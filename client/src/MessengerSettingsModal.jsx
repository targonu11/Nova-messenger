import React, { useState, useEffect } from 'react';
import { getStoredLang, setStoredLang, t } from './i18n';
import { requestOverlayClose } from './novaMotion';
import {
  avatarUrl,
  getMe,
  getSessions,
  revokeSession,
  logoutAllDevices,
  setTwoFaPin,
  getStarredMessages,
  updateProfile,
  getApiBaseUrl,
  getApiBaseUrlDisplay,
  getDefaultApiBaseUrl,
  setApiBaseUrlOverride,
  clearApiBaseUrlOverride,
  hasApiBaseUrlOverride,
  normalizeApiBaseUrl,
  fetchServerVersion,
} from './api';
import { applyUiCustomization } from './uiCustomize';
import { applyMotionPreferences } from './motion';
import { BotsSettings } from './BotsSettings';
import './StickerPicker.css';
import {
  getAdvancedAutoUpdate,
  getAdvancedCompactMode,
  getAdvancedHardwareAcceleration,
  getAdvancedSmoothAnimations,
  getBatteryGifAutoplay,
  getBatteryLowBandwidthMode,
  getBatteryReduceMotion,
  getBatterySaverMode,
  getEnableLargeEmoji,
  getEnableMessageReactions,
  getFoldersCollapseEmpty,
  getFoldersPinFavoritesTop,
  getFoldersQuickAction,
  getFoldersShowUnreadBadge,
  getNotificationsDesktopEnabled,
  getNotificationsFlashTaskbar,
  getNotificationsPlaySound,
  getNotificationsPreviewMode,
  getPrivacyAllowCalls,
  getPrivacyAllowGroupInvites,
  getPrivacyProfilePhotoPublic,
  getPrivacyReadReceipts,
  getReplaceEmojiAutomatically,
  getSendByEnter,
  setAdvancedAutoUpdate,
  setAdvancedCompactMode,
  setAdvancedHardwareAcceleration,
  setAdvancedSmoothAnimations,
  setBatteryGifAutoplay,
  setBatteryLowBandwidthMode,
  setBatteryReduceMotion,
  setBatterySaverMode,
  setEnableLargeEmoji,
  setEnableMessageReactions,
  setFoldersCollapseEmpty,
  setFoldersPinFavoritesTop,
  setFoldersQuickAction,
  setFoldersShowUnreadBadge,
  setNotificationsDesktopEnabled,
  setNotificationsFlashTaskbar,
  setNotificationsPlaySound,
  setNotificationsPreviewMode,
  setPrivacyAllowCalls,
  setPrivacyAllowGroupInvites,
  setPrivacyProfilePhotoPublic,
  setPrivacyReadReceipts,
  setReplaceEmojiAutomatically,
  setSendByEnter,
  getAppSettings,
  setAppSetting,
} from './appSettings';
import './MessengerSettingsModal.css';
import { getStoredTheme, setStoredTheme, applyTheme } from './themeStorage';

export { getStoredTheme, setStoredTheme, applyTheme };

const AUDIO_INPUT_KEY = 'nova_audio_input_id';
const AUDIO_OUTPUT_KEY = 'nova_audio_output_id';
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

export function getStoredAudioInputId() {
  try {
    return localStorage.getItem(AUDIO_INPUT_KEY) || '';
  } catch {
    return '';
  }
}

export function getStoredAudioOutputId() {
  try {
    return localStorage.getItem(AUDIO_OUTPUT_KEY) || '';
  } catch {
    return '';
  }
}

function setStoredAudioInputId(id) {
  try {
    if (id) localStorage.setItem(AUDIO_INPUT_KEY, id);
    else localStorage.removeItem(AUDIO_INPUT_KEY);
  } catch (e) {}
}

function setStoredAudioOutputId(id) {
  try {
    if (id) localStorage.setItem(AUDIO_OUTPUT_KEY, id);
    else localStorage.removeItem(AUDIO_OUTPUT_KEY);
  } catch (e) {}
}

