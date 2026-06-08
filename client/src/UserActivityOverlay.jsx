import React, { useEffect, useState } from 'react';
import { formatActivityTime, primaryActivityLine, formatTrackLine, formatArtists, formatGameSessionTime, resolveGameSessionMs } from './activityUtils';
import { useActivityPlayback } from './useActivityPlayback';
import { ActivityProgressBar } from './ActivityProgressBar';
import './UserActivityOverlay.css';

function ActivityIcon({ type }) {
  if (type === 'game') return <span className="user-activity-icon user-activity-icon--game" aria-hidden>🎮</span>;
  if (type === 'youtube') return <span className="user-activity-icon user-activity-icon--youtube" aria-hidden>▶</span>;
  return <span className="user-activity-icon user-activity-icon--music" aria-hidden>🎧</span>;
}

function EqBars() {
  return (
    <span className="user-activity-eq" aria-hidden>
      <span /><span /><span />
    </span>
  );
}

function ActivityCard({ activity, t, compact = false, showProgress = true }) {
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

  const displayDetails = formatArtists(activity.details) || activity.details || '';

  return (
    <div className={`user-activity-card user-activity-card--${activity.type}${compact ? ' user-activity-card--compact' : ''}${activity.isPlaying ? ' user-activity-card--playing' : ''}`}>
      <div className="user-activity-art-wrap">
        {activity.artworkUrl ? (
          <img className="user-activity-art" src={activity.artworkUrl} alt="" />
        ) : (
          <div className="user-activity-art user-activity-art--placeholder">
            <ActivityIcon type={activity.type} />
          </div>
        )}
        {activity.isPlaying && isMedia && <span className="user-activity-art-ring" aria-hidden />}
      </div>
      <div className="user-activity-body">
        <div className="user-activity-label">
          {activity.type === 'game' && t('activityPlaying')}
          {activity.type === 'music' && (
            <>
              {t('activityListening')}
              {activity.isPlaying && <EqBars />}
            </>
          )}
          {activity.type === 'youtube' && t('activityWatching')}
        </div>
        <div className="user-activity-title" title={activity.name}>{activity.name}</div>
        {displayDetails && activity.type !== 'game' && (
          <div className="user-activity-details" title={displayDetails}>{displayDetails}</div>
        )}
        {isGame && activity.isPlaying && resolveGameSessionMs(activity) > 0 && (
          <div className="user-activity-details">{formatGameSessionTime(activity)}</div>
        )}
        {hasTimeline && showProgress && (
          <div className="user-activity-timeline">
            <ActivityProgressBar
              hasDuration={hasDuration}
              progress={progress}
              isPlaying={activity.isPlaying}
              trackClassName="user-activity-progress-track"
              fillClassName="user-activity-progress-fill"
              indeterminateClassName="user-activity-progress-fill--indeterminate"
            />
            <span className="user-activity-time">
              {formatActivityTime(pos)}
              {hasDuration ? ` / ${formatActivityTime(dur)}` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function UserActivityOverlay({ activities, t, compact = false, inline = false }) {
  const list = Array.isArray(activities) ? activities.filter((a) => a && a.name) : [];
  if (!list.length) return null;

  if (inline) {
    return (
      <span className="user-activity-inline" title={formatTrackLine(list[0])}>
        {formatTrackLine(list[0])}
      </span>
    );
  }

  return (
    <div className={`user-activity-overlay${compact ? ' user-activity-overlay--compact' : ''}`}>
      {list.map((a, i) => (
        <ActivityCard key={`${a.type}-${a.name}-${i}`} activity={a} t={t} compact={compact} />
      ))}
    </div>
  );
}

export function UserActivityPreview({ activities, t }) {
  const list = Array.isArray(activities) ? activities.filter((a) => a && a.name) : [];
  if (!list.length) return null;
  const a = list[0];
  return (
    <span className={`user-activity-preview user-activity-preview--${a.type}${a.isPlaying ? ' user-activity-preview--playing' : ''}`}>
      <ActivityIcon type={a.type} />
      <span className="user-activity-preview-text">{formatTrackLine(a) || primaryActivityLine(a, t)}</span>
    </span>
  );
}
