import { MOBILE_DEFAULT_SERVER_ORIGIN } from './remoteServer.js';

/** localStorage: ручной адрес API (для прод-сервера и других устройств в сети) */
const STORAGE_API_BASE = 'nova_api_base';

function normalizeApiBaseUrl(url) {
  if (!url || typeof url !== 'string') return '';
  return url.trim().replace(/\/+$/, '');
}

function computeDefaultApiBase() {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv && String(fromEnv).trim()) {
    let base = normalizeApiBaseUrl(String(fromEnv).trim());
    // Прод: если в сборке зашит localhost, а страница открыта с VPS/домена — API должен быть того же origin
    if (typeof window !== 'undefined') {
      const h = window.location.hostname;
      const pageIsLocal = h === 'localhost' || h === '127.0.0.1';
      if (!pageIsLocal && /localhost|127\.0\.0\.1/i.test(base)) {
        return normalizeApiBaseUrl(window.location.origin);
      }
    }
    return base;
  }
  if (typeof window !== 'undefined') {
    if (window.Capacitor) {
      return normalizeApiBaseUrl(MOBILE_DEFAULT_SERVER_ORIGIN);
    }
    // Vite dev: относительные URL → тот же origin (5173), прокси на 3001 — без обхода прямым localhost:3001
    if (window.location.port === '5173') {
      return '';
    }
    return normalizeApiBaseUrl(window.location.origin);
  }
  return normalizeApiBaseUrl('http://localhost:3001');
}

/** База API с учётом переопределения в localStorage (nova_api_base) */
export function getApiBaseUrl() {
  if (typeof window !== 'undefined') {
    try {
      const override = localStorage.getItem(STORAGE_API_BASE);
      if (override && String(override).trim()) {
        return normalizeApiBaseUrl(String(override).trim());
      }
    } catch {}
  }
  return computeDefaultApiBase();
}

/** База без пользовательского override (из сборки / origin) */
export function getDefaultApiBaseUrl() {
  return computeDefaultApiBase();
}

/** Текст для UI, когда база пустая (dev: относительные запросы через Vite) */
export function getApiBaseUrlDisplay() {
  const b = getApiBaseUrl();
  if (b) return b;
  if (typeof window !== 'undefined') {
    return window.location.origin + ' (proxy → :3001)';
  }
  return '';
}

export function setApiBaseUrlOverride(url) {
  if (!url || !String(url).trim()) {
    clearApiBaseUrlOverride();
    return;
  }
  try {
    localStorage.setItem(STORAGE_API_BASE, normalizeApiBaseUrl(String(url).trim()));
  } catch {}
}

export function clearApiBaseUrlOverride() {
  try {
    localStorage.removeItem(STORAGE_API_BASE);
  } catch {}
}

export function hasApiBaseUrlOverride() {
  try {
    const o = localStorage.getItem(STORAGE_API_BASE);
    return !!(o && String(o).trim());
  } catch {
    return false;
  }
}

export { normalizeApiBaseUrl };

export async function fetchServerVersion() {
  const base = getApiBaseUrl();
  const res = await fetch(base + '/api/version', { cache: 'no-store' });
  if (!res.ok) throw new Error('version');
  return res.json();
}

function getToken() {
  return localStorage.getItem('token');
}

function getRefreshToken() {
  return localStorage.getItem('refreshToken');
}

function getHeaders(includeAuth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (includeAuth) {
    const t = getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
  }
  return headers;
}

let refreshInFlight = null;

let authBootstrapResolved = false;
const authBootstrapWaiters = [];

/** Дождаться завершения первичной проверки сессии (AuthContext). */
export function waitForAuthBootstrap() {
  if (authBootstrapResolved) return Promise.resolve();
  return new Promise((resolve) => authBootstrapWaiters.push(resolve));
}

export function resolveAuthBootstrap() {
  if (authBootstrapResolved) return;
  authBootstrapResolved = true;
  while (authBootstrapWaiters.length) {
    const fn = authBootstrapWaiters.shift();
    try { fn(); } catch {}
  }
}

function notifyTokenUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('nova-token-updated'));
  }
}

function getJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isAccessTokenValid(token, leewaySec = 10) {
  const p = getJwtPayload(token);
  if (!p?.userId) return false;
  if (p.exp && Number(p.exp) < Math.floor(Date.now() / 1000) + leewaySec) return false;
  return true;
}

