import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './useAuth';
import { getStoredAudioInputId } from './MessengerSettingsModal';
import { getGroupMembers } from './api';
import { t } from './i18n';
import { isMediaCallSupportedInThisPage } from './secureMedia';
import ScreenPickerDialog from './ScreenPickerDialog';
import {
  startIncomingRing,
  startOutgoingRing,
  stopCallRing,
  playCallConnected,
  playCallEnded,
  playCallRejected,
  playCallMicToggle,
} from './useCallSounds';

const CallContext = createContext(null);
const defaultConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const AUDIO_PROCESSING = {
  noiseSuppression: false,
  echoCancellation: true,
  autoGainControl: true,
};

/** Ограничения для микрофона со шумоподавлением (звонки и голосовые). */
export function getAudioConstraintsForMic(omitDeviceId = false) {
  const id = omitDeviceId ? null : getStoredAudioInputId();
  return { ...AUDIO_PROCESSING, ...(id ? { deviceId: { ideal: id } } : {}) };
}

function getMediaConstraints(omitDeviceId = false) {
  return { audio: getAudioConstraintsForMic(omitDeviceId), video: false };
}

/** Получить поток камеры/микрофона; при "device not found" повторяет без выбора устройства. */
async function getUserMediaForCall() {
  const isDeviceError = (e) =>
    e?.name === 'NotFoundError' ||
    e?.name === 'OverconstrainedError' ||
    (e?.message && /device|not found|not available/i.test(e.message));
  try {
    return await navigator.mediaDevices.getUserMedia(getMediaConstraints(false));
  } catch (e) {
    if (isDeviceError(e)) {
      return await navigator.mediaDevices.getUserMedia(getMediaConstraints(true));
    }
    throw e;
  }
}

function serializeIce(c) {
  if (!c) return null;
  return {
    candidate: c.candidate || '',
    sdpMid: c.sdpMid ?? '',
    sdpMLineIndex: c.sdpMLineIndex ?? 0,
  };
}

function serializeSdp(desc) {
  if (!desc) return null;
  return { type: desc.type, sdp: desc.sdp || '' };
}

