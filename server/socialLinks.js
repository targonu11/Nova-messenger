/** Разрешённые ключи интеграций (профиль → внешние сервисы). */
export const SOCIAL_LINK_KEYS = [
  'reddit',
  'roblox',
  'steam',
  'instagram',
  'spotify',
  'twitter',
  'youtube',
  'github',
  'twitch',
  'discord',
  'tiktok',
  'telegram',
];

const KEY_SET = new Set(SOCIAL_LINK_KEYS);

export function parseSocialLinksJson(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const out = {};
    for (const k of KEY_SET) {
      const v = raw[k];
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  }
  if (typeof raw !== 'string') return {};
  try {
    const o = JSON.parse(raw);
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return {};
    const out = {};
    for (const k of KEY_SET) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function stripUrlToHandle(input) {
  let t = String(input).trim();
  if (!t) return '';
  t = t.replace(/^@+/, '');
  t = t.replace(/\/+$/, '');
  const patterns = [
    [/^(?:https?:\/\/)?(?:www\.)?reddit\.com\/(?:u|user)\/([^/?#]+)/i, (m) => m[1]],
    [/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i, (m) => m[1]],
    [/^(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([^/?#]+)/i, (m) => m[1]],
    [/^(?:https?:\/\/)?(?:www\.)?youtube\.com\/@([^/?#]+)/i, (m) => m[1]],
    [/^(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:c\/|channel\/|user\/)([^/?#]+)/i, (m) => m[1]],
    [/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#]+)/i, (m) => m[1]],
    [/^(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([^/?#]+)/i, (m) => m[1]],
    [/^(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([^/?#]+)/i, (m) => m[1]],
    [/^(?:https?:\/\/)?(?:t\.)?me\/([^/?#]+)/i, (m) => m[1]],
    [/^(?:https?:\/\/)?(?:open\.)?spotify\.com\/user\/([^/?#]+)/i, (m) => m[1]],
    [/^(?:https?:\/\/)?(?:www\.)?roblox\.com\/users\/(\d+)/i, (m) => m[1]],
    [/^(?:https?:\/\/)?(?:www\.)?roblox\.com\/users\/profile\?username=([^&]+)/i, (m) => decodeURIComponent(m[1])],
    [/^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/(?:profiles|id)\/([^/?#]+)/i, (m) => m[1]],
  ];
  for (const [re, fn] of patterns) {
    const m = t.match(re);
    if (m) return fn(m);
  }
  return t.split('/')[0].split('?')[0] || t;
}

function isValidHandle(s) {
  if (!s || s.length > 120) return false;
  return /^[a-zA-Z0-9_.\-]+$/.test(s);
}

/**
 * Принимает объект с ключами из SOCIAL_LINK_KEYS; пустые значения отбрасываются.
 * @throws {Error} INVALID_SHAPE
 */
export function sanitizeSocialLinksPayload(bodyValue) {
  if (bodyValue == null) return {};
  if (typeof bodyValue !== 'object' || Array.isArray(bodyValue)) {
    const err = new Error('INVALID_SHAPE');
    throw err;
  }
  const out = {};
  for (const key of KEY_SET) {
    if (!Object.prototype.hasOwnProperty.call(bodyValue, key)) continue;
    const raw = bodyValue[key];
    if (raw === null || raw === undefined || raw === '') continue;
    const cleaned = stripUrlToHandle(String(raw));
    if (!cleaned || !isValidHandle(cleaned)) continue;
    out[key] = cleaned;
  }
  return out;
}