export function clearAuthStorage() {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  } catch {}
  notifyTokenUpdated();
}

/** Восстановить access token без лишнего 401 на /api/users/me */
export async function restoreAccessTokenForBootstrap() {
  let t = getToken();
  if (t && isAccessTokenValid(t)) return t;
  if (getRefreshToken()) return refreshAccessToken();
  return null;
}

async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const rt = getRefreshToken();
      if (!rt) return null;
      const res = await fetch(getApiBaseUrl() + '/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      const token = data && typeof data.token === 'string' ? data.token : null;
      if (token) {
        localStorage.setItem('token', token);
        notifyTokenUpdated();
        return token;
      }
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Обновить access token (дедупликация параллельных запросов). */
export { refreshAccessToken };

async function ensureAccessToken() {
  let t = getToken();
  if (t && isAccessTokenValid(t)) return t;
  return refreshAccessToken();
}

async function fetchWithAuth(url, init = {}, retry = true) {
  await waitForAuthBootstrap();
  let t = await ensureAccessToken();
  const headers = { ...(init.headers || {}) };
  if (t) headers['Authorization'] = 'Bearer ' + t;
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401 && retry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      const headers2 = { ...(init.headers || {}), Authorization: 'Bearer ' + newToken };
      return fetch(url, { ...init, headers: headers2 });
    }
  }
  return res;
}

export async function getUsers() {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/users', { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('Failed to load users');
  return res.json();
}

/** Общие группы и люди из тех же групп (аналог Mutual servers / friends). */
export async function getUserMutual(peerId) {
  const res = await fetchWithAuth(
    `${getApiBaseUrl()}/api/users/${encodeURIComponent(String(peerId))}/mutual`,
    { headers: { 'Content-Type': 'application/json' } }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load mutual');
  }
  return res.json();
}

/** Converts an image File to a PNG Blob (for avatars). */
export function imageToPngBlob(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Failed to convert to PNG'))),
        'image/png',
        0.95
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

export async function uploadAvatar(file) {
  const pngBlob = await imageToPngBlob(file);
  const form = new FormData();
  form.append('avatar', pngBlob, 'avatar.png');
  const res = await fetch(getApiBaseUrl() + '/api/users/avatar', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + getToken() },
    body: form,
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export async function uploadProfileCover(file) {
  const form = new FormData();
  form.append('cover', file, file.name || 'cover.jpg');
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/users/cover', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

export async function setProfileCover(coverPath) {
  const res = await fetch(getApiBaseUrl() + '/api/users/me/cover', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ coverPath: coverPath ?? null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to set cover' }));
    throw new Error(err.error || 'Failed to set cover');
  }
  return res.json();
}

export async function setAvatarRing(avatarRing) {
  const res = await fetch(getApiBaseUrl() + '/api/users/me/avatar-ring', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ avatarRing: avatarRing ?? 'none' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to set avatar ring' }));
    throw new Error(err.error || 'Failed to set avatar ring');
  }
  return res.json();
}

export async function uploadChatBackground(file) {
  const url = getApiBaseUrl() + '/api/users/me/chat-background';
  const form = new FormData();
  form.append('background', file, file.name || 'background.png');
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + getToken() },
      body: form,
    });
  } catch (e) {
    if (e?.message === 'Failed to fetch' || e?.name === 'TypeError') {
      throw new Error('Нет связи с сервером. Проверьте, что сервер запущен и адрес API верный.');
    }
    throw e;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Ошибка загрузки');
  }
  return res.json();
}

/**
 * Кэш списка «серверов» в globalThis: переживает HMR (иначе при каждом сохранении Messenger снова летит GET).
 * Полная перезагрузка вкладки сбрасывает. Пустой ответ (404 / нет маршрута) держим дольше — меньше дублей в консоли.
 */
const SERVERS_STATE_KEY = '__novaGetServersCache';
const SERVERS_CACHE_MS_NONEMPTY = 800;
const SERVERS_CACHE_MS_EMPTY = 5 * 60 * 1000;

function getServersState() {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  if (!g[SERVERS_STATE_KEY]) {
    g[SERVERS_STATE_KEY] = { cache: null, fetchId: 0, inflight: null };
  }
  return g[SERVERS_STATE_KEY];
}

