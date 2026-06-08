/** Форматирование и интерполяция позиции воспроизведения */

export function formatActivityTime(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function activityTrackKey(activity) {
  if (!activity) return '';
  const type = activity.type || '';
  const name = String(activity.name || '').trim().toLowerCase();
  return `${type}|${name}`;
}

function preferArtistDetails(prevDetails, incomingDetails) {
  const prev = String(prevDetails || '').trim();
  const incoming = String(incomingDetails || '').trim();
  if (!prev) return incoming;
  if (!incoming) return prev;
  if (prev.length >= incoming.length) return prev;
  if (incoming.includes(prev)) return incoming;
  return incoming;
}

/** Текущая позиция — плавно, без сброса при каждом poll */
export function resolveActivityPosition(activity, nowMs = Date.now()) {
  if (!activity) return 0;
  const base = Math.max(0, Number(activity.playbackBaseMs ?? activity.positionMs) || 0);
  if (!activity.isPlaying) return base;
  const anchor = Number(activity.playbackAnchorMs ?? activity.updatedAt) || nowMs;
  const elapsed = Math.max(0, nowMs - anchor);
  const dur = Number(activity.durationMs) || 0;
  const next = base + elapsed;
  if (dur > 0) return Math.min(next, dur);
  return next;
}

export function activityProgress(activity, nowMs = Date.now()) {
  const pos = resolveActivityPosition(activity, nowMs);
  const dur = Math.max(0, Number(activity?.durationMs) || 0);
  if (dur <= 0) return 0;
  return Math.min(100, (pos / dur) * 100);
}

/** Все артисты — сохраняем строку целиком, нормализуем только разделители */
export function formatArtists(details) {
  if (!details || typeof details !== 'string') return '';
  return details
    .split(/[,;]|(?:\s+feat\.?\s+)|(?:\s+ft\.?\s+)/gi)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(', ');
}

/** Краткая строка трека */
export function formatTrackLine(activity) {
  if (!activity?.name) return '';
  if (activity.type === 'music' || activity.type === 'youtube') {
    const artists = formatArtists(activity.details);
    return artists ? `${activity.name} — ${artists}` : activity.name;
  }
  if (activity.type === 'game') return activity.name;
  return activity.name;
}

/**
 * Сохраняет локальные часы воспроизведения между poll-ами Electron.
 * Сбрасывает якорь только при смене трека или большом рассинхроне с системой.
 */
export function mergePlaybackActivities(prevList, incomingList, nowMs = Date.now()) {
  const prevMap = new Map((prevList || []).map((a) => [activityTrackKey(a), a]));
  const RESYNC_DRIFT_MS = 3500;

  return (incomingList || []).map((incoming) => {
    const key = activityTrackKey(incoming);
    const prev = prevMap.get(key);
    const sysPos = Math.max(0, Number(incoming.positionMs) || 0);
    const sysDur = Math.max(0, Number(incoming.durationMs) || 0);
    const mergedDetails = formatArtists(preferArtistDetails(prev?.details, incoming.details)) || incoming.details || '';

    const base = {
      ...incoming,
      details: mergedDetails,
      durationMs: sysDur > 0 ? sysDur : (prev?.durationMs || 0),
      startedAt: incoming.type === 'game' && prev?.startedAt
        ? prev.startedAt
        : (incoming.startedAt ?? prev?.startedAt),
    };

    if (!prev) {
      const startPos = sysPos > 0 ? sysPos : 0;
      return {
        ...base,
        playbackBaseMs: startPos,
        playbackAnchorMs: nowMs,
        positionMs: startPos,
        updatedAt: nowMs,
      };
    }

    const localPos = resolveActivityPosition(prev, nowMs);
    const prevBase = Math.max(0, Number(prev.playbackBaseMs ?? prev.positionMs) || 0);

    // Системная позиция — источник правды (SMTC / Spotify)
    if (sysPos > 0 && incoming.isPlaying && (!prev || Math.abs(sysPos - localPos) > 700)) {
      return {
        ...base,
        playbackBaseMs: sysPos,
        playbackAnchorMs: nowMs,
        positionMs: sysPos,
        updatedAt: nowMs,
      };
    }

    // Система отдала позицию позже (Nova открыли во время трека) — подхватываем
    if (sysPos > 0 && sysPos > localPos + 1500 && sysPos > prevBase + 1500) {
      return {
        ...base,
        playbackBaseMs: sysPos,
        playbackAnchorMs: nowMs,
        positionMs: sysPos,
        updatedAt: nowMs,
      };
    }

    if (!incoming.isPlaying) {
      const frozen = sysPos > 0 ? sysPos : localPos;
      return {
        ...base,
        playbackBaseMs: frozen,
        playbackAnchorMs: nowMs,
        positionMs: frozen,
        updatedAt: nowMs,
      };
    }

    // Система не отдала позицию (Spotify fallback) — продолжаем локальные часы
    if (sysPos <= 0) {
      return {
        ...base,
        durationMs: base.durationMs || prev?.durationMs || 0,
        playbackBaseMs: prev.playbackBaseMs ?? prev.positionMs ?? localPos,
        playbackAnchorMs: prev.playbackAnchorMs ?? prev.updatedAt ?? nowMs,
        positionMs: prev.playbackBaseMs ?? prev.positionMs ?? 0,
        updatedAt: prev.playbackAnchorMs ?? prev.updatedAt ?? nowMs,
      };
    }

    // Длительность пришла позже — пересчитываем якорь под текущую позицию
    if (sysDur > 0 && !(prev?.durationMs > 0)) {
      return {
        ...base,
        playbackBaseMs: sysPos,
        playbackAnchorMs: nowMs,
        positionMs: sysPos,
        updatedAt: nowMs,
      };
    }

    if (Math.abs(sysPos - localPos) > RESYNC_DRIFT_MS) {
      return {
        ...base,
        playbackBaseMs: sysPos,
        playbackAnchorMs: nowMs,
        positionMs: sysPos,
        updatedAt: nowMs,
      };
    }

    return {
      ...base,
      playbackBaseMs: prev.playbackBaseMs ?? prev.positionMs ?? 0,
      playbackAnchorMs: prev.playbackAnchorMs ?? prev.updatedAt ?? nowMs,
      positionMs: prev.playbackBaseMs ?? prev.positionMs ?? 0,
      updatedAt: prev.playbackAnchorMs ?? prev.updatedAt ?? nowMs,
    };
  });
}

/** Снимок для отправки на сервер (актуальная позиция) */
export function activitiesForServer(activities, nowMs = Date.now()) {
  return (activities || []).map((a) => {
    const { playbackBaseMs, playbackAnchorMs, ...rest } = a;
    const pos = resolveActivityPosition(a, nowMs);
    return {
      ...rest,
      positionMs: pos,
      updatedAt: nowMs,
    };
  });
}

export function primaryActivityLine(activity, t) {
  if (!activity) return '';
  if (activity.type === 'game') {
    return `${t('activityPlaying')} ${activity.name}`;
  }
  if (activity.type === 'music') {
    const track = formatTrackLine(activity);
    return `${t('activityListening')} ${track}`;
  }
  if (activity.type === 'youtube') {
    return `${t('activityWatching')} ${activity.name}`;
  }
  return activity.name || '';
}

export function normalizeActivities(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((a) => a && a.type && a.name);
}

export function resolveGameSessionMs(activity, nowMs = Date.now()) {
  if (!activity || activity.type !== 'game') return 0;
  const started = Number(activity.startedAt);
  if (Number.isFinite(started) && started > 0) {
    return Math.max(0, Math.floor(nowMs / 1000) - started);
  }
  return 0;
}

export function formatGameSessionTime(activity, nowMs = Date.now()) {
  const sec = resolveGameSessionMs(activity, nowMs);
  return formatActivityTime(sec * 1000);
}

export function formatActivityPreview(activities, t) {
  const list = normalizeActivities(activities);
  if (!list.length) return '';
  return primaryActivityLine(list[0], t);
}
