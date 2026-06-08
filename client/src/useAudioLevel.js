import { useState, useEffect } from 'react';

/** Уровень громкости потока 0…1 для визуализации «говорит» */
export function useAudioLevel(stream, enabled = true) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream || !enabled) {
      setLevel(0);
      return undefined;
    }
    const tracks = stream.getAudioTracks?.() || [];
    if (!tracks.length || tracks.every((t) => !t.enabled || t.muted)) {
      setLevel(0);
      return undefined;
    }

    let ctx;
    let anim;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i];
        setLevel(Math.min(1, (sum / data.length) / 90));
        anim = requestAnimationFrame(tick);
      };
      anim = requestAnimationFrame(tick);
    } catch {
      setLevel(0);
    }

    return () => {
      if (anim) cancelAnimationFrame(anim);
      if (ctx) ctx.close().catch(() => {});
    };
  }, [stream, enabled]);

  return level;
}