function serversListCacheTtl(data) {
  return Array.isArray(data) && data.length > 0 ? SERVERS_CACHE_MS_NONEMPTY : SERVERS_CACHE_MS_EMPTY;
}

export function invalidateServersListCache() {
  const s = getServersState();
  s.cache = null;
  s.fetchId++;
  s.inflight = null;
}

async function fetchServersListOnce() {
  const s = getServersState();
  const fetchId = s.fetchId;
  try {
    const res = await fetchWithAuth(getApiBaseUrl() + '/api/servers', { headers: { 'Content-Type': 'application/json' } });
    let data = [];
    if (res.status !== 404 && res.ok) {
      const json = await res.json();
      data = Array.isArray(json) ? json : [];
    }
    if (fetchId === s.fetchId) {
      s.cache = { at: Date.now(), data };
    }
    return data;
  } catch {
    if (fetchId === s.fetchId) {
      s.cache = { at: Date.now(), data: [] };
    }
    return [];
  }
}

export async function getServers() {
  const s = getServersState();
  const now = Date.now();
  if (s.cache && now - s.cache.at < serversListCacheTtl(s.cache.data)) {
    return s.cache.data;
  }
  if (!s.inflight) {
    s.inflight = fetchServersListOnce().finally(() => {
      s.inflight = null;
    });
  }
  return s.inflight;
}

export async function createServer(name) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/servers', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create server');
  }
  const json = await res.json();
  invalidateServersListCache();
  return json;
}

export async function createServerChannel(serverId, name, description) {
  const body = { name };
  if (description) body.description = description;
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/servers/' + encodeURIComponent(serverId) + '/channels', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create channel');
  }
  return res.json();
}

export async function inviteServerMembers(serverId, userIds) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/servers/' + encodeURIComponent(serverId) + '/members', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ userIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to invite');
  }
  return res.json();
}

export async function getServer(serverId) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/servers/' + encodeURIComponent(serverId), {
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load server');
  }
  return res.json();
}

export async function updateServer(serverId, name) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/servers/' + encodeURIComponent(serverId), {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update server');
  }
  const json = await res.json();
  invalidateServersListCache();
  return json;
}

export async function leaveServer(serverId) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/servers/' + encodeURIComponent(serverId) + '/leave', {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to leave server');
  }
  invalidateServersListCache();
  return res.json();
}

export async function deleteServer(serverId) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/servers/' + encodeURIComponent(serverId), {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete server');
  }
  invalidateServersListCache();
  return res.json();
}

export async function getGroups() {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/groups', { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('Failed to load groups');
  return res.json();
}

export async function createGroup(name, memberIds, kind = 'group') {
  const res = await fetch(getApiBaseUrl() + '/api/groups', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name, memberIds, kind }),
  });
  if (!res.ok) throw new Error('Failed to create group');
  return res.json();
}

export async function getGroupMembers(groupId) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/groups/' + encodeURIComponent(groupId) + '/members', { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('Failed to load members');
  return res.json();
}

export async function getGroup(groupId) {
  const url = getApiBaseUrl() + '/api/groups/' + encodeURIComponent(groupId);
  const res = await fetchWithAuth(url, { headers: { 'Content-Type': 'application/json' } });
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!res.ok) {
    if (contentType.includes('text/html')) {
      throw new Error('Server error: Received HTML response. Make sure the server is running on port 3001.');
    }
    let error;
    try {
      error = JSON.parse(text);
    } catch {
      error = { error: text.substring(0, 200) || 'Failed to load group' };
    }
    throw new Error(error.error || 'Failed to load group');
  }
  return JSON.parse(text);
}

export async function updateGroup(groupId, name, backgroundPath, channelSettings) {
  const body = {};
  if (name !== undefined) body.name = name;
  if (backgroundPath !== undefined) body.backgroundPath = backgroundPath;
  if (channelSettings && typeof channelSettings === 'object') {
    if (channelSettings.description !== undefined) body.description = channelSettings.description;
    if (channelSettings.slowModeSec !== undefined) body.slowModeSec = channelSettings.slowModeSec;
    if (channelSettings.reactionsEnabled !== undefined) body.reactionsEnabled = channelSettings.reactionsEnabled;
    if (channelSettings.postAsChannel !== undefined) body.postAsChannel = channelSettings.postAsChannel;
    if (channelSettings.allowForward !== undefined) body.allowForward = channelSettings.allowForward;
    if (channelSettings.allowCopy !== undefined) body.allowCopy = channelSettings.allowCopy;
  }
  const res = await fetch(getApiBaseUrl() + '/api/groups/' + encodeURIComponent(groupId), {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to update group' }));
    throw new Error(error.error || 'Failed to update group');
  }
  return res.json();
}

export async function getChannelInviteLink(groupId, regenerate = false) {
  const res = await fetch(getApiBaseUrl() + '/api/groups/' + encodeURIComponent(groupId) + '/invite-link', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ regenerate: !!regenerate }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to get invite link' }));
    throw new Error(error.error || 'Failed to get invite link');
  }
  return res.json();
}

