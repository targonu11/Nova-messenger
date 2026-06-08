import { useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { updateMyActivity } from './api';
import { mergePlaybackActivities, activitiesForServer, activityTrackKey } from './activityUtils';

function isElectron() {
  return typeof window !== 'undefined' && window.electronAPI?.isElectron;
}

function syncFingerprint(activities) {
  return JSON.stringify((activities || []).map((a) => ({
    t: a.type,
    n: String(a.name || '').trim().toLowerCase(),
    pl: a.isPlaying,
  })));
}

/** Синхронизация rich presence с сервером (Electron + Media Session fallback) */
export function useActivitySync(enabled = true) {
  const { user, accessToken } = useAuth();
  const lastSyncFp = useRef('');
  const lastSentAt = useRef(0);
  const activitiesRef = useRef([]);
  const [myActivities, setMyActivities] = useState([]);

  useEffect(() => {
    if (!enabled || !user?.id || !accessToken) {
      activitiesRef.current = [];
      setMyActivities([]);
      return undefined;
    }

    let unsubElectron = null;
    let mediaPoll = null;
    let serverTick = null;

    const applyIncoming = (incoming) => {
      const now = Date.now();
      const prevList = activitiesRef.current;
      const merged = mergePlaybackActivities(prevList, incoming, now);
      activitiesRef.current = merged;
      setMyActivities(merged);

      const fp = syncFingerprint(merged);
      const playingMedia = merged.some((a) => (a.type === 'music' || a.type === 'youtube') && a.isPlaying);
      const playingGame = merged.some((a) => a.type === 'game' && a.isPlaying);
      const trackChanged = fp !== lastSyncFp.current;
      const positionBootstrapped = merged.some((a) => {
        const key = activityTrackKey(a);
        const prev = prevList.find((x) => activityTrackKey(x) === key);
        if (!prev) return (Number(a.positionMs) || 0) > 0;
        const prevPos = Number(prev.playbackBaseMs ?? prev.positionMs) || 0;
        const nextPos = Number(a.playbackBaseMs ?? a.positionMs) || 0;
        return nextPos > prevPos + 1500;
      });
      if (trackChanged || positionBootstrapped || playingGame || !playingMedia || now - lastSentAt.current >= 8000) {
        lastSyncFp.current = fp;
        lastSentAt.current = now;
        updateMyActivity(activitiesForServer(merged, now)).catch(() => {});
      }
    };

    if (isElectron() && window.electronAPI.onActivityDetected) {
      unsubElectron = window.electronAPI.onActivityDetected(applyIncoming);
    } else if (typeof navigator !== 'undefined' && navigator.mediaSession) {
      const readMediaSession = () => {
        const meta = navigator.mediaSession.metadata;
        const state = navigator.mediaSession.playbackState;
        if (!meta || state === 'none') {
          applyIncoming([]);
          return;
        }
        const title = meta.title || '';
        if (!title) {
          applyIncoming([]);
          return;
        }
        const artist = meta.artist || meta.album || '';
        const isYoutube = /youtube/i.test(title + artist + (meta.album || ''));
        applyIncoming([{
          type: isYoutube ? 'youtube' : 'music',
          name: title,
          details: artist,
          artworkUrl: meta.artwork?.[0]?.src || '',
          positionMs: 0,
          durationMs: 0,
          isPlaying: state === 'playing',
          startedAt: Math.floor(Date.now() / 1000),
        }]);
      };
      readMediaSession();
      mediaPoll = setInterval(readMediaSession, 5000);
    }

    serverTick = setInterval(() => {
      const list = activitiesRef.current;
      if (!list.length) return;
      const playingMedia = list.some((a) => (a.type === 'music' || a.type === 'youtube') && a.isPlaying);
      const playingGame = list.some((a) => a.type === 'game' && a.isPlaying);
      if (!playingMedia && !playingGame) return;
      const now = Date.now();
      if (now - lastSentAt.current < 8000) return;
      lastSentAt.current = now;
      updateMyActivity(activitiesForServer(list, now)).catch(() => {});
    }, 8000);

    return () => {
      if (unsubElectron) unsubElectron();
      if (mediaPoll) clearInterval(mediaPoll);
      if (serverTick) clearInterval(serverTick);
    };
  }, [enabled, user?.id, accessToken]);

  return myActivities;
}

export { activityTrackKey };
