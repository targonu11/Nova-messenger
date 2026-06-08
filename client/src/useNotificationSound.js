let audioContext = null;

function getAudioContext() {
  if (audioContext) return audioContext;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    return null;
  }
  return audioContext;
}

/**
 * Воспроизводит короткий плавный звук уведомления (тон с затуханием).
 */
export function playNotificationSound() {
  playTone({ start: 880, mid: 1100, end: 880, duration: 0.35, volume: 0.15 });
}

/** Мягкий «whoosh» при отправке сообщения */
export function playSendSound() {
  playTone({ start: 520, mid: 680, end: 420, duration: 0.18, volume: 0.08, type: 'triangle' });
}

/** Короткий pop при реакции */
export function playReactionSound() {
  playTone({ start: 640, mid: 920, end: 720, duration: 0.12, volume: 0.06, type: 'sine' });
}

/** Тихий «ping» при новом сообщении вне экрана */
export function playNewMessageSound() {
  playTone({ start: 480, mid: 620, end: 540, duration: 0.14, volume: 0.05, type: 'sine' });
}

/** Мягкий chime при восстановлении соединения */
export function playConnectSound() {
  playTone({ start: 392, mid: 523, end: 659, duration: 0.22, volume: 0.07, type: 'sine' });
}

function playTone({ start, mid, end, duration = 0.3, volume = 0.12, type = 'sine' }) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(start, now);
    if (mid) osc.frequency.exponentialRampToValueAtTime(mid, now + duration * 0.35);
    osc.frequency.exponentialRampToValueAtTime(end, now + duration * 0.7);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    osc.stop(now + duration);
  } catch {
    // ignore
  }
}