export async function joinChannelByInvite(inviteCode) {
  const res = await fetch(getApiBaseUrl() + '/api/channels/join', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ inviteCode: String(inviteCode || '').trim() }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to join channel' }));
    throw new Error(error.error || 'Failed to join channel');
  }
  return res.json();
}

export async function uploadGroupAvatar(groupId, file) {
  const pngBlob = await imageToPngBlob(file);
  const form = new FormData();
  form.append('avatar', pngBlob, 'avatar.png');
  const res = await fetch(getApiBaseUrl() + '/api/groups/' + encodeURIComponent(groupId) + '/avatar', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + getToken() },
    body: form,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Upload failed');
  }
  return res.json();
}

export async function uploadGroupBackground(groupId, file) {
  const imgBlob = file.type === 'image/png' ? file : await imageToPngBlob(file);
  const form = new FormData();
  form.append('background', imgBlob, file.name || 'background.png');
  const res = await fetch(getApiBaseUrl() + '/api/groups/' + encodeURIComponent(groupId) + '/background', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + getToken() },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

export async function clearGroupBackground(groupId) {
  const res = await fetch(getApiBaseUrl() + '/api/groups/' + encodeURIComponent(groupId) + '/background', {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to clear background' }));
    throw new Error(err.error || 'Failed to clear background');
  }
  return res.json();
}

export async function deleteGroup(groupId) {
  const res = await fetch(getApiBaseUrl() + '/api/groups/' + encodeURIComponent(groupId), {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to delete group' }));
    throw new Error(err.error || 'Failed to delete group');
  }
  return res.json();
}

export async function addGroupMembers(groupId, userIds) {
  const res = await fetch(getApiBaseUrl() + '/api/groups/' + encodeURIComponent(groupId) + '/members', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ userIds }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to add members' }));
    throw new Error(error.error || 'Failed to add members');
  }
  return res.json();
}

export async function removeGroupMember(groupId, userId) {
  const res = await fetch(getApiBaseUrl() + '/api/groups/' + encodeURIComponent(groupId) + '/members/' + encodeURIComponent(userId), {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to remove member' }));
    throw new Error(error.error || 'Failed to remove member');
  }
  return res.json();
}

export async function changeMemberRole(groupId, userId, role) {
  const res = await fetch(getApiBaseUrl() + '/api/groups/' + encodeURIComponent(groupId) + '/members/' + encodeURIComponent(userId) + '/role', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to change role' }));
    throw new Error(error.error || 'Failed to change role');
  }
  return res.json();
}

export async function getMessages(type, id, opts = {}) {
  const limit = opts && opts.limit != null ? Number(opts.limit) : undefined;
  const before = opts && opts.before != null ? Number(opts.before) : undefined;
  const around = opts && opts.around != null ? Number(opts.around) : undefined;
  const qs = new URLSearchParams();
  qs.set('type', type);
  qs.set('id', id);
  if (Number.isFinite(limit)) qs.set('limit', String(limit));
  if (Number.isFinite(before)) qs.set('before', String(before));
  if (Number.isFinite(around)) qs.set('around', String(around));
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/messages?' + qs.toString(), { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('Failed to load messages');
  const data = await res.json();
  if (Array.isArray(data)) {
    return { messages: data, pinned: [], peerLastReadAt: null };
  }
  return {
    messages: Array.isArray(data.messages) ? data.messages : [],
    pinned: Array.isArray(data.pinned) ? data.pinned : [],
    peerLastReadAt: data.peerLastReadAt != null ? Number(data.peerLastReadAt) : null,
    hasMore: !!data.hasMore,
    aroundId: data.aroundId || null,
  };
}

export async function searchMessages(type, id, q, limit = 30) {
  const query = q != null ? String(q) : '';
  const url = getApiBaseUrl()
    + '/api/messages/search?type=' + encodeURIComponent(type)
    + '&id=' + encodeURIComponent(id)
    + '&q=' + encodeURIComponent(query)
    + '&limit=' + encodeURIComponent(String(limit));
  const res = await fetchWithAuth(url, { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('Failed to search messages');
  const data = await res.json();
  return Array.isArray(data?.results) ? data.results : [];
}

export async function getMe() {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/users/me', { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}

/** Presence другого пользователя: online, lastSeenAt (unix sec), hideLastSeen */
export async function getPresence(userId) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/users/' + encodeURIComponent(userId) + '/presence', { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('Failed to load presence');
  return res.json();
}

/** Объект { [userId]: { online, lastSeenAt, hideLastSeen } }; не более 100 id за запрос */
export async function getPresenceBatch(ids) {
  const unique = [...new Set((ids || []).map((id) => String(id).trim()).filter(Boolean))].slice(0, 100);
  if (!unique.length) return {};
  const q = unique.map((id) => encodeURIComponent(id)).join(',');
  const res = await fetchWithAuth(
    getApiBaseUrl() + '/api/users/presence-batch?ids=' + q,
    { headers: { 'Content-Type': 'application/json' } }
  );
  if (!res.ok) throw new Error('Failed to load presence batch');
  const data = await res.json();
  return data && typeof data === 'object' ? data : {};
}

export async function getSessions() {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/auth/sessions', { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('Failed to load sessions');
  return res.json();
}

export async function revokeSession(sessionId) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/auth/sessions/' + encodeURIComponent(sessionId) + '/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error('Failed to revoke session');
  return res.json();
}

export async function logoutAllDevices() {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/auth/logout-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error('Failed to logout all devices');
  return res.json();
}

export async function setTwoFaPin({ enabled, pin, password }) {
  const payload = { enabled: !!enabled, password: String(password || '') };
  if (enabled) payload.pin = String(pin || '');
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/users/me/2fa-pin', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to update 2FA');
  return data;
}

export async function getStarredMessages(limit = 60) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/users/me/starred?limit=' + encodeURIComponent(String(limit)), {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to load starred');
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.results) ? data.results : [];
}

