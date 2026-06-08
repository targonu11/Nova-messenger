import fs from 'fs';
import path from 'path';

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const GROQ_KEY = process.env.GROQ_API_KEY || '';

export function parseVoiceMeta(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

export function detectLanguage(text) {
  const t = String(text || '').trim();
  if (!t) return 'unknown';
  const cyr = (t.match(/[\u0400-\u04FF]/g) || []).length;
  const lat = (t.match(/[A-Za-z]/g) || []).length;
  if (cyr > lat) return 'ru';
  if (lat > 0) return 'en';
  return 'unknown';
}

async function postWhisperCompatible(url, apiKey, model, absPath) {
  const buf = fs.readFileSync(absPath);
  const blob = new Blob([buf], { type: 'audio/webm' });
  const form = new FormData();
  form.append('file', blob, path.basename(absPath));
  form.append('model', model);
  form.append('response_format', 'json');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    console.warn('Whisper API error:', res.status, await res.text().catch(() => ''));
    return null;
  }
  const data = await res.json();
  return typeof data.text === 'string' ? data.text.trim() : null;
}

export async function transcribeAudioFile(absPath) {
  if (!fs.existsSync(absPath)) return null;
  try {
    if (GROQ_KEY) {
      const t = await postWhisperCompatible(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        GROQ_KEY,
        'whisper-large-v3-turbo',
        absPath,
      );
      if (t) return t;
    }
    if (OPENAI_KEY) {
      return await postWhisperCompatible(
        'https://api.openai.com/v1/audio/transcriptions',
        OPENAI_KEY,
        'whisper-1',
        absPath,
      );
    }
  } catch (e) {
    console.warn('Whisper transcribe failed:', e.message);
  }
  return null;
}

export async function translateText(text, fromLang, toLang) {
  const t = String(text || '').trim();
  if (!t) return '';
  const from = normalizeLang(fromLang);
  const to = normalizeLang(toLang);
  if (!from || !to || from === to) return t;

  try {
    const url = `https://lingva.ml/api/v1/${from}/${to}/${encodeURIComponent(t)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const out = data?.translation;
    if (typeof out === 'string' && out.trim()) return out.trim();
  } catch (e) {
    console.warn('Lingva translate failed:', e.message);
  }

  return t;
}

function normalizeLang(code) {
  const c = String(code || '').toLowerCase().slice(0, 2);
  if (c === 'unknown' || !c) return 'en';
  return c;
}

export async function buildVoiceMeta({ absPath, clientTranscript, waveform, durationSec, clientLang }) {
  let transcript = String(clientTranscript || '').trim();
  let source = transcript ? 'browser' : 'none';

  const aiTranscript = await transcribeAudioFile(absPath);
  if (aiTranscript) {
    transcript = aiTranscript;
    source = GROQ_KEY ? 'groq-whisper' : 'whisper';
  }

  const detectedLang = transcript
    ? detectLanguage(transcript)
    : normalizeLang(clientLang) || 'unknown';

  const peaks = Array.isArray(waveform?.peaks)
    ? waveform.peaks.slice(0, 64).map((n) => Math.min(100, Math.max(0, Number(n) || 0)))
    : [];

  return {
    version: 1,
    peaks,
    durationSec: Number(durationSec) || 0,
    transcript: transcript || '',
    detectedLang,
    transcriptSource: source,
    translations: {},
    processedAt: Math.floor(Date.now() / 1000),
  };
}

export async function translateVoiceMeta(meta, targetLang) {
  const m = parseVoiceMeta(meta) || {};
  const lang = normalizeLang(targetLang);
  if (!m.transcript) return { ...m, translations: { ...(m.translations || {}) } };
  const translations = { ...(m.translations || {}) };
  if (!translations[lang]) {
    translations[lang] = await translateText(m.transcript, m.detectedLang, lang);
  }
  return { ...m, translations };
}

export async function transcribeVoiceMeta(meta, absPath, clientTranscript) {
  const m = parseVoiceMeta(meta) || {};
  if (m.transcript?.trim()) return m;

  let transcript = String(clientTranscript || m.pendingTranscript || '').trim();
  let source = transcript ? 'browser' : 'none';

  const ai = await transcribeAudioFile(absPath);
  if (ai) {
    transcript = ai;
    source = GROQ_KEY ? 'groq-whisper' : 'whisper';
  }

  return {
    ...m,
    transcript: transcript || '',
    detectedLang: transcript ? detectLanguage(transcript) : (m.detectedLang || 'unknown'),
    transcriptSource: source,
    transcribedAt: transcript ? Math.floor(Date.now() / 1000) : null,
  };
}
