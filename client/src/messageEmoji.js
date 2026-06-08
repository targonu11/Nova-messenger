/** Нормализация эмодзи для хранения и сравнения (👍 vs 👍️) */
export function normalizeReactionEmoji(emoji) {
  return String(emoji || '')
    .trim()
    .normalize('NFC')
    .replace(/\uFE0F/g, '');
}

/** Одно–три эмодзи без текста (Telegram-style крупные) */
export function isLargeEmojiText(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 24) return false;
  if (/[a-zA-Z0-9\u0400-\u04FF]/.test(t)) return false;
  const emojis = t.match(/\p{Extended_Pictographic}/gu);
  if (!emojis || emojis.length < 1 || emojis.length > 3) return false;
  const rest = t.replace(/\p{Extended_Pictographic}/gu, '').replace(/[\s\uFE0F\u200D]/g, '');
  return rest.length === 0;
}

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '👀', '🎉'];

/** Серверный grouped { emoji: [userId] } → клиентский { emoji: { count, me } } */
export function reactionsFromGrouped(grouped, currentUserId) {
  const uid = String(currentUserId ?? '');
  const merged = {};
  for (const [emoji, userIds] of Object.entries(grouped || {})) {
    if (!Array.isArray(userIds)) continue;
    const key = normalizeReactionEmoji(emoji);
    if (!merged[key]) merged[key] = { display: emoji, userIds: new Set() };
    userIds.forEach((id) => merged[key].userIds.add(String(id)));
  }
  const out = {};
  for (const [key, { display, userIds }] of Object.entries(merged)) {
    const arr = [...userIds];
    out[display] = { count: arr.length, me: arr.includes(uid) };
  }
  return out;
}

/** Локальный toggle до ответа сервера */
export function toggleReactionLocal(reactions, emoji, userId) {
  const uid = String(userId ?? '');
  const norm = normalizeReactionEmoji(emoji);
  const next = { ...(reactions || {}) };
  let foundKey = null;
  for (const k of Object.keys(next)) {
    if (normalizeReactionEmoji(k) === norm) {
      foundKey = k;
      break;
    }
  }
  if (foundKey) {
    const info = { ...next[foundKey] };
    if (info.me) {
      const count = Math.max(0, (info.count || 1) - 1);
      if (count <= 0) delete next[foundKey];
      else next[foundKey] = { ...info, count, me: false };
    } else {
      next[foundKey] = { ...info, count: (info.count || 0) + 1, me: true };
    }
  } else {
    next[emoji] = { count: 1, me: true };
  }
  return next;
}

export function reactionIsActive(reactions, emoji) {
  const norm = normalizeReactionEmoji(emoji);
  for (const [k, info] of Object.entries(reactions || {})) {
    if (normalizeReactionEmoji(k) === norm && info?.me) return true;
  }
  return false;
}