export async function getMyAchievements() {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/users/me/achievements', {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to load achievements');
  return res.json();
}

export async function getUserAchievements(userId) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/users/' + encodeURIComponent(userId) + '/achievements', {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to load achievements');
  return res.json();
}

export async function getAchievementsCatalog() {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/achievements', {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to load achievements catalog');
  return res.json();
}

export async function adminGrantAchievement(userId, achievementId) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/admin/users/' + encodeURIComponent(userId) + '/achievements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ achievementId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to grant achievement');
  return data;
}

export async function setMyBadge(badgeId) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/users/me/badge', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ badgeId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to set badge');
  return data;
}

export async function archiveChat(type, id) {
  const t = type === 'group' ? 'group' : 'user';
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/chats/' + t + '/' + encodeURIComponent(id) + '/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to archive');
  return data;
}

export async function unarchiveChat(type, id) {
  const t = type === 'group' ? 'group' : 'user';
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/chats/' + t + '/' + encodeURIComponent(id) + '/archive', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to unarchive');
  return data;
}

export async function getArchivedChats(limit = 200) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/chats/archived?limit=' + encodeURIComponent(String(limit)), {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to load archived');
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.results) ? data.results : [];
}

export async function updateCustomStatus({ emoji, text, mode } = {}) {
  const body = {};
  if (emoji !== undefined) body.emoji = emoji;
  if (text !== undefined) body.text = text;
  if (mode !== undefined) body.mode = mode;
  const res = await fetch(getApiBaseUrl() + '/api/users/me/status', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to update status' }));
    throw new Error(error.error || 'Failed to update status');
  }
  return res.json();
}

export async function fetchLinkPreview(url) {
  const q = encodeURIComponent(String(url || '').trim());
  if (!q) return null;
  const res = await fetchWithAuth(`${getApiBaseUrl()}/api/link-preview?url=${q}`);
  if (!res.ok) return null;
  return res.json();
}

