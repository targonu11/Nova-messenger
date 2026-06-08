const { execFile } = require('child_process');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const PLAYBACK_PLAYING = 4;
const PLAYBACK_VIDEO = 2;

let smtcModule = null;

function getSmtcModule() {
  if (process.platform !== 'win32') return null;
  if (smtcModule !== null) return smtcModule || null;
  try {
    smtcModule = require('@coooookies/windows-smtc-monitor');
  } catch {
    smtcModule = false;
  }
  return smtcModule || null;
}

function normalizeArtists(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .split(/[,;]|(?:\s+feat\.?\s+)|(?:\s+ft\.?\s+)/gi)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(', ');
}

const NON_GAME_PROCESSES = new Set([
  'explorer', 'SearchHost', 'ShellExperienceHost', 'StartMenuExperienceHost',
  'ApplicationFrameHost', 'SystemSettings', 'TextInputHost', 'RuntimeBroker',
  'dllhost', 'sihost', 'taskhostw', 'ctfmon', 'LockApp', 'SecurityHealthSystray',
  'PhoneExperienceHost', 'WidgetService', 'Widgets', 'msedgewebview2',
  'chrome', 'msedge', 'firefox', 'opera', 'brave', 'vivaldi',
  'Discord', 'Telegram', 'Slack', 'Teams', 'Cursor', 'Code',
  'electron', 'nova', 'Nova', 'Spotify', 'MusicBee', 'AIMP', 'vlc',
  'notepad', 'WINWORD', 'EXCEL', 'POWERPNT', 'OUTLOOK', 'OneDrive',
  'steam', 'EpicGamesLauncher', 'Battle.net', 'GalaxyClient',
  'SearchUI', 'SystemSettingsAdminFlows', 'ShellHost',
]);

const GAME_PROCESS_HINTS = [
  'cs2', 'csgo', 'dota2', 'minecraft', 'javaw', 'GTA5', 'RocketLeague',
  'FortniteClient', 'VALORANT', 'League of Legends', 'RiotClientServices',
  'Overwatch', 'RainbowSix', 'PUBG', 'Terraria', 'Stardew Valley',
  'eldenring', 'Cyberpunk2077', 'witcher3', 'Skyrim', 'Fallout4',
  'Warframe', 'Destiny2', 'Apex', 'r5apex', 'HoYoPlay', 'GenshinImpact',
  'RobloxPlayerBeta', 'Among Us', 'Palworld', 'Helldivers2',
];

function isLikelyGame(processName, windowTitle) {
  const base = (processName || '').replace(/\.exe$/i, '');
  if (!base) return false;
  if (NON_GAME_PROCESSES.has(base)) return false;
  const lower = base.toLowerCase();
  if (GAME_PROCESS_HINTS.some((g) => lower.includes(g.toLowerCase()))) return true;
  if (/game|unity|unreal/i.test(base)) return true;
  if (windowTitle && windowTitle.length > 2 && !windowTitle.includes('Chrome') && !windowTitle.includes('Edge')) {
    if (windowTitle.toLowerCase().includes(lower) || lower.length >= 6) {
      if (/microsoft|windows|settings|nova|discord|telegram/i.test(windowTitle)) return false;
      return true;
    }
  }
  return false;
}

function isYouTubeApp(appId, sourceApp, title) {
  const hay = `${appId || ''} ${sourceApp || ''} ${title || ''}`.toLowerCase();
  return hay.includes('youtube') && !hay.includes('music.youtube');
}

function isYouTubeMusic(appId, sourceApp, title) {
  const hay = `${appId || ''} ${sourceApp || ''} ${title || ''}`.toLowerCase();
  return hay.includes('youtube music') || hay.includes('youtubemusic');
}

function resolveTimelineMs(session) {
  const now = Date.now();
  const lastUpdated = Number(session?.lastUpdatedTime) || now;
  const ageMs = Math.max(0, now - lastUpdated);
  const status = Number(session?.playback?.playbackStatus);
  const isPlaying = status === PLAYBACK_PLAYING;
  let positionSec = Math.max(0, Number(session?.timeline?.position) || 0);
  if (isPlaying) positionSec += ageMs / 1000;
  const durationSec = Math.max(0, Number(session?.timeline?.duration) || 0);
  return {
    positionMs: Math.floor(positionSec * 1000),
    durationMs: Math.floor(durationSec * 1000),
    isPlaying,
  };
}

