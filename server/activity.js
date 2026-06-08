/** Rich presence / activity (Discord-style): game, music, YouTube */

const MAX_ACTIVITIES = 3;
const MAX_NAME = 200;
const MAX_DETAILS = 200;
const MAX_ARTWORK = 500_000;

function sanitizeActivity(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = ['game', 'music', 'youtube'].includes(raw.type) ? raw.type : null;
  if (!type) return null;
  const name = String(raw.name || raw.title || '').trim().slice(0, MAX_NAME);
  if (!name) return null;
  const details = String(raw.details || raw.artist || '').trim().slice(0, MAX_DETAILS);
  const artworkUrl = typeof raw.artworkUrl === 'string' && raw.artworkUrl.length <= MAX_ARTWORK
    ? raw.artworkUrl
    : '';
  const startedAt = Number.isFinite(Number(raw.startedAt)) ? Math.floor(Number(raw.startedAt)) : null;
  const positionMs = Number.isFinite(Number(raw.positionMs)) ? Math.max(0, Math.floor(Number(raw.positionMs))) : 0;
  const durationMs = Number.isFinite(Number(raw.durationMs)) ? Math.max(0, Math.floor(Number(raw.durationMs))) : 0;
  const isPlaying = raw.isPlaying !== false;
  const updatedAt = Number.isFinite(Number(raw.updatedAt)) ? Math.floor(Number(raw.updatedAt)) : Date.now();
  const url = typeof raw.url === 'string' ? raw.url.trim().slice(0, 500) : '';
  return {
    type,
    name,
    details,
    artworkUrl,
    startedAt,
    positionMs,
    durationMs,
    isPlaying,
    updatedAt,
    url,
  };
}

export function parseActivitiesJson(json) {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.map(sanitizeActivity).filter(Boolean).slice(0, MAX_ACTIVITIES);
  } catch {
    return [];
  }
}

export function serializeActivities(activities) {
  const list = Array.isArray(activities)
    ? activities.map(sanitizeActivity).filter(Boolean).slice(0, MAX_ACTIVITIES)
    : [];
  return JSON.stringify(list);
}

export function getUserActivities(db, userId) {
  try {
    const row = db.prepare('SELECT activities_json FROM user_activities WHERE user_id = ?').get(userId);
    return parseActivitiesJson(row?.activities_json);
  } catch {
    return [];
  }
}

export function setUserActivities(db, userId, activities) {
  const prev = getUserActivities(db, userId);
  const prevMap = new Map(
    prev.map((a) => [`${a.type}|${String(a.name || '').trim().toLowerCase()}`, a]),
  );
  const merged = (Array.isArray(activities) ? activities : []).map((raw) => {
    const a = sanitizeActivity(raw);
    if (!a) return null;
    if (a.type === 'game') {
      const key = `${a.type}|${String(a.name || '').trim().toLowerCase()}`;
      const p = prevMap.get(key);
      if (p?.startedAt && (!a.startedAt || a.startedAt > p.startedAt)) {
        return { ...a, startedAt: p.startedAt };
      }
    }
    return a;
  }).filter(Boolean).slice(0, MAX_ACTIVITIES);
  const json = JSON.stringify(merged);
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO user_activities (user_id, activities_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET activities_json = excluded.activities_json, updated_at = excluded.updated_at
  `).run(userId, json, now);
  return parseActivitiesJson(json);
}

export function getActivitiesBatch(db, userIds) {
  const out = {};
  for (const uid of userIds) {
    out[uid] = getUserActivities(db, uid);
  }
  return out;
}
