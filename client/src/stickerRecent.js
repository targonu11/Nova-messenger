const STORAGE_KEY = 'nova_recent_stickers';
const MAX_RECENT = 24;

export function getRecentStickers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function addRecentSticker(sticker) {
  if (!sticker?.id || !sticker?.filePath) return;
  const entry = {
    id: sticker.id,
    packId: sticker.packId,
    filePath: sticker.filePath,
    emoji: sticker.emoji || '',
    mediaType: sticker.mediaType || 'static',
  };
  const prev = getRecentStickers().filter((s) => s.id !== entry.id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...prev].slice(0, MAX_RECENT)));
  } catch {
    /* ignore */
  }
}

export function getLastUsedPackId() {
  const recent = getRecentStickers();
  return recent[0]?.packId || null;
}