export async function updateMyActivity(activities) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/users/me/activity', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activities: Array.isArray(activities) ? activities : [] }),
  });
  if (!res.ok) throw new Error('Failed to update activity');
  return res.json();
}

export async function getMyActivity() {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/users/me/activity', {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to load activity');
  return res.json();
}

export function getConnectionStartUrl(provider, accessToken) {
  const base = getApiBaseUrl();
  const q = new URLSearchParams({ token: accessToken || '' });
  return `${base}/api/connections/${encodeURIComponent(provider)}/start?${q}`;
}

export async function getConnectionProviders() {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/connections/providers');
  if (res.status === 404) return { providers: [] };
  if (!res.ok) throw new Error('Failed to load connection providers');
  return res.json();
}

export async function getMyConnections() {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/connections/me');
  if (res.status === 404) return { connections: [] };
  if (!res.ok) throw new Error('Failed to load connections');
  return res.json();
}

export async function getUserConnections(userId) {
  const res = await fetchWithAuth(getApiBaseUrl() + `/api/users/${encodeURIComponent(userId)}/connections`);
  if (res.status === 404) return { connections: [] };
  if (!res.ok) throw new Error('Failed to load user connections');
  return res.json();
}

export async function disconnectConnection(provider) {
  const res = await fetchWithAuth(getApiBaseUrl() + `/api/connections/${encodeURIComponent(provider)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to disconnect');
  return res.json();
}

export async function updateProfile(login, displayName, bio, hideLastSeen, birthday, socialLinks) {
  const body = {};
  if (login !== undefined) body.login = login;
  if (displayName !== undefined) body.displayName = displayName;
  if (bio !== undefined) body.bio = bio;
  if (typeof hideLastSeen === 'boolean') body.hideLastSeen = hideLastSeen;
  if (birthday !== undefined) body.birthday = birthday;
  if (socialLinks !== undefined && socialLinks !== null) body.socialLinks = socialLinks;
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/users/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to update profile' }));
    throw new Error(error.error || 'Failed to update profile');
  }
  return res.json();
}

export async function uploadVoice(blob, meta = {}) {
  const form = new FormData();
  form.append('voice', blob, 'voice.webm');
  if (meta.peaks?.length) form.append('waveform', JSON.stringify({ peaks: meta.peaks }));
  if (meta.durationSec != null) form.append('durationSec', String(meta.durationSec));
  if (meta.transcript) form.append('transcript', meta.transcript);
  if (meta.lang) form.append('lang', meta.lang);
  const res = await fetch(getApiBaseUrl() + '/api/voice/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + getToken() },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }
  const data = await res.json();
  return { path: data.path, voiceMeta: data.voiceMeta || null };
}

export async function transcribeVoiceMessage(messageId) {
  const res = await fetch(getApiBaseUrl() + '/api/voice/transcribe', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + getToken(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messageId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Transcription failed');
  }
  return data.voiceMeta;
}

export async function translateVoiceMessage(messageId, targetLang) {
  const res = await fetch(getApiBaseUrl() + '/api/voice/translate', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + getToken(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messageId, targetLang }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Translation failed' }));
    throw new Error(err.error || 'Translation failed');
  }
  const data = await res.json();
  return data.voiceMeta;
}

/** Перевод произвольного текста (MyMemory через сервер). */
export async function translateText(text, to = 'en', from = 'auto') {
  const res = await fetch(getApiBaseUrl() + '/api/translate', {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ text, to, from }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Translation failed');
  }
  return data;
}

/** Загрузить вложение (фото, видео, файл) для чата. Возвращает path. */
export async function uploadAttachment(file) {
  const url = getApiBaseUrl() + '/api/attachments/upload';
  const form = new FormData();
  form.append('file', file, file.name || 'file');
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + getToken() },
      body: form,
    });
  } catch (e) {
    const msg = e && e.message === 'Failed to fetch'
      ? 'Не удалось подключиться к серверу. Запустите сервер (npm start в папке server) и обновите страницу.'
      : (e && e.message) || 'Ошибка загрузки';
    throw new Error(msg);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }
  const data = await res.json();
  return data.path;
}

export async function blockUser(userId) {
  const res = await fetch(getApiBaseUrl() + '/api/users/me/block/' + encodeURIComponent(userId), {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to block');
  }
  return res.json();
}

export async function unblockUser(userId) {
  const res = await fetch(getApiBaseUrl() + '/api/users/me/block/' + encodeURIComponent(userId), {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to unblock');
  }
  return res.json();
}

export async function getBlockedList() {
  const res = await fetch(getApiBaseUrl() + '/api/users/me/blocked', { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load blocked list');
  return res.json();
}

export async function deleteDirectChat(userId) {
  const res = await fetch(getApiBaseUrl() + '/api/messages/direct/' + encodeURIComponent(userId), {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete chat');
  }
  return res.json();
}

export function avatarUrl(path) {
  if (!path || typeof path !== 'string') return null;
  const p = path.replace(/\\/g, '/').trim();
  if (!p) return null;
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  const base = getApiBaseUrl() || (typeof window !== 'undefined' ? window.location.origin : '');
  const segment = p.startsWith('/') ? p : (p.startsWith('uploads/') ? '/' + p : '/uploads/' + p);
  // cache-bust по имени файла, чтобы после смены авы не показывалась старая из кэша
  const bust = encodeURIComponent(segment.split('/').pop() || '');
  return `${base}${segment}${bust ? `?v=${bust}` : ''}`;
}

// Установить публичный ключ для сквозного шифрования
export async function setE2EPublicKey(publicKeyJwk) {
  const res = await fetch(getApiBaseUrl() + '/api/users/me/e2e-key', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ publicKey: JSON.stringify(publicKeyJwk) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to set e2e key');
  }
  return res.json();
}

export async function getAdminSettings() {
  const res = await fetch(getApiBaseUrl() + '/api/admin/settings', { headers: getHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load admin settings');
  }
  return res.json();
}

export async function setAdminSettings(payload) {
  const res = await fetch(getApiBaseUrl() + '/api/admin/settings', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save admin settings');
  }
  return res.json();
}

// Админ: временный бан пользователя (в секундах, 0 — снятие бана)
export async function adminBanUser(userId, durationSec) {
  const res = await fetch(getApiBaseUrl() + '/api/admin/users/' + encodeURIComponent(userId) + '/ban', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ durationSec }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to ban user');
  }
  return res.json();
}

// Админ: выдать / снять галочку верификации
export async function adminSetVerification(userId, verified) {
  const res = await fetch(getApiBaseUrl() + '/api/admin/users/' + encodeURIComponent(userId) + '/verify', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ verified }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to set verification');
  }
  return res.json();
}

// --- Bots & Stickers ---
export async function lookupUserByLogin(login) {
  const name = String(login || '').replace(/^@/, '').trim();
  if (!name) throw new Error('Login required');
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/users/lookup/' + encodeURIComponent(name), {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'User not found');
  }
  return res.json();
}

export async function getBotCommands(userId) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/users/' + encodeURIComponent(userId) + '/bot-commands', {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to load bot commands');
  return res.json();
}

export async function getBots() {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/bots', { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('Failed to load bots');
  return res.json();
}

export async function createBot({ username, displayName, description }) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/bots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, displayName, description }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create bot');
  }
  return res.json();
}

export async function deleteBot(botId) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/bots/' + encodeURIComponent(botId), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to delete bot');
  return res.json();
}

export async function rotateBotToken(botId) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/bots/' + encodeURIComponent(botId) + '/rotate-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to rotate token');
  return res.json();
}

export async function getInstalledStickerPacks() {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/stickers/installed', { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('Failed to load sticker packs');
  return res.json();
}

export async function getPublicStickerPacks() {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/stickers/packs/public', { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('Failed to load public packs');
  return res.json();
}

export async function getStickerPackInfo(packId, viaStickerId = null) {
  const q = viaStickerId ? '?viaStickerId=' + encodeURIComponent(viaStickerId) : '';
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/stickers/packs/' + encodeURIComponent(packId) + q, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load sticker pack');
  }
  return res.json();
}

export async function getPackStickers(packId, type = null, viaStickerId = null) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (viaStickerId) params.set('viaStickerId', viaStickerId);
  const q = params.toString() ? '?' + params.toString() : '';
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/stickers/packs/' + encodeURIComponent(packId) + '/stickers' + q, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to load stickers');
  return res.json();
}

export async function installStickerPack(packId) {
  const res = await fetchWithAuth(getApiBaseUrl() + '/api/stickers/packs/' + encodeURIComponent(packId) + '/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to install pack');
  return res.json();
}

