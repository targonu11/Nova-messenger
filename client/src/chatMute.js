const KEY = 'nova_muted_chats_v1';

function key(type, id) {
  return `${type === 'group' ? 'group' : 'user'}:${String(id)}`;
}

export function isChatMuted(type, id) {
  if (id == null) return false;
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return false;
    return arr.includes(key(type, id));
  } catch {
    return false;
  }
}

/** @returns {boolean} новое состояние: true = без звука */
export function toggleChatMuted(type, id) {
  const k = key(type, id);
  try {
    const raw = localStorage.getItem(KEY);
    let arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) arr = [];
    const i = arr.indexOf(k);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(k);
    localStorage.setItem(KEY, JSON.stringify(arr));
    return arr.includes(k);
  } catch {
    return false;
  }
}
