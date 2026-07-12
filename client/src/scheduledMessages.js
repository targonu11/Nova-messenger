const KEY = 'nova_scheduled_messages_v1';

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
    window.dispatchEvent(new CustomEvent('nova-scheduled'));
  } catch {}
}

export function getScheduledMessages() {
  return readAll().sort((a, b) => (a.sendAt || 0) - (b.sendAt || 0));
}

export function getScheduledForChat(type, id) {
  const t = type === 'group' ? 'group' : 'user';
  return getScheduledMessages().filter(
    (m) => m.recipientType === t && String(m.recipientId) === String(id)
  );
}

export function addScheduledMessage({
  recipientType,
  recipientId,
  content,
  messageType = null,
  messageMeta = null,
  replyToId = null,
  sendAt,
}) {
  const at = Number(sendAt);
  if (!Number.isFinite(at) || at <= Date.now()) return null;
  const text = String(content || '').trim();
  if (!text && messageType !== 'poll') return null;
  const item = {
    id: `sch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    recipientType: recipientType === 'group' ? 'group' : 'user',
    recipientId: String(recipientId),
    content: text,
    messageType: messageType || null,
    messageMeta: messageMeta || null,
    replyToId: replyToId || null,
    sendAt: at,
    createdAt: Date.now(),
  };
  const all = readAll();
  all.push(item);
  writeAll(all);
  return item;
}

export function removeScheduledMessage(id) {
  writeAll(readAll().filter((x) => x.id !== id));
}

export function takeDueScheduled(now = Date.now()) {
  const all = readAll();
  const due = all.filter((x) => Number(x.sendAt) <= now);
  if (!due.length) return [];
  const keep = all.filter((x) => Number(x.sendAt) > now);
  writeAll(keep);
  return due;
}
