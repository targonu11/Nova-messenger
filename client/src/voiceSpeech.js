/** Распознавание речи в браузере (Web Speech API) во время записи. */
export function createSpeechTranscriber({ lang = 'ru-RU', onPartial, onFinal } = {}) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!SR) return null;

  const rec = new SR();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let full = '';

  rec.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0]?.transcript || '';
      if (event.results[i].isFinal) full += (full ? ' ' : '') + t.trim();
      else interim += t;
    }
    onPartial?.(full, interim);
    if (full) onFinal?.(full);
  };

  rec.onerror = () => {};

  return {
    start: () => {
      try {
        full = '';
        rec.start();
      } catch (_) { /* already started */ }
    },
    stop: () => {
      try {
        rec.stop();
      } catch (_) { /* ignore */ }
      return full.trim();
    },
    getTranscript: () => full.trim(),
  };
}

export function detectBrowserLang() {
  const l = (navigator.language || 'ru').slice(0, 2).toLowerCase();
  return l === 'ru' || l === 'en' || l === 'uk' || l === 'de' ? l : 'ru';
}

/** Озвучить текст (перевод) — Web Speech Synthesis, подбор голоса по языку. */
export function speakText(text, lang, { rate = 1, pitch = 1, onEnd } = {}) {
  if (!text || typeof window === 'undefined' || !window.speechSynthesis) return null;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = langToBcp47(lang);
  u.rate = rate;
  u.pitch = pitch;
  const voices = window.speechSynthesis.getVoices();
  const match = voices.find((v) => v.lang?.toLowerCase().startsWith(String(lang).toLowerCase()));
  if (match) u.voice = match;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
  return u;
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
}

function langToBcp47(code) {
  const map = { ru: 'ru-RU', en: 'en-US', uk: 'uk-UA', de: 'de-DE', fr: 'fr-FR', es: 'es-ES' };
  return map[code] || code || 'ru-RU';
}
