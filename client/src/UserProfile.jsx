import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getGroups, getMessages, getPresence, getUserAchievements, setMyBadge, avatarUrl, getUserConnections } from './api';
import { getProfileCoverStyle } from './profileCovers';
import { AvatarRingWrap } from './AvatarRingWrap';
import { useAuth } from './useAuth';
import { useSocket } from './SocketContext';
import { useTranslation } from './i18n';
import { getStoredProfileMusic } from './profileExtras';
import { OAUTH_CONNECTION_PROVIDERS, buildSocialProfileUrl } from './socialProviders';
import { formatCustomStatusLine } from './customStatus';
import { mergePlaybackActivities, formatTrackLine } from './activityUtils';
import { UserActivityOverlay } from './UserActivityOverlay';
import { formatBirthdayDots } from './BirthdayWheelPicker';
import { getAgeFromBirthday, formatAgeLabel, getProfileCompleteness, getZodiacSign, getDaysUntilBirthday, formatBirthdayCountdown } from './profileAge';
import { ProfileHeroStats } from './ProfileLevelBadge';
import {
  IconPhone,
  IconInfo,
  IconLink,
  IconCalendar,
  IconMusic,
  IconAward,
  IconPlay,
  IconPause,
  IconExternal,
} from './profileIcons';
import './UserProfile.css';

