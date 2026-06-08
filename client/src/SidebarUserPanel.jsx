import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { formatCustomStatusLine, STATUS_PRESETS } from './customStatus';
import { formatActivityTime, formatArtists, formatGameSessionTime, resolveGameSessionMs } from './activityUtils';
import { useActivityPlayback } from './useActivityPlayback';
import { ActivityProgressBar } from './ActivityProgressBar';
import { ProfileLevelBadge } from './ProfileLevelBadge';
import './SidebarUserPanel.css';

function EqualizerBars({ playing }) {
  if (!playing) return null;
  return (
    <span className="sidebar-eq" aria-hidden>
      <span /><span /><span />
    </span>
  );
}

function ActivityRow({ activity, compact = false, showProgress = true }) {
  const isMedia = activity.type === 'music' || activity.type === 'youtube';
  const isGame = activity.type === 'game';
  const { pos, dur, progress, hasDuration } = useActivityPlayback(activity);
  const hasTimeline = isMedia && (hasDuration || pos > 0 || activity.isPlaying);
  const [, gameTick] = useState(0);

  useEffect(() => {
    if (!isGame || !activity.isPlaying) return undefined;
    const id = setInterval(() => gameTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isGame, activity.isPlaying, activity.startedAt]);

  const displayTitle = activity.name || '';
  const displayArtist = formatArtists(activity.details) || activity.details || '';

  return (
    <div className={`sidebar-activity-row sidebar-activity-row--${activity.type}${compact ? ' sidebar-activity-row--compact' : ''}${activity.isPlaying ? ' sidebar-activity-row--playing' : ''}`}>
      <div className="sidebar-activity-row-art-wrap">
        {activity.artworkUrl ? (
          <img className="sidebar-activity-row-art" src={activity.artworkUrl} alt="" />
        ) : (
          <div className="sidebar-activity-row-art sidebar-activity-row-art--placeholder">
            {activity.type === 'game' && '🎮'}
            {activity.type === 'music' && '🎧'}
            {activity.type === 'youtube' && '▶'}
          </div>
        )}
        {activity.isPlaying && isMedia && <span className="sidebar-activity-playing-ring" aria-hidden />}
      </div>
      <div className="sidebar-activity-row-body">
        <span className="sidebar-activity-row-label">
          {activity.type === 'game' && 'В игре'}
          {activity.type === 'music' && 'Слушает'}
          {activity.type === 'youtube' && 'Смотрит'}
          <EqualizerBars playing={activity.isPlaying && activity.type === 'music'} />
        </span>
        <span className="sidebar-activity-row-name" title={displayTitle}>{displayTitle}</span>
        {displayArtist && activity.type !== 'game' && (
          <span className="sidebar-activity-row-sub" title={displayArtist}>{displayArtist}</span>
        )}
        {hasTimeline && showProgress && (
          <div className="sidebar-activity-timeline">
            <ActivityProgressBar
              hasDuration={hasDuration}
              progress={progress}
              isPlaying={activity.isPlaying}
              trackClassName="sidebar-activity-progress-track"
              fillClassName="sidebar-activity-progress-fill"
              indeterminateClassName="sidebar-activity-progress-fill--indeterminate"
            />
            <span className="sidebar-activity-row-time">
              {formatActivityTime(pos)}
              {hasDuration ? ` / ${formatActivityTime(dur)}` : ''}
            </span>
          </div>
        )}
        {activity.type === 'game' && (
          <span className="sidebar-activity-row-sub">
            {activity.details}
            {activity.isPlaying && resolveGameSessionMs(activity) > 0 && (
              <> · {formatGameSessionTime(activity)}</>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

function formatActivityPreview(activity) {
  if (!activity?.name) return '';
  if (activity.type === 'music' || activity.type === 'youtube') {
    const artists = formatArtists(activity.details);
    return artists ? `${activity.name} — ${artists}` : activity.name;
  }
  return activity.name;
}

export default function SidebarUserPanel({
  user,
  connected,
  activities = [],
  t,
  lang = 'ru',
  onStatusClick,
  onProfileClick,
  onSettingsClick,
  onAdminClick,
  isAdmin,
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const statusLine = formatCustomStatusLine(user);
  const list = Array.isArray(activities) ? activities.filter((a) => a?.name) : [];
  const primaryActivity = list[0] || null;

  const previewLine = useMemo(() => {
    if (primaryActivity) return formatActivityPreview(primaryActivity);
    return statusLine || t('setStatus');
  }, [primaryActivity, statusLine, t]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => setOpen((v) => !v);

  return (
    <div
      ref={panelRef}
      className={`sidebar-user-panel${open ? ' sidebar-user-panel--open' : ' sidebar-user-panel--collapsed'}${list.length ? ' sidebar-user-panel--has-activity' : ''}`}
    >
      {list.length > 0 && (
        <div className={`sidebar-activity-stack${open ? ' sidebar-activity-stack--expanded' : ' sidebar-activity-stack--mini'}`}>
          {(open ? list : list.slice(0, 1)).map((a, i) => (
            <ActivityRow
              key={`${a.type}-${a.name}-${i}`}
              activity={a}
              compact={!open}
              showProgress={open || a.isPlaying}
            />
          ))}
        </div>
      )}

      <div className="sidebar-user-bar">
        <button
          type="button"
          className="sidebar-user-bar-main"
          onClick={toggle}
          aria-expanded={open}
          title={user?.displayName}
        >
          <Avatar path={user?.avatarPath} userId={user?.id} size="sm" ring={user?.avatarRing} presenceOnline={!!connected} />
          <div className="sidebar-user-bar-text">
            <span className="sidebar-user-bar-name">
              {user?.displayName}
              {user?.isVerified && <span className="verify-badge verify-badge-inline">✔</span>}
              {user && <ProfileLevelBadge user={user} lang={lang} compact />}
            </span>
            {!open ? (
              <span className={`sidebar-user-bar-status sidebar-user-bar-status--preview${primaryActivity || statusLine ? '' : ' sidebar-user-bar-status--muted'}${primaryActivity ? ' sidebar-user-bar-status--activity' : ''}`}>
                {previewLine}
              </span>
            ) : (
              <span className="sidebar-user-bar-login">@{user?.login}</span>
            )}
          </div>
          <span className={`sidebar-user-bar-chevron${open ? ' sidebar-user-bar-chevron--open' : ''}`} aria-hidden>›</span>
        </button>

        {open && (
          <div className="sidebar-user-bar-actions">
            {isAdmin && (
              <button type="button" className="sidebar-user-bar-btn sidebar-user-bar-btn--admin" onClick={onAdminClick} title="Админ-панель" aria-label="Админ-панель">
                <span className="icon-admin-star" />
              </button>
            )}
            <button type="button" className="sidebar-user-bar-btn" onClick={onSettingsClick} title={t('messengerSettings')} aria-label={t('messengerSettings')}>
              <span className="icon-gear" />
            </button>
          </div>
        )}
      </div>

      <div className={`sidebar-user-menu${open ? ' sidebar-user-menu--open' : ''}`}>
        <div className="sidebar-user-menu-inner">
          <div className="sidebar-user-menu-presets">
            {STATUS_PRESETS.slice(0, 4).map((p) => (
              <button key={p.id} type="button" className="sidebar-user-menu-preset" title={t(p.labelKey)} onClick={() => onStatusClick?.(p)}>
                {p.emoji || '🟢'}
              </button>
            ))}
            <button type="button" className="sidebar-user-menu-preset sidebar-user-menu-preset--more" onClick={() => onStatusClick?.()} title={t('customStatusTitle')}>✏️</button>
          </div>
          <div className="sidebar-user-menu-links">
            <button type="button" className="sidebar-user-menu-link" onClick={onProfileClick}>{t('sidebarOpenProfile')}</button>
            <button type="button" className="sidebar-user-menu-link" onClick={onSettingsClick}>{t('settings')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { ActivityRow };
