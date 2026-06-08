/** Обводка аватара (VK-style ring) */
export const AVATAR_RING_PRESETS = [
  { id: 'none', label: 'Без обводки' },
  { id: 'nova', label: 'Nova' },
  { id: 'purple', label: 'Фиолет' },
  { id: 'orange', label: 'Золото' },
  { id: 'white', label: 'Белая' },
  { id: 'blue', label: 'Синяя' },
  { id: 'pink', label: 'Розовая' },
  { id: 'rainbow', label: 'Радуга' },
];

export function normalizeAvatarRing(ring) {
  const id = String(ring || 'none').trim();
  if (id === '' || id === 'none') return 'none';
  return AVATAR_RING_PRESETS.some((p) => p.id === id) ? id : 'none';
}

export function avatarRingClass(ring) {
  const id = normalizeAvatarRing(ring);
  return id === 'none' ? '' : `avatar-ring avatar-ring--${id}`;
}
