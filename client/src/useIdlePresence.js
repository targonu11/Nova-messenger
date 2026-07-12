import { useEffect, useRef } from 'react';
import { updateCustomStatus } from './api';

const IDLE_MS = 5 * 60 * 1000;
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'visibilitychange'];

/**
 * Auto-set presence mode to idle after inactivity (Discord-style).
 * Restores previous mode on activity. Skips DND. Preserves emoji/text via partial status API.
 */
export function useIdlePresence(enabled, currentMode, onUpdated) {
  const idleRef = useRef(false);
  const prevModeRef = useRef(currentMode || 'online');
  const timerRef = useRef(null);
  const modeRef = useRef(currentMode || 'online');
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;

  useEffect(() => {
    modeRef.current = currentMode || 'online';
    if (currentMode !== 'idle') prevModeRef.current = currentMode || 'online';
  }, [currentMode]);

  useEffect(() => {
    if (!enabled) return undefined;

    const goIdle = async () => {
      if (idleRef.current) return;
      if (modeRef.current === 'dnd') return;
      idleRef.current = true;
      prevModeRef.current = modeRef.current === 'idle' ? 'online' : modeRef.current;
      try {
        const updated = await updateCustomStatus({ mode: 'idle' });
        onUpdatedRef.current?.(updated);
      } catch {}
    };

    const bump = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(goIdle, IDLE_MS);
    };

    const goActive = async () => {
      bump();
      if (!idleRef.current) return;
      if (document.visibilityState === 'hidden') return;
      idleRef.current = false;
      const restore = prevModeRef.current === 'idle' ? 'online' : (prevModeRef.current || 'online');
      try {
        const updated = await updateCustomStatus({ mode: restore === 'dnd' ? 'online' : restore });
        onUpdatedRef.current?.(updated);
      } catch {}
    };

    const onActivity = () => {
      if (document.visibilityState === 'hidden') return;
      goActive();
    };

    bump();
    EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
    };
  }, [enabled]);
}
