const UNREAD_KEY = 'nova_unread_v1';

function chatKey(type, id) {
  return `${type}:${String(id)}`;
}

function readAll() {
  try {
    const raw = localStorage.getItem(UNREAD_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(UNREAD_KEY, JSON.stringify(data));
  } catch {}
}

export function getUnreadCounts() {
  return { ...readAll() };
}

export function getUnreadCount(type, id) {
  const n = readAll()[chatKey(type, id)];
  return typeof n === 'number' && n > 0 ? n : 0;
}

export function getTotalUnread() {
  return Object.values(readAll()).reduce((s, n) => s + (Number(n) || 0), 0);
}

export function incrementUnread(type, id, by = 1) {
  const key = chatKey(type, id);
  const all = readAll();
  all[key] = (Number(all[key]) || 0) + by;
  writeAll(all);
  return all[key];
}

export function clearUnread(type, id) {
  const key = chatKey(type, id);
  const all = readAll();
  if (!all[key]) return;
  delete all[key];
  writeAll(all);
}
