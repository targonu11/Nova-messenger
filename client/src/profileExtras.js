const MUSIC_PREFIX = 'nova_profile_music_';

export function getStoredProfileMusic(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(MUSIC_PREFIX + String(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
    const artist = typeof parsed.artist === 'string' ? parsed.artist.trim() : '';
    const audioDataUrl = typeof parsed.audioDataUrl === 'string' ? parsed.audioDataUrl : '';
    if (!title && !artist && !audioDataUrl) return null;
    return { title, artist, audioDataUrl };
  } catch {
    return null;
  }
}

export function setStoredProfileMusic(userId, music) {
  if (!userId) return;
  try {
    if (!music || (!music.title && !music.artist && !music.audioDataUrl)) {
      localStorage.removeItem(MUSIC_PREFIX + String(userId));
      return;
    }
    localStorage.setItem(MUSIC_PREFIX + String(userId), JSON.stringify({
      title: music.title || '',
      artist: music.artist || '',
      audioDataUrl: music.audioDataUrl || '',
    }));
  } catch {}
}

