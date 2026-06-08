import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './NovaConfetti.css';

const COLORS = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#00b0f4', '#ffffff'];

let burstFn = null;

/** Глобальный взрыв confetti: burstNovaConfetti({ count: 60 }) */
export function burstNovaConfetti(opts = {}) {
  burstFn?.(opts);
}

export function NovaConfettiHost() {
  const [bursts, setBursts] = useState([]);

  useEffect(() => {
    burstFn = ({ count = 48, originX = 50, originY = 50 } = {}) => {
      const id = Date.now();
      const pieces = Array.from({ length: count }, (_, i) => ({
        id: `${id}-${i}`,
        dx: `${(Math.random() - 0.5) * 160}px`,
        dy: `${-40 - Math.random() * 120}px`,
        rot: `${Math.random() * 720 - 360}deg`,
        color: COLORS[i % COLORS.length],
        delay: `${Math.random() * 0.15}s`,
        w: `${4 + Math.random() * 6}px`,
        h: `${6 + Math.random() * 8}px`,
        left: `${originX + (Math.random() - 0.5) * 8}%`,
        top: `${originY}%`,
      }));
      setBursts((prev) => [...prev, { id, pieces }]);
      setTimeout(() => {
        setBursts((prev) => prev.filter((b) => b.id !== id));
      }, 2200);
    };
    return () => { burstFn = null; };
  }, []);

  if (!bursts.length) return null;

  return createPortal(
    <div className="nova-confetti-layer" aria-hidden>
      {bursts.map((burst) => (
        <div key={burst.id} className="nova-confetti-burst">
          {burst.pieces.map((p) => (
            <span
              key={p.id}
              className="nova-confetti-piece"
              style={{
                '--dx': p.dx,
                '--dy': p.dy,
                '--rot': p.rot,
                left: p.left,
                top: p.top,
                width: p.w,
                height: p.h,
                background: p.color,
                animationDelay: p.delay,
              }}
            />
          ))}
        </div>
      ))}
    </div>,
    document.body
  );
}