function thumbnailToDataUrl(thumbnail) {
  if (!thumbnail || !Buffer.isBuffer(thumbnail) || thumbnail.length <= 0 || thumbnail.length >= 250000) {
    return '';
  }
  return `data:image/jpeg;base64,${thumbnail.toString('base64')}`;
}

function sessionToActivity(session) {
  const title = String(session?.media?.title || '').trim();
  if (!title) return null;

  const appId = String(session?.sourceAppId || '');
  const artistRaw = [session?.media?.artist, session?.media?.albumArtist]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(', ');
  const artist = normalizeArtists(artistRaw);
  const { positionMs, durationMs, isPlaying } = resolveTimelineMs(session);
  const artworkUrl = thumbnailToDataUrl(session?.media?.thumbnail);
  const isVideo = Number(session?.playback?.playbackType) === PLAYBACK_VIDEO;
  const now = Date.now();

  if (isYouTubeApp(appId, appId, title) || (isVideo && /youtube|chrome|msedge|firefox|brave|opera|vivaldi/i.test(appId))) {
    if (isYouTubeMusic(appId, appId, title)) return null;
    return {
      type: 'youtube',
      name: title,
      details: artist || appId,
      artworkUrl,
      positionMs,
      durationMs,
      isPlaying,
      startedAt: Math.floor((now - positionMs) / 1000),
      updatedAt: now,
      url: '',
    };
  }

  if (isYouTubeMusic(appId, appId, title)) return null;

  return {
    type: 'music',
    name: title,
    details: artist,
    artworkUrl,
    positionMs,
    durationMs,
    isPlaying,
    startedAt: Math.floor((now - positionMs) / 1000),
    updatedAt: now,
  };
}

function detectMediaFromNative() {
  const mod = getSmtcModule();
  if (!mod?.SMTCMonitor) return [];

  try {
    const current = mod.SMTCMonitor.getCurrentMediaSession();
    const all = mod.SMTCMonitor.getMediaSessions();
    const seen = new Set();
    const ordered = [];

    const pushSession = (session) => {
      if (!session?.media?.title) return;
      const key = `${session.sourceAppId}|${session.media.title}`;
      if (seen.has(key)) return;
      seen.add(key);
      ordered.push(session);
    };

    if (current) pushSession(current);
    const playing = all.filter((s) => Number(s?.playback?.playbackStatus) === PLAYBACK_PLAYING);
    for (const s of playing) pushSession(s);
    for (const s of all) pushSession(s);

    const activities = [];
    for (const session of ordered) {
      const activity = sessionToActivity(session);
      if (activity) activities.push(activity);
    }
    return activities;
  } catch {
    return [];
  }
}