export function CallProvider({ children }) {
  const { user: currentUser } = useAuth();
  const { socket, connected } = useSocket();
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callError, setCallError] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareAudioEnabled, setScreenShareAudioEnabled] = useState(false);
  const [mutedRemoteForMe, setMutedRemoteForMe] = useState({});
  const [remoteVolumeForMe, setRemoteVolumeForMe] = useState({});
  const [isGroupAdmin, setIsGroupAdmin] = useState(false);
  const [mutedByAdmin, setMutedByAdmin] = useState(false);
  const [adminMutedPeerIds, setAdminMutedPeerIds] = useState({});
  const [activeGroupCallIds, setActiveGroupCallIds] = useState({});
  const [screenShareError, setScreenShareError] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showEndCallDialog, setShowEndCallDialog] = useState(false);
  const [showScreenPicker, setShowScreenPicker] = useState(false);
  const [pendingScreenShare, setPendingScreenShare] = useState(null);
  const adminMutedPeerIdsRef = useRef(adminMutedPeerIds);
  const pcRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const outgoingCandidatesRef = useRef([]);
  const screenStreamRef = useRef(null);
  const ringTimeoutRef = useRef(null);
  const activeCallRef = useRef(activeCall);
  const hadRemoteStreamRef = useRef(false);

  adminMutedPeerIdsRef.current = adminMutedPeerIds;
  activeCallRef.current = activeCall;

  useEffect(() => {
    if (incomingCall && !activeCall) {
      startIncomingRing();
    } else if (!incomingCall && !activeCall) {
      stopCallRing();
    }
  }, [incomingCall, activeCall]);

  useEffect(() => {
    if (remoteStream && activeCall) {
      if (!hadRemoteStreamRef.current) {
        stopCallRing();
        playCallConnected();
      }
      hadRemoteStreamRef.current = true;
    } else {
      hadRemoteStreamRef.current = false;
    }
  }, [remoteStream, activeCall]);

  useEffect(() => () => stopCallRing(), []);

  const clearRingTimeout = useCallback(() => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  }, []);

  const closePc = useCallback(() => {
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    pendingCandidatesRef.current = [];
  }, []);

  const stopStream = useCallback((stream) => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }, []);

  const endCallForAll = useCallback(() => {
    if (socket && activeCall && activeCall.isGroup && activeCall.groupId) {
      socket.emit('call:end_for_all', { groupId: activeCall.groupId });
    }
    const durationSec = activeCall?.startedAt ? (Date.now() - activeCall.startedAt) / 1000 : 0;
    const recipientType = activeCall?.isGroup ? 'group' : 'user';
    const recipientId = activeCall?.isGroup ? activeCall.groupId : activeCall?.remoteUserId;
    if (recipientId) {
      socket?.emit('call_ended', { recipientType, recipientId, durationSec: Math.floor(durationSec) });
    }
    closePc();
    stopStream(localStream);
    stopStream(screenStreamRef.current);
    screenStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setActiveCall(null);
    setIncomingCall(null);
    setCallError(null);
    setIsMuted(false);
    setIsScreenSharing(false);
    setMutedRemoteForMe({});
    setRemoteVolumeForMe({});
    setMutedByAdmin(false);
    setAdminMutedPeerIds({});
    setScreenShareError(null);
    setIsMinimized(false);
    setShowEndCallDialog(false);
    clearRingTimeout();
    stopCallRing();
    playCallEnded();
  }, [socket, activeCall, localStream, closePc, stopStream, clearRingTimeout]);

  const hangup = useCallback((options) => {
    const fromRemote = options?.fromRemote === true;
    const endForAll = options?.endForAll === true;
    
    // Если администратор группы выходит из группового звонка, показываем диалог
    if (!fromRemote && activeCall?.isGroup && activeCall?.groupId && isGroupAdmin && !endForAll) {
      setShowEndCallDialog(true);
      return;
    }

    if (socket && activeCall) {
      if (!fromRemote) {
        if (activeCall.isGroup && activeCall.groupId) {
          if (endForAll) {
            socket.emit('call:end_for_all', { groupId: activeCall.groupId });
          } else {
            socket.emit('call:hangup', { groupId: activeCall.groupId });
          }
        }
        if (activeCall.remoteUserId) {
          socket.emit('call:hangup', { to: activeCall.remoteUserId });
        }
        const durationSec = activeCall.startedAt ? (Date.now() - activeCall.startedAt) / 1000 : 0;
        const recipientType = activeCall.isGroup ? 'group' : 'user';
        const recipientId = activeCall.isGroup ? activeCall.groupId : activeCall.remoteUserId;
        if (recipientId) {
          socket.emit('call_ended', { recipientType, recipientId, durationSec: Math.floor(durationSec) });
        }
      }
    }
    closePc();
    stopStream(localStream);
    stopStream(screenStreamRef.current);
    screenStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setActiveCall(null);
    setIncomingCall(null);
    setCallError(null);
    setIsMuted(false);
    setIsScreenSharing(false);
    setMutedRemoteForMe({});
    setRemoteVolumeForMe({});
    setIsGroupAdmin(false);
    setMutedByAdmin(false);
    setAdminMutedPeerIds({});
    setScreenShareError(null);
    setIsMinimized(false);
    setShowEndCallDialog(false);
    clearRingTimeout();
    stopCallRing();
    if (activeCall || incomingCall) playCallEnded();
  }, [socket, activeCall, incomingCall, localStream, closePc, stopStream, isGroupAdmin, clearRingTimeout]);

  const startConnectTimeout = useCallback(({ remoteUserId = null, groupId = null } = {}) => {
    clearRingTimeout();
    ringTimeoutRef.current = setTimeout(() => {
      // Если за 30 секунд звонок не установился (нет нормального завершения)
      // и это всё ещё тот же самый звонок, который ставил таймер — сбрасываем у обоих
      const cur = activeCallRef.current;
      if (!cur) return; // уже завершён вручную
      const sameRemote = (cur.remoteUserId || null) === remoteUserId;
      const sameGroup = (cur.groupId || null) === groupId;
      if (!sameRemote || !sameGroup) return; // уже другой звонок
      hangup();
    }, 30000);
  }, [clearRingTimeout, hangup]);

  useEffect(() => {
    if (!socket) return;
    const handleIncoming = ({ from, offer, isGroup, groupId }) => {
      const offerDesc = offer && (offer.type && typeof offer.sdp === 'string') ? offer : null;
      if (offerDesc) setIncomingCall({ from, offer: offerDesc, isGroup, groupId });
    };
    const handleAnswer = async ({ from, answer, groupId: answerGroupId }) => {
      if (!pcRef.current) return;
      // Для групповых звонков принимаем answer от любого участника группы
      if (answerGroupId && activeCall?.groupId) {
        if (activeCall.groupId !== answerGroupId) return;
      } else if (activeCall?.remoteUserId && activeCall.remoteUserId !== from) {
        // Для одиночных звонков проверяем, что это наш собеседник
        return;
      }
      try {
        const answerDesc = answer && (answer.type && answer.sdp) ? answer : { type: 'answer', sdp: '' };
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answerDesc));
        pendingCandidatesRef.current.forEach((c) => pcRef.current?.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
        pendingCandidatesRef.current = [];
        if (answerGroupId && activeCall?.groupId) {
          // Для групповых звонков отправляем ICE кандидаты через группу
          outgoingCandidatesRef.current.forEach((c) => socket.emit('call:ice', { groupId: answerGroupId, candidate: typeof c.candidate === 'string' ? c : serializeIce(c) }));
        } else {
          // Для одиночных звонков отправляем конкретному пользователю
          setActiveCall((prev) => (prev ? { ...prev, remoteUserId: from } : { remoteUserId: from, isGroup: false, startedAt: Date.now() }));
          outgoingCandidatesRef.current.forEach((c) => socket.emit('call:ice', { to: from, candidate: typeof c.candidate === 'string' ? c : serializeIce(c) }));
        }
        outgoingCandidatesRef.current = [];
      } catch (e) { console.error(e); }
    };
    const handleIce = ({ from, candidate, groupId: iceGroupId }) => {
      if (!candidate || !candidate.candidate) return;
      const pc = pcRef.current;
      // Для групповых звонков принимаем ICE кандидаты от любого участника группы
      if (pc && activeCall?.isGroup && iceGroupId && activeCall?.groupId === iceGroupId) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
      } else if (pc && activeCall?.remoteUserId === from) {
        // Для одиночных звонков проверяем, что это наш собеседник
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
      } else if (incomingCall?.from === from) {
        // Сохраняем кандидаты для входящего звонка
        pendingCandidatesRef.current.push(candidate);
      }
    };
    const handleRemoteHangup = ({ from }) => {
      if (activeCall?.remoteUserId === from || incomingCall?.from === from) hangup({ fromRemote: true });
    };
    const handleInboundDismiss = ({ from, groupId }) => {
      setIncomingCall((prev) => {
        if (!prev) return prev;
        if (groupId != null && prev.isGroup && prev.groupId === groupId) return null;
        if (from != null && !prev.isGroup && prev.from === from) return null;
        return prev;
      });
      setCallError(null);
    };
    const handleRenegotiate = async ({ from, offer, groupId: renegotiateGroupId }) => {
      const pc = pcRef.current;
      if (!pc) return;
      // Для одиночных звонков проверяем, что from совпадает с remoteUserId
      if (activeCall?.isGroup && renegotiateGroupId) {
        // Для групповых звонков принимаем renegotiate от любого участника группы
        if (activeCall?.groupId !== renegotiateGroupId) return;
      } else if (activeCall?.remoteUserId !== from) {
        // Для одиночных звонков проверяем, что это наш собеседник
        return;
      }
      try {
        console.log('Handling renegotiate from:', from, 'groupId:', renegotiateGroupId, 'offer type:', offer?.type);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true, // Принимаем video от других участников
        });
        await pc.setLocalDescription(answer);
        console.log('Renegotiate answer created, sending back...');
        if (renegotiateGroupId) {
          socket.emit('call:renegotiate-answer', { groupId: renegotiateGroupId, answer: serializeSdp(answer) });
        } else {
          socket.emit('call:renegotiate-answer', { to: from, answer: serializeSdp(answer) });
        }
      } catch (e) {
        console.error('Renegotiate error:', e);
      }
    };
    const handleRenegotiateAnswer = async ({ from, answer, groupId: renegotiateGroupId }) => {
      const pc = pcRef.current;
      if (!pc) return;
      // Для одиночных звонков проверяем, что from совпадает с remoteUserId
      if (activeCall?.isGroup && renegotiateGroupId) {
        // Для групповых звонков принимаем answer от любого участника группы
        if (activeCall?.groupId !== renegotiateGroupId) return;
      } else if (activeCall?.remoteUserId !== from) {
        // Для одиночных звонков проверяем, что это наш собеседник
        return;
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (e) {
        console.error('Renegotiate answer error:', e);
      }
    };
    const handleYouAreMuted = () => {
      if (localStream) localStream.getAudioTracks().forEach((t) => { t.enabled = false; });
      setIsMuted(true);
      setMutedByAdmin(true);
    };
    const handleYouAreUnmuted = () => {
      setMutedByAdmin(false);
    };
    socket.on('call:incoming', handleIncoming);
    socket.on('call:answer', handleAnswer);
    socket.on('call:ice', handleIce);
    socket.on('call:hangup', handleRemoteHangup);
    socket.on('call:inbound_dismiss', handleInboundDismiss);
    socket.on('call:renegotiate', handleRenegotiate);
    socket.on('call:renegotiate-answer', handleRenegotiateAnswer);
    socket.on('call:you_are_muted', handleYouAreMuted);
    socket.on('call:you_are_unmuted', handleYouAreUnmuted);
    // Групповой звонок без remoteUserId: deps должны включать groupId/isGroup, иначе ICE видит устаревший activeCall
    return () => {
      socket.off('call:incoming', handleIncoming);
      socket.off('call:answer', handleAnswer);
      socket.off('call:ice', handleIce);
      socket.off('call:hangup', handleRemoteHangup);
      socket.off('call:inbound_dismiss', handleInboundDismiss);
      socket.off('call:renegotiate', handleRenegotiate);
      socket.off('call:renegotiate-answer', handleRenegotiateAnswer);
      socket.off('call:you_are_muted', handleYouAreMuted);
      socket.off('call:you_are_unmuted', handleYouAreUnmuted);
    };
  }, [socket, activeCall?.remoteUserId, activeCall?.groupId, activeCall?.isGroup, incomingCall?.from, incomingCall?.groupId, incomingCall?.isGroup, hangup, localStream]);

  useEffect(() => {
    if (!socket) return;
    const onStarted = ({ groupId }) => {
      if (groupId) setActiveGroupCallIds((prev) => ({ ...prev, [groupId]: true }));
    };
    const onEnded = ({ groupId }) => {
      if (groupId) setActiveGroupCallIds((prev) => { const next = { ...prev }; delete next[groupId]; return next; });
    };
    const onActiveList = ({ groupIds }) => {
      const obj = {};
      (groupIds || []).forEach((gid) => { obj[gid] = true; });
      setActiveGroupCallIds((prev) => ({ ...prev, ...obj }));
    };
    socket.on('call:group_call_started', onStarted);
    socket.on('call:group_call_ended', onEnded);
    socket.on('call:active_group_calls', onActiveList);
    if (connected) socket.emit('call:get_active_group_calls');
    return () => {
      socket.off('call:group_call_started', onStarted);
      socket.off('call:group_call_ended', onEnded);
      socket.off('call:active_group_calls', onActiveList);
    };
  }, [socket, connected]);

  useEffect(() => {
    if (!activeCall?.groupId || !currentUser?.id) {
      setIsGroupAdmin(false);
      return;
    }
    let cancelled = false;
    getGroupMembers(activeCall.groupId)
      .then((members) => {
        if (cancelled) return;
        const me = members.find((m) => m.id === currentUser.id);
        setIsGroupAdmin(me?.role === 'admin');
      })
      .catch(() => { if (!cancelled) setIsGroupAdmin(false); });
    return () => { cancelled = true; };
  }, [activeCall?.groupId, currentUser?.id]);

  const toggleMutedRemoteForMe = useCallback((userId) => {
    setMutedRemoteForMe((prev) => ({ ...prev, [userId]: !prev[userId] }));
  }, []);

  const setRemoteVolume = useCallback((userId, volume) => {
    const v = Math.max(0, Math.min(1, Number(volume)));
    setRemoteVolumeForMe((prev) => ({ ...prev, [userId]: v }));
  }, []);

  const muteParticipantForAll = useCallback((userId) => {
    if (!socket || !userId) return;
    const groupId = activeCall?.isGroup ? activeCall.groupId : undefined;
    const isAlreadyMutedByAdmin = !!adminMutedPeerIdsRef.current[userId];
    if (isAlreadyMutedByAdmin) {
      socket.emit('call:unmute_participant', { to: userId, groupId });
      setAdminMutedPeerIds((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } else {
      socket.emit('call:mute_participant', { to: userId, groupId });
      setAdminMutedPeerIds((prev) => ({ ...prev, [userId]: true }));
    }
  }, [socket, activeCall?.isGroup, activeCall?.groupId]);

  const startCall = useCallback(async (peerId) => {
    if (!peerId) {
      setCallError(t('callErrNoPeer'));
      return;
    }
    if (!isMediaCallSupportedInThisPage()) {
      setCallError(t('callErrInsecureContext'));
      return;
    }
    if (!socket || !connected) {
      setCallError(t('callErrNoConnection'));
      return;
    }
    if (activeCall || incomingCall) {
      setCallError(t('callErrFinishCurrent'));
      return;
    }
    setCallError(null);
    try {
      const stream = await getUserMediaForCall();
      setLocalStream(stream);
      const pc = new RTCPeerConnection(defaultConfig);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.ontrack = (e) => {
        console.log('Received track:', e.track.kind, 'from stream:', e.streams[0]?.id);
        clearRingTimeout();
        // Используем текущий activeCall из состояния через замыкание
        setRemoteStream((prev) => {
          // Для групповых звонков объединяем все tracks в один stream
          const currentCall = activeCall;
          if (currentCall?.isGroup) {
            if (!prev) {
              const newStream = new MediaStream();
              e.streams[0]?.getTracks().forEach(track => newStream.addTrack(track));
              return newStream;
            }
            // Добавляем новые tracks в существующий stream
            e.streams[0]?.getTracks().forEach(track => {
              if (!prev.getTracks().some(t => t.id === track.id)) {
                prev.addTrack(track);
              }
            });
            return new MediaStream(prev.getTracks());
          } else {
            // Для одиночных звонков просто заменяем stream
            return e.streams[0] || null;
          }
        });
      };
      pc.onicecandidate = (e) => { if (e.candidate && connected) socket.emit('call:ice', { to: peerId, candidate: serializeIce(e.candidate) }); };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('call:offer', { to: peerId, offer: serializeSdp(offer), isGroup: false });
      setActiveCall({ remoteUserId: peerId, isGroup: false, startedAt: Date.now() });
      startConnectTimeout({ remoteUserId: peerId });
      startOutgoingRing();
    } catch (e) {
      console.error(e);
      setCallError(e.message || t('callErrNoMedia'));
      hangup();
    }
  }, [socket, connected, activeCall, incomingCall, hangup, clearRingTimeout, startConnectTimeout]);

  const startGroupCall = useCallback(async (groupId) => {
    if (!groupId) {
      setCallError(t('callErrGroupNotSelected'));
      return;
    }
    if (!isMediaCallSupportedInThisPage()) {
      setCallError(t('callErrInsecureContext'));
      return;
    }
    if (!socket || !connected) {
      setCallError(t('callErrNoConnection'));
      return;
    }
    if (activeCall || incomingCall) {
      setCallError(t('callErrFinishCurrent'));
      return;
    }
    setCallError(null);
    try {
      outgoingCandidatesRef.current = [];
      const stream = await getUserMediaForCall();
      setLocalStream(stream);
      const pc = new RTCPeerConnection(defaultConfig);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.ontrack = (e) => {
        console.log('Received track:', e.track.kind, 'from stream:', e.streams[0]?.id);
        clearRingTimeout();
        // Используем текущий activeCall из состояния через замыкание
        setRemoteStream((prev) => {
          // Для групповых звонков объединяем все tracks в один stream
          const currentCall = activeCall;
          if (currentCall?.isGroup) {
            if (!prev) {
              const newStream = new MediaStream();
              e.streams[0]?.getTracks().forEach(track => newStream.addTrack(track));
              return newStream;
            }
            // Добавляем новые tracks в существующий stream
            e.streams[0]?.getTracks().forEach(track => {
              if (!prev.getTracks().some(t => t.id === track.id)) {
                prev.addTrack(track);
              }
            });
            return new MediaStream(prev.getTracks());
          } else {
            // Для одиночных звонков просто заменяем stream
            return e.streams[0] || null;
          }
        });
      };
      pc.onicecandidate = (e) => { 
        if (e.candidate) {
          if (groupId) {
            // Для групповых звонков отправляем ICE кандидаты через группу
            socket.emit('call:ice', { groupId, candidate: serializeIce(e.candidate) });
          } else {
            // Для одиночных звонков сохраняем кандидаты для отправки после answer
            outgoingCandidatesRef.current.push(serializeIce(e.candidate));
          }
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('call:offer', { offer: serializeSdp(offer), isGroup: true, groupId });
      setActiveCall({ groupId, isGroup: true, startedAt: Date.now() });
      startConnectTimeout({ groupId });
      startOutgoingRing();
    } catch (e) {
      console.error(e);
      setCallError(e.message || t('callErrNoMedia'));
      hangup();
    }
  }, [socket, connected, activeCall, incomingCall, hangup, clearRingTimeout, startConnectTimeout]);

  const answerCall = useCallback(async () => {
    const inc = incomingCall;
    if (!inc || !socket || !inc.offer) return;
    if (!isMediaCallSupportedInThisPage()) {
      setCallError(t('callErrInsecureContext'));
      return;
    }
    stopCallRing();
    setIncomingCall(null);
    setCallError(null);
    try {
      const stream = await getUserMediaForCall();
      setLocalStream(stream);
      const pc = new RTCPeerConnection(defaultConfig);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.ontrack = (e) => {
        console.log('Received track:', e.track.kind, 'from stream:', e.streams[0]?.id);
        clearRingTimeout();
        // Используем текущий activeCall из состояния через замыкание
        setRemoteStream((prev) => {
          // Для групповых звонков объединяем все tracks в один stream
          const currentCall = activeCall;
          if (currentCall?.isGroup) {
            if (!prev) {
              const newStream = new MediaStream();
              e.streams[0]?.getTracks().forEach(track => newStream.addTrack(track));
              return newStream;
            }
            // Добавляем новые tracks в существующий stream
            e.streams[0]?.getTracks().forEach(track => {
              if (!prev.getTracks().some(t => t.id === track.id)) {
                prev.addTrack(track);
              }
            });
            return new MediaStream(prev.getTracks());
          } else {
            // Для одиночных звонков просто заменяем stream
            return e.streams[0] || null;
          }
        });
      };
      if (inc.isGroup && inc.groupId) {
        // Для групповых звонков отправляем ICE кандидаты через группу
        pc.onicecandidate = (e) => { 
          if (e.candidate) socket.emit('call:ice', { groupId: inc.groupId, candidate: serializeIce(e.candidate) }); 
        };
      } else {
        // Для одиночных звонков отправляем конкретному пользователю
        pc.onicecandidate = (e) => { 
          if (e.candidate) socket.emit('call:ice', { to: inc.from, candidate: serializeIce(e.candidate) }); 
        };
      }
      await pc.setRemoteDescription(new RTCSessionDescription(inc.offer));
      pendingCandidatesRef.current.forEach((c) => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
      pendingCandidatesRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (inc.isGroup && inc.groupId) {
        socket.emit('call:answer', { groupId: inc.groupId, answer: serializeSdp(answer) });
        setActiveCall({ groupId: inc.groupId, isGroup: true, startedAt: Date.now() });
      } else {
        socket.emit('call:answer', { to: inc.from, answer: serializeSdp(answer) });
        setActiveCall({ remoteUserId: inc.from, isGroup: false, startedAt: Date.now() });
      }
      if (inc.isGroup && inc.groupId) {
        startConnectTimeout({ groupId: inc.groupId });
      } else {
        startConnectTimeout({ remoteUserId: inc.from });
      }
    } catch (e) {
      console.error(e);
      setCallError(e.message || t('callErrNoMediaShort'));
      hangup();
    }
  }, [incomingCall, socket, hangup, clearRingTimeout, startConnectTimeout]);

  const rejectCall = useCallback(() => {
    stopCallRing();
    playCallRejected();
    if (incomingCall && socket) {
      if (incomingCall.isGroup && incomingCall.groupId) {
        socket.emit('call:reject_incoming', { groupId: incomingCall.groupId });
      } else if (!incomingCall.isGroup && incomingCall.from) {
        socket.emit('call:reject_incoming', { to: incomingCall.from });
      }
    }
    setIncomingCall(null);
    setCallError(null);
  }, [incomingCall, socket]);

  const toggleMute = useCallback(() => {
    if (!localStream) return;
    if (mutedByAdmin) {
      return;
    }
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length) {
      const next = !audioTracks[0].enabled;
      audioTracks.forEach((t) => { t.enabled = next; });
      setIsMuted(!next);
      playCallMicToggle(!next);
    }
  }, [localStream, mutedByAdmin]);

  const stopScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    const peerId = activeCall?.remoteUserId;
    const groupId = activeCall?.groupId;
    const screenStream = screenStreamRef.current;
    if (!pc || !socket || !activeCall) return;
    
    // Останавливаем screen share track
    if (screenStream) {
      screenStream.getTracks().forEach((t) => {
        t.stop();
        if (localStream) {
          localStream.removeTrack(t);
        }
      });
      screenStreamRef.current = null;
    }
    
    // Удаляем video track из PeerConnection
    const videoSenders = pc.getSenders().filter(s => s.track && s.track.kind === 'video');
    for (const sender of videoSenders) {
      await sender.replaceTrack(null).catch(console.error);
    }
    
    // Удаляем audio track от screen sharing из PeerConnection
    const micAudioSenders = pc.getSenders().filter(s => 
      s.track && 
      s.track.kind === 'audio' && 
      (s.track.label.includes('microphone') || s.track.label.includes('default') || s.track.label.includes('Mic'))
    );
    const screenAudioSenders = pc.getSenders().filter(s => 
      s.track && 
      s.track.kind === 'audio' && 
      !micAudioSenders.includes(s)
    );
    for (const sender of screenAudioSenders) {
      await sender.replaceTrack(null).catch(console.error);
    }
    
    // Обновляем localStream - удаляем video и screen audio tracks
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      videoTracks.forEach(track => {
        localStream.removeTrack(track);
        track.stop();
      });
      const screenAudioTracks = localStream.getAudioTracks().filter(t => 
        !t.label.includes('microphone') && !t.label.includes('default') && !t.label.includes('Mic')
      );
      screenAudioTracks.forEach(track => {
        localStream.removeTrack(track);
        track.stop();
      });
      // Обновляем состояние для React компонентов
      setLocalStream(new MediaStream(localStream.getTracks()));
    }
    
    setIsScreenSharing(false);
    setScreenShareAudioEnabled(false);
    setScreenShareError(null);
    
    // Отправляем renegotiation для удаления video track
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (peerId) {
        socket.emit('call:renegotiate', { to: peerId, offer: serializeSdp(offer) });
      } else if (groupId) {
        socket.emit('call:renegotiate', { groupId, offer: serializeSdp(offer) });
      }
    } catch (err) {
      console.error('Failed to renegotiate after stopping screen share:', err);
    }
  }, [activeCall, localStream, socket]);

  const startScreenShareWithSource = useCallback(async (sourceId, includeAudio = false) => {
    const pc = pcRef.current;
    if (!pc || !socket || !activeCall || !sourceId) return;
    
    const peerId = activeCall.remoteUserId;
    const groupId = activeCall.groupId;
    
    try {
      setScreenShareError(null);
      let screenStream = null;
      
      // В Electron используем getUserMedia с desktop source
      if (window.electronAPI && window.electronAPI.isElectron) {
        screenStream = await navigator.mediaDevices.getUserMedia({
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
            }
          },
          audio: includeAudio ? {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
            }
          } : false
        });
      } else {
        // В браузере используем стандартный getDisplayMedia
        screenStream = await navigator.mediaDevices.getDisplayMedia({ 
          video: true,
          audio: includeAudio 
        });
      }
      
      screenStreamRef.current = screenStream;
      const videoTrack = screenStream.getVideoTracks()[0];
      if (!videoTrack) throw new Error('No video track');
      videoTrack.onended = () => stopScreenShare();
      
      const audioTrack = includeAudio ? screenStream.getAudioTracks()[0] : null;
      setScreenShareAudioEnabled(!!audioTrack);
      
      // Находим существующий video sender или создаем новый
      const videoSenders = pc.getSenders().filter(s => s.track && s.track.kind === 'video');
      const existingVideoSender = videoSenders.length > 0 ? videoSenders[0] : null;
      
      if (existingVideoSender) {
        // Заменяем существующий video track на screen share
        await existingVideoSender.replaceTrack(videoTrack);
      } else {
        // Добавляем новый video track
        pc.addTrack(videoTrack, localStream || screenStream);
      }
      
      // Обрабатываем аудио трек от screen sharing
      if (audioTrack) {
        // Находим существующий audio sender от screen sharing или добавляем новый
        // Ищем audio sender, который не является микрофоном (микрофон обычно имеет label с "microphone" или "default")
        const micAudioSenders = pc.getSenders().filter(s => 
          s.track && 
          s.track.kind === 'audio' && 
          (s.track.label.includes('microphone') || s.track.label.includes('default') || s.track.label.includes('Mic'))
        );
        const screenAudioSenders = pc.getSenders().filter(s => 
          s.track && 
          s.track.kind === 'audio' && 
          !micAudioSenders.includes(s)
        );
        
        if (screenAudioSenders.length > 0) {
          // Заменяем существующий audio track от screen sharing
          await screenAudioSenders[0].replaceTrack(audioTrack);
        } else {
          // Добавляем новый audio track от screen sharing
          pc.addTrack(audioTrack, screenStream);
        }
      }
      
      // Обновляем localStream для отображения screen share в UI
      if (localStream) {
        // Удаляем старый video track если есть
        const oldVideoTracks = localStream.getVideoTracks();
        oldVideoTracks.forEach(track => {
          if (track !== videoTrack) {
            localStream.removeTrack(track);
            track.stop();
          }
        });
        // Добавляем новый video track
        if (!localStream.getVideoTracks().includes(videoTrack)) {
          localStream.addTrack(videoTrack);
        }
        // Добавляем или удаляем audio track от screen sharing
        const micAudioTracks = localStream.getAudioTracks().filter(t => 
          t.label.includes('microphone') || t.label.includes('default') || t.label.includes('Mic')
        );
        const oldScreenAudioTracks = localStream.getAudioTracks().filter(t => 
          !micAudioTracks.includes(t)
        );
        oldScreenAudioTracks.forEach(track => {
          localStream.removeTrack(track);
          track.stop();
        });
        if (audioTrack && !localStream.getAudioTracks().includes(audioTrack)) {
          localStream.addTrack(audioTrack);
        }
        // Обновляем состояние для React компонентов
        setLocalStream(new MediaStream(localStream.getTracks()));
      } else {
        // Если localStream еще не создан, создаем новый с screen share
        const tracks = [videoTrack];
        if (audioTrack) tracks.push(audioTrack);
        const newStream = new MediaStream(tracks);
        setLocalStream(newStream);
      }
      
      // Создаем offer с video constraints для screen sharing
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false, // Мы отправляем видео, не получаем
      });
      await pc.setLocalDescription(offer);
      
      console.log('Screen share offer created, sending renegotiation...', { peerId, groupId, hasVideoTrack: !!videoTrack });
      if (peerId) {
        socket.emit('call:renegotiate', { to: peerId, offer: serializeSdp(offer) });
      } else if (groupId) {
        socket.emit('call:renegotiate', { groupId, offer: serializeSdp(offer) });
      }
      setIsScreenSharing(true);
      setShowScreenPicker(false);
    } catch (e) {
      console.error('Screen share error:', e);
      const errorMsg = e?.message || e?.name || '';
      if (errorMsg.includes('NotAllowedError') || errorMsg.includes('Permission denied') || errorMsg.includes('permission')) {
        setScreenShareError(t('screenSharePermissionDenied'));
      } else if (errorMsg.includes('NotReadableError') || errorMsg.includes('Not available') || errorMsg.includes('not available')) {
        setScreenShareError(t('screenShareNotAvailable'));
      } else {
        setScreenShareError(t('screenShareFailed'));
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setShowScreenPicker(false);
    }
  }, [activeCall, localStream, socket, stopScreenShare]);

  const startScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !socket || !activeCall) {
      setScreenShareError(t('screenShareNeedPeer'));
      return;
    }
    const peerId = activeCall.remoteUserId;
    const groupId = activeCall.groupId;
    // Проверяем, что есть либо peerId (для одиночных звонков), либо groupId (для групповых)
    if (!peerId && !groupId) {
      setScreenShareError(t('screenShareNeedPeer'));
      return;
    }
    
    // В Electron показываем кастомный диалог выбора экрана
    if (window.electronAPI && window.electronAPI.isElectron && window.electronAPI.getScreenSources) {
      setShowScreenPicker(true);
      return;
    }
    
    // В браузере используем стандартный getDisplayMedia
    try {
      setScreenShareError(null);
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
        video: true,
        audio: false 
      });
      screenStreamRef.current = screenStream;
      const videoTrack = screenStream.getVideoTracks()[0];
      if (!videoTrack) throw new Error('No video track');
      videoTrack.onended = () => stopScreenShare();
      if (localStream) localStream.addTrack(videoTrack);
      pc.addTrack(videoTrack, localStream || screenStream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (peerId) {
        socket.emit('call:renegotiate', { to: peerId, offer: serializeSdp(offer) });
      } else if (groupId) {
        // Для групповых звонков отправляем всем участникам
        socket.emit('call:renegotiate', { groupId, offer: serializeSdp(offer) });
      }
      setIsScreenSharing(true);
    } catch (e) {
      console.error('Screen share error:', e);
      const errorMsg = e?.message || e?.name || '';
      if (errorMsg.includes('NotAllowedError') || errorMsg.includes('Permission denied') || errorMsg.includes('permission')) {
        setScreenShareError(t('screenSharePermissionDenied'));
      } else if (errorMsg.includes('NotReadableError') || errorMsg.includes('Not available') || errorMsg.includes('not available')) {
        setScreenShareError(t('screenShareNotAvailable'));
      } else {
        setScreenShareError(t('screenShareFailed'));
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
    }
  }, [activeCall, localStream, socket, stopScreenShare]);

  const toggleScreenShareAudio = useCallback(async () => {
    const pc = pcRef.current;
    const screenStream = screenStreamRef.current;
    if (!pc || !screenStream || !isScreenSharing) return;
    
    const audioTracks = screenStream.getAudioTracks();
    const currentAudioEnabled = audioTracks.length > 0 && audioTracks[0].enabled;
    
    if (currentAudioEnabled && audioTracks.length > 0) {
      // Выключаем звук - отключаем трек
      audioTracks.forEach(track => {
        track.enabled = false;
      });
      // Удаляем audio track из PeerConnection
      const micAudioSenders = pc.getSenders().filter(s => 
        s.track && 
        s.track.kind === 'audio' && 
        (s.track.label.includes('microphone') || s.track.label.includes('default') || s.track.label.includes('Mic'))
      );
      const screenAudioSenders = pc.getSenders().filter(s => 
        s.track && 
        s.track.kind === 'audio' && 
        !micAudioSenders.includes(s)
      );
      for (const sender of screenAudioSenders) {
        await sender.replaceTrack(null).catch(console.error);
      }
      // Удаляем из localStream
      if (localStream) {
        const screenAudioTracks = localStream.getAudioTracks().filter(t => 
          !t.label.includes('microphone') && !t.label.includes('default') && !t.label.includes('Mic')
        );
        screenAudioTracks.forEach(track => {
          localStream.removeTrack(track);
        });
        setLocalStream(new MediaStream(localStream.getTracks()));
      }
      setScreenShareAudioEnabled(false);
      
      // Отправляем renegotiation
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const peerId = activeCall?.remoteUserId;
        const groupId = activeCall?.groupId;
        if (peerId) {
          socket.emit('call:renegotiate', { to: peerId, offer: serializeSdp(offer) });
        } else if (groupId) {
          socket.emit('call:renegotiate', { groupId, offer: serializeSdp(offer) });
        }
      } catch (err) {
        console.error('Failed to renegotiate after toggling screen share audio:', err);
      }
    } else {
      // Включаем звук - нужно перезапустить screen sharing с аудио
      // Это требует повторного вызова getDisplayMedia/getUserMedia
      setScreenShareError(t('screenShareAudioRestart') || 'Перезапустите демонстрацию экрана с включенным звуком');
    }
  }, [isScreenSharing, localStream, socket, activeCall, t]);

  const minimizeCall = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const maximizeCall = useCallback(() => {
    setIsMinimized(false);
  }, []);

  return (
    <>
      <CallContext.Provider value={{ incomingCall, activeCall, localStream, remoteStream, callError, startCall, startGroupCall, answerCall, rejectCall, hangup, endCallForAll, isMuted, toggleMute, isScreenSharing, startScreenShare, stopScreenShare, screenShareAudioEnabled, toggleScreenShareAudio, mutedRemoteForMe, toggleMutedRemoteForMe, remoteVolumeForMe, setRemoteVolume, muteParticipantForAll, isGroupAdmin, mutedByAdmin, adminMutedPeerIds, activeGroupCallIds, screenShareError, isMinimized, minimizeCall, maximizeCall, showEndCallDialog, setShowEndCallDialog }}>
        {children}
      </CallContext.Provider>
      {showScreenPicker && (
        <ScreenPickerDialog
          onSelect={(sourceId) => startScreenShareWithSource(sourceId)}
          onCancel={() => setShowScreenPicker(false)}
        />
      )}
    </>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside CallProvider');
  return ctx;
}