export default function UserProfile({
  user: propUser,
  onClose,
  onEditProfile,
  onCreateChannel,
  onOpenChannel,
  variant = 'overlay',
}) {
  const isPanel = variant === 'panel';
  const isOverlay = variant === 'overlay' || variant === 'modal';
  const { user: authUser, refreshUser } = useAuth();
  const targetUser = useMemo(() => {
    if (!propUser) return null;
    if (authUser && String(propUser.id) === String(authUser.id)) {
      return { ...propUser, ...authUser };
    }
    return propUser;
  }, [propUser, authUser]);
  const { socket } = useSocket();
  const { t, lang } = useTranslation();
  const isMe = useMemo(
    () => Boolean(authUser?.id && targetUser?.id && String(authUser.id) === String(targetUser.id)),
    [authUser?.id, targetUser?.id]
  );

  const [presence, setPresence] = useState(null);
  const [personalChannel, setPersonalChannel] = useState(null);
  const [lastChannelPost, setLastChannelPost] = useState(null);
  const [music, setMusic] = useState(null);
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const [musicDuration, setMusicDuration] = useState(0);
  const [musicCurrentTime, setMusicCurrentTime] = useState(0);
  const [musicVolume, setMusicVolume] = useState(0.8);
  const musicAudioRef = useRef(null);
  const profileActivitiesRef = useRef([]);
  const [achievements, setAchievements] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedBadgeId, setSelectedBadgeId] = useState(targetUser?.badgeId || null);
  const [badgeBusyId, setBadgeBusyId] = useState(null);

  useEffect(() => {
    if (!isMe) return;
    refreshUser?.();
  }, [isMe, refreshUser]);

  useEffect(() => {
    if (!targetUser?.id) return;
    setMusic(getStoredProfileMusic(targetUser.id));
  }, [targetUser?.id]);

  useEffect(() => {
    profileActivitiesRef.current = [];
    if (!targetUser?.id) return;
    let cancelled = false;
    getPresence(targetUser.id)
      .then((p) => {
        if (cancelled || !p) return;
        const incoming = Array.isArray(p.activities) ? p.activities : [];
        const merged = mergePlaybackActivities(profileActivitiesRef.current, incoming);
        profileActivitiesRef.current = merged;
        setPresence({ ...p, activities: merged });
      })
      .catch(() => {
        if (!cancelled) setPresence(null);
      });
    return () => {
      cancelled = true;
    };
  }, [targetUser?.id]);

  useEffect(() => {
    if (!socket || !targetUser?.id) return undefined;
    const uid = String(targetUser.id);
    const onActivity = ({ userId, activities }) => {
      if (String(userId) !== uid) return;
      const incoming = Array.isArray(activities) ? activities : [];
      const merged = mergePlaybackActivities(profileActivitiesRef.current, incoming);
      profileActivitiesRef.current = merged;
      setPresence((prev) => ({ ...(prev || {}), activities: merged }));
    };
    socket.on('activity_changed', onActivity);
    return () => socket.off('activity_changed', onActivity);
  }, [socket, targetUser?.id]);

  useEffect(() => {
    if (!targetUser?.id) return;
    let cancelled = false;
    getUserAchievements(targetUser.id)
      .then((d) => {
        if (cancelled) return;
        setAchievements(Array.isArray(d?.achievements) ? d.achievements : []);
        setSelectedBadgeId(d?.selectedBadgeId || targetUser?.badgeId || null);
      })
      .catch(() => {
        if (!cancelled) setAchievements([]);
      });
    return () => { cancelled = true; };
  }, [targetUser?.id]);

  useEffect(() => {
    if (!isMe || !authUser?.id) return;
    let cancelled = false;
    getGroups()
      .then((gs) => {
        if (cancelled) return;
        const mine = Array.isArray(gs)
          ? gs.find((g) => String(g?.createdBy) === String(authUser.id) && g?.kind === 'channel') || null
          : null;
        setPersonalChannel(mine);
      })
      .catch(() => {
        if (!cancelled) setPersonalChannel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isMe, authUser?.id]);

  useEffect(() => {
    if (!personalChannel?.id) {
      setLastChannelPost(null);
      return;
    }
    let cancelled = false;
    getMessages('group', personalChannel.id)
      .then((data) => {
        if (cancelled) return;
        const msgs = data.messages || [];
        const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        setLastChannelPost(last);
      })
      .catch(() => {
        if (!cancelled) setLastChannelPost(null);
      });
    return () => {
      cancelled = true;
    };
  }, [personalChannel?.id]);

  const presenceLabel = useMemo(() => {
    if (presence?.online && presence?.activities?.length > 0) {
      const a = presence.activities[0];
      if (a?.name) return formatTrackLine(a);
    }
    const custom = formatCustomStatusLine(presence || targetUser);
    if (custom) return custom;
    if (!presence) return '';
    if (presence.online) return t('statusOnline');
    if (presence.lastSeenAt) {
      const d = new Date(presence.lastSeenAt * 1000);
      return `${t('statusLastSeenWhen')} ${d.toLocaleDateString(lang === 'en' ? 'en-US' : 'ru-RU')}`;
    }
    return '';
  }, [presence, targetUser, t, lang]);

  useEffect(() => {
    const audio = musicAudioRef.current;
    if (!audio) return;
    const onLoaded = () => setMusicDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onTime = () => setMusicCurrentTime(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    const onEnded = () => setIsPlayingMusic(false);
    audio.volume = musicVolume;
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
    };
  }, [music?.audioDataUrl, musicVolume]);

  useEffect(() => {
    if (!targetUser?.id) return;
    let cancelled = false;
    getUserConnections(targetUser.id)
      .then((d) => {
        if (!cancelled) setConnections(Array.isArray(d?.connections) ? d.connections : []);
      })
      .catch(() => {
        if (!cancelled) setConnections([]);
      });
    return () => { cancelled = true; };
  }, [targetUser?.id]);

  const socialEntries = useMemo(() => {
    return connections.map((c) => {
      const p = OAUTH_CONNECTION_PROVIDERS.find((x) => x.id === c.provider);
      if (!p) return null;
      const handle = c.username || c.displayName || c.providerUserId;
      const url = c.profileUrl || buildSocialProfileUrl(c.provider, c.providerUserId || handle);
      return { id: c.provider, labelKey: p.labelKey, handle, url, verified: true };
    }).filter(Boolean);
  }, [connections]);

  const formatTime = (sec) => {
    const total = Math.max(0, Math.floor(sec || 0));
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const toggleMusicPlayback = () => {
    const audio = musicAudioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => setIsPlayingMusic(true)).catch(() => {});
    } else {
      audio.pause();
      setIsPlayingMusic(false);
    }
  };

  const handleSeek = (value) => {
    const audio = musicAudioRef.current;
    if (!audio) return;
    const next = Number(value);
    audio.currentTime = next;
    setMusicCurrentTime(next);
  };

  if (!targetUser) return null;

  const coverStyle = getProfileCoverStyle(targetUser.coverPath, avatarUrl);
  const profileCompleteness = getProfileCompleteness(targetUser);
  const zodiacSign = getZodiacSign(targetUser.birthday, lang);
  const daysUntilBirthday = getDaysUntilBirthday(targetUser.birthday);
  const birthdayCountdown = daysUntilBirthday != null ? formatBirthdayCountdown(daysUntilBirthday, lang) : '';

  return (
    <div
      className={
        isPanel
          ? 'user-profile-panel-overlay'
          : isOverlay
            ? 'user-profile-chat-overlay'
            : 'modal-overlay'
      }
      onClick={isPanel ? undefined : onClose}
      role={isPanel ? 'region' : 'presentation'}
      aria-label={t('profileInfoTitle')}
    >
      <div
        className={`modal user-profile${isPanel ? ' user-profile--panel' : ''}${isOverlay && !isPanel ? ' user-profile--overlay' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="user-profile-content">
          <div
            className={`user-profile-hero${coverStyle ? ' user-profile-hero--has-cover profile-banner-animated' : ''} user-profile-hero--with-stats`}
            style={coverStyle || undefined}
          >
            {coverStyle && <div className="profile-banner-shimmer" aria-hidden />}
            <button
              type="button"
              className="user-profile-hero-close btn-icon-close"
              onClick={onClose}
              aria-label={t('close')}
            >
              <span className="icon-close">×</span>
            </button>
            <div className="user-profile-hero-body">
              <AvatarRingWrap ring={targetUser.avatarRing} size="xl">
                <img
                  className="user-profile-avatar-xl"
                  src={avatarUrl(targetUser.avatarPath) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetUser.id}`}
                  alt={targetUser.displayName}
                />
              </AvatarRingWrap>
              <div className="user-profile-hero-text">
                <div className="user-profile-name">
                  {targetUser.displayName || t('profileUnknown')}
                  {targetUser.isVerified && <span className="verify-badge">✔</span>}
                  {targetUser.badgeIcon && (
                    <span className="user-profile-badge" title={targetUser.badgeName || 'Badge'} aria-label={targetUser.badgeName || 'Badge'}>
                      {targetUser.badgeIcon}
                    </span>
                  )}
                </div>
                <div className="user-profile-login">@{targetUser.login}</div>
                <ProfileHeroStats
                  user={targetUser}
                  lang={lang}
                  profileCompleteness={isMe && profileCompleteness < 100 ? profileCompleteness : null}
                  completenessLabel={t('profileCompleteness')}
                />
                {presenceLabel && (
                  <div
                    className={`user-profile-presence${presence?.online ? ' user-profile-presence--online' : ''}`}
                  >
                    {presenceLabel}
                  </div>
                )}
                {presence?.online && presence?.activities?.length > 0 && (
                  <UserActivityOverlay activities={presence.activities} t={t} compact />
                )}
              </div>
            </div>
          </div>

          {music?.title && (
            <div className="user-profile-music-block">
              <div className="user-profile-music-head">
                <IconMusic size={20} />
                <span className="user-profile-music-title">
                  {music.artist ? `${music.artist} — ${music.title}` : music.title}
                </span>
              </div>
              <div className="user-profile-music-controls">
                <button type="button" className="user-profile-music-btn" onClick={toggleMusicPlayback} aria-label={isPlayingMusic ? 'Pause' : 'Play'}>
                  {isPlayingMusic ? <IconPause /> : <IconPlay />}
                </button>
                <div className="user-profile-music-timeline">
                  <input
                    type="range"
                    min="0"
                    max={musicDuration || 0}
                    step="0.01"
                    value={Math.min(musicCurrentTime, musicDuration || 0)}
                    onChange={(e) => handleSeek(e.target.value)}
                  />
                  <span className="user-profile-music-time">
                    {formatTime(musicCurrentTime)} / {formatTime(musicDuration)}
                  </span>
                </div>
                <div className="user-profile-music-volume">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(Number(e.target.value))}
                    aria-label="Volume"
                  />
                </div>
              </div>
              {music.audioDataUrl && (
                <audio
                  ref={musicAudioRef}
                  src={music.audioDataUrl}
                  preload="none"
                  onEnded={() => setIsPlayingMusic(false)}
                />
              )}
            </div>
          )}

          <section className="user-profile-section">
            <div className="user-profile-row">
              <span className="user-profile-row-icon"><IconPhone size={20} /></span>
              <div className="user-profile-row-body">
                <span className="user-profile-row-label">{t('profilePhoneLabel')}</span>
                <span className="user-profile-row-value">{targetUser.phone || '—'}</span>
              </div>
            </div>

            <div className="user-profile-row">
              <span className="user-profile-row-icon"><IconInfo size={20} /></span>
              <div className="user-profile-row-body">
                <span className="user-profile-row-label">{t('profileBioLabel')}</span>
                <span className={`user-profile-row-value${targetUser.bio?.trim() ? ' user-profile-row-value--pre' : ' user-profile-row-value--muted'}`}>
                  {targetUser.bio && targetUser.bio.trim() ? targetUser.bio : '—'}
                </span>
              </div>
            </div>

            {socialEntries.length > 0 && (
              <div className="user-profile-row">
                <span className="user-profile-row-icon"><IconLink size={20} /></span>
                <div className="user-profile-row-body">
                  <span className="user-profile-row-label">{t('connectionsTitle')}</span>
                  <div className="user-profile-social-links">
                    {socialEntries.map((e) =>
                      e.url ? (
                        <a
                          key={e.id}
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`user-profile-social-chip${e.verified ? ' user-profile-social-chip--verified' : ''}`}
                        >
                          {e.verified && <span className="user-profile-social-verified">✓</span>}
                          {t(e.labelKey)}
                          <IconExternal size={14} />
                        </a>
                      ) : (
                        <span
                          key={e.id}
                          className={`user-profile-social-chip user-profile-social-chip-static${e.verified ? ' user-profile-social-chip--verified' : ''}`}
                          title={e.handle}
                        >
                          {e.verified && <span className="user-profile-social-verified">✓</span>}
                          {t(e.labelKey)}: <span className="user-profile-social-handle">{e.handle}</span>
                        </span>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="user-profile-row">
              <span className="user-profile-row-icon"><IconCalendar size={20} /></span>
              <div className="user-profile-row-body">
                <span className="user-profile-row-label">{t('profileBirthdayLabel')}</span>
                <span className={`user-profile-row-value${targetUser.birthday ? '' : ' user-profile-row-value--muted'}`}>
                  {targetUser.birthday
                    ? formatBirthdayDots(targetUser.birthday)
                    : (lang === 'en' ? 'Not set' : 'Не указан')}
                  {(() => {
                    const age = getAgeFromBirthday(targetUser.birthday);
                    const label = age != null ? formatAgeLabel(age, lang) : '';
                    return label ? <span className="user-profile-row-sub"> · {label}</span> : null;
                  })()}
                  {zodiacSign && <span className="user-profile-row-sub"> · {zodiacSign}</span>}
                </span>
                {birthdayCountdown && daysUntilBirthday != null && daysUntilBirthday <= 14 && (
                  <span className={`user-profile-birthday-countdown${daysUntilBirthday === 0 ? ' profile-birthday-countdown--today' : ''}`}>
                    {birthdayCountdown}
                  </span>
                )}
              </div>
            </div>

            <div className="user-profile-row">
              <span className="user-profile-row-icon"><IconAward size={20} /></span>
              <div className="user-profile-row-body">
                <span className="user-profile-row-label">Achievements</span>
                {achievements.length === 0 ? (
                  <span className="user-profile-row-value user-profile-row-value--muted">—</span>
                ) : (
                  <span className="user-profile-achievements-grid">
                    {achievements.slice(0, 16).map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className={`user-profile-achievement-tile ${selectedBadgeId === a.id ? 'active' : ''}`}
                        title={`${a.name}${a.description ? ` — ${a.description}` : ''}${isMe ? '\n\nНажмите, чтобы поставить бейдж в профиль' : ''}`}
                        disabled={!isMe || badgeBusyId === a.id}
                        onClick={async () => {
                          if (!isMe) return;
                          try {
                            setBadgeBusyId(a.id);
                            const res = await setMyBadge(a.id);
                            setSelectedBadgeId(res.badgeId || null);
                          } finally {
                            setBadgeBusyId(null);
                          }
                        }}
                      >
                        <span className="user-profile-achievement-tile-ico" aria-hidden>{a.icon}</span>
                        <span className="user-profile-achievement-tile-name">{a.name}</span>
                      </button>
                    ))}
                    {isMe && (
                      <button
                        type="button"
                        className={`user-profile-achievement-tile ${!selectedBadgeId ? 'active' : ''}`}
                        title="Снять бейдж"
                        disabled={badgeBusyId === '__none__'}
                        onClick={async () => {
                          try {
                            setBadgeBusyId('__none__');
                            await setMyBadge(null);
                            setSelectedBadgeId(null);
                          } finally {
                            setBadgeBusyId(null);
                          }
                        }}
                      >
                        <span className="user-profile-achievement-tile-name">No badge</span>
                      </button>
                    )}
                  </span>
                )}
              </div>
            </div>

            {isMe && (
              <div className="user-profile-row">
                <span className="user-profile-row-icon"><IconLink size={20} /></span>
                <div className="user-profile-row-body">
                  <span className="user-profile-row-label">{t('profilePersonalChannelLabel')}</span>
                  <button
                    type="button"
                    className="user-profile-channel-card"
                    onClick={() => {
                      if (!personalChannel?.id) return;
                      onOpenChannel?.(personalChannel.id);
                      onClose?.();
                    }}
                    disabled={!personalChannel?.id}
                    title={personalChannel?.name || t('profilePersonalChannelLabel')}
                  >
                    <div className="user-profile-channel-name">{personalChannel?.name || '—'}</div>
                    <div className="user-profile-channel-post">
                      {lastChannelPost?.content?.trim()
                        ? lastChannelPost.content
                        : (lastChannelPost?.attachmentPath ? 'Медиа сообщение' : 'Пока нет постов')}
                    </div>
                  </button>
                </div>
              </div>
            )}
          </section>

          {isMe && (
            <div className="user-profile-actions">
              <button
                type="button"
                className="btn-secondary user-profile-action-btn"
                onClick={() => {
                  onCreateChannel?.();
                  onClose?.();
                }}
              >
                {t('profileCreateChannel')}
              </button>
              <button
                type="button"
                className="btn-primary user-profile-action-btn"
                onClick={() => {
                  onEditProfile?.();
                  onClose?.();
                }}
              >
                {t('profileEditButton')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
