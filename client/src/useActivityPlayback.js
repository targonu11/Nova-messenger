import { useEffect, useMemo, useState } from 'react';
import { resolveActivityPosition, activityProgress, activityTrackKey } from './activityUtils';

/** Плавный прогресс воспроизведения — обновление каждый кадр, 1:1 со скоростью трека */export function useActivityPlayback(activity) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const trackKey = activityTrackKey(activity);
  const isMedia = activity?.type === 'music' || activity?.type === 'youtube';
  const isPlaying = Boolean(activity?.isPlaying);

  useEffect(() => {
    if (!isMedia || !isPlaying) {
      setNowMs(Date.now());
      return undefined;
    }
    let rafId = 0;
    const tick = () => {
      setNowMs(Date.now());
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isMedia, isPlaying, trackKey]);

  return useMemo(() => {
    const dur = Math.max(0, Number(activity?.durationMs) || 0);
    const pos = resolveActivityPosition(activity, nowMs);
    const progress = activityProgress(activity, nowMs);
    const hasDuration = dur > 0;
    return {
      pos,
      dur,
      progress,
      hasDuration,
      indeterminate: !hasDuration && isPlaying,
    };
  }, [activity, nowMs, isPlaying]);
}
