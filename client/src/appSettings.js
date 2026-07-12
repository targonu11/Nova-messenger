const SETTINGS_KEY = 'nova_app_settings_v1';

const defaults = {
  sendByEnter: true,
  enableMessageReactions: true,
  enableLargeEmoji: true,
  replaceEmojiAutomatically: true,
  foldersShowUnreadBadge: true,
  foldersPinFavoritesTop: true,
  foldersCollapseEmpty: false,
  foldersQuickAction: 'archive',
  notificationsDesktopEnabled: true,
  notificationsPlaySound: true,
  notificationsFlashTaskbar: true,
  notificationsPreviewMode: 'name_text',
  privacyReadReceipts: true,
  privacyProfilePhotoPublic: true,
  privacyAllowCalls: true,
  privacyAllowGroupInvites: true,
  advancedHardwareAcceleration: true,
  advancedSmoothAnimations: true,
  advancedCompactMode: false,
  advancedAutoUpdate: true,
  batterySaverMode: false,
  batteryReduceMotion: false,
  batteryLowBandwidthMode: false,
  batteryGifAutoplay: true,
  /** UI: s | m | l | xl */
  uiFontScale: 'm',
  /** nova | purple | green | rose | orange | teal */
  uiAccentPreset: 'nova',
  /** comfortable | compact */
  uiChatDensity: 'comfortable',
  /** normal | soft */
  uiRadius: 'normal',
  /** Карточка профиля сверху чата (выкл. по умолчанию — мешает чату) */
  uiShowChatProfileTop: false,
  /** Узкий | обычный | широкий сайдбар */
  uiSidebarWidth: 'normal',
  /** Отступы между сообщениями: tight | normal | relaxed */
  uiMessageGap: 'normal',
  /** Показывать аватары у сообщений в чате */
  uiShowMessageAvatars: true,
  /** Тема следует за системной (prefers-color-scheme) */
  syncThemeWithSystem: false,
  /** Меньше насыщенности интерфейса (доступность) */
  uiLowSaturation: false,
  /** Авто-показ текста голосовых (как в Telegram) */
  voiceAutoShowTranscript: true,
  /** Язык перевода голосовых сообщений (ru, en, uk, de) */
  voicePreferredLang: 'ru',
  /** Imba FX — эпичные анимации сообщений, presence aurora, combo */
  uiImbaFx: true,
};

function readAll() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    return { ...defaults, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...defaults };
  }
}

function writeAll(next) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {}
}

export function getAppSettings() {
  return readAll();
}

export function setAppSetting(key, value) {
  const current = readAll();
  const next = { ...current, [key]: value };
  writeAll(next);
  return next;
}

export function getSendByEnter() {
  return !!readAll().sendByEnter;
}

export function setSendByEnter(enabled) {
  return setAppSetting('sendByEnter', !!enabled);
}

export function getEnableMessageReactions() {
  return !!readAll().enableMessageReactions;
}

export function setEnableMessageReactions(enabled) {
  return setAppSetting('enableMessageReactions', !!enabled);
}

export function getEnableLargeEmoji() {
  return !!readAll().enableLargeEmoji;
}

export function setEnableLargeEmoji(enabled) {
  return setAppSetting('enableLargeEmoji', !!enabled);
}

export function getReplaceEmojiAutomatically() {
  return !!readAll().replaceEmojiAutomatically;
}

export function setReplaceEmojiAutomatically(enabled) {
  return setAppSetting('replaceEmojiAutomatically', !!enabled);
}

export function getFoldersShowUnreadBadge() {
  return !!readAll().foldersShowUnreadBadge;
}

export function setFoldersShowUnreadBadge(enabled) {
  return setAppSetting('foldersShowUnreadBadge', !!enabled);
}

export function getFoldersPinFavoritesTop() {
  return !!readAll().foldersPinFavoritesTop;
}

export function setFoldersPinFavoritesTop(enabled) {
  return setAppSetting('foldersPinFavoritesTop', !!enabled);
}

export function getFoldersCollapseEmpty() {
  return !!readAll().foldersCollapseEmpty;
}

export function setFoldersCollapseEmpty(enabled) {
  return setAppSetting('foldersCollapseEmpty', !!enabled);
}

