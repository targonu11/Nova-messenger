import React, { useRef, useEffect, useState } from 'react';
import { useCall } from './useCall';
import { useAuth } from './useAuth';
import { getStoredAudioOutputId } from './MessengerSettingsModal';
import { avatarUrl, getUsers, getGroups } from './api';
import { getStoredContactNames } from './SettingsModal';
import { t } from './i18n';
import { useAudioLevel } from './useAudioLevel';
import './CallPanel.css';

export default function CallPanel({ onNavigateToChat }) {
  const { incomingCall, activeCall, localStream, remoteStream, callError, answerCall, rejectCall, hangup, endCallForAll, isMuted, toggleMute, isScreenSharing, startScreenShare, stopScreenShare, screenShareAudioEnabled, toggleScreenShareAudio, mutedRemoteForMe, toggleMutedRemoteForMe, remoteVolumeForMe, setRemoteVolume, muteParticipantForAll, isGroupAdmin, mutedByAdmin, adminMutedPeerIds, screenShareError, isMinimized, minimizeCall, maximizeCall, showEndCallDialog, setShowEndCallDialog } = useCall();
  const { user: currentUser } = useAuth();
  const localVideoRef = useRef(null);
  const localPreviewRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [remoteHover, setRemoteHover] = useState(false);
  const [usersMap, setUsersMap] = useState({});
  const [groupsMap, setGroupsMap] = useState({});
  const [contactNames, setContactNames] = useState(() => getStoredContactNames());
  const [callDurationSec, setCallDurationSec] = useState(0);

  const formatCallDuration = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!activeCall?.startedAt) {
      setCallDurationSec(0);
      return undefined;
    }
    const tick = () => setCallDurationSec(Math.floor((Date.now() - activeCall.startedAt) / 1000));
    tick();
    const iv = window.setInterval(tick, 1000);
    return () => window.clearInterval(iv);
  }, [activeCall?.startedAt]);

  // Загружаем список пользователей и групп для получения их имен и аватарок
  useEffect(() => {
    let cancelled = false;
    Promise.all([getUsers(), getGroups()])
      .then(([users, groups]) => {
        if (cancelled) return;
        const usersMapObj = {};
        users.forEach((u) => {
          usersMapObj[String(u.id)] = u;
        });
        setUsersMap(usersMapObj);
        
        const groupsMapObj = {};
        groups.forEach((g) => {
          groupsMapObj[String(g.id)] = g;
        });
        setGroupsMap(groupsMapObj);
      })
      .catch((err) => {
        console.error('Failed to load users/groups:', err);
      });
    return () => { cancelled = true; };
  }, []);

  // Обновляем contactNames при изменении в localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      setContactNames(getStoredContactNames());
    };
    window.addEventListener('storage', handleStorageChange);
    // Также проверяем периодически на случай изменений в том же окне
    const interval = setInterval(handleStorageChange, 1000);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Функция для получения URL аватарки пользователя
  const getUserAvatarUrl = (userId) => {
    if (!userId) return `https://api.dicebear.com/7.x/avataaars/svg?seed=user`;
    const userIdStr = String(userId);
    if (userIdStr === String(currentUser?.id)) {
      const url = currentUser?.avatarPath ? avatarUrl(currentUser.avatarPath) : null;
      return url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userIdStr}`;
    }
    const user = usersMap[userIdStr];
    if (user?.avatarPath) {
      const url = avatarUrl(user.avatarPath);
      if (url) return url;
    }
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${userIdStr}`;
  };

  // Функция для получения имени участника (displayName или contactName, не username)
  const getParticipantName = (participantId, isGroup = false) => {
    if (!participantId) return '';
    const idStr = String(participantId);
    
    if (isGroup) {
      // Для групп используем имя группы
      const group = groupsMap[idStr];
      return group?.name || 'Group';
    } else {
      // Для пользователей используем contactName если есть, иначе displayName
      const contactName = contactNames[idStr];
      if (contactName) return contactName;
      
      const user = usersMap[idStr];
      return user?.displayName || 'User';
    }
  };

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
    if (localPreviewRef.current) localPreviewRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    const el = remoteVideoRef.current;
    const outputId = getStoredAudioOutputId();
    if (!el || !outputId || typeof el.setSinkId !== 'function') return;
    el.setSinkId(outputId).catch(() => {});
  }, [remoteStream]);

  const remoteUserId = activeCall?.remoteUserId || null;
  const isRemoteMutedForMe = remoteUserId ? !!mutedRemoteForMe[remoteUserId] : false;
  const remoteVolume = remoteUserId ? (remoteVolumeForMe?.[remoteUserId] ?? 1) : 1;
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el) return;
    el.volume = isRemoteMutedForMe ? 0 : remoteVolume;
  }, [isRemoteMutedForMe, remoteVolume]);

  const remoteLevel = useAudioLevel(remoteStream, !!remoteStream && !isRemoteMutedForMe);
  const localLevel = useAudioLevel(localStream, !!localStream && !isMuted);

  if (callError) {
    return (
      <div className="call-overlay call-overlay-telegram">
        <div className="call-incoming-telegram">
          <div className="call-incoming-avatar-wrap">
            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=error`} alt="" className="call-incoming-avatar" />
          </div>
          <h3 className="call-incoming-title">{t('callErrorTitle')}</h3>
          <p className="call-error-text">{callError}</p>
          <div className="call-actions-telegram">
            <button type="button" className="call-btn call-btn-decline" onClick={hangup} title={t('close')}>
              <span className="call-btn-icon call-icon-hangup" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (incomingCall && !activeCall) {
    const callerLabel = incomingCall.isGroup
      ? getParticipantName(incomingCall.groupId, true)
      : getParticipantName(incomingCall.from, false);
    return (
      <div className="call-overlay call-overlay-telegram call-panel-incoming">
        <div className="call-incoming-telegram">
          <div className="call-incoming-avatar-wrap call-ring call-ring--multi">
            <span className="call-ring-wave call-ring-wave--1" aria-hidden />
            <span className="call-ring-wave call-ring-wave--2" aria-hidden />
            <span className="call-ring-wave call-ring-wave--3" aria-hidden />
            <img 
              src={getUserAvatarUrl(incomingCall.isGroup ? incomingCall.groupId : incomingCall.from)} 
              alt="" 
              className="call-incoming-avatar"
              onError={(e) => {
                const seed = incomingCall.isGroup ? incomingCall.groupId : incomingCall.from;
                const fallbackUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed || 'user'}`;
                if (e.target.src !== fallbackUrl) {
                  e.target.src = fallbackUrl;
                }
              }}
            />
          </div>
          <h3 className="call-incoming-title">{callerLabel || t('callIncomingTitle')}</h3>
          <p className="call-incoming-subtitle">
            {incomingCall.isGroup ? t('callGroup') : t('callPrivate')}
          </p>
          <div className="call-actions-telegram">
            <button type="button" className="call-btn call-btn-decline" onClick={rejectCall} title={t('callReject')}>
              <span className="call-btn-icon call-icon-decline" />
            </button>
            <button type="button" className="call-btn call-btn-answer" onClick={answerCall} title={t('callAccept')}>
              <span className="call-btn-icon call-icon-answer" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!activeCall) return null;

  // Если звонок минимизирован, показываем компактную панель
  if (isMinimized) {
    const remoteId = activeCall?.remoteUserId || activeCall?.groupId;
    const chatType = activeCall.isGroup ? 'group' : 'user';
    return (
      <div className="call-minimized-bar">
        <div className="call-minimized-info">
          <span className="call-minimized-status">
            🔊 {t('callInCall')} · {formatCallDuration(callDurationSec)}
          </span>
        </div>
        <div className="call-minimized-actions">
          <button
            type="button"
            className="call-minimized-btn"
            onClick={() => {
              if (onNavigateToChat) {
                onNavigateToChat({ type: chatType, id: remoteId });
              }
            }}
            title={t('callOpenChat') || 'Открыть чат'}
          >
            💬
          </button>
          <button
            type="button"
            className="call-minimized-btn"
            onClick={maximizeCall}
            title={t('callRestore') || 'Восстановить'}
          >
            ⬆
          </button>
          <button
            type="button"
            className="call-minimized-btn call-minimized-hangup"
            onClick={hangup}
            title={t('callLeave')}
          >
            📞
          </button>
        </div>
      </div>
    );
  }

  const remoteId = activeCall?.remoteUserId || activeCall?.groupId;
  const hasRemoteParticipant = !!activeCall?.remoteUserId;
  const isGroupCall = activeCall?.isGroup || false;

  if (!remoteStream) {
    const targetId = isGroupCall ? activeCall.groupId : activeCall.remoteUserId;
    const targetLabel = getParticipantName(targetId, isGroupCall);
    return (
      <div className="call-overlay call-overlay-telegram call-panel-outgoing">
        <div className="call-incoming-telegram call-outgoing-telegram">
          <div className="call-incoming-avatar-wrap call-ring call-ring--outgoing call-ring--multi">
            <span className="call-ring-wave call-ring-wave--outgoing call-ring-wave--1" aria-hidden />
            <span className="call-ring-wave call-ring-wave--outgoing call-ring-wave--2" aria-hidden />
            <img
              src={getUserAvatarUrl(targetId)}
              alt=""
              className="call-incoming-avatar"
            />
          </div>
          <h3 className="call-incoming-title">{targetLabel}</h3>
          <p className="call-incoming-subtitle call-outgoing-subtitle">{t('callOutgoing')}</p>
          <div className="call-outgoing-dots" aria-hidden><span /><span /><span /></div>
          <div className="call-actions-telegram">
            <button type="button" className="call-btn call-btn-decline call-btn-cancel-outgoing" onClick={hangup} title={t('callReject')}>
              <span className="call-btn-icon call-icon-hangup" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const participants = [
    { key: 'local', label: t('you'), num: 1, isLocal: true, stream: localStream },
    { 
      key: 'remote', 
      label: getParticipantName(remoteId, isGroupCall), 
      num: 2, 
      isLocal: false, 
      stream: remoteStream, 
      id: remoteId 
    },
  ];
  const count = participants.length;

  return (
    <div className="call-overlay call-overlay-telegram call-active">
      <div className="call-active-header">
        <span className={`call-status-dot${remoteStream ? '' : ' call-status-dot--waiting'}`} aria-hidden />
        <span>{remoteStream ? formatCallDuration(callDurationSec) : t('callWaiting')}</span>
      </div>
      <div className="call-active-layout">
        <div
          className="call-grid"
          style={{ '--call-count': count } }
          data-count={count}
        >
          {participants.map((p) => {
            const speaking = p.isLocal ? localLevel > 0.06 : remoteLevel > 0.06;
            return (
            <div key={p.key} className={`call-tile${p.stream ? ' call-tile--connected' : ''}${speaking ? ' call-tile--speaking' : ''}`}>
              <img
                src={getUserAvatarUrl(p.isLocal ? currentUser?.id : p.id)}
                alt=""
                className={`call-tile-center-avatar ${p.stream ? 'overlay' : 'main'}`}
                onError={(e) => {
                  // Fallback на dicebear если изображение не загрузилось
                  const fallbackUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.isLocal ? currentUser?.id : p.id || 'user'}`;
                  if (e.target.src !== fallbackUrl) {
                    e.target.src = fallbackUrl;
                  }
                }}
              />
              {p.isLocal ? (
                <video ref={localVideoRef} autoPlay muted playsInline className="call-tile-video" />
              ) : (
                <div
                  className="call-tile-remote"
                  onMouseEnter={() => setRemoteHover(true)}
                  onMouseLeave={() => setRemoteHover(false)}
                >
                  {p.stream ? (
                    <video ref={remoteVideoRef} autoPlay playsInline className="call-tile-video" />
                  ) : (
                    <div className="call-tile-placeholder">
                      <img 
                        src={getUserAvatarUrl(p.id)} 
                        alt="" 
                        className="call-tile-avatar"
                        onError={(e) => {
                          // Fallback на dicebear если изображение не загрузилось
                          const fallbackUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.id || 'user'}`;
                          if (e.target.src !== fallbackUrl) {
                            e.target.src = fallbackUrl;
                          }
                        }}
                      />
                      <span className="call-tile-waiting">{t('callWaiting')}</span>
                    </div>
                  )}
                  {remoteHover && hasRemoteParticipant && (
                    <div className="call-tile-actions">
                      <div className="call-remote-menu">
                        <button
                          type="button"
                          className={`call-remote-menu-item ${isRemoteMutedForMe ? 'active' : ''}`}
                          onClick={() => toggleMutedRemoteForMe(activeCall.remoteUserId)}
                          title={isRemoteMutedForMe ? t('callUnmuteForMe') : t('callMuteForMe')}
                        >
                          <span className={`call-remote-menu-icon ${isRemoteMutedForMe ? 'icon-mic-off' : 'icon-mic-on'}`} />
                          <span className="call-remote-menu-text">
                            {isRemoteMutedForMe ? t('callUnmute') : t('callMuteForMeShort')}
                          </span>
                        </button>
                        {activeCall.isGroup && isGroupAdmin && (
                          <button
                            type="button"
                            className={`call-remote-menu-item ${adminMutedPeerIds[activeCall.remoteUserId] ? 'active' : ''}`}
                            onClick={() => muteParticipantForAll(activeCall.remoteUserId)}
                            title={adminMutedPeerIds[activeCall.remoteUserId] ? t('callUnblockMic') : t('callMuteForAll')}
                          >
                            <span className="call-remote-menu-icon icon-admin-mic" />
                            <span className="call-remote-menu-text">
                              {adminMutedPeerIds[activeCall.remoteUserId] ? t('callUnblock') : t('callMuteForAllShort')}
                            </span>
                          </button>
                        )}
                        {activeCall.remoteUserId && (
                          <>
                            <div className="call-remote-menu-divider" />
                            <label className="call-remote-volume">
                              <span className="call-remote-volume-text">{t('callVolume')}</span>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={remoteVolume}
                                onChange={(e) => setRemoteVolume(activeCall.remoteUserId, e.target.value)}
                                aria-label={t('callVolume')}
                              />
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <span className="call-tile-label">
                {p.label}
                {speaking && <span className="call-tile-speaking-badge">{t('callSpeaking')}</span>}
              </span>
            </div>
            );
          })}
        </div>

        <aside className="call-sidebar">
          <button
            type="button"
            className="call-sidebar-btn call-sidebar-minimize"
            onClick={() => {
              const chatType = activeCall.isGroup ? 'group' : 'user';
              const chatId = activeCall?.remoteUserId || activeCall?.groupId;
              if (onNavigateToChat) {
                onNavigateToChat({ type: chatType, id: chatId });
              }
              minimizeCall();
            }}
            title={t('callMinimize') || 'Свернуть в чат'}
            aria-label={t('callMinimize') || 'Свернуть в чат'}
          >
            <span className="call-btn-icon call-icon-minimize" />
          </button>
          <button
            type="button"
            className="call-sidebar-btn call-sidebar-hangup"
            onClick={hangup}
            title={t('callLeave')}
            aria-label={t('callLeave')}
          >
            <span className="call-btn-icon call-icon-hangup" />
          </button>
          <button
            type="button"
            className={`call-sidebar-btn call-sidebar-mic ${isMuted ? 'muted' : ''} ${mutedByAdmin ? 'disabled' : ''}`}
            onClick={toggleMute}
            disabled={!!mutedByAdmin}
            title={mutedByAdmin ? t('callMicBlockedByAdmin') : (isMuted ? t('callMicOn') : t('callMicOff'))}
            aria-label={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
          >
            <span className={`call-btn-icon ${isMuted ? 'call-icon-mic-off' : 'call-icon-mic-on'}`} />
          </button>
          <button
            type="button"
            className={`call-sidebar-btn call-sidebar-demo ${isScreenSharing ? 'active' : ''}`}
            onClick={isScreenSharing ? stopScreenShare : startScreenShare}
            title={isScreenSharing ? t('callDemoStop') : t('callDemoStart')}
            aria-label={isScreenSharing ? 'Остановить демо' : 'Демо экрана'}
          >
            <span className="call-btn-icon call-icon-screen" />
          </button>
          {isScreenSharing && (
            <button
              type="button"
              className={`call-sidebar-btn ${screenShareAudioEnabled ? 'active' : ''}`}
              onClick={toggleScreenShareAudio}
              title={screenShareAudioEnabled ? (t('screenShareAudioOff') || 'Выключить звук экрана') : (t('screenShareAudioOn') || 'Включить звук экрана')}
              aria-label={screenShareAudioEnabled ? 'Выключить звук экрана' : 'Включить звук экрана'}
            >
              <span className={`call-btn-icon ${screenShareAudioEnabled ? 'call-icon-audio-on' : 'call-icon-audio-off'}`} />
            </button>
          )}
          {screenShareError && (
            <div className="call-sidebar-hint" role="status">
              {screenShareError}
            </div>
          )}
          <div className="call-sidebar-you">
            <video ref={localPreviewRef} autoPlay muted playsInline className="call-sidebar-you-video" />
            <span className="call-sidebar-you-label">{t('you')}</span>
          </div>
        </aside>
      </div>

      {/* Диалог завершения звонка для администратора */}
      {showEndCallDialog && (
        <div className="call-end-dialog-overlay">
          <div className="call-end-dialog">
            <h3 className="call-end-dialog-title">{t('callEndForAllTitle')}</h3>
            <p className="call-end-dialog-text">{t('callEndForAllText')}</p>
            <div className="call-end-dialog-actions">
              <button
                type="button"
                className="call-end-dialog-btn call-end-dialog-btn-cancel"
                onClick={() => {
                  setShowEndCallDialog(false);
                  hangup({ endForAll: false });
                }}
              >
                {t('callLeaveOnly')}
              </button>
              <button
                type="button"
                className="call-end-dialog-btn call-end-dialog-btn-confirm"
                onClick={endCallForAll}
              >
                {t('callEndForAll')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
