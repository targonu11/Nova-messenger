import React, { useState, useEffect, useRef, useMemo } from 'react';
import jsmediatagsImport from 'jsmediatags/build2/jsmediatags.js';
import { useAuth } from './useAuth';
import { updateProfile, uploadAvatar, uploadProfileCover, setProfileCover, setAvatarRing, avatarUrl, getGroups, getMyAchievements, setMyBadge } from './api';
import { PROFILE_COVER_PRESETS, getProfileCoverStyle } from './profileCovers';
import { AVATAR_RING_PRESETS } from './avatarRings';
import { AvatarRingWrap } from './AvatarRingWrap';
import { useTranslation } from './i18n';
import { getStoredProfileMusic, setStoredProfileMusic } from './profileExtras';
import { pickImageFromGallery } from './pickGalleryImage';
import ProfileConnections from './ProfileConnections';
import BirthdayWheelPicker from './BirthdayWheelPicker';
import { ProfileLevelBadge } from './ProfileLevelBadge';
import { showNovaToast, showNovaToastCelebrate } from './NovaToast';
import { burstNovaConfetti } from './NovaConfetti';
import { getAgeFromBirthday, formatAgeLabel, getProfileCompleteness, getZodiacSign, getDaysUntilBirthday, formatBirthdayCountdown } from './profileAge';
import './ProfileEdit.css';

function ProfileCompletenessRing({ percent }) {
  const size = 84;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, percent)) / 100);
  return (
    <div className="profile-completeness-wrap" title={`${percent}%`}>
      <svg className="profile-completeness-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle className="profile-completeness-ring-bg" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="profile-completeness-ring-fg"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="profile-completeness-pct">{percent}%</span>
    </div>
  );
}

