import { getNotificationsPlaySound } from './appSettings';

let audioContext = null;
let ringTimer = null;
let ringNodes = [];

function getCtx() {
  if (audioContext) return audioContext;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    return null;
  }
  return audioContext;
}

function tone({ freqs = [440], duration = 0.2, volume = 0.1, type = 'sine', gap = 0 }) {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    freqs.forEach((freq, i) => {
      const start = now + i * (duration + gap);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    });
  } catch {
    // ignore
  }
}

function dualRingBurst() {
  tone({ freqs: [440, 480], duration: 0.35, volume: 0.11, gap: 0.08 });
  window.setTimeout(() => tone({ freqs: [440, 480], duration: 0.35, volume: 0.11, gap: 0.08 }), 400);
}

function outgoingBurst() {
  tone({ freqs: [520], duration: 0.12, volume: 0.06, type: 'triangle' });
}

export function stopCallRing() {
  if (ringTimer) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
  ringNodes.forEach((n) => {
    try { n.stop?.(); n.disconnect?.(); } catch { /* ignore */ }
  });
  ringNodes = [];
}

/** Входящий звонок — классический двойной гудок */
export function startIncomingRing() {
  if (!getNotificationsPlaySound()) return;
  stopCallRing();
  dualRingBurst();
  ringTimer = setInterval(dualRingBurst, 2400);
}

/** Исходящий — мягкие гудки «ожидание» */
export function startOutgoingRing() {
  if (!getNotificationsPlaySound()) return;
  stopCallRing();
  outgoingBurst();
  ringTimer = setInterval(outgoingBurst, 1800);
}

/** Соединение установлено */
export function playCallConnected() {
  stopCallRing();
  if (!getNotificationsPlaySound()) return;
  tone({ freqs: [523, 659, 784], duration: 0.16, volume: 0.09, gap: 0.06 });
}

/** Звонок завершён */
export function playCallEnded() {
  stopCallRing();
  if (!getNotificationsPlaySound()) return;
  tone({ freqs: [392, 330], duration: 0.22, volume: 0.08, gap: 0.04, type: 'triangle' });
}

/** Отклонён / занято */
export function playCallRejected() {
  stopCallRing();
  if (!getNotificationsPlaySound()) return;
  tone({ freqs: [280, 220], duration: 0.18, volume: 0.07, gap: 0.05, type: 'square' });
}

/** Начало записи голосового */
export function playVoiceRecordStart() {
  if (!getNotificationsPlaySound()) return;
  tone({ freqs: [600, 720], duration: 0.1, volume: 0.06, gap: 0.03, type: 'sine' });
}

/** Голосовое отправлено */
export function playVoiceSend() {
  if (!getNotificationsPlaySound()) return;
  tone({ freqs: [480, 640, 520], duration: 0.12, volume: 0.07, gap: 0.04, type: 'triangle' });
}

/** Начало воспроизведения голосового */
export function playVoicePlayStart() {
  if (!getNotificationsPlaySound()) return;
  tone({ freqs: [540], duration: 0.08, volume: 0.04, type: 'sine' });
}

/** Отмена записи голосового */
export function playVoiceRecordCancel() {
  if (!getNotificationsPlaySound()) return;
  tone({ freqs: [420, 320], duration: 0.14, volume: 0.06, gap: 0.03, type: 'triangle' });
}

/** Переключение микрофона в звонке */
export function playCallMicToggle(muted) {
  if (!getNotificationsPlaySound()) return;
  if (muted) tone({ freqs: [360], duration: 0.1, volume: 0.05, type: 'square' });
  else tone({ freqs: [480, 560], duration: 0.1, volume: 0.05, gap: 0.02, type: 'sine' });
}
