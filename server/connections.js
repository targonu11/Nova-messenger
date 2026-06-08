/** OAuth-привязки аккаунтов (Discord / Steam / Spotify) */

import crypto from 'node:crypto';

export const CONNECTION_PROVIDERS = ['discord', 'steam', 'spotify'];

const STATE_TTL_MS = 10 * 60 * 1000;

function getPublicBaseUrl() {
  const domain = process.env.DOMAIN || 'localhost:3001';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  return process.env.OAUTH_PUBLIC_URL || `${protocol}://${domain}`;
}

function getClientBaseUrl() {
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL.replace(/\/$/, '');
  const pub = getPublicBaseUrl();
  if (pub.includes(':3001')) return pub.replace(':3001', ':5173');
  return pub;
}

function getProviderConfig(provider) {
  const p = String(provider || '').toLowerCase();
  if (p === 'discord') {
    const clientId = process.env.DISCORD_CLIENT_ID || '';
    const clientSecret = process.env.DISCORD_CLIENT_SECRET || '';
    if (!clientId || !clientSecret) return null;
    return { provider: p, clientId, clientSecret };
  }
  if (p === 'spotify') {
    const clientId = process.env.SPOTIFY_CLIENT_ID || '';
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '';
    if (!clientId || !clientSecret) return null;
    return { provider: p, clientId, clientSecret };
  }
  if (p === 'steam') {
    return { provider: p };
  }
  return null;
}

export function isProviderConfigured(provider) {
  return Boolean(getProviderConfig(provider));
}

export function listConfiguredProviders() {
  return CONNECTION_PROVIDERS.filter(isProviderConfigured);
}

export function initConnectionsDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_connections (
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL DEFAULT '',
      profile_url TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      connected_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, provider)
    );
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}

function cleanupStates(db) {
  const cutoff = Date.now() - STATE_TTL_MS;
  db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(cutoff);
}

function createState(db, userId, provider) {
  cleanupStates(db);
  const state = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO oauth_states (state, user_id, provider, created_at) VALUES (?, ?, ?, ?)').run(
    state, String(userId), provider, Date.now(),
  );
  return state;
}

function consumeState(db, state) {
  cleanupStates(db);
  const row = db.prepare('SELECT user_id, provider, created_at FROM oauth_states WHERE state = ?').get(state);
  if (!row) return null;
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
  if (Date.now() - Number(row.created_at) > STATE_TTL_MS) return null;
  return { userId: String(row.user_id), provider: String(row.provider) };
}

function upsertConnection(db, userId, provider, data) {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO user_connections (user_id, provider, provider_user_id, username, display_name, profile_url, avatar_url, connected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, provider) DO UPDATE SET
      provider_user_id = excluded.provider_user_id,
      username = excluded.username,
      display_name = excluded.display_name,
      profile_url = excluded.profile_url,
      avatar_url = excluded.avatar_url,
      connected_at = excluded.connected_at
  `).run(
    String(userId),
    provider,
    data.providerUserId,
    data.username || '',
    data.displayName || '',
    data.profileUrl || '',
    data.avatarUrl || '',
    now,
  );
}

export function getUserConnections(db, userId) {
  const rows = db.prepare(`
    SELECT provider, provider_user_id, username, display_name, profile_url, avatar_url, connected_at
    FROM user_connections WHERE user_id = ?
  `).all(String(userId));
  return rows.map((r) => ({
    provider: r.provider,
    providerUserId: r.provider_user_id,
    username: r.username,
    displayName: r.display_name,
    profileUrl: r.profile_url,
    avatarUrl: r.avatar_url,
    connectedAt: r.connected_at,
    verified: true,
  }));
}

export function getConnectionsBatch(db, userIds) {
  const out = {};
  for (const uid of userIds) {
    out[uid] = getUserConnections(db, uid);
  }
  return out;
}

export function deleteUserConnection(db, userId, provider) {
  const r = db.prepare('DELETE FROM user_connections WHERE user_id = ? AND provider = ?').run(String(userId), provider);
  return r.changes > 0;
}

function syncSocialLink(db, userId, provider, handle, profileUrl) {
  if (!handle) return;
  const row = db.prepare('SELECT social_links FROM users WHERE id = ?').get(String(userId));
  let links = {};
  try {
    links = row?.social_links ? JSON.parse(row.social_links) : {};
  } catch {
    links = {};
  }
  links[provider] = handle;
  db.prepare('UPDATE users SET social_links = ? WHERE id = ?').run(JSON.stringify(links), String(userId));
}

export function buildConnectionStartUrl(db, userId, provider) {
  const cfg = getProviderConfig(provider);
  if (!cfg) return null;
  const state = createState(db, userId, provider);
  const redirectUri = `${getPublicBaseUrl()}/api/connections/${provider}/callback`;
  const clientBase = getClientBaseUrl();

  if (provider === 'discord') {
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify',
      state,
      prompt: 'consent',
    });
    return `https://discord.com/api/oauth2/authorize?${params}`;
  }

  if (provider === 'spotify') {
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'user-read-currently-playing user-read-playback-state user-read-email',
      state,
    });
    return `https://accounts.spotify.com/authorize?${params}`;
  }

  if (provider === 'steam') {
    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': `${redirectUri}?state=${state}`,
      'openid.realm': clientBase,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    });
    return `https://steamcommunity.com/openid/login?${params}`;
  }

  return null;
}

