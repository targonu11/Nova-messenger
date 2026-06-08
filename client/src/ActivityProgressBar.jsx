import React from 'react';

/** Полоска прогресса: точная при известной длительности, бегущая — если длительность неизвестна */
export function ActivityProgressBar({
  hasDuration,
  progress,
  isPlaying,
  trackClassName,
  fillClassName,
  indeterminateClassName,
}) {
  const indeterminate = !hasDuration && isPlaying;

  return (
    <div className={trackClassName}>
      <div
        className={`${fillClassName}${indeterminate ? ` ${indeterminateClassName}` : ''}`}
        style={hasDuration ? { width: `${Math.min(100, Math.max(0, progress))}%` } : undefined}
      />
    </div>
  );
}
