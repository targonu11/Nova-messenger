import React, { useEffect, useMemo } from 'react';

const PARTICLE_EMOJIS = ['✦', '✧', '·', '⋆', '✨', '°', '✧'];

/** Фоновые частицы + вспышки/тряска/звёздопад/mood */
export default function ImbaChatEffects({ shake, flash, rain, starfall, overload, mood }) {
  const particles = useMemo(
    () =>
      Array.from({ length: overload ? 28 : 18 }, (_, i) => ({
        id: i,
        left: `${(i * 17 + 7) % 100}%`,
        delay: `${(i % 9) * 0.35}s`,
        dur: `${5 + (i % 5)}s`,
        size: `${8 + (i % 6)}px`,
        emoji: PARTICLE_EMOJIS[i % PARTICLE_EMOJIS.length],
        drift: `${(i % 2 ? 1 : -1) * (8 + (i % 5) * 3)}px`,
      })),
    [overload]
  );

  const stars = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        id: i,
        left: `${(i * 19 + 3) % 100}%`,
        delay: `${(i % 8) * 0.15}s`,
        dur: `${1.2 + (i % 5) * 0.25}s`,
      })),
    []
  );

  useEffect(() => {
    if (!shake) return undefined;
    const root = document.documentElement;
    root.classList.add('imba-shake');
    const t = window.setTimeout(() => root.classList.remove('imba-shake'), 520);
    return () => {
      window.clearTimeout(t);
      root.classList.remove('imba-shake');
    };
  }, [shake]);

  return (
    <div
      className={`imba-chat-fx-layer${rain ? ' imba-chat-fx-layer--rain' : ''}${overload ? ' imba-chat-fx-layer--overload' : ''}`}
      aria-hidden
    >
      {mood ? <div className={`imba-mood imba-mood--${mood}`} /> : null}
      {particles.map((p) => (
        <span
          key={p.id}
          className="imba-particle"
          style={{
            left: p.left,
            animationDelay: p.delay,
            animationDuration: p.dur,
            fontSize: p.size,
            '--imba-drift': p.drift,
          }}
        >
          {p.emoji}
        </span>
      ))}
      {starfall
        ? stars.map((s) => (
            <span
              key={`s-${s.id}`}
              className="imba-star"
              style={{ left: s.left, animationDelay: s.delay, animationDuration: s.dur }}
            >
              ✦
            </span>
          ))
        : null}
      {flash ? <div className={`imba-screen-flash imba-screen-flash--${flash}`} /> : null}
      {rain ? (
        <div className="imba-rain">
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} className="imba-raindrop" style={{ left: `${(i * 13) % 100}%`, animationDelay: `${(i % 8) * 0.12}s` }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
