/** Извлечение пиков аудиограммы из Blob (Web Audio API). */
export async function extractWaveformPeaks(blob, barCount = 48) {
  if (!blob || !blob.size) {
    return { peaks: [], durationSec: 0 };
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    return { peaks: fallbackPeaks(barCount), durationSec: 0 };
  }
  const ctx = new AudioCtx();
  try {
    const buf = await blob.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf.slice(0));
    const channel = audio.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channel.length / barCount));
    const peaks = [];
    for (let i = 0; i < barCount; i++) {
      let max = 0;
      const start = i * blockSize;
      const end = Math.min(channel.length, start + blockSize);
      for (let j = start; j < end; j++) {
        max = Math.max(max, Math.abs(channel[j]));
      }
      peaks.push(Math.min(100, Math.round(max * 100)));
    }
    return {
      peaks,
      durationSec: Number.isFinite(audio.duration) ? audio.duration : 0,
    };
  } catch (e) {
    console.warn('Waveform decode failed:', e);
    return { peaks: fallbackPeaks(barCount), durationSec: 0 };
  } finally {
    try {
      await ctx.close();
    } catch (_) { /* ignore */ }
  }
}

function fallbackPeaks(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(20 + (i % 7) * 8);
  return out;
}

/** Живая аудиограмма при записи через AnalyserNode. */
export function createLiveAnalyser(stream) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx || !stream) return null;
  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.65;
  source.connect(analyser);
  return { ctx, analyser, barCount: 36 };
}

export function readAnalyserPeaks(analyser, barCount = 36) {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  const step = Math.floor(data.length / barCount) || 1;
  const peaks = [];
  for (let i = 0; i < barCount; i++) {
    let sum = 0;
    const start = i * step;
    for (let j = start; j < start + step && j < data.length; j++) sum += data[j];
    const avg = sum / step;
    peaks.push(Math.min(100, Math.round((avg / 255) * 100)));
  }
  return peaks;
}