export default function MessengerSettingsModal({ onClose, onThemeChange, onLangChange, onLogout, onOpenProfileEdit, onOpenBotChat }) {
  const [page, setPage] = useState('main');
  const [pageDir, setPageDir] = useState('forward');
  const [closing, setClosing] = useState(false);
  const [lang, setLang] = useState(getStoredLang);
  const [voicePreferredLang, setVoicePreferredLangState] = useState(() => getAppSettings().voicePreferredLang || 'ru');
  const [theme, setTheme] = useState(getStoredTheme);
  const [me, setMe] = useState(null);
  const [audioInputs, setAudioInputs] = useState([]);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [selectedInputId, setSelectedInputId] = useState(getStoredAudioInputId);
  const [selectedOutputId, setSelectedOutputId] = useState(getStoredAudioOutputId);
  const [hideLastSeen, setHideLastSeen] = useState(false);
  const [accountLoading, setAccountLoading] = useState(true);
  const [sendByEnter, setSendByEnterState] = useState(getSendByEnter);
  const [enableMessageReactions, setEnableMessageReactionsState] = useState(getEnableMessageReactions);
  const [enableLargeEmoji, setEnableLargeEmojiState] = useState(getEnableLargeEmoji);
  const [replaceEmojiAutomatically, setReplaceEmojiAutomaticallyState] = useState(getReplaceEmojiAutomatically);
  const [foldersShowUnreadBadge, setFoldersShowUnreadBadgeState] = useState(getFoldersShowUnreadBadge);
  const [foldersPinFavoritesTop, setFoldersPinFavoritesTopState] = useState(getFoldersPinFavoritesTop);
  const [foldersCollapseEmpty, setFoldersCollapseEmptyState] = useState(getFoldersCollapseEmpty);
  const [foldersQuickAction, setFoldersQuickActionState] = useState(getFoldersQuickAction);
  const [notificationsDesktopEnabled, setNotificationsDesktopEnabledState] = useState(getNotificationsDesktopEnabled);
  const [notificationsPlaySound, setNotificationsPlaySoundState] = useState(getNotificationsPlaySound);
  const [notificationsFlashTaskbar, setNotificationsFlashTaskbarState] = useState(getNotificationsFlashTaskbar);
  const [notificationsPreviewMode, setNotificationsPreviewModeState] = useState(getNotificationsPreviewMode);
  const [privacyReadReceipts, setPrivacyReadReceiptsState] = useState(getPrivacyReadReceipts);
  const [privacyProfilePhotoPublic, setPrivacyProfilePhotoPublicState] = useState(getPrivacyProfilePhotoPublic);
  const [privacyAllowCalls, setPrivacyAllowCallsState] = useState(getPrivacyAllowCalls);
  const [privacyAllowGroupInvites, setPrivacyAllowGroupInvitesState] = useState(getPrivacyAllowGroupInvites);
  const [advancedHardwareAcceleration, setAdvancedHardwareAccelerationState] = useState(getAdvancedHardwareAcceleration);
  const [advancedSmoothAnimations, setAdvancedSmoothAnimationsState] = useState(getAdvancedSmoothAnimations);
  const [advancedCompactMode, setAdvancedCompactModeState] = useState(getAdvancedCompactMode);
  const [advancedAutoUpdate, setAdvancedAutoUpdateState] = useState(getAdvancedAutoUpdate);
  const [batterySaverMode, setBatterySaverModeState] = useState(getBatterySaverMode);
  const [batteryReduceMotion, setBatteryReduceMotionState] = useState(getBatteryReduceMotion);
  const [batteryLowBandwidthMode, setBatteryLowBandwidthModeState] = useState(getBatteryLowBandwidthMode);
  const [batteryGifAutoplay, setBatteryGifAutoplayState] = useState(getBatteryGifAutoplay);
  const [apiUrlDraft, setApiUrlDraft] = useState('');
  const [serverTestMsg, setServerTestMsg] = useState('');
  const [serverVersionLabel, setServerVersionLabel] = useState(null);
  const [uiFontScale, setUiFontScaleState] = useState(() => getAppSettings().uiFontScale || 'm');
  const [uiAccentPreset, setUiAccentPresetState] = useState(() => {
    const p = getAppSettings().uiAccentPreset || 'nova';
    return p === 'blue' ? 'nova' : p;
  });
  const [uiChatDensity, setUiChatDensityState] = useState(() => getAppSettings().uiChatDensity || 'comfortable');
  const [uiRadius, setUiRadiusState] = useState(() => getAppSettings().uiRadius || 'normal');
  const [syncThemeWithSystem, setSyncThemeWithSystemState] = useState(() => !!getAppSettings().syncThemeWithSystem);
  const [uiShowChatProfileTop, setUiShowChatProfileTopState] = useState(() => getAppSettings().uiShowChatProfileTop === true);
  const [uiSidebarWidth, setUiSidebarWidthState] = useState(() => getAppSettings().uiSidebarWidth || 'normal');
  const [uiMessageGap, setUiMessageGapState] = useState(() => getAppSettings().uiMessageGap || 'normal');
  const [uiShowMessageAvatars, setUiShowMessageAvatarsState] = useState(() => getAppSettings().uiShowMessageAvatars !== false);
  const [uiImbaFx, setUiImbaFxState] = useState(() => getAppSettings().uiImbaFx !== false);
  const [uiLowSaturation, setUiLowSaturationState] = useState(() => !!getAppSettings().uiLowSaturation);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState('');
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [twoFaPassword, setTwoFaPassword] = useState('');
  const [twoFaPin, setTwoFaPin] = useState('');
  const [twoFaBusy, setTwoFaBusy] = useState(false);
  const [twoFaMsg, setTwoFaMsg] = useState('');
  const [starred, setStarred] = useState([]);
  const [starredLoading, setStarredLoading] = useState(false);
  const [starredError, setStarredError] = useState('');

  useEffect(() => {
    setApiUrlDraft(hasApiBaseUrlOverride() ? getApiBaseUrl() : '');
    fetchServerVersion()
      .then((d) => setServerVersionLabel(d.version || null))
      .catch(() => setServerVersionLabel(null));
  }, []);

  useEffect(() => {
    if (page !== 'privacy') return;
    let cancelled = false;
    setSessionsError('');
    setSessionsLoading(true);
    getSessions()
      .then((rows) => { if (!cancelled) setSessions(Array.isArray(rows) ? rows : []); })
      .catch((e) => { if (!cancelled) setSessionsError(e?.message || 'Failed to load sessions'); })
      .finally(() => { if (!cancelled) setSessionsLoading(false); });
    return () => { cancelled = true; };
  }, [page]);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((profile) => {
        if (cancelled) return;
        setMe(profile);
        setHideLastSeen(!!profile.hideLastSeen);
        setTwoFaEnabled(!!profile.twofaEnabled);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAccountLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleHideLastSeen = (e) => {
    const value = e.target.checked;
    setHideLastSeen(value);
    updateProfile(undefined, undefined, undefined, value).catch(() => setHideLastSeen(!value));
  };

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        if (cancelled) return;
        const inputs = devices.filter((d) => d.kind === 'audioinput');
        const outputs = devices.filter((d) => d.kind === 'audiooutput');
        setAudioInputs(inputs);
        setAudioOutputs(outputs);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleLang = (value) => {
    setStoredLang(value);
    setLang(value);
    onLangChange?.(value);
  };

  const handleTheme = (value) => {
    setAppSetting('syncThemeWithSystem', false);
    setSyncThemeWithSystemState(false);
    setTheme(value);
    applyTheme(value);
    applyUiCustomization();
    onThemeChange?.(value);
  };

  const handleSaveApiUrl = () => {
    const v = apiUrlDraft.trim();
    if (!v) clearApiBaseUrlOverride();
    else setApiBaseUrlOverride(v);
    window.location.reload();
  };

  const handleClearApiUrl = () => {
    clearApiBaseUrlOverride();
    setApiUrlDraft('');
    window.location.reload();
  };

  const handleTestApiUrl = async () => {
    setServerTestMsg('');
    const raw = apiUrlDraft.trim() || getDefaultApiBaseUrl();
    const base = normalizeApiBaseUrl(raw);
    try {
      const r = await fetch(base + '/api/health', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      setServerTestMsg('OK');
    } catch (e) {
      setServerTestMsg(e && e.message ? String(e.message) : 'Failed');
    }
  };

  const handleInputChange = (e) => {
    const id = e.target.value || '';
    setSelectedInputId(id);
    setStoredAudioInputId(id);
  };

  const handleOutputChange = (e) => {
    const id = e.target.value || '';
    setSelectedOutputId(id);
    setStoredAudioOutputId(id);
  };

  const avatar =
    avatarUrl(me?.avatarPath) ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${me?.id || 'user'}`;
  const profileName = me?.displayName || me?.login || 'User';
  const profileSubtitle = me?.phone || (me?.login ? `@${me.login}` : '');
  const currentLangLabel = lang === 'en' ? t('langEn') : t('langRu');
  const inputDeviceLabel =
    audioInputs.find((d) => d.deviceId === selectedInputId)?.label ||
    (selectedInputId ? `${t('microphone')} ${selectedInputId.slice(0, 8)}` : t('defaultDevice'));
  const outputDeviceLabel =
    audioOutputs.find((d) => d.deviceId === selectedOutputId)?.label ||
    (selectedOutputId ? `${t('speaker')} ${selectedOutputId.slice(0, 8)}` : t('defaultDevice'));

  const openPage = (next) => {
    setPageDir('forward');
    setPage(next);
  };
  const goMain = () => {
    setPageDir('back');
    setPage('main');
  };
  const closeModal = () => requestOverlayClose(setClosing, onClose);

  return (
    <div className={`modal-overlay${closing ? ' modal-overlay--closing' : ''}`} onClick={closeModal}>
      <div className="modal messenger-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="messenger-settings-header">
          <div className="messenger-settings-header-left">
            {page !== 'main' && (
              <button type="button" className="btn-icon-back" onClick={goMain} aria-label={t('close')}>
                ←
              </button>
            )}
            <h2>
              {page === 'main' && t('settingsTitle')}
              {page === 'notifications' && 'Notifications and Sounds'}
              {page === 'chat' && 'Chat Settings'}
              {page === 'speakers' && 'Speakers and Camera'}
              {page === 'folders' && 'Folders'}
              {page === 'account' && 'My Account'}
              {page === 'privacy' && 'Privacy and Security'}
              {page === 'advanced' && 'Advanced'}
              {page === 'battery' && 'Battery and Animations'}
              {page === 'language' && t('language')}
              {page === 'bots' && t('botsTitle')}
              {page === 'server' && 'Server & connection'}
              {page === 'appearance' && t('guiAppearance')}
            </h2>
          </div>
          <button type="button" className="btn-icon-close" onClick={closeModal} aria-label={t('close')}>
            <span className="icon-close">×</span>
          </button>
        </div>

        <div className={`messenger-settings-page messenger-settings-page--${pageDir}`} key={page}>
        <div className="messenger-settings-body">
          {page === 'main' && (
            <>
              <section className="messenger-settings-profile">
                <img className="messenger-settings-profile-avatar" src={avatar} alt="" />
                <div className="messenger-settings-profile-info">
                  <div className="messenger-settings-profile-name">{profileName}</div>
                  <div className="messenger-settings-profile-subtitle">{profileSubtitle}</div>
                </div>
              </section>

              <section className="messenger-settings-list">
                <button type="button" className="messenger-settings-row" onClick={() => openPage('account')}>
                  <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">👤</span><span className="messenger-settings-row-text">My Account</span></span>
                </button>
                <button type="button" className="messenger-settings-row" onClick={() => openPage('server')}>
                  <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🌐</span><span className="messenger-settings-row-text">Server & connection</span></span>
                  <span className="messenger-settings-row-right"><span className="messenger-settings-row-value">{getApiBaseUrlDisplay()}</span></span>
                </button>
                <button type="button" className="messenger-settings-row" onClick={() => openPage('appearance')}>
                  <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🎨</span><span className="messenger-settings-row-text">Appearance</span></span>
                </button>
                <button type="button" className="messenger-settings-row" onClick={() => openPage('notifications')}>
                  <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🔔</span><span className="messenger-settings-row-text">Notifications and Sounds</span></span>
                </button>
                <button type="button" className="messenger-settings-row" onClick={() => openPage('privacy')}>
                  <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🔒</span><span className="messenger-settings-row-text">Privacy and Security</span></span>
                </button>
                <button type="button" className="messenger-settings-row" onClick={() => openPage('chat')}>
                  <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">💬</span><span className="messenger-settings-row-text">Chat Settings</span></span>
                </button>
                <button type="button" className="messenger-settings-row" onClick={() => openPage('folders')}>
                  <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">📁</span><span className="messenger-settings-row-text">Folders</span></span>
                </button>
                <button type="button" className="messenger-settings-row" onClick={() => openPage('advanced')}>
                  <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">⚙️</span><span className="messenger-settings-row-text">Advanced</span></span>
                </button>
                <button type="button" className="messenger-settings-row" onClick={() => openPage('speakers')}>
                  <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🔊</span><span className="messenger-settings-row-text">Speakers and Camera</span></span>
                </button>
                <button type="button" className="messenger-settings-row" onClick={() => openPage('battery')}>
                  <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🔋</span><span className="messenger-settings-row-text">Battery and Animations</span></span>
                </button>
                <button type="button" className="messenger-settings-row" onClick={() => openPage('bots')}>
                  <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon messenger-settings-row-icon-bot" /><span className="messenger-settings-row-text">{t('botsTitle')}</span></span>
                </button>
                <button type="button" className="messenger-settings-row" onClick={() => openPage('language')}>
                  <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🌐</span><span className="messenger-settings-row-text">{t('language')}</span></span>
                  <span className="messenger-settings-row-right"><span className="messenger-settings-row-value">{currentLangLabel}</span></span>
                </button>
              </section>

              {onLogout && (
                <section className="messenger-settings-section messenger-settings-logout">
                  <button type="button" className="messenger-settings-logout-btn" onClick={() => { onClose(); onLogout(); }} aria-label={t('logOut')}>
                    {t('logOut')}
                  </button>
                </section>
              )}
            </>
          )}

          {page === 'notifications' && (
            <section className="messenger-settings-list">
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🖥️</span><span className="messenger-settings-row-text">Desktop notifications</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={notificationsDesktopEnabled} onChange={(e) => { setNotificationsDesktopEnabledState(e.target.checked); setNotificationsDesktopEnabled(e.target.checked); }} />
                </span>
              </label>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🔊</span><span className="messenger-settings-row-text">Allow sound</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={notificationsPlaySound} onChange={(e) => { setNotificationsPlaySoundState(e.target.checked); setNotificationsPlaySound(e.target.checked); }} />
                </span>
              </label>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">💡</span><span className="messenger-settings-row-text">Flash taskbar icon</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={notificationsFlashTaskbar} onChange={(e) => { setNotificationsFlashTaskbarState(e.target.checked); setNotificationsFlashTaskbar(e.target.checked); }} />
                </span>
              </label>
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">📝</span><span className="messenger-settings-row-text">Message preview</span></span>
              </div>
              <div className="messenger-settings-row messenger-settings-row-radio">
                <label className="messenger-settings-radio-line">
                  <input type="radio" name="notification-preview-mode" checked={notificationsPreviewMode === 'name_text'} onChange={() => { setNotificationsPreviewModeState('name_text'); setNotificationsPreviewMode('name_text'); }} />
                  <span>Name and text</span>
                </label>
              </div>
              <div className="messenger-settings-row messenger-settings-row-radio">
                <label className="messenger-settings-radio-line">
                  <input type="radio" name="notification-preview-mode" checked={notificationsPreviewMode === 'name_only'} onChange={() => { setNotificationsPreviewModeState('name_only'); setNotificationsPreviewMode('name_only'); }} />
                  <span>Name only</span>
                </label>
              </div>
              <div className="messenger-settings-row messenger-settings-row-radio">
                <label className="messenger-settings-radio-line">
                  <input type="radio" name="notification-preview-mode" checked={notificationsPreviewMode === 'none'} onChange={() => { setNotificationsPreviewModeState('none'); setNotificationsPreviewMode('none'); }} />
                  <span>Hide preview</span>
                </label>
              </div>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">👁</span><span className="messenger-settings-row-text">{t('hideLastSeen')}</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={hideLastSeen} onChange={handleHideLastSeen} disabled={accountLoading} aria-label={t('hideLastSeen')} />
                </span>
              </label>
              <div className="messenger-settings-row"><span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🎚</span><span className="messenger-settings-row-text">Volume</span></span><span className="messenger-settings-row-right"><span className="messenger-settings-row-value">100%</span></span></div>
            </section>
          )}

          {page === 'privacy' && (
            <>
              <section className="messenger-settings-list">
                <div className="messenger-settings-section-title">Two-step verification</div>
                <label className="messenger-settings-row">
                  <span className="messenger-settings-row-left">
                    <span className="messenger-settings-row-icon">🔐</span>
                    <span className="messenger-settings-row-text">2FA PIN</span>
                  </span>
                  <span className="messenger-settings-row-right">
                    <input
                      type="checkbox"
                      checked={twoFaEnabled}
                      onChange={(e) => { setTwoFaEnabled(e.target.checked); setTwoFaMsg(''); }}
                      disabled={accountLoading || twoFaBusy}
                      aria-label="2FA PIN"
                    />
                  </span>
                </label>
                <div className="messenger-settings-hint">
                  If enabled, you’ll need your PIN in addition to password when signing in.
                </div>
                {twoFaMsg && <div className={twoFaMsg.startsWith('OK:') ? 'messenger-settings-hint' : 'messenger-settings-error'}>{twoFaMsg.replace(/^OK:\s*/, '')}</div>}
                <input
                  className="messenger-settings-text-input"
                  type="password"
                  placeholder="Your password"
                  value={twoFaPassword}
                  onChange={(e) => { setTwoFaPassword(e.target.value); setTwoFaMsg(''); }}
                  disabled={twoFaBusy}
                />
                {twoFaEnabled && (
                  <input
                    className="messenger-settings-text-input"
                    type="password"
                    inputMode="numeric"
                    placeholder="New PIN (4-8 digits)"
                    value={twoFaPin}
                    onChange={(e) => { setTwoFaPin(e.target.value); setTwoFaMsg(''); }}
                    disabled={twoFaBusy}
                  />
                )}
                <div className="messenger-settings-server-actions">
                  <button
                    type="button"
                    className="messenger-settings-small-btn"
                    disabled={twoFaBusy}
                    onClick={async () => {
                      try {
                        setTwoFaBusy(true);
                        setTwoFaMsg('');
                        if (!twoFaPassword.trim()) throw new Error('Password is required');
                        if (twoFaEnabled) {
                          const p = twoFaPin.trim();
                          if (!/^\d{4,8}$/.test(p)) throw new Error('PIN must be 4-8 digits');
                          await setTwoFaPin({ enabled: true, pin: p, password: twoFaPassword });
                          setTwoFaMsg('OK: 2FA enabled');
                        } else {
                          await setTwoFaPin({ enabled: false, password: twoFaPassword });
                          setTwoFaMsg('OK: 2FA disabled');
                        }
                        // refresh profile in UI
                        const profile = await getMe();
                        setMe(profile);
                        setTwoFaEnabled(!!profile.twofaEnabled);
                        setTwoFaPassword('');
                        setTwoFaPin('');
                      } catch (e) {
                        setTwoFaMsg(e?.message || 'Failed');
                      } finally {
                        setTwoFaBusy(false);
                      }
                    }}
                  >
                    Save
                  </button>
                </div>
              </section>

              <section className="messenger-settings-list">
                <div className="messenger-settings-section-title">Starred messages</div>
                <button
                  type="button"
                  className="messenger-settings-row"
                  onClick={async () => {
                    try {
                      setStarredError('');
                      setStarredLoading(true);
                      const rows = await getStarredMessages(80);
                      setStarred(rows);
                    } catch (e) {
                      setStarredError(e?.message || 'Failed to load starred');
                    } finally {
                      setStarredLoading(false);
                    }
                  }}
                >
                  <span className="messenger-settings-row-left">
                    <span className="messenger-settings-row-icon">⭐</span>
                    <span className="messenger-settings-row-text">Load starred</span>
                  </span>
                </button>
                {starredLoading && <div className="messenger-settings-hint">Loading…</div>}
                {starredError && <div className="messenger-settings-error">{starredError}</div>}
                {!starredLoading && !starredError && starred.length > 0 && (
                  <div className="messenger-settings-hint">Showing last {starred.length}</div>
                )}
                {starred.slice(0, 10).map((m) => (
                  <div key={m.id} className="messenger-settings-row" style={{ alignItems: 'flex-start' }}>
                    <span className="messenger-settings-row-left">
                      <span className="messenger-settings-row-icon">💬</span>
                      <span className="messenger-settings-row-text" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>{m.senderName || '—'}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted, #888)' }}>{(m.content || '(no text)').slice(0, 140)}</span>
                      </span>
                    </span>
                  </div>
                ))}
              </section>

              <section className="messenger-settings-list">
                <div className="messenger-settings-section-title">Active sessions</div>
                {sessionsLoading && <div className="messenger-settings-hint">Loading…</div>}
                {sessionsError && <div className="messenger-settings-error">{sessionsError}</div>}
                {!sessionsLoading && !sessionsError && sessions.length === 0 && (
                  <div className="messenger-settings-hint">No sessions</div>
                )}
                {sessions.map((s) => (
                  <div key={s.id} className="messenger-settings-row" style={{ alignItems: 'flex-start' }}>
                    <span className="messenger-settings-row-left">
                      <span className="messenger-settings-row-icon">{s.current ? '📱' : '💻'}</span>
                      <span className="messenger-settings-row-text" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>
                          {s.current ? 'This device' : 'Device'} {s.revokedAt ? '(revoked)' : ''}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted, #888)' }}>{(s.userAgent || 'Unknown').slice(0, 120)}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted, #888)' }}>
                          IP: {s.ip || '—'}
                        </span>
                      </span>
                    </span>
                    <span className="messenger-settings-row-right">
                      {!s.current && !s.revokedAt && (
                        <button
                          type="button"
                          className="messenger-settings-small-btn"
                          onClick={async () => {
                            try {
                              await revokeSession(s.id);
                              const rows = await getSessions();
                              setSessions(Array.isArray(rows) ? rows : []);
                            } catch (e) {
                              setSessionsError(e?.message || 'Failed to revoke');
                            }
                          }}
                        >
                          Terminate
                        </button>
                      )}
                    </span>
                  </div>
                ))}
                <button
                  type="button"
                  className="messenger-settings-row"
                  onClick={async () => {
                    if (!window.confirm('Log out from all devices except this one?')) return;
                    try {
                      await logoutAllDevices();
                      const rows = await getSessions();
                      setSessions(Array.isArray(rows) ? rows : []);
                    } catch (e) {
                      setSessionsError(e?.message || 'Failed to logout all devices');
                    }
                  }}
                >
                  <span className="messenger-settings-row-left">
                    <span className="messenger-settings-row-icon">🚪</span>
                    <span className="messenger-settings-row-text">Log out from other devices</span>
                  </span>
                </button>
              </section>
            </>
          )}

          {page === 'chat' && (
            <section className="messenger-settings-list">
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">😀</span><span className="messenger-settings-row-text">Large emoji</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={enableLargeEmoji} onChange={(e) => { setEnableLargeEmojiState(e.target.checked); setEnableLargeEmoji(e.target.checked); }} />
                </span>
              </label>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">✨</span><span className="messenger-settings-row-text">Replace emoji automatically</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={replaceEmojiAutomatically} onChange={(e) => { setReplaceEmojiAutomaticallyState(e.target.checked); setReplaceEmojiAutomatically(e.target.checked); }} />
                </span>
              </label>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">❤️</span><span className="messenger-settings-row-text">Reaction button on messages</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={enableMessageReactions} onChange={(e) => { setEnableMessageReactionsState(e.target.checked); setEnableMessageReactions(e.target.checked); }} />
                </span>
              </label>
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">⌨️</span><span className="messenger-settings-row-text">Messages</span></span>
              </div>
              <div className="messenger-settings-row messenger-settings-row-radio">
                <label className="messenger-settings-radio-line">
                  <input type="radio" name="send-mode" checked={sendByEnter} onChange={() => { setSendByEnterState(true); setSendByEnter(true); }} />
                  <span>Send with Enter</span>
                </label>
              </div>
              <div className="messenger-settings-row messenger-settings-row-radio">
                <label className="messenger-settings-radio-line">
                  <input type="radio" name="send-mode" checked={!sendByEnter} onChange={() => { setSendByEnterState(false); setSendByEnter(false); }} />
                  <span>Send with Ctrl+Enter</span>
                </label>
              </div>
            </section>
          )}

          {page === 'speakers' && (
            <section className="messenger-settings-list">
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🔊</span><span className="messenger-settings-row-text">Output device</span></span>
                <span className="messenger-settings-row-right"><span className="messenger-settings-row-value" title={outputDeviceLabel}>{outputDeviceLabel}</span></span>
              </div>
              <select className="messenger-settings-select" value={selectedOutputId} onChange={handleOutputChange} aria-label={t('speaker')}>
                <option value="">{t('defaultDevice')}</option>
                {audioOutputs.length === 0 && <option value="" disabled>{t('noDevices')}</option>}
                {audioOutputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `${t('speaker')} ${d.deviceId.slice(0, 8)}`}</option>)}
              </select>
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🎤</span><span className="messenger-settings-row-text">Input device</span></span>
                <span className="messenger-settings-row-right"><span className="messenger-settings-row-value" title={inputDeviceLabel}>{inputDeviceLabel}</span></span>
              </div>
              <select className="messenger-settings-select" value={selectedInputId} onChange={handleInputChange} aria-label={t('microphone')}>
                <option value="">{t('defaultDevice')}</option>
                {audioInputs.length === 0 && <option value="" disabled>{t('noDevices')}</option>}
                {audioInputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `${t('microphone')} ${d.deviceId.slice(0, 8)}`}</option>)}
              </select>
            </section>
          )}

          {page === 'folders' && (
            <section className="messenger-settings-list">
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left">
                  <span className="messenger-settings-row-icon">🔔</span>
                  <span className="messenger-settings-row-text">Show unread badges in folders</span>
                </span>
                <span className="messenger-settings-row-right">
                  <input
                    type="checkbox"
                    checked={foldersShowUnreadBadge}
                    onChange={(e) => {
                      setFoldersShowUnreadBadgeState(e.target.checked);
                      setFoldersShowUnreadBadge(e.target.checked);
                    }}
                  />
                </span>
              </label>

              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left">
                  <span className="messenger-settings-row-icon">📌</span>
                  <span className="messenger-settings-row-text">Pin favorites on top</span>
                </span>
                <span className="messenger-settings-row-right">
                  <input
                    type="checkbox"
                    checked={foldersPinFavoritesTop}
                    onChange={(e) => {
                      setFoldersPinFavoritesTopState(e.target.checked);
                      setFoldersPinFavoritesTop(e.target.checked);
                    }}
                  />
                </span>
              </label>

              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left">
                  <span className="messenger-settings-row-icon">🗂️</span>
                  <span className="messenger-settings-row-text">Collapse empty folders</span>
                </span>
                <span className="messenger-settings-row-right">
                  <input
                    type="checkbox"
                    checked={foldersCollapseEmpty}
                    onChange={(e) => {
                      setFoldersCollapseEmptyState(e.target.checked);
                      setFoldersCollapseEmpty(e.target.checked);
                    }}
                  />
                </span>
              </label>

              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left">
                  <span className="messenger-settings-row-icon">⚡</span>
                  <span className="messenger-settings-row-text">Chat list quick action</span>
                </span>
                <span className="messenger-settings-row-right">
                  <span className="messenger-settings-row-value">
                    {foldersQuickAction === 'archive' ? 'Archive' : foldersQuickAction === 'pin' ? 'Pin' : 'Mute'}
                  </span>
                </span>
              </div>
              <div className="messenger-settings-row messenger-settings-row-radio">
                <label className="messenger-settings-radio-line">
                  <input
                    type="radio"
                    name="folders-quick-action"
                    checked={foldersQuickAction === 'archive'}
                    onChange={() => {
                      setFoldersQuickActionState('archive');
                      setFoldersQuickAction('archive');
                    }}
                  />
                  <span>Archive</span>
                </label>
              </div>
              <div className="messenger-settings-row messenger-settings-row-radio">
                <label className="messenger-settings-radio-line">
                  <input
                    type="radio"
                    name="folders-quick-action"
                    checked={foldersQuickAction === 'pin'}
                    onChange={() => {
                      setFoldersQuickActionState('pin');
                      setFoldersQuickAction('pin');
                    }}
                  />
                  <span>Pin</span>
                </label>
              </div>
              <div className="messenger-settings-row messenger-settings-row-radio">
                <label className="messenger-settings-radio-line">
                  <input
                    type="radio"
                    name="folders-quick-action"
                    checked={foldersQuickAction === 'mute'}
                    onChange={() => {
                      setFoldersQuickActionState('mute');
                      setFoldersQuickAction('mute');
                    }}
                  />
                  <span>Mute</span>
                </label>
              </div>
            </section>
          )}

          {page === 'server' && (
            <section className="messenger-settings-list">
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">📡</span><span className="messenger-settings-row-text">Build default</span></span>
                <span className="messenger-settings-row-right"><span className="messenger-settings-row-value" title={getDefaultApiBaseUrl()}>{getDefaultApiBaseUrl()}</span></span>
              </div>
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">✓</span><span className="messenger-settings-row-text">Active API</span></span>
                <span className="messenger-settings-row-right"><span className="messenger-settings-row-value" title={getApiBaseUrlDisplay()}>{getApiBaseUrlDisplay()}</span></span>
              </div>
              <p className="messenger-settings-hint">
                Override URL (saved in this browser). Use your server IP or domain so phones and other PCs can connect. Reload after save.
              </p>
              <input
                type="url"
                className="messenger-settings-text-input"
                value={apiUrlDraft}
                onChange={(e) => setApiUrlDraft(e.target.value)}
                placeholder={getDefaultApiBaseUrl()}
                autoComplete="off"
                spellCheck={false}
              />
              <div className="messenger-settings-server-actions">
                <button type="button" className="messenger-settings-chip" onClick={handleTestApiUrl}>Test</button>
                <button type="button" className="messenger-settings-chip active" onClick={handleSaveApiUrl}>Save & reload</button>
                <button type="button" className="messenger-settings-chip" onClick={handleClearApiUrl} disabled={!hasApiBaseUrlOverride()}>Clear override</button>
              </div>
              {serverTestMsg && <p className="messenger-settings-hint">{serverTestMsg}</p>}
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">📝</span><span className="messenger-settings-row-text">Versions</span></span>
                <span className="messenger-settings-row-right">
                  <span className="messenger-settings-row-value">app {APP_VERSION}{serverVersionLabel ? ` · srv ${serverVersionLabel}` : ''}</span>
                </span>
              </div>
            </section>
          )}

          {page === 'appearance' && (
            <section className="messenger-settings-list messenger-settings-appearance">
              <h3 className="messenger-settings-section-title">{t('guiSectionTheme')}</h3>
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🎨</span><span className="messenger-settings-row-text">{t('theme')}</span></span>
                <div className="messenger-settings-row-right messenger-settings-inline-options">
                  <button
                    type="button"
                    className={`messenger-settings-chip ${theme === 'dark' ? 'active' : ''}`}
                    onClick={() => handleTheme('dark')}
                    disabled={syncThemeWithSystem}
                  >
                    {t('themeDark')}
                  </button>
                  <button
                    type="button"
                    className={`messenger-settings-chip ${theme === 'light' ? 'active' : ''}`}
                    onClick={() => handleTheme('light')}
                    disabled={syncThemeWithSystem}
                  >
                    {t('themeLight')}
                  </button>
                </div>
              </div>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">💻</span><span className="messenger-settings-row-text">{t('guiSyncWithComputer')}</span></span>
                <span className="messenger-settings-row-right">
                  <input
                    type="checkbox"
                    checked={syncThemeWithSystem}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setAppSetting('syncThemeWithSystem', on);
                      setSyncThemeWithSystemState(on);
                      if (on) {
                        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                        setTheme(dark ? 'dark' : 'light');
                        applyTheme(dark ? 'dark' : 'light');
                        applyUiCustomization();
                        onThemeChange?.(dark ? 'dark' : 'light');
                      } else {
                        applyUiCustomization();
                      }
                    }}
                  />
                </span>
              </label>
              <p className="messenger-settings-hint messenger-settings-hint-indent">{t('guiSyncWithComputerHint')}</p>

              <h3 className="messenger-settings-section-title">{t('guiSectionColors')}</h3>
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🎯</span><span className="messenger-settings-row-text">{t('guiAccent')}</span></span>
                <div className="messenger-settings-row-right messenger-settings-inline-options messenger-settings-accent-wrap">
                  {['nova', 'purple', 'green', 'rose', 'orange', 'teal'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`messenger-settings-chip ${uiAccentPreset === k ? 'active' : ''}`}
                      onClick={() => {
                        setAppSetting('uiAccentPreset', k);
                        setUiAccentPresetState(k);
                        applyUiCustomization();
                      }}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🌫️</span><span className="messenger-settings-row-text">{t('guiLowSaturation')}</span></span>
                <span className="messenger-settings-row-right">
                  <input
                    type="checkbox"
                    checked={uiLowSaturation}
                    onChange={(e) => {
                      setAppSetting('uiLowSaturation', e.target.checked);
                      setUiLowSaturationState(e.target.checked);
                      applyUiCustomization();
                    }}
                  />
                </span>
              </label>
              <p className="messenger-settings-hint messenger-settings-hint-indent">{t('guiLowSaturationHint')}</p>

              <h3 className="messenger-settings-section-title">{t('guiSectionText')}</h3>
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🔤</span><span className="messenger-settings-row-text">{t('guiFontSize')}</span></span>
                <div className="messenger-settings-row-right messenger-settings-inline-options">
                  {['s', 'm', 'l', 'xl'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`messenger-settings-chip ${uiFontScale === k ? 'active' : ''}`}
                      onClick={() => {
                        setAppSetting('uiFontScale', k);
                        setUiFontScaleState(k);
                        applyUiCustomization();
                      }}
                    >
                      {k.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">↕️</span><span className="messenger-settings-row-text">{t('guiMessageSpacing')}</span></span>
                <div className="messenger-settings-row-right messenger-settings-inline-options">
                  {[
                    { id: 'tight', label: t('guiSpacingTight') },
                    { id: 'normal', label: t('guiSpacingNormal') },
                    { id: 'relaxed', label: t('guiSpacingRelaxed') },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      className={`messenger-settings-chip ${uiMessageGap === id ? 'active' : ''}`}
                      onClick={() => {
                        setAppSetting('uiMessageGap', id);
                        setUiMessageGapState(id);
                        applyUiCustomization();
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">📐</span><span className="messenger-settings-row-text">{t('guiListDensity')}</span></span>
                <div className="messenger-settings-row-right messenger-settings-inline-options">
                  <button type="button" className={`messenger-settings-chip ${uiChatDensity === 'comfortable' ? 'active' : ''}`} onClick={() => { setAppSetting('uiChatDensity', 'comfortable'); setUiChatDensityState('comfortable'); applyUiCustomization(); }}>Comfort</button>
                  <button type="button" className={`messenger-settings-chip ${uiChatDensity === 'compact' ? 'active' : ''}`} onClick={() => { setAppSetting('uiChatDensity', 'compact'); setUiChatDensityState('compact'); applyUiCustomization(); }}>Compact</button>
                </div>
              </div>
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">⬛</span><span className="messenger-settings-row-text">{t('guiCorners')}</span></span>
                <div className="messenger-settings-row-right messenger-settings-inline-options">
                  <button type="button" className={`messenger-settings-chip ${uiRadius === 'normal' ? 'active' : ''}`} onClick={() => { setAppSetting('uiRadius', 'normal'); setUiRadiusState('normal'); applyUiCustomization(); }}>Normal</button>
                  <button type="button" className={`messenger-settings-chip ${uiRadius === 'soft' ? 'active' : ''}`} onClick={() => { setAppSetting('uiRadius', 'soft'); setUiRadiusState('soft'); applyUiCustomization(); }}>Soft</button>
                </div>
              </div>

              <h3 className="messenger-settings-section-title">{t('guiSectionChat')}</h3>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🪪</span><span className="messenger-settings-row-text">{t('guiShowTopProfile')}</span></span>
                <span className="messenger-settings-row-right">
                  <input
                    type="checkbox"
                    checked={uiShowChatProfileTop}
                    onChange={(e) => {
                      setAppSetting('uiShowChatProfileTop', e.target.checked);
                      setUiShowChatProfileTopState(e.target.checked);
                      applyUiCustomization();
                    }}
                  />
                </span>
              </label>
              <p className="messenger-settings-hint messenger-settings-hint-indent">{t('guiShowTopProfileHint')}</p>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">👤</span><span className="messenger-settings-row-text">{t('guiShowMessageAvatars')}</span></span>
                <span className="messenger-settings-row-right">
                  <input
                    type="checkbox"
                    checked={uiShowMessageAvatars}
                    onChange={(e) => {
                      setAppSetting('uiShowMessageAvatars', e.target.checked);
                      setUiShowMessageAvatarsState(e.target.checked);
                      applyUiCustomization();
                    }}
                  />
                </span>
              </label>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🔥</span><span className="messenger-settings-row-text">{t('guiImbaFx')}</span></span>
                <span className="messenger-settings-row-right">
                  <input
                    type="checkbox"
                    checked={uiImbaFx}
                    onChange={(e) => {
                      setAppSetting('uiImbaFx', e.target.checked);
                      setUiImbaFxState(e.target.checked);
                      applyUiCustomization();
                    }}
                  />
                </span>
              </label>
              <p className="messenger-settings-hint messenger-settings-hint-indent">{t('guiImbaFxHint')}</p>

              <h3 className="messenger-settings-section-title">{t('guiSectionSidebar')}</h3>
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">↔️</span><span className="messenger-settings-row-text">{t('guiSidebarWidth')}</span></span>
                <div className="messenger-settings-row-right messenger-settings-inline-options">
                  {[
                    { id: 'narrow', label: t('guiSidebarNarrow') },
                    { id: 'normal', label: t('guiSidebarNormal') },
                    { id: 'wide', label: t('guiSidebarWide') },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      className={`messenger-settings-chip ${uiSidebarWidth === id ? 'active' : ''}`}
                      onClick={() => {
                        setAppSetting('uiSidebarWidth', id);
                        setUiSidebarWidthState(id);
                        applyUiCustomization();
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {page === 'bots' && (
            <BotsSettings onOpenChat={(login) => {
              onOpenBotChat?.(login);
              onClose();
            }} />
          )}

          {page === 'language' && (
            <section className="messenger-settings-list">
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🌐</span><span className="messenger-settings-row-text">{t('language')}</span></span>
                <div className="messenger-settings-row-right messenger-settings-inline-options">
                  <button type="button" className={`messenger-settings-chip ${lang === 'ru' ? 'active' : ''}`} onClick={() => handleLang('ru')}>{t('langRu')}</button>
                  <button type="button" className={`messenger-settings-chip ${lang === 'en' ? 'active' : ''}`} onClick={() => handleLang('en')}>{t('langEn')}</button>
                </div>
              </div>
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🎙</span><span className="messenger-settings-row-text">Перевод голосовых</span></span>
                <div className="messenger-settings-row-right messenger-settings-inline-options">
                  {['ru', 'en', 'uk', 'de'].map((code) => (
                    <button
                      key={code}
                      type="button"
                      className={`messenger-settings-chip ${voicePreferredLang === code ? 'active' : ''}`}
                      onClick={() => {
                        setAppSetting('voicePreferredLang', code);
                        setVoicePreferredLangState(code);
                      }}
                    >
                      {code.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {page === 'account' && (
            <section className="messenger-settings-list">
              <div className="messenger-account-preview">
                <div className="messenger-account-preview-top">
                  <img className="messenger-account-preview-avatar" src={avatar} alt="" />
                  <button
                    type="button"
                    className="messenger-account-edit-btn"
                    onClick={() => onOpenProfileEdit?.()}
                    aria-label="Edit profile"
                    title="Edit profile"
                  >
                    ✎
                  </button>
                </div>
                <div className="messenger-account-preview-name">{me?.displayName || me?.login || '—'}</div>
                <div className="messenger-account-preview-login">{me?.login ? `@${me.login}` : '—'}</div>
              </div>

              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">📱</span><span className="messenger-settings-row-text">Mobile</span></span>
                <span className="messenger-settings-row-right"><span className="messenger-settings-row-value">{me?.phone || '—'}</span></span>
              </div>
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">📝</span><span className="messenger-settings-row-text">Bio</span></span>
                <span className="messenger-settings-row-right"><span className="messenger-settings-row-value">{me?.bio || '—'}</span></span>
              </div>
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🆔</span><span className="messenger-settings-row-text">Username</span></span>
                <span className="messenger-settings-row-right"><span className="messenger-settings-row-value">{me?.login ? `@${me.login}` : '—'}</span></span>
              </div>
              <div className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🎂</span><span className="messenger-settings-row-text">Birthday</span></span>
                <span className="messenger-settings-row-right"><span className="messenger-settings-row-value">{me?.birthday || '—'}</span></span>
              </div>
            </section>
          )}

          {page === 'privacy' && (
            <section className="messenger-settings-list">
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">✅</span><span className="messenger-settings-row-text">Read receipts</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={privacyReadReceipts} onChange={(e) => { setPrivacyReadReceiptsState(e.target.checked); setPrivacyReadReceipts(e.target.checked); }} />
                </span>
              </label>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🖼️</span><span className="messenger-settings-row-text">Public profile photo</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={privacyProfilePhotoPublic} onChange={(e) => { setPrivacyProfilePhotoPublicState(e.target.checked); setPrivacyProfilePhotoPublic(e.target.checked); }} />
                </span>
              </label>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">📞</span><span className="messenger-settings-row-text">Allow calls</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={privacyAllowCalls} onChange={(e) => { setPrivacyAllowCallsState(e.target.checked); setPrivacyAllowCalls(e.target.checked); }} />
                </span>
              </label>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">👥</span><span className="messenger-settings-row-text">Allow group invites</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={privacyAllowGroupInvites} onChange={(e) => { setPrivacyAllowGroupInvitesState(e.target.checked); setPrivacyAllowGroupInvites(e.target.checked); }} />
                </span>
              </label>
            </section>
          )}

          {page === 'advanced' && (
            <section className="messenger-settings-list">
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🚀</span><span className="messenger-settings-row-text">Hardware acceleration</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={advancedHardwareAcceleration} onChange={(e) => { setAdvancedHardwareAccelerationState(e.target.checked); setAdvancedHardwareAcceleration(e.target.checked); }} />
                </span>
              </label>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">✨</span><span className="messenger-settings-row-text">Smooth animations</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={advancedSmoothAnimations} onChange={(e) => { setAdvancedSmoothAnimationsState(e.target.checked); setAdvancedSmoothAnimations(e.target.checked); applyMotionPreferences(); }} />
                </span>
              </label>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">📏</span><span className="messenger-settings-row-text">Compact mode</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={advancedCompactMode} onChange={(e) => { setAdvancedCompactModeState(e.target.checked); setAdvancedCompactMode(e.target.checked); }} />
                </span>
              </label>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">⬆️</span><span className="messenger-settings-row-text">Auto update</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={advancedAutoUpdate} onChange={(e) => { setAdvancedAutoUpdateState(e.target.checked); setAdvancedAutoUpdate(e.target.checked); }} />
                </span>
              </label>
            </section>
          )}

          {page === 'battery' && (
            <section className="messenger-settings-list">
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🔋</span><span className="messenger-settings-row-text">Battery saver mode</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={batterySaverMode} onChange={(e) => { setBatterySaverModeState(e.target.checked); setBatterySaverMode(e.target.checked); }} />
                </span>
              </label>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🪶</span><span className="messenger-settings-row-text">Reduce motion</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={batteryReduceMotion} onChange={(e) => { setBatteryReduceMotionState(e.target.checked); setBatteryReduceMotion(e.target.checked); applyMotionPreferences(); }} />
                </span>
              </label>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">📶</span><span className="messenger-settings-row-text">Low bandwidth mode</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={batteryLowBandwidthMode} onChange={(e) => { setBatteryLowBandwidthModeState(e.target.checked); setBatteryLowBandwidthMode(e.target.checked); }} />
                </span>
              </label>
              <label className="messenger-settings-row">
                <span className="messenger-settings-row-left"><span className="messenger-settings-row-icon">🎞️</span><span className="messenger-settings-row-text">Auto-play GIFs</span></span>
                <span className="messenger-settings-row-right">
                  <input type="checkbox" checked={batteryGifAutoplay} onChange={(e) => { setBatteryGifAutoplayState(e.target.checked); setBatteryGifAutoplay(e.target.checked); }} />
                </span>
              </label>
            </section>
          )}

          <div className="messenger-settings-version">
            Client {APP_VERSION}
            {serverVersionLabel ? ` · Server ${serverVersionLabel}` : ''}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
