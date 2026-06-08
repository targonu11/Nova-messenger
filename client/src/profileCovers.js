/** Обои профиля (как обложка VK) — preset:id или /uploads/... */
export const PROFILE_COVER_PRESETS = [
  {
    id: 'preset:nova',
    label: 'Nova',
    style: { background: 'linear-gradient(135deg, #7812e4 0%, #d6872d 100%)' },
  },
  {
    id: 'preset:purple',
    label: 'Фиолет',
    style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  },
  {
    id: 'preset:sunset',
    label: 'Закат',
    style: { background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
  },
  {
    id: 'preset:ocean',
    label: 'Океан',
    style: { background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  },
  {
    id: 'preset:forest',
    label: 'Лес',
    style: { background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
  },
  {
    id: 'preset:night',
    label: 'Ночь',
    style: { background: 'linear-gradient(155deg, #1a1b24 0%, #2d1b4e 45%, #7812e4 100%)' },
  },
  {
    id: 'preset:pattern',
    label: 'Узор',
    style: {
      background: 'repeating-linear-gradient(45deg, #1a1a2e, #1a1a2e 8px, #16213e 8px, #16213e 16px)',
    },
  },
  {
    id: 'preset:rose',
    label: 'Роза',
    style: { background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  },
];

export function getProfileCoverStyle(coverPath, urlFn) {
  if (!coverPath || typeof coverPath !== 'string') return null;
  const p = coverPath.trim();
  if (!p) return null;
  if (p.startsWith('preset:')) {
    const preset = PROFILE_COVER_PRESETS.find((x) => x.id === p);
    return preset ? { ...preset.style, backgroundSize: 'cover' } : null;
  }
  const url = urlFn ? urlFn(p) : null;
  return url
    ? {
        backgroundImage: `url(${url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
      }
    : null;
}
