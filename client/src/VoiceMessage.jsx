import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { claimVoicePlayback, releaseVoicePlayback } from './voicePlaybackManager';
import { transcribeVoiceMessage, translateVoiceMessage } from './api';
import { getAppSettings } from './appSettings';
import { speakText, stopSpeaking } from './voiceSpeech';
import { playVoicePlayStart } from './useCallSounds';
import './VoiceMessage.css';

const SPEEDS = [1, 1.5, 2];

function hashSeed(str) {
  let h = 0;
  const s = String(str || '0');
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  return Math.abs(h);
}

function formatClock(sec) {
  const t = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(t / 60);
  const ss = String(t % 60).padStart(2, '0');
  return `${m}:${ss}`;
}

export function VoiceMessage({
  src,
  durationSec,
  isOwn,
  messageId,
  voiceMeta,
  onVoiceMetaUpdate,
}) {
  const [playing, setPlaying] = useState(false);
  const [entering] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const safeDurationSec = typeof durationSec === 'number' && Number.isFinite(durationSec) && durationSec >= 0 ? durationSec : 0;
  const metaDuration = voiceMeta?.durationSec;
  const [duration, setDuration] = useState(metaDuration || safeDurationSec);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [localMeta, setLocalMeta] = useState(voiceMeta || null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptError, setTranscriptError] = useState('');
  const [translating, setTranslating] = useState(false);
  const [speakingTranslation, setSpeakingTranslation] = useState(false);
  const audioRef = useRef(null);
  const trackRef = useRef(null);
  const seed = useMemo(() => hashSeed(messageId != null ? String(messageId) : src || ''), [messageId, src]);

  const settings = getAppSettings();
  const preferredLang = settings.voicePreferredLang || 'ru';
  const autoShowText = settings.voiceAutoShowTranscript !== false;

  useEffect(() => {
    setLocalMeta(voiceMeta || null);
  }, [voiceMeta]);

  const bars = useMemo(() => {
    const peaks = localMeta?.peaks;
    if (Array.isArray(peaks) && peaks.length > 0) {
      return peaks.map((n) => Math.min(100, Math.max(8, Number(n) || 8)));
    }
    const out = [];
    let x = seed;
    for (let i = 0; i < 36; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      out.push(22 + (x % 55));
    }
    return out;
  }, [localMeta?.peaks, seed]);

  const transcript = (localMeta?.transcript || '').trim();
  const detectedLang = localMeta?.detectedLang || 'unknown';
  const translation = localMeta?.translations?.[preferredLang] || '';
  const showTextBlock = transcript && autoShowText;
  const needsTranslate = transcript && detectedLang !== preferredLang && detectedLang !== 'unknown';

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = SPEEDS[speedIdx];
  }, [speedIdx, src]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onLoadedMetadata = () => {
      const d = el.duration;
      setDuration(typeof d === 'number' && Number.isFinite(d) && d >= 0 ? d : 0);
    };
    el.addEventListener('loadedmetadata', onLoadedMetadata);
    return () => el.removeEventListener('loadedmetadata', onLoadedMetadata);
  }, [src]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => {
      stopSpeaking();
      setSpeakingTranslation(false);
      claimVoicePlayback(el);
      setPlaying(true);
    };
    const onPause = () => {
      setPlaying(false);
      releaseVoicePlayback(el);
    };
    const onTimeUpdate = () => {
      setCurrentTime(Number.isFinite(el.currentTime) ? el.currentTime : 0);
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
      releaseVoicePlayback(el);
    };
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('ended', onEnded);
      releaseVoicePlayback(el);
    };
  }, [src]);

  useEffect(() => () => stopSpeaking(), []);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else {
      stopSpeaking();
      setSpeakingTranslation(false);
      claimVoicePlayback(el);
      playVoicePlayStart();
      el.play().catch(() => {});
    }
  };

  const handleTranscribe = async (e) => {
    e?.stopPropagation?.();
    if (!messageId || transcribing || transcript) return;
    setTranscriptError('');
    setTranscribing(true);
    try {
      const updated = await transcribeVoiceMessage(messageId);
      setLocalMeta(updated);
      onVoiceMetaUpdate?.(messageId, updated);
    } catch (err) {
      setTranscriptError(err.message || 'Не удалось расшифровать');
    } finally {
      setTranscribing(false);
    }
  };

  const handleTranslate = async (e) => {
    e.stopPropagation();
    if (!messageId || translating || !needsTranslate) return;
    setTranslating(true);
    try {
      const updated = await translateVoiceMessage(messageId, preferredLang);
      setLocalMeta(updated);
      onVoiceMetaUpdate?.(messageId, updated);
    } catch (err) {
      console.error(err);
    } finally {
      setTranslating(false);
    }
  };

  const dur = typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progress = dur > 0 ? Math.min(100, (currentTime / dur) * 100) : 0;

  const draggingRef = useRef(false);

  const seekFromClientX = useCallback((clientX) => {
    const el = audioRef.current;
    const track = trackRef.current;
    if (!el || !track || !dur) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    el.currentTime = ratio * dur;
    setCurrentTime(el.currentTime);
  }, [dur]);

  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return;
      seekFromClientX(e.clientX);
    };
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [seekFromClientX]);

  return (
    <div className={`voice-message ${isOwn ? 'voice-message-own' : ''} ${showTextBlock ? 'voice-message-with-text' : ''}${playing ? ' voice-message--playing' : ''}${entering ? ' voice-message--enter' : ''}`}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="voice-message-row">
        <button type="button" className="voice-message-play" onClick={togglePlay} aria-label={playing ? 'Пауза' : 'Слушать'}>
          <span className={`voice-message-icon ${playing ? 'voice-message-icon-pause' : 'voice-message-icon-play'}`} />
        </button>
        <div className="voice-message-body">
          <div
            ref={trackRef}
            className="voice-message-track"
            role="slider"
            tabIndex={0}
            aria-valuenow={currentTime}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              draggingRef.current = true;
              seekFromClientX(e.clientX);
            }}
          >
            <div className="voice-message-bars" aria-hidden>
              {bars.map((h, i) => {
                const barProgress = ((i + 1) / bars.length) * 100;
                const played = barProgress <= progress;
                return (
                  <span
                    key={i}
                    className={`voice-message-bar ${playing && played ? 'voice-message-bar-playing' : ''} ${played ? 'voice-message-bar-played' : ''}`}
                    style={{ height: `${Math.max(12, h)}%` }}
                  />
                );
              })}
            </div>
            <div className="voice-message-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="voice-message-meta">
            <span className="voice-message-time">{formatClock(dur || currentTime)}</span>
            <button type="button" className="voice-message-speed" onClick={(e) => { e.stopPropagation(); setSpeedIdx((i) => (i + 1) % SPEEDS.length); }}>
              {SPEEDS[speedIdx]}×
            </button>
          </div>
        </div>
        {!transcript && (
          <button
            type="button"
            className="voice-message-to-text"
            onClick={handleTranscribe}
            disabled={transcribing}
            title="Расшифровать в текст (как в Telegram)"
            aria-label="В текст"
          >
            {transcribing ? <span className="voice-message-to-text-spin" /> : 'А'}
          </button>
        )}
      </div>

      {transcribing && !transcript && (
        <p className="voice-message-transcript-status">Расшифровываем…</p>
      )}

      {transcriptError && !transcript && (
        <p className="voice-message-transcript-error">{transcriptError}</p>
      )}

      {showTextBlock && (
        <div className="voice-message-text-block">
          <p className="voice-message-transcript">{transcript}</p>
          {needsTranslate && (
            <button type="button" className="voice-message-translate-link" onClick={handleTranslate} disabled={translating}>
              {translating ? 'Перевод…' : translation ? 'Показать перевод' : `Перевести на ${preferredLang.toUpperCase()}`}
            </button>
          )}
          {translation && translation !== transcript && (
            <p className="voice-message-translation">{translation}</p>
          )}
        </div>
      )}
    </div>
  );
}
