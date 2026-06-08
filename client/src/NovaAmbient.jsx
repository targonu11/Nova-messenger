import React, { useMemo } from 'react';
import './NovaAmbient.css';

function makeParticles(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: `${2 + Math.random() * 5}px`,
    delay: `${Math.random() * 12}s`,
    duration: `${14 + Math.random() * 18}s`,
    opacity: 0.15 + Math.random() * 0.35,
  }));
}

export default function NovaAmbient({ variant = 'messenger', density = 28 }) {
  const particles = useMemo(() => makeParticles(density), [density]);
  const orbs = useMemo(() => (
    Array.from({ length: 3 }, (_, i) => ({
      id: i,
      left: `${15 + i * 30}%`,
      top: `${10 + i * 25}%`,
      delay: `${i * 4}s`,
    }))
  ), []);

  return (
    <div className={`nova-ambient nova-ambient--${variant}`} aria-hidden>
      <div className="nova-ambient-mesh" />
      {orbs.map((o) => (
        <span key={o.id} className="nova-ambient-orb" style={{ left: o.left, top: o.top, animationDelay: o.delay }} />
      ))}
      {variant === 'login' && [0, 1, 2].map((i) => (
        <span
          key={`comet-${i}`}
          className="nova-ambient-comet"
          style={{ top: `${12 + i * 28}%`, animationDelay: `${i * 5.5}s`, animationDuration: `${2.8 + i * 0.6}s` }}
        />
      ))}
      {particles.map((p) => (
        <span
          key={p.id}
          className="nova-ambient-particle"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            animationDuration: p.duration,
            opacity: p.opacity,
          }}
        />
      ))}
    </div>
  );
}
