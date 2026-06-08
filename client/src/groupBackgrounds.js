export const BACKGROUND_PRESETS = [
  { id: 'preset:gradient1', label: 'Градиент 1', style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' } },
  { id: 'preset:gradient2', label: 'Градиент 2', style: { background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' } },
  { id: 'preset:gradient3', label: 'Градиент 3', style: { background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' } },
  { id: 'preset:gradient4', label: 'Градиент 4', style: { background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' } },
  { id: 'preset:gradient5', label: 'Градиент 5', style: { background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' } },
  { id: 'preset:pattern', label: 'Узор', style: { background: 'repeating-linear-gradient(45deg, #1a1a2e, #1a1a2e 8px, #16213e 8px, #16213e 16px)' } },
];

export function getGroupBackgroundStyle(backgroundPath, avatarUrlFn) {
  if (!backgroundPath) return null;
  if (backgroundPath.startsWith('preset:')) {
    const preset = BACKGROUND_PRESETS.find((p) => p.id === backgroundPath);
    return preset ? { ...preset.style, backgroundSize: 'cover' } : null;
  }
  const url = avatarUrlFn ? avatarUrlFn(backgroundPath) : null;
  return url ? { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : null;
}