function normalizeBirthdayForInput(value) {
  if (!value || typeof value !== 'string') return '';
  const v = value.trim();
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const dot = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dot) return `${dot[3]}-${dot[2]}-${dot[1]}`;
  const slash = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`;
  return '';
}

function formatBirthdayForDisplay(value, lang) {
  if (!value) return '';
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return value;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return `${m[3]}.${m[2]}.${m[1]}`;
  }
}

function parseTrackInfoFromFileName(fileName) {
  const base = String(fileName || '').replace(/\.[^.]+$/, '').trim();
  if (!base) return { artist: '', title: '' };
  const separators = [' - ', ' — ', ' – ', ' —', '–', '—'];
  for (const sep of separators) {
    const idx = base.indexOf(sep);
    if (idx > 0 && idx < base.length - sep.length) {
      const artist = base.slice(0, idx).trim();
      const title = base.slice(idx + sep.length).trim();
      if (artist && title) return { artist, title };
    }
  }
  return { artist: '', title: base };
}

const jsmediatags = jsmediatagsImport?.default || jsmediatagsImport;

function readTrackTags(file) {
  return new Promise((resolve) => {
    jsmediatags.read(file, {
      onSuccess: ({ tags }) => {
        const artist = typeof tags?.artist === 'string' ? tags.artist.trim() : '';
        const title = typeof tags?.title === 'string' ? tags.title.trim() : '';
        resolve({ artist, title });
      },
      onError: () => resolve({ artist: '', title: '' }),
    });
  });
}

export default function ProfileEdit({ onClose, onCreateChannel }) {
  const { user, updateUser, refreshUser } = useAuth();
  const { t, lang } = useTranslation();
  const [login, setLogin] = useState(user?.login || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [birthday, setBirthday] = useState(normalizeBirthdayForInput(user?.birthday));
  const [musicTitle, setMusicTitle] = useState('');
  const [musicArtist, setMusicArtist] = useState('');
  const [musicAudioDataUrl, setMusicAudioDataUrl] = useState('');
  const [musicUploading, setMusicUploading] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [coverPath, setCoverPathState] = useState(user?.coverPath || '');
  const [coverUploading, setCoverUploading] = useState(false);
  const [avatarRing, setAvatarRingState] = useState(user?.avatarRing || 'none');
  const [ringSaving, setRingSaving] = useState(false);
  const [personalChannel, setPersonalChannel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [badges, setBadges] = useState([]);
  const [selectedBadge, setSelectedBadge] = useState(user?.badgeId || '');
  const [badgePassword, setBadgePassword] = useState('');
  const [badgeBusy, setBadgeBusy] = useState(false);
  const fileInputRef = useRef(null);
  const birthdayPickerRef = useRef(null);

  useEffect(() => {
    if (user) {
      setLogin(user.login || '');
      setDisplayName(user.displayName || '');
      setBio(user.bio || '');
      setBirthday(normalizeBirthdayForInput(user.birthday));
      const music = getStoredProfileMusic(user.id);
      setMusicTitle(music?.title || '');
      setMusicArtist(music?.artist || '');
      setMusicAudioDataUrl(music?.audioDataUrl || '');
      setAvatarPreview(null);
      setAvatarFile(null);
      setCoverPathState(user.coverPath || '');
      setAvatarRingState(user.avatarRing || 'none');
      setSelectedBadge(user.badgeId || '');
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    getMyAchievements()
      .then((d) => {
        if (cancelled) return;
        setBadges(Array.isArray(d?.achievements) ? d.achievements : []);
        setSelectedBadge(d?.selectedBadgeId || user?.badgeId || '');
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;
    getGroups()
      .then((gs) => {
        if (cancelled) return;
        const mine = Array.isArray(gs)
          ? gs.find((g) => String(g?.createdBy) === String(user.id) && g?.kind === 'channel') || null
          : null;
        setPersonalChannel(mine);
      })
      .catch(() => {
        if (!cancelled) setPersonalChannel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const applyAvatarFile = (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError(t('profilePickImageError'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError(t('profileImageSizeError'));
      return;
    }

    setAvatarFile(file);
    setError('');

    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    applyAvatarFile(file);
  };

  const handleAvatarFromGallery = async () => {
    const file = await pickImageFromGallery();
    if (file) applyAvatarFile(file);
  };

  const applyCoverPath = async (next) => {
    setError('');
    setCoverUploading(true);
    try {
      const res = await setProfileCover(next || null);
      const path = res.coverPath || '';
      setCoverPathState(path);
      updateUser({ coverPath: path || null });
    } catch (err) {
      setError(err.message || t('profileUpdateFailed'));
    } finally {
      setCoverUploading(false);
    }
  };

  const applyAvatarRing = async (next) => {
    setError('');
    setRingSaving(true);
    try {
      const res = await setAvatarRing(next || 'none');
      const id = res.avatarRing || 'none';
      setAvatarRingState(id);
      updateUser({ avatarRing: id });
    } catch (err) {
      setError(err.message || t('profileUpdateFailed'));
    } finally {
      setRingSaving(false);
    }
  };

  const applyCoverFile = async (file) => {
    if (!file) return;
    const isImage = file.type?.startsWith('image/')
      || /\.(jpe?g|png|gif|webp|bmp|avif|heic|heif)$/i.test(file.name || '');
    if (!isImage) {
      setError(t('profilePickImageError'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError(t('profileImageSizeError'));
      return;
    }
    setCoverUploading(true);
    setError('');
    try {
      const res = await uploadProfileCover(file);
      const path = res.coverPath || '';
      setCoverPathState(path);
      updateUser({ coverPath: path || null });
    } catch (err) {
      setError(err.message || t('profileUpdateFailed'));
    } finally {
      setCoverUploading(false);
    }
  };

  const handleCoverFromGallery = async () => {
    const file = await pickImageFromGallery();
    if (file) await applyCoverFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!displayName.trim()) {
      setError(t('profileDisplayNameRequired'));
      return;
    }
    
    if (!login.trim()) {
      setError(t('profileLoginRequired'));
      return;
    }
    
    const canChangeUsername = user?.allowUsernameChange !== false;
    setLoading(true);
    try {
      let avatarPath = user?.avatarPath;
      
      // Загружаем аватар если выбран новый
      if (avatarFile) {
        const avatarResult = await uploadAvatar(avatarFile);
        avatarPath = avatarResult.avatarPath;
      }
      
      const newLogin = login.trim();
      const loginArg = canChangeUsername ? newLogin : undefined;
      const birthdayToSave = birthdayPickerRef.current?.getIso?.() || birthday.trim() || null;
      console.log('[ProfileEdit] Updating profile with login:', loginArg, 'birthday:', birthdayToSave);
      const updated = await updateProfile(loginArg, displayName.trim(), bio.trim() || null, undefined, birthdayToSave);
      console.log('[ProfileEdit] Profile updated, response:', updated);
      console.log('[ProfileEdit] Response login:', updated.login, 'Expected login:', newLogin);
      
      // Убеждаемся, что логин есть в ответе
      if (!updated.login) {
        console.warn('[ProfileEdit] Login not in response, using submitted value');
        updated.login = newLogin;
      } else if (updated.login !== newLogin) {
        console.warn('[ProfileEdit] Login mismatch! Response:', updated.login, 'Expected:', newLogin);
      }
      
      updated.avatarPath = avatarPath;
      if (updated.birthday === undefined) {
        updated.birthday = birthdayToSave || '';
      }
      
      // Обновляем локальное состояние с новым логином
      console.log('[ProfileEdit] Updating user with login:', updated.login);
      updateUser(updated);
      setStoredProfileMusic(updated.id || user?.id, {
        title: musicTitle.trim(),
        artist: musicArtist.trim(),
        audioDataUrl: musicAudioDataUrl || '',
      });
      
      // Небольшая задержка перед закрытием, чтобы состояние успело обновиться
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Также обновляем данные с сервера для гарантии синхронизации
      console.log('[ProfileEdit] Refreshing user from server...');
      await refreshUser();
      console.log('[ProfileEdit] User refreshed, closing modal');
      
      const finalCompleteness = getProfileCompleteness(updated);
      if (finalCompleteness >= 100) {
        burstNovaConfetti({ count: 72, originY: 40 });
        showNovaToastCelebrate(t('profileCompleteCelebrate'));
      } else {
        showNovaToast(t('profileSaved'));
      }
      
      // Еще одна небольшая задержка перед закрытием
      await new Promise(resolve => setTimeout(resolve, 100));
      onClose();
    } catch (err) {
      setError(err.message || t('profileUpdateFailed'));
    } finally {
      setLoading(false);
    }
  };

  const saveBadge = async () => {
    setError('');
    setBadgeBusy(true);
    try {
      const next = selectedBadge ? selectedBadge : null;
      const res = await setMyBadge(next);
      updateUser({ badgeId: res.badgeId, badgeName: res.badgeName, badgeIcon: res.badgeIcon });
      await refreshUser();
    } catch (e) {
      setError(e?.message || 'Failed to set badge');
    } finally {
      setBadgeBusy(false);
    }
  };

  const handleMusicFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setError('Выберите аудио файл');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('Размер аудио должен быть меньше 12MB');
      return;
    }
    setMusicUploading(true);
    setError('');
    try {
      const tags = await readTrackTags(file);
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Не удалось прочитать аудио'));
        reader.readAsDataURL(file);
      });
      setMusicAudioDataUrl(dataUrl);
      const parsed = parseTrackInfoFromFileName(file.name);
      const artist = tags.artist || parsed.artist || 'Unknown artist';
      const title = tags.title || parsed.title || file.name.replace(/\.[^.]+$/, '');
      setMusicArtist(artist);
      setMusicTitle(title);
    } catch (err) {
      setError(err?.message || 'Ошибка загрузки аудио');
    } finally {
      setMusicUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const currentAvatar = avatarPreview || avatarUrl(user?.avatarPath) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id}`;
  const coverStyle = getProfileCoverStyle(coverPath, avatarUrl);
  const profileCompleteness = useMemo(
    () => getProfileCompleteness({
      displayName,
      bio,
      avatarPath: avatarPreview || user?.avatarPath,
      coverPath,
      birthday,
      customStatusText: user?.customStatusText,
      customStatusEmoji: user?.customStatusEmoji,
    }),
    [displayName, bio, avatarPreview, user?.avatarPath, coverPath, birthday, user?.customStatusText, user?.customStatusEmoji]
  );
  const ageLabel = useMemo(() => {
    const age = getAgeFromBirthday(birthday);
    return age != null ? formatAgeLabel(age, lang) : '';
  }, [birthday, lang]);
  const zodiacSign = useMemo(() => getZodiacSign(birthday, lang), [birthday, lang]);
  const daysUntilBirthday = useMemo(() => getDaysUntilBirthday(birthday), [birthday]);
  const birthdayCountdown = useMemo(
    () => (daysUntilBirthday != null ? formatBirthdayCountdown(daysUntilBirthday, lang) : ''),
    [daysUntilBirthday, lang]
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal profile-edit" onClick={(e) => e.stopPropagation()}>
        <div className="profile-edit-preview">
          <div className="profile-preview-card profile-preview-card--vk">
            <div
              className={`profile-preview-vk-hero${coverStyle ? ' has-cover profile-banner-animated' : ''}`}
              style={coverStyle || undefined}
            >
              {coverStyle && <div className="profile-banner-shimmer" aria-hidden />}
              <button
                type="button"
                className="profile-preview-cover-upload"
                onClick={handleCoverFromGallery}
                disabled={coverUploading}
                title={t('profileCoverUpload')}
              >
                {coverUploading ? '…' : t('profileCoverUpload')}
              </button>
              <div className="profile-preview-vk-body">
              <div className="profile-preview-avatar-stack">
                <ProfileCompletenessRing percent={profileCompleteness} />
                <AvatarRingWrap ring={avatarRing} size="lg" className="profile-preview-avatar-wrap">
                <img className="avatar-lg" src={currentAvatar} alt="" />
                <button
                  type="button"
                  className="avatar-change-btn"
                  title={t('pickFromGallery')}
                  aria-label={t('pickFromGallery')}
                  onClick={handleAvatarFromGallery}
                >
                  <span className="icon-camera" />
                </button>
              </AvatarRingWrap>
              </div>
              <div className="profile-preview-info">
                <h3 className="profile-preview-name">{displayName.trim() || user?.displayName || t('profileNamePlaceholder')}</h3>
                <p className="profile-preview-login">@{login.trim() || user?.login || ''}</p>
                <ProfileLevelBadge user={{ displayName, bio, avatarPath: avatarPreview || user?.avatarPath, coverPath, birthday, customStatusText: user?.customStatusText, customStatusEmoji: user?.customStatusEmoji, badgeId: user?.badgeId, isVerified: user?.isVerified }} lang={lang} celebrateOnLevelUp />
                {ageLabel && <p className="profile-preview-age">{ageLabel}</p>}
                {zodiacSign && <p className="profile-preview-zodiac">{zodiacSign}</p>}
                {birthdayCountdown && daysUntilBirthday != null && daysUntilBirthday <= 14 && (
                  <p className={`profile-preview-countdown${daysUntilBirthday === 0 ? ' profile-birthday-countdown--today' : ''}`}>
                    {birthdayCountdown}
                  </p>
                )}
                {bio.trim() ? (
                  <p className="profile-preview-bio">{bio.trim()}</p>
                ) : (
                  <p className="profile-preview-bio-placeholder">{t('profileBioEmpty')}</p>
                )}
              </div>
            </div>
            </div>
          </div>
        </div>

        <div className="profile-edit-body">
        <h2>{t('profileEditTitle')}</h2>
          <div className="profile-cover-section">
            <label className="form-label">{t('profileCoverLabel')}</label>
            <p className="form-hint profile-cover-hint">{t('profileCoverHint')}</p>
            <div className="profile-cover-presets">
              {PROFILE_COVER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`profile-cover-preset${coverPath === preset.id ? ' active' : ''}`}
                  style={preset.style}
                  title={preset.label}
                  disabled={coverUploading}
                  onClick={() => applyCoverPath(preset.id)}
                />
              ))}
            </div>
            {coverPath && (
              <button
                type="button"
                className="btn-secondary profile-cover-remove"
                onClick={() => applyCoverPath(null)}
                disabled={coverUploading}
              >
                {t('profileCoverRemove')}
              </button>
            )}
          </div>
          <div className="profile-cover-section profile-ring-section">
            <label className="form-label">{t('profileAvatarRingLabel')}</label>
            <p className="form-hint profile-cover-hint">{t('profileAvatarRingHint')}</p>
            <div className="profile-ring-presets">
              {AVATAR_RING_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`profile-ring-preset${avatarRing === preset.id ? ' active' : ''}`}
                  title={preset.label}
                  disabled={ringSaving}
                  onClick={() => applyAvatarRing(preset.id)}
                >
                  <span
                    className={
                      preset.id === 'none'
                        ? 'profile-ring-preset-dot profile-ring-preset-none'
                        : `profile-ring-preset-dot avatar-ring avatar-ring--${preset.id}`
                    }
                  >
                    {preset.id !== 'none' && <span className="profile-ring-preset-inner" />}
                    {preset.id === 'none' ? '—' : ''}
                  </span>
                  <span className="profile-ring-preset-label">{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
        
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-label">{t('profileLoginLabel')}</label>
            <input
              type="text"
              className="form-input"
              placeholder={t('profileUsernamePlaceholder')}
              value={login}
              onChange={(e) => setLogin(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              maxLength={30}
              required
              disabled={user?.allowUsernameChange === false}
              title={user?.allowUsernameChange === false ? t('profileUsernameLockedHint') : undefined}
            />
            <p className="form-hint">
              {user?.allowUsernameChange === false ? t('profileUsernameLockedHint') : t('profileLoginHint')}
            </p>
          </div>
          
          <div className="form-field">
            <label className="form-label">{t('profileAvatarLabel')}</label>
            <div className="avatar-upload-section">
              <button
                type="button"
                className="btn-avatar-upload"
                onClick={() => fileInputRef.current?.click()}
              >
                {avatarFile ? t('profileAvatarReplace') : t('profileAvatarChoose')}
              </button>
              <button
                type="button"
                className="btn-avatar-upload btn-avatar-gallery"
                onClick={handleAvatarFromGallery}
              >
                {t('pickFromGallery')}
              </button>
              {avatarFile && (
                <span className="avatar-file-name">{avatarFile.name}</span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                style={{ display: 'none' }}
              />
            </div>
            <p className="form-hint">{t('profileAvatarHint')}</p>
          </div>
          
          <div className="form-field">
            <label className="form-label">{t('profileNameLabel')}</label>
            <input
              type="text"
              className="form-input"
              placeholder={t('profileNamePlaceholder')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              required
            />
          </div>
          
          <div className="form-field">
            <label className="form-label">{t('profileBioLabel')}</label>
            <textarea
              className="form-textarea"
              placeholder={t('profileBioPlaceholder')}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={200}
              rows={4}
            />
            <p className="form-hint">{bio.length}/200 {t('profileCharacters')}</p>
          </div>

          <div className="form-field profile-social-section">
            <label className="form-label">{t('connectionsTitle')}</label>
            <ProfileConnections t={t} />
          </div>

          <div className="form-field">
            <label className="form-label">Музыка в профиле</label>
            <input
              type="text"
              className="form-input"
              placeholder="Название трека"
              value={musicTitle}
              onChange={(e) => setMusicTitle(e.target.value)}
              maxLength={80}
            />
            <div style={{ height: 8 }} />
            <input
              type="text"
              className="form-input"
              placeholder="Исполнитель"
              value={musicArtist}
              onChange={(e) => setMusicArtist(e.target.value)}
              maxLength={80}
            />
            <div className="avatar-upload-section" style={{ marginTop: 10 }}>
              <label className="settings-upload-label">
                <input type="file" accept="audio/*" className="settings-upload-input" onChange={handleMusicFile} disabled={musicUploading} />
                <span className="btn-secondary">{musicUploading ? 'Загрузка…' : (musicAudioDataUrl ? 'Заменить аудио' : 'Выбрать аудио')}</span>
              </label>
              {musicAudioDataUrl && (
                <button type="button" className="btn-secondary" onClick={() => setMusicAudioDataUrl('')}>
                  Удалить аудио
                </button>
              )}
            </div>
            <p className="form-hint">Показывается в профиле как карточка с плеером.</p>
          </div>

          <div className="form-field">
            <label className="form-label">{t('profilePhoneLabel')}</label>
            <input
              type="text"
              className="form-input"
              value={user?.phone || ''}
              placeholder="—"
              disabled
            />
          </div>

          <div className="form-field">
            <label className="form-label">{t('profileBirthdayLabel')}</label>
            <BirthdayWheelPicker
              ref={birthdayPickerRef}
              value={birthday}
              onChange={setBirthday}
              lang={lang}
              clearLabel={t('profileBirthdayClear')}
            />
          </div>

          <div className="form-field">
            <label className="form-label">Badge (one active)</label>
            <select
              className="form-input"
              value={selectedBadge || ''}
              onChange={(e) => setSelectedBadge(e.target.value)}
              disabled={badgeBusy}
            >
              <option value="">No badge</option>
              {badges.map((b) => (
                <option key={b.id} value={b.id}>
                  {(b.icon || '') + ' '}{b.name}
                </option>
              ))}
            </select>
            <p className="form-hint">Можно выбрать только 1 бейдж. Можно менять в любой момент.</p>
            <div className="modal-actions" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn-secondary" onClick={saveBadge} disabled={badgeBusy}>
                {badgeBusy ? 'Saving…' : 'Save badge'}
              </button>
            </div>
          </div>

          {personalChannel && (
            <div className="form-field">
              <label className="form-label">{t('profilePersonalChannelLabel')}</label>
              <input
                type="text"
                className="form-input"
                value={personalChannel.name || ''}
                disabled
              />
            </div>
          )}

          {onCreateChannel && (
            <div className="modal-actions profile-edit-channel-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onCreateChannel()}
                disabled={loading}
              >
                {t('profileCreateChannel')}
              </button>
            </div>
          )}
          
          {error && <p className="modal-error">{error}</p>}
          
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              {t('profileCancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? t('profileSaving') : t('profileSave')}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
