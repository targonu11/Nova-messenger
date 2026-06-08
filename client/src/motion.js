import { getAdvancedSmoothAnimations, getBatteryReduceMotion } from './appSettings';

export function applyMotionPreferences() {
  const root = document.documentElement;
  const osReduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const reduce = osReduce || !getAdvancedSmoothAnimations() || getBatteryReduceMotion();
  if (reduce) {
    root.setAttribute('data-reduce-motion', 'true');
  } else {
    root.removeAttribute('data-reduce-motion');
  }
}