async function runPowerShellFile(scriptPath) {
  if (process.platform !== 'win32') return null;
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { timeout: 8000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
    );
    const trimmed = (stdout || '').trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function parseMediaFromPs1(mediaList) {
  const activities = [];
  for (const m of mediaList) {
    if (!m || !m.title) continue;
    const appId = m.appId || m.sourceApp || '';
    const title = String(m.title || '').trim();
    const artist = normalizeArtists(String(m.artist || m.albumArtist || '').trim());
    const positionMs = Math.max(0, Math.floor(Number(m.positionMs) || 0));
    const durationMs = Math.max(0, Math.floor(Number(m.durationMs) || 0));
    const isPlaying = m.playbackStatus === 'Playing' || m.isPlaying === true;
    const artworkUrl = typeof m.artworkBase64 === 'string' && m.artworkBase64
      ? `data:image/jpeg;base64,${m.artworkBase64}`
      : '';
    const now = Date.now();

    if (isYouTubeApp(appId, m.sourceApp, title) || (m.isVideo && /youtube/i.test(appId))) {
      activities.push({
        type: 'youtube',
        name: title,
        details: artist || appId,
        artworkUrl,
        positionMs,
        durationMs,
        isPlaying,
        startedAt: Math.floor((now - positionMs) / 1000),
        updatedAt: now,
        url: m.url || '',
      });
    } else if (!isYouTubeMusic(appId, m.sourceApp, title)) {
      activities.push({
        type: 'music',
        name: title,
        details: artist,
        artworkUrl,
        positionMs,
        durationMs,
        isPlaying,
        startedAt: Math.floor((now - positionMs) / 1000),
        updatedAt: now,
      });
    }
  }
  return activities;
}

async function detectWindowsActivity() {
  if (process.platform !== 'win32') return [];

  const activities = [];
  let game = null;

  const scriptPath = path.join(__dirname, 'scripts', 'win-activity-detect.ps1');
  const data = await runPowerShellFile(scriptPath);

  if (data?.game && (data.game.processName || data.game.windowTitle)) {
    const procName = data.game.processName || '';
    const title = data.game.windowTitle || '';
    if (isLikelyGame(procName, title)) {
      const prevGame = (lastActivities || []).find((a) => a.type === 'game');
      const sameGame = prevGame && (
        prevGame.name === (title || procName.replace(/\.exe$/i, ''))
        || prevGame.details === procName.replace(/\.exe$/i, '')
      );
      game = {
        type: 'game',
        name: title || procName.replace(/\.exe$/i, ''),
        details: procName.replace(/\.exe$/i, ''),
        startedAt: sameGame?.startedAt || Math.floor(Date.now() / 1000),
        updatedAt: Date.now(),
        isPlaying: true,
      };
      activities.push(game);
    }
  }

  let mediaActivities = detectMediaFromNative();
  if (!mediaActivities.length && data?.media) {
    mediaActivities = parseMediaFromPs1(Array.isArray(data.media) ? data.media : []);
  }
  activities.push(...mediaActivities);

  const out = [];
  if (game) out.push(game);
  for (const a of activities) {
    if (a.type === 'game') continue;
    if (out.filter((x) => x.type === a.type).length >= 1) continue;
    out.push(a);
    if (out.length >= 3) break;
  }

  return out;
}

function preferDetails(prev, incoming) {
  const p = String(prev || '').trim();
  const i = String(incoming || '').trim();
  if (!p) return i;
  if (!i) return p;
  if (p.length >= i.length) return p;
  if (i.includes(p)) return i;
  return i;
}

function mergeDetectedActivities(prevList, incomingList) {
  const prevMap = new Map((prevList || []).map((a) => [`${a.type}|${String(a.name || '').trim().toLowerCase()}`, a]));
  return (incomingList || []).map((incoming) => {
    const key = `${incoming.type}|${String(incoming.name || '').trim().toLowerCase()}`;
    const prev = prevMap.get(key);
    const sysPos = Math.max(0, Number(incoming.positionMs) || 0);
    const sysDur = Math.max(0, Number(incoming.durationMs) || 0);
    const details = normalizeArtists(preferDetails(prev?.details, incoming.details));
    const startedAt = incoming.type === 'game' && prev?.startedAt
      ? prev.startedAt
      : incoming.startedAt;
    return {
      ...incoming,
      details,
      startedAt,
      positionMs: sysPos,
      durationMs: sysDur > 0 ? sysDur : (prev?.durationMs || 0),
    };
  });
}

let pollTimer = null;
let bootstrapTimers = [];
let lastFingerprint = '';
let lastActivities = [];
let onUpdateCallback = null;

function fingerprint(activities) {
  return JSON.stringify(activities.map((a) => ({
    t: a.type,
    n: String(a.name || '').trim().toLowerCase(),
    pl: a.isPlaying,
  })));
}

async function pollOnce() {
  try {
    const raw = await detectWindowsActivity();
    const activities = mergeDetectedActivities(lastActivities, raw);
    lastActivities = activities;
    const fp = fingerprint(activities);
    const playingMedia = activities.some((a) => (a.type === 'music' || a.type === 'youtube') && a.isPlaying);
    const playingGame = activities.some((a) => a.type === 'game' && a.isPlaying);
    if (fp !== lastFingerprint || playingMedia || playingGame) {
      lastFingerprint = fp;
      if (onUpdateCallback) onUpdateCallback(activities);
    }
  } catch {
    /* ignore */
  }
}

function startActivityDetector(callback, intervalMs = 2500) {
  onUpdateCallback = callback;
  if (pollTimer) clearInterval(pollTimer);
  bootstrapTimers.forEach(clearTimeout);
  bootstrapTimers = [];
  pollOnce();
  for (const delay of [200, 500, 1000, 2000]) {
    bootstrapTimers.push(setTimeout(pollOnce, delay));
  }
  pollTimer = setInterval(pollOnce, intervalMs);
}

function stopActivityDetector() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  bootstrapTimers.forEach(clearTimeout);
  bootstrapTimers = [];
  onUpdateCallback = null;
  lastFingerprint = '';
  lastActivities = [];
}

module.exports = {
  detectWindowsActivity,
  startActivityDetector,
  stopActivityDetector,
};
