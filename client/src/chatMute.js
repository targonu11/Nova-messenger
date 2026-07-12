const KEY = 'nova_muted_chats_v1';
const KEY_META = 'nova_muted_chats_meta_v1';

function chatKey(type, id) {
  return `${type === 'group' ? 'group' : 'user'}:${String(id)}`;
}

function readList() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeList(arr) {
  try {
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {}
}

function readMeta() {
  try {
    const raw = localStorage.getItem(KEY_META);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function writeMeta(obj) {
  try {
    localStorage.setItem(KEY_META, JSON.stringify(obj));
  } catch {}
}

/** Состояние мута: muted / until / hideBadge */
export function getChatMuteState(type, id) {
  if (id == null) return { muted: false, until: null, hideBadge: true };
  const k = chatKey(type, id);
  const muted = readList().includes(k);
  if (!muted) return { muted: false, until: null, hideBadge: true };
  const meta = readMeta()[k] || {};
  const until = typeof meta.until === 'number' ? meta.until : null;
  if (until && until <= Date.now()) {
    // истёк
    const arr = readList().filter((x) => x !== k);
    writeList(arr);
    const m = readMeta();
    delete m[k];
    writeMeta(m);
    return { muted: false, until: null, hideBadge: true };
  }
  return {
    muted: true,
    until,
    hideBadge: meta.hideBadge !== false,
  };
}

export function isChatMuted(type, id) {
  return !!getChatMuteState(type, id).muted;
}

/** @returns {boolean} новое состояние: true = без звука */
export function toggleChatMuted(type, id, opts = {}) {
  const k = chatKey(type, id);
  const arr = readList();
  const i = arr.indexOf(k);
  const meta = readMeta();
  if (i >= 0) {
    arr.splice(i, 1);
    delete meta[k];
    writeList(arr);
    writeMeta(meta);
    return false;
  }
  arr.push(k);
  meta[k] = {
    until: typeof opts.until === 'number' ? opts.until : null,
    hideBadge: opts.hideBadge !== false,
  };
  writeList(arr);
  writeMeta(meta);
  return true;
}

export function setChatMuted(type, id, { until = null, hideBadge = true } = {}) {
  const k = chatKey(type, id);
  const arr = readList();
  if (!arr.includes(k)) arr.push(k);
  writeList(arr);
  const meta = readMeta();
  meta[k] = { until, hideBadge };
  writeMeta(meta);
  return true;
}

export function unmuteChat(type, id) {
  const k = chatKey(type, id);
  writeList(readList().filter((x) => x !== k));
  const meta = readMeta();
  delete meta[k];
  writeMeta(meta);
}
