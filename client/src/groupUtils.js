/** Канал vs группа на клиенте */

export function isChannelGroup(peer) {
  if (!peer) return false;
  return peer.kind === 'channel' || peer.groupKind === 'channel';
}

export function canPostInChat(peer, type, currentUser) {
  if (type !== 'group' || !isChannelGroup(peer)) return true;
  const role = peer.myRole || peer.userRole;
  return role === 'admin';
}

export function canCallInChat(peer, type) {
  if (type !== 'group') return true;
  return !isChannelGroup(peer);
}
