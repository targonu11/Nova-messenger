/** Пресеты статуса (Discord / Telegram style) */
export const STATUS_PRESETS = [
  { id: 'clear', emoji: '', text: '', mode: 'online', labelKey: 'statusPresetOnline' },
  { id: 'gaming', emoji: '🎮', text: 'В игре', mode: 'dnd', labelKey: 'statusPresetGaming' },
  { id: 'dnd', emoji: '🔴', text: 'Не беспокоить', mode: 'dnd', labelKey: 'statusPresetDnd' },
  { id: 'idle', emoji: '🌙', text: 'Сплю', mode: 'idle', labelKey: 'statusPresetSleep' },
  { id: 'study', emoji: '📚', text: 'Учусь', mode: 'idle', labelKey: 'statusPresetStudy' },
  { id: 'music', emoji: '🎧', text: 'Слушаю музыку', mode: 'online', labelKey: 'statusPresetMusic' },
];

export function formatCustomStatusLine(entity) {
  if (!entity) return '';
  const emoji = (entity.customStatusEmoji || '').trim();
  const text = (entity.customStatusText || '').trim();
  if (!emoji && !text) return '';
  return [emoji, text].filter(Boolean).join(' ');
}

export function presenceModeFromEntity(entity) {
  if (!entity) return 'offline';
  if (entity.online === false) return 'offline';
  const mode = entity.customStatusMode || entity.statusMode || 'online';
  if (mode === 'dnd' || mode === 'idle') return mode;
  return 'online';
}

/** Текст под именем: кастомный статус или «в сети» */
export function formatPresenceSubtitle(entity, t) {
  const custom = formatCustomStatusLine(entity);
  if (custom) return custom;
  if (entity?.online) return t?.('statusOnline') || 'в сети';
  return '';
}