async function exchangeDiscord(code, cfg) {
  const redirectUri = `${getPublicBaseUrl()}/api/connections/discord/callback`;
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!tokenRes.ok) throw new Error('DISCORD_TOKEN');
  const token = await tokenRes.json();
  const meRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) throw new Error('DISCORD_USER');
  const me = await meRes.json();
  const username = me.discriminator && me.discriminator !== '0'
    ? `${me.username}#${me.discriminator}`
    : (me.global_name || me.username);
  return {
    providerUserId: String(me.id),
    username,
    displayName: me.global_name || me.username || username,
    profileUrl: `https://discord.com/users/${me.id}`,
    avatarUrl: me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128`
      : '',
    socialHandle: me.id,
  };
}

async function exchangeSpotify(code, cfg) {
  const redirectUri = `${getPublicBaseUrl()}/api/connections/spotify/callback`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!tokenRes.ok) throw new Error('SPOTIFY_TOKEN');
  const token = await tokenRes.json();
  const meRes = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) throw new Error('SPOTIFY_USER');
  const me = await meRes.json();
  const handle = me.id || me.uri?.replace('spotify:user:', '') || '';
  return {
    providerUserId: String(me.id || handle),
    username: me.display_name || handle,
    displayName: me.display_name || handle,
    profileUrl: handle ? `https://open.spotify.com/user/${handle}` : '',
    avatarUrl: me.images?.[0]?.url || '',
    socialHandle: handle,
  };
}

async function verifySteamOpenId(query) {
  const params = new URLSearchParams(query);
  params.set('openid.mode', 'check_authentication');
  const res = await fetch('https://steamcommunity.com/openid/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const text = await res.text();
  if (!/is_valid\s*:\s*true/i.test(text)) throw new Error('STEAM_INVALID');
  const claimed = params.get('openid.claimed_id') || '';
  const m = claimed.match(/\/id\/(\d+)$/);
  if (!m) throw new Error('STEAM_ID');
  const steamId = m[1];
  let displayName = steamId;
  let avatarUrl = '';
  const apiKey = process.env.STEAM_WEB_API_KEY || '';
  if (apiKey) {
    try {
      const summaryRes = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId}`,
      );
      const summary = await summaryRes.json();
      const player = summary?.response?.players?.[0];
      if (player) {
        displayName = player.personaname || displayName;
        avatarUrl = player.avatarfull || player.avatarmedium || '';
      }
    } catch { /* ignore */ }
  }
  return {
    providerUserId: steamId,
    username: displayName,
    displayName,
    profileUrl: `https://steamcommunity.com/profiles/${steamId}`,
    avatarUrl,
    socialHandle: steamId,
  };
}

export async function handleConnectionCallback(db, provider, req) {
  const clientBase = getClientBaseUrl();
  const fail = (reason) => `${clientBase}/?connection_error=${encodeURIComponent(reason)}`;
  const ok = (p) => `${clientBase}/?connection_ok=${encodeURIComponent(p)}`;

  try {
    if (provider === 'steam') {
      const state = req.query.state;
      const consumed = consumeState(db, state);
      if (!consumed) return fail('state');
      const data = await verifySteamOpenId(req.query);
      const existing = db.prepare(
        'SELECT user_id FROM user_connections WHERE provider = ? AND provider_user_id = ? AND user_id != ?',
      ).get('steam', data.providerUserId, consumed.userId);
      if (existing) return fail('already_linked');
      upsertConnection(db, consumed.userId, 'steam', data);
      syncSocialLink(db, consumed.userId, 'steam', data.socialHandle, data.profileUrl);
      return ok('steam');
    }

    const code = req.query.code;
    const state = req.query.state;
    if (!code || !state) return fail('missing');
    const consumed = consumeState(db, state);
    if (!consumed || consumed.provider !== provider) return fail('state');

    const cfg = getProviderConfig(provider);
    if (!cfg) return fail('config');

    let data;
    if (provider === 'discord') data = await exchangeDiscord(code, cfg);
    else if (provider === 'spotify') data = await exchangeSpotify(code, cfg);
    else return fail('provider');

    const existing = db.prepare(
      'SELECT user_id FROM user_connections WHERE provider = ? AND provider_user_id = ? AND user_id != ?',
    ).get(provider, data.providerUserId, consumed.userId);
    if (existing) return fail('already_linked');

    upsertConnection(db, consumed.userId, provider, data);
    syncSocialLink(db, consumed.userId, provider, data.socialHandle, data.profileUrl);
    return ok(provider);
  } catch (e) {
    console.error('OAuth callback error:', provider, e);
    return fail('exchange');
  }
}

export function parseJwtUserId(token, verifyJwt) {
  if (!token) return null;
  try {
    const parsed = verifyJwt(token);
    return parsed?.userId ? String(parsed.userId) : null;
  } catch {
    return null;
  }
}
