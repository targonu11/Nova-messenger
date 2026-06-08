/** Один голосовой плеер в чате одновременно (как в Telegram). */
let current = null;

export function claimVoicePlayback(audioEl) {
  if (!audioEl) return;
  if (current && current !== audioEl) {
    try {
      current.pause();
    } catch {}
  }
  current = audioEl;
}

export function releaseVoicePlayback(audioEl) {
  if (current === audioEl) current = null;
}
