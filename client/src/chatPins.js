const KEY = 'nova_pinned_chats_v1';

function chatKey(type, id) {
  return `${type === 'group' ? 'group' : 'user'}:${String(id)}`;
}

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(arr) {
  try {
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {}
}

export function isChatPinned(type, id) {
  if (id == null) return false;
  return readAll().includes(chatKey(type, id));
}

export function toggleChatPinned(type, id) {
  const k = chatKey(type, id);
  const arr = readAll();
  const i = arr.indexOf(k);
  if (i >= 0) arr.splice(i, 1);
  else arr.unshift(k);
  writeAll(arr);
  return arr.includes(k);
}

export function getPinnedChatKeys() {
  return readAll();
}