export function getFoldersQuickAction() {
  const v = readAll().foldersQuickAction;
  return v === 'pin' || v === 'mute' || v === 'archive' ? v : 'archive';
}

export function setFoldersQuickAction(value) {
  const v = value === 'pin' || value === 'mute' || value === 'archive' ? value : 'archive';
  return setAppSetting('foldersQuickAction', v);
}

export function getNotificationsDesktopEnabled() {
  return !!readAll().notificationsDesktopEnabled;
}
export function setNotificationsDesktopEnabled(enabled) {
  return setAppSetting('notificationsDesktopEnabled', !!enabled);
}
export function getNotificationsPlaySound() {
  return !!readAll().notificationsPlaySound;
}
export function setNotificationsPlaySound(enabled) {
  return setAppSetting('notificationsPlaySound', !!enabled);
}
export function getNotificationsFlashTaskbar() {
  return !!readAll().notificationsFlashTaskbar;
}
export function setNotificationsFlashTaskbar(enabled) {
  return setAppSetting('notificationsFlashTaskbar', !!enabled);
}
export function getNotificationsPreviewMode() {
  const v = readAll().notificationsPreviewMode;
  return v === 'none' || v === 'name_only' || v === 'name_text' ? v : 'name_text';
}
export function setNotificationsPreviewMode(mode) {
  const v = mode === 'none' || mode === 'name_only' || mode === 'name_text' ? mode : 'name_text';
  return setAppSetting('notificationsPreviewMode', v);
}

export function getPrivacyReadReceipts() {
  return !!readAll().privacyReadReceipts;
}
export function setPrivacyReadReceipts(enabled) {
  return setAppSetting('privacyReadReceipts', !!enabled);
}
export function getPrivacyProfilePhotoPublic() {
  return !!readAll().privacyProfilePhotoPublic;
}
export function setPrivacyProfilePhotoPublic(enabled) {
  return setAppSetting('privacyProfilePhotoPublic', !!enabled);
}
export function getPrivacyAllowCalls() {
  return !!readAll().privacyAllowCalls;
}
export function setPrivacyAllowCalls(enabled) {
  return setAppSetting('privacyAllowCalls', !!enabled);
}
export function getPrivacyAllowGroupInvites() {
  return !!readAll().privacyAllowGroupInvites;
}
export function setPrivacyAllowGroupInvites(enabled) {
  return setAppSetting('privacyAllowGroupInvites', !!enabled);
}

export function getAdvancedHardwareAcceleration() {
  return !!readAll().advancedHardwareAcceleration;
}
export function setAdvancedHardwareAcceleration(enabled) {
  return setAppSetting('advancedHardwareAcceleration', !!enabled);
}
export function getAdvancedSmoothAnimations() {
  return !!readAll().advancedSmoothAnimations;
}
export function setAdvancedSmoothAnimations(enabled) {
  return setAppSetting('advancedSmoothAnimations', !!enabled);
}
export function getAdvancedCompactMode() {
  return !!readAll().advancedCompactMode;
}
export function setAdvancedCompactMode(enabled) {
  return setAppSetting('advancedCompactMode', !!enabled);
}
export function getAdvancedAutoUpdate() {
  return !!readAll().advancedAutoUpdate;
}
export function setAdvancedAutoUpdate(enabled) {
  return setAppSetting('advancedAutoUpdate', !!enabled);
}

export function getBatterySaverMode() {
  return !!readAll().batterySaverMode;
}
export function setBatterySaverMode(enabled) {
  return setAppSetting('batterySaverMode', !!enabled);
}
export function getBatteryReduceMotion() {
  return !!readAll().batteryReduceMotion;
}
export function setBatteryReduceMotion(enabled) {
  return setAppSetting('batteryReduceMotion', !!enabled);
}
export function getBatteryLowBandwidthMode() {
  return !!readAll().batteryLowBandwidthMode;
}
export function setBatteryLowBandwidthMode(enabled) {
  return setAppSetting('batteryLowBandwidthMode', !!enabled);
}
export function getBatteryGifAutoplay() {
  return !!readAll().batteryGifAutoplay;
}
export function setBatteryGifAutoplay(enabled) {
  return setAppSetting('batteryGifAutoplay', !!enabled);
}

