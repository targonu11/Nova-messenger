/** Тип чата: group — все пишут; channel — только админы, без звонков */

export const GROUP_KIND_GROUP = 'group';
export const GROUP_KIND_CHANNEL = 'channel';

export function normalizeGroupKind(kind) {
  return kind === GROUP_KIND_CHANNEL ? GROUP_KIND_CHANNEL : GROUP_KIND_GROUP;
}

export function isChannelKind(kind) {
  return normalizeGroupKind(kind) === GROUP_KIND_CHANNEL;
}

export function getGroupRow(db, groupId) {
  if (!groupId) return null;
  try {
    return db.prepare('SELECT id, group_kind, created_by, server_id FROM groups WHERE id = ?').get(groupId);
  } catch {
    try {
      const row = db.prepare('SELECT id, created_by, server_id FROM groups WHERE id = ?').get(groupId);
      if (!row) return null;
      return {
        ...row,
        group_kind: row.server_id ? GROUP_KIND_CHANNEL : GROUP_KIND_GROUP,
      };
    } catch {
      return null;
    }
  }
}

export function isChannelGroup(db, groupId) {
  const row = getGroupRow(db, groupId);
  if (!row) return false;
  if (row.server_id) return true;
  return isChannelKind(row.group_kind);
}

export function canPostInGroup(db, userId, groupId) {
  if (!isChannelGroup(db, groupId)) return true;
  const m = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  return !!(m && m.role === 'admin');
}

export function mapGroupKindField(row) {
  if (!row) return GROUP_KIND_GROUP;
  if (row.group_kind) return normalizeGroupKind(row.group_kind);
  if (row.server_id) return GROUP_KIND_CHANNEL;
  return GROUP_KIND_GROUP;
}

export function mapGroupChannelSettings(row) {
  if (!row) {
    return {
      description: '',
      slowModeSec: 0,
      reactionsEnabled: true,
      inviteCode: null,
      postAsChannel: true,
      allowForward: true,
      allowCopy: true,
    };
  }
  return {
    description: row.description ? String(row.description) : '',
    slowModeSec: Number(row.slow_mode_sec) || 0,
    reactionsEnabled: row.reactions_enabled == null ? true : Number(row.reactions_enabled) !== 0,
    inviteCode: row.invite_code ? String(row.invite_code) : null,
    postAsChannel: row.post_as_channel == null ? true : Number(row.post_as_channel) !== 0,
    allowForward: row.allow_forward == null ? true : Number(row.allow_forward) !== 0,
    allowCopy: row.allow_copy == null ? true : Number(row.allow_copy) !== 0,
  };
}

export function allowForwardFromGroup(db, groupId) {
  if (!isChannelGroup(db, groupId)) return true;
  let row;
  try {
    row = db.prepare('SELECT allow_forward FROM groups WHERE id = ?').get(groupId);
  } catch {
    return true;
  }
  return row?.allow_forward == null ? true : Number(row.allow_forward) !== 0;
}

export function allowCopyFromGroup(db, groupId) {
  if (!isChannelGroup(db, groupId)) return true;
  let row;
  try {
    row = db.prepare('SELECT allow_copy FROM groups WHERE id = ?').get(groupId);
  } catch {
    return true;
  }
  return row?.allow_copy == null ? true : Number(row.allow_copy) !== 0;
}

export function applyChannelPostDisplay(db, groupId, msg) {
  if (!msg || !groupId || !isChannelGroup(db, groupId)) return msg;
  let row;
  try {
    row = db.prepare('SELECT name, avatar_path, post_as_channel FROM groups WHERE id = ?').get(groupId);
  } catch {
    return msg;
  }
  const asChannel = Number(msg.posted_as_channel) === 1
    || (msg.posted_as_channel == null && row?.post_as_channel != null && Number(row.post_as_channel) !== 0)
    || (msg.posted_as_channel == null && row?.post_as_channel == null);
  if (!asChannel) return msg;
  return {
    ...msg,
    authorName: msg.senderName,
    authorId: msg.senderId,
    senderName: row?.name || msg.senderName,
    senderAvatar: row?.avatar_path || msg.senderAvatar,
    postedAsChannel: true,
  };
}

export function reactionsEnabledForGroup(db, groupId) {
  if (!isChannelGroup(db, groupId)) return true;
  let row;
  try {
    row = db.prepare('SELECT reactions_enabled FROM groups WHERE id = ?').get(groupId);
  } catch {
    return true;
  }
  return row?.reactions_enabled == null ? true : Number(row.reactions_enabled) !== 0;
}

export function checkSlowMode(db, userId, groupId) {
  let row;
  try {
    row = db.prepare('SELECT slow_mode_sec FROM groups WHERE id = ?').get(groupId);
  } catch {
    return { ok: true };
  }
  const sec = Number(row?.slow_mode_sec) || 0;
  if (sec <= 0) return { ok: true };
  const last = db.prepare(`
    SELECT created_at FROM messages
    WHERE sender_id = ? AND recipient_type = 'group' AND recipient_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(userId, groupId);
  if (!last?.created_at) return { ok: true };
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - Number(last.created_at);
  if (elapsed >= sec) return { ok: true };
  return { ok: false, waitSec: Math.max(1, sec - elapsed) };
}
