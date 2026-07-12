const KEY = 'nova_chat_folders_v1';

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return { folders: [] };
    const folders = Array.isArray(parsed.folders) ? parsed.folders : [];
    return {
      folders: folders
        .filter((f) => f && f.id && f.name)
        .map((f) => ({
          id: String(f.id),
          name: String(f.name).slice(0, 32),
          chatKeys: Array.isArray(f.chatKeys) ? f.chatKeys.map(String) : [],
        })),
    };
  } catch {
    return { folders: [] };
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('nova-chat-folders'));
  } catch {}
}

function chatKey(type, id) {
  return `${type === 'group' ? 'group' : 'user'}:${String(id)}`;
}

export function getCustomFolders() {
  return readAll().folders;
}

export function createCustomFolder(name) {
  const n = String(name || '').trim().slice(0, 32);
  if (!n) return null;
  const data = readAll();
  const folder = {
    id: `f-${Date.now().toString(36)}`,
    name: n,
    chatKeys: [],
  };
  data.folders.push(folder);
  writeAll(data);
  return folder;
}

export function renameCustomFolder(folderId, name) {
  const n = String(name || '').trim().slice(0, 32);
  if (!n) return false;
  const data = readAll();
  const f = data.folders.find((x) => x.id === folderId);
  if (!f) return false;
  f.name = n;
  writeAll(data);
  return true;
}

export function deleteCustomFolder(folderId) {
  const data = readAll();
  data.folders = data.folders.filter((x) => x.id !== folderId);
  writeAll(data);
}

export function addChatToFolder(folderId, type, id) {
  const data = readAll();
  const f = data.folders.find((x) => x.id === folderId);
  if (!f) return false;
  const k = chatKey(type, id);
  if (!f.chatKeys.includes(k)) f.chatKeys.push(k);
  writeAll(data);
  return true;
}

export function removeChatFromFolder(folderId, type, id) {
  const data = readAll();
  const f = data.folders.find((x) => x.id === folderId);
  if (!f) return false;
  const k = chatKey(type, id);
  f.chatKeys = f.chatKeys.filter((x) => x !== k);
  writeAll(data);
  return true;
}

export function isChatInFolder(folderId, type, id) {
  const f = readAll().folders.find((x) => x.id === folderId);
  if (!f) return false;
  return f.chatKeys.includes(chatKey(type, id));
}

export function getFoldersForChat(type, id) {
  const k = chatKey(type, id);
  return readAll().folders.filter((f) => f.chatKeys.includes(k));
}
