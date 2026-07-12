import React, { useState, useEffect, useRef, useMemo, useCallback, useReducer } from 'react';
import { useSocket } from './SocketContext';
import { getMessages, searchMessages, getUsers, getPresence, avatarUrl, uploadVoice, uploadAttachment, getBotCommands, getGroupMembers, getStarredMessages, getPresenceBatch, translateText } from './api';
import { resolveBotUserId } from './botChat';
import { ensureKeyPair, encryptForPeer, decryptFromPeer } from './e2e';
import { useCall, getAudioConstraintsForMic } from './useCall';
import { getGroupBackgroundStyle } from './groupBackgrounds';
import { t, getStoredLang } from './i18n';
import { pickImageFromGallery } from './pickGalleryImage';
import { isMediaCallSupportedInThisPage } from './secureMedia';
import { getEnableMessageReactions, getSendByEnter, getPrivacyReadReceipts, getEnableLargeEmoji, getBatteryGifAutoplay, getAppSettings } from './appSettings';
import { ChatDmProfilePanel, ChatGroupProfilePanel } from './ChatProfileTopPanel';
import { isLargeEmojiText, QUICK_REACTIONS, reactionsFromGrouped, toggleReactionLocal, reactionIsActive } from './messageEmoji';
import { MessageFormattedText, wrapInputSelection } from './messageFormat';
import FormatToolbar from './FormatToolbar';
import MentionSuggest, { getMentionQuery, insertMention } from './MentionSuggest';
import EmojiSuggest from './EmojiSuggest';
import { getEmojiQuery, insertEmojiShortcode, filterEmojiShortcodes } from './emojiShortcodes';
import LinkPreview from './LinkPreview';
import PollMessage from './PollMessage';
import MembersPanel, { nameColor } from './MembersPanel';
import { filterBuiltinSlash, resolveBuiltinSlash } from './builtinSlash';
import { addScheduledMessage, getScheduledForChat, removeScheduledMessage } from './scheduledMessages';
import { isChatMuted, toggleChatMuted, setChatMuted as persistChatMuted } from './chatMute';
import { loadDraft, saveDraft } from './chatDrafts';
import UserProfile from './UserProfile';
import GroupEdit from './GroupEdit';
import { VoiceMessage } from './VoiceMessage';
import { extractWaveformPeaks, createLiveAnalyser, readAnalyserPeaks } from './voiceWaveform';
import { createSpeechTranscriber, detectBrowserLang } from './voiceSpeech';
import { PhotoViewer } from './PhotoViewer';
import { Avatar } from './Avatar';
import { formatCustomStatusLine } from './customStatus';
import { mergePlaybackActivities } from './activityUtils';
import { UserActivityOverlay } from './UserActivityOverlay';
import { isChannelGroup, canPostInChat, canCallInChat } from './groupUtils';
import { createDoubleTapHandler } from './novaMotion';
import { playSendSound, playReactionSound, playNewMessageSound } from './useNotificationSound';
import { playVoiceRecordStart, playVoiceSend, playVoiceRecordCancel } from './useCallSounds';
import QuickEmojiBar from './QuickEmojiBar';
import MessageFxBar from './MessageFxBar';
import ImbaChatEffects from './ImbaChatEffects';
import { parseMessageFx, getMessageFx, displayMessageContent, SCREEN_SHAKE_FX, SCREEN_FLASH_FX, CONFETTI_FX, STARFALL_FX, rollCriticalHit, isMessageCritical, FX_HOTKEYS, comboTierLabel } from './messageFx';
import { getNotificationsPlaySound } from './appSettings';
import { burstNovaConfetti } from './NovaConfetti';
import { StickerPicker, MessageSticker } from './StickerPicker';
import { showNovaToastInfo } from './NovaToast';
import StickerPackPreview from './StickerPackPreview';
import BotCommandMenu, { filterBotCommands } from './BotCommandMenu';
import './ChatView.css';
import './StickerPicker.css';
import './BotCommandMenu.css';
import './MembersPanel.css';

function formatDateDay(createdAt) {
  return new Date(createdAt * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const MESSAGE_GROUP_GAP_SEC = 7 * 60;

function isMessageGrouped(m, prev, showDate) {
  if (!prev || showDate) return false;
  if (!m || m.isDeleted || prev.isDeleted) return false;
  if (m.messageType === 'action' || m.messageType === 'call_ended') return false;
  if (prev.messageType === 'action' || prev.messageType === 'call_ended') return false;
  if (String(m.senderId) !== String(prev.senderId)) return false;
  const gap = (Number(m.createdAt) || 0) - (Number(prev.createdAt) || 0);
  return gap >= 0 && gap <= MESSAGE_GROUP_GAP_SEC;
}

function formatCallDuration(sec) {
  if (sec == null || sec < 0) return '0 сек';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const parts = [];
  if (h) parts.push(`${h} ч`);
  if (m) parts.push(`${m} мин`);
  parts.push(`${s} сек`);
  return parts.join(' ');
}

function formatLastSeen(lastSeenAt) {
  if (lastSeenAt == null) return null;
  const d = new Date(lastSeenAt * 1000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const date = d.getTime();
  const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (date >= today) return `сегодня в ${timeStr}`;
  if (date >= yesterday) return `вчера в ${timeStr}`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' в ' + timeStr;
}

function isVoiceAttachment(path) {
  if (!path || typeof path !== 'string') return false;
  const p = path.toLowerCase();
  return p.includes('voice') || p.endsWith('.webm');
}

function isImageAttachmentPath(path) {
  if (!path || typeof path !== 'string') return false;
  return /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(path);
}

async function copyToClipboard(text) {
  const str = text == null ? '' : String(text);
  if (!str) return false;
  try {
    if (navigator?.clipboard?.writeText && (window.isSecureContext || window.location?.protocol === 'https:' || window.location?.hostname === 'localhost')) {
      await navigator.clipboard.writeText(str);
      return true;
    }
  } catch (e) {
    // fallback below
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.left = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand && document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch (e) {
    return false;
  }
}

function CustomVideoPlayer({ src }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);

  const formatTime = (sec) => {
    const t = Math.max(0, Math.floor(sec || 0));
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(t % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoaded = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    const onTime = () => setCurrentTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
    const onEnded = () => setIsPlaying(false);
    video.volume = volume;
    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('ended', onEnded);
    };
  }, [volume, src]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="custom-video-player" ref={containerRef}>
      <video ref={videoRef} src={src} className="custom-video-element" onClick={togglePlay} />
      <div className="custom-video-controls">
        <button type="button" className="custom-video-btn" onClick={togglePlay}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          min="0"
          max={duration || 0}
          step="0.01"
          value={Math.min(currentTime, duration || 0)}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (videoRef.current) videoRef.current.currentTime = v;
            setCurrentTime(v);
          }}
          className="custom-video-seek"
        />
        <span className="custom-video-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
        <span className="custom-video-vol-label">Vol</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="custom-video-volume"
        />
        <button
          type="button"
          className="custom-video-btn custom-video-fullscreen"
          onClick={() => {
            const el = containerRef.current;
            if (!el) return;
            const doc = document;
            const isFs = doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;
            if (!isFs) {
              (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)?.call(el);
            } else {
              (doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen)?.call(doc);
            }
          }}
          title="Fullscreen"
        >
          ⛶
        </button>
      </div>
    </div>
  );
}

function MessageAttachment({ path, content, mentionUsers, onMentionClick, onOpenImage }) {
  const url = avatarUrl(path);
  if (!url) return null;
  const isImage = /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(path);
  const isVideo = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(path);
  const caption = content ? (
    <p className="message-content message-attachment-caption">
      <MessageFormattedText text={content} mentionUsers={mentionUsers} onMentionClick={onMentionClick} />
    </p>
  ) : null;
  if (isImage) {
    return (
      <div className="message-attachment">
        <button
          type="button"
          className="message-attachment-img-btn"
          onClick={() => onOpenImage?.(url)}
        >
          <img src={url} alt="" className="message-attachment-img" loading="lazy" decoding="async" />
        </button>
        {caption}
      </div>
    );
  }
  if (isVideo) {
    return (
      <div className="message-attachment">
        <CustomVideoPlayer src={url} />
        {caption}
      </div>
    );
  }
  return (
    <div className="message-attachment">
      <a href={url} target="_blank" rel="noopener noreferrer" className="message-attachment-file">
        📎 Файл
      </a>
      {caption}
    </div>
  );
}

function isStickerMessage(m) {
  if (!m || m.isDeleted) return false;
  if (m.messageType === 'sticker') return true;
  const p = m.attachmentPath || '';
  return /\/uploads\/stickers\//i.test(String(p));
}

function isAnimatedSticker(m) {
  return m?.messageMeta?.mediaType === 'animated' || /\.gif(\?|$)/i.test(m?.attachmentPath || '');
}

export default function ChatView({
  currentUser,
  peer,
  type,
  onBack,
  onMenu,
  onOpenSettings,
  myChatBackground,
  contactNames,
  onEditProfile,
  onCreateChannel,
  onOpenChannel,
  onUpdated,
  users = [],
  groups = [],
  pendingForwardMessage = null,
  onPendingForwardConsumed,
  onForwardChoose,
  onArchiveChat,
  onUnarchiveChat,
  isArchived,
  onOpenUserChat,
  chatListMode = 'full',
  onCycleChatList,
  initialUnreadCount = 0,
}) {
  const { socket, connected } = useSocket();
  const [messages, setMessages] = useState([]);
  const [messagesBootstrapping, setMessagesBootstrapping] = useState(true);
  const [input, setInput] = useState('');
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [stickerTab, setStickerTab] = useState('stickers');
  const [stickerFocusPackId, setStickerFocusPackId] = useState(null);
  const [stickerPacksRefreshKey, setStickerPacksRefreshKey] = useState(0);
  const [stickerPackPreview, setStickerPackPreview] = useState(null);
  const [botCommands, setBotCommands] = useState([]);
  const [isBotChat, setIsBotChat] = useState(false);
  const [botCmdIndex, setBotCmdIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [showGroupEdit, setShowGroupEdit] = useState(false);
  const [profileUser, setProfileUser] = useState(null);
  const listRef = useRef(null);
  const [animatingMsgIds, setAnimatingMsgIds] = useState(() => new Set());
  const [poppingReactions, setPoppingReactions] = useState(() => new Set());
  const [highlightMsgId, setHighlightMsgId] = useState(null);
  const [chatEntering, setChatEntering] = useState(true);
  const [sendBurst, setSendBurst] = useState(false);
  const [floatingHearts, setFloatingHearts] = useState(() => new Set());
  const [selectedFx, setSelectedFx] = useState(null);
  const [fxSticky, setFxSticky] = useState(false);
  const [chatMood, setChatMood] = useState(null);
  const [imbaStarfall, setImbaStarfall] = useState(false);
  const [imbaOverload, setImbaOverload] = useState(false);
  const [imbaCombo, setImbaCombo] = useState(null);
  const [imbaMega, setImbaMega] = useState(null);
  const [imbaStreak, setImbaStreak] = useState(null);
  const [imbaShakeToken, setImbaShakeToken] = useState(0);
  const [imbaFlash, setImbaFlash] = useState(null);
  const [imbaRain, setImbaRain] = useState(false);
  const [imbaCritToast, setImbaCritToast] = useState(null);
  const [sendCharging, setSendCharging] = useState(false);
  const [vanishingIds, setVanishingIds] = useState(() => new Set());
  const reactionComboRef = useRef({ count: 0, at: 0 });
  const sendStreakRef = useRef({ count: 0, at: 0 });
  const lastFxHandledRef = useRef(null);
  const chargeTimerRef = useRef(null);
  const chargeArmedRef = useRef(false);
  const doubleTapHandlerRef = useRef(null);
  const reactDoubleTapRef = useRef(null);
  const flashMessage = useCallback((id) => {
    if (id == null) return;
    const sid = String(id);
    setHighlightMsgId(sid);
    window.setTimeout(() => setHighlightMsgId(null), 1800);
  }, []);

  const triggerImbaFx = useCallback((fx, critical = false) => {
    if (!fx || getAppSettings().uiImbaFx === false) return;
    const effective = critical && fx !== 'nova' ? fx : fx;
    if (critical || fx === 'nova') {
      setImbaShakeToken((n) => n + 1);
      setImbaFlash(fx === 'nova' ? 'nova' : fx);
      window.setTimeout(() => setImbaFlash(null), 650);
      try { burstNovaConfetti({ count: critical || fx === 'nova' ? 90 : 50 }); } catch (_) { /* ignore */ }
      if (critical) {
        const id = `crit-${Date.now()}`;
        setImbaCritToast({ id });
        window.setTimeout(() => setImbaCritToast((c) => (c && c.id === id ? null : c)), 1150);
      }
    } else {
      if (SCREEN_SHAKE_FX.has(fx)) setImbaShakeToken((n) => n + 1);
      if (SCREEN_FLASH_FX.has(fx) || SCREEN_SHAKE_FX.has(fx)) {
        setImbaFlash(fx);
        window.setTimeout(() => setImbaFlash(null), 560);
      }
      if (CONFETTI_FX.has(fx)) {
        try { burstNovaConfetti({ count: fx === 'party' || fx === 'rainbow' ? 70 : 40 }); } catch (_) { /* ignore */ }
      }
    }
    if (fx === 'wave' || fx === 'ice' || fx === 'thunder' || fx === 'blizzard') {
      setImbaRain(true);
      window.setTimeout(() => setImbaRain(false), 2200);
    }
    if (STARFALL_FX.has(fx)) {
      setImbaStarfall(true);
      window.setTimeout(() => setImbaStarfall(false), 2400);
    }
    if (critical || fx === 'nova' || fx === 'quake') {
      setImbaOverload(true);
      window.setTimeout(() => setImbaOverload(false), 1800);
    }
    void effective;
  }, []);
  const triggerImbaFxRef = useRef(triggerImbaFx);
  triggerImbaFxRef.current = triggerImbaFx;
  const markReactionPop = useCallback((messageId, emoji) => {
    const key = `${messageId}:${emoji}`;
    setPoppingReactions((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    window.setTimeout(() => {
      setPoppingReactions((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 400);
  }, []);
  const markMessageIn = useCallback((id) => {
    if (id == null) return;
    const sid = String(id);
    setAnimatingMsgIds((prev) => {
      if (prev.has(sid)) return prev;
      const next = new Set(prev);
      next.add(sid);
      return next;
    });
    window.setTimeout(() => {
      setAnimatingMsgIds((prev) => {
        if (!prev.has(sid)) return prev;
        const next = new Set(prev);
        next.delete(sid);
        return next;
      });
    }, 380);
  }, []);
  const setSendingRef = useRef(null);
  const sendingTimeoutRef = useRef(null);
  setSendingRef.current = setSending;
  const { startCall, startGroupCall, activeCall, activeGroupCallIds } = useCall();
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState(null);
  const [voiceErrorShake, setVoiceErrorShake] = useState(false);
  const [liveWavePeaks, setLiveWavePeaks] = useState([]);
  const [liveTranscript, setLiveTranscript] = useState('');
  const liveAnalyserRef = useRef(null);
  const liveAnimRef = useRef(null);
  const speechTranscriberRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordStreamRef = useRef(null);
  const recordTimerRef = useRef(null);
  const recordPendingRef = useRef(false);
  const cancelVoiceRef = useRef(false);
  const [replyTo, setReplyTo] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [forwardMessage, setForwardMessage] = useState(null);
  const [forwardPickerOpen, setForwardPickerOpen] = useState(false);
  const [forwardPickMessage, setForwardPickMessage] = useState(null);
  const [forwardSearch, setForwardSearch] = useState('');
  const [messageMenuId, setMessageMenuId] = useState(null);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [presence, setPresence] = useState(null);
  const [sendByEnter, setSendByEnter] = useState(getSendByEnter);
  const [enableMessageReactions, setEnableMessageReactions] = useState(getEnableMessageReactions);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState({});
  const [peerLastReadAt, setPeerLastReadAt] = useState(null);
  const [chatMuted, setChatMuted] = useState(false);
  const [groupMembers, setGroupMembers] = useState([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [emojiIndex, setEmojiIndex] = useState(0);
  const [muteMenuOpen, setMuteMenuOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [showJumpDate, setShowJumpDate] = useState(false);
  const [jumpDateValue, setJumpDateValue] = useState('');
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptionsText, setPollOptionsText] = useState('Да\nНет');
  const [pollMulti, setPollMulti] = useState(false);
  const [showScheduleComposer, setShowScheduleComposer] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduledList, setScheduledList] = useState([]);
  const [slashIndex, setSlashIndex] = useState(0);
  const [showStarredPanel, setShowStarredPanel] = useState(false);
  const [starredList, setStarredList] = useState([]);
  const [starredLoading, setStarredLoading] = useState(false);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [memberPresence, setMemberPresence] = useState({});
  const [msgTranslations, setMsgTranslations] = useState({});
  const [photoViewer, setPhotoViewer] = useState(null);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQ, setChatSearchQ] = useState('');
  const [chatSearchLoading, setChatSearchLoading] = useState(false);
  const [chatSearchResults, setChatSearchResults] = useState([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [pendingBelow, setPendingBelow] = useState(0);
  const [scrollDownBump, setScrollDownBump] = useState(false);
  const prevPendingBelowRef = useRef(0);
  const [copiedBubbleId, setCopiedBubbleId] = useState(null);
  const [silentPost, setSilentPost] = useState(false);
  const channelViewsSentRef = useRef(new Set());
  const [inputFocused, setInputFocused] = useState(false);
  const oldestCreatedAtRef = useRef(null);
  const prevLastMsgIdRef = useRef(null);
  const typingEmitTimerRef = useRef(null);
  const lastReadMarkRef = useRef(0);
  const skipDraftSaveRef = useRef(true);
  const presenceRefreshRef = useRef(null);
  const peerActivitiesRef = useRef([]);
  const chatInputRef = useRef(null);

  const appendToInput = useCallback((chunk) => {
    setInput((prev) => prev + chunk);
  }, []);

  const [, forceUiRefresh] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    const fn = () => forceUiRefresh();
    window.addEventListener('nova-app-settings', fn);
    return () => window.removeEventListener('nova-app-settings', fn);
  }, []);

  const recipientId = peer?.id;
  const recipientType = type === 'group' ? 'group' : 'user';

  useEffect(() => {
    setChatEntering(true);
    const timer = window.setTimeout(() => setChatEntering(false), 420);
    return () => window.clearTimeout(timer);
  }, [recipientType, recipientId]);

  const filteredBotCommands = useMemo(
    () => (isBotChat ? filterBotCommands(botCommands, input) : []),
    [isBotChat, botCommands, input]
  );
  const showBotCommandMenu = isBotChat && filteredBotCommands.length > 0;
  const builtinSlashCommands = useMemo(
    () => (!isBotChat ? filterBuiltinSlash(input) : []),
    [isBotChat, input]
  );
  const showBuiltinSlash = !isBotChat && canPostInChat(peer, type, currentUser) && builtinSlashCommands.length > 0;

  useEffect(() => {
    setBotCmdIndex(0);
    setSlashIndex(0);
  }, [input, filteredBotCommands.length, builtinSlashCommands.length]);

  useEffect(() => {
    setMentionIndex(0);
    setEmojiIndex(0);
  }, [input]);

  useEffect(() => {
    setMuteMenuOpen(false);
    setSelectMode(false);
    setSelectedIds(new Set());
    setShowJumpDate(false);
    setShowPollComposer(false);
    setShowScheduleComposer(false);
    setShowStarredPanel(false);
    setShowMembersPanel(false);
    setScheduledList(getScheduledForChat(recipientType, recipientId));
  }, [recipientType, recipientId]);

  useEffect(() => {
    const sync = () => setScheduledList(getScheduledForChat(recipientType, recipientId));
    window.addEventListener('nova-scheduled', sync);
    return () => window.removeEventListener('nova-scheduled', sync);
  }, [recipientType, recipientId]);

  useEffect(() => {
    if (type !== 'user' || !recipientId || String(recipientId) === String(currentUser?.id)) {
      setIsBotChat(false);
      setBotCommands([]);
      return;
    }
    if (peer?.isBot) setIsBotChat(true);
    let cancelled = false;
    getBotCommands(recipientId)
      .then((data) => {
        if (cancelled) return;
        const cmds = data?.commands || [];
        setBotCommands(cmds);
        if (cmds.length > 0) setIsBotChat(true);
        else if (!peer?.isBot) setIsBotChat(false);
      })
      .catch(() => {
        if (cancelled) return;
        setBotCommands([]);
        if (!peer?.isBot) setIsBotChat(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type, recipientId, peer?.isBot, currentUser?.id]);

  const showToast = useCallback((text) => {
    const msg = text == null ? '' : String(text);
    if (!msg) return;
    showNovaToastInfo(msg);
  }, []);

  const openChatSearch = useCallback(() => {
    setChatSearchOpen(true);
    setChatSearchQ('');
    setChatSearchResults([]);
    setChatSearchLoading(false);
  }, []);

  const closeChatSearch = useCallback(() => {
    setChatSearchOpen(false);
    setChatSearchQ('');
    setChatSearchResults([]);
    setChatSearchLoading(false);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        const tag = e.target?.tagName?.toLowerCase();
        if (tag === 'input' && e.target?.classList?.contains('chat-search-input')) return;
        e.preventDefault();
        openChatSearch();
        return;
      }
      const tag = e.target?.tagName?.toLowerCase();
      const inField = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
      if (e.key === 'Escape' && replyTo) {
        e.preventDefault();
        setReplyTo(null);
        return;
      }
      if (!inField && (e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const last = [...messages].reverse().find((m) => !m.isDeleted && m.messageType !== 'call_ended');
        if (last) {
          e.preventDefault();
          setReplyTo({ id: last.id, content: last.content || '', senderName: last.senderName });
          setForwardMessage(null);
          requestAnimationFrame(() => chatInputRef.current?.focus());
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openChatSearch, replyTo, messages]);

  const appendQuickEmoji = useCallback((emoji) => {
    setInput((prev) => `${prev}${emoji}`);
    requestAnimationFrame(() => chatInputRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!chatSearchOpen) return;
    if (!recipientId) return;
    const q = chatSearchQ.trim();
    if (q.length < 2) {
      setChatSearchResults([]);
      setChatSearchLoading(false);
      return;
    }
    let cancelled = false;
    setChatSearchLoading(true);
    const t = setTimeout(() => {
      searchMessages(type, recipientId, q, 40)
        .then((rows) => { if (!cancelled) setChatSearchResults(rows); })
        .catch(() => { if (!cancelled) setChatSearchResults([]); })
        .finally(() => { if (!cancelled) setChatSearchLoading(false); });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [chatSearchOpen, chatSearchQ, recipientId, type]);
  const menuCloseRef = useRef(null);
  const headerMenuRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const e2eKeysRef = useRef(null);

  const mentionUsers = useMemo(() => {
    const map = new Map();
    (users || []).forEach((u) => { if (u?.id) map.set(String(u.id), u); });
    (groupMembers || []).forEach((u) => { if (u?.id) map.set(String(u.id), { ...map.get(String(u.id)), ...u }); });
    if (currentUser?.id) map.set(String(currentUser.id), { ...map.get(String(currentUser.id)), ...currentUser });
    return [...map.values()];
  }, [users, currentUser, groupMembers]);

  useEffect(() => {
    if (type !== 'group' || !recipientId) {
      setGroupMembers([]);
      return undefined;
    }
    let cancelled = false;
    getGroupMembers(recipientId)
      .then((rows) => {
        if (cancelled) return;
        const list = (Array.isArray(rows) ? rows : rows?.members || []).map((m) => ({
          id: m.id || m.userId,
          login: m.login,
          displayName: m.displayName || m.display_name || m.login,
          avatarPath: m.avatarPath || m.avatar_path,
          role: m.role || m.memberRole || 'member',
        })).filter((u) => u.id && u.login);
        setGroupMembers(list);
      })
      .catch(() => { if (!cancelled) setGroupMembers([]); });
    return () => { cancelled = true; };
  }, [type, recipientId]);

  useEffect(() => {
    if (type !== 'group' || !showMembersPanel || !groupMembers.length) return undefined;
    let cancelled = false;
    const ids = groupMembers.map((m) => m.id).filter(Boolean).slice(0, 80);
    if (!ids.length) return undefined;
    getPresenceBatch(ids)
      .then((data) => {
        if (cancelled || !data) return;
        setMemberPresence(data);
      })
      .catch(() => { if (!cancelled) setMemberPresence({}); });
    return () => { cancelled = true; };
  }, [type, showMembersPanel, groupMembers]);

  const imageGalleryUrls = useMemo(() => {
    return messages
      .filter((m) => m.attachmentPath && isImageAttachmentPath(m.attachmentPath))
      .map((m) => avatarUrl(m.attachmentPath))
      .filter(Boolean);
  }, [messages]);

  const openImageViewer = useCallback((url) => {
    if (!url) return;
    const idx = imageGalleryUrls.indexOf(url);
    setPhotoViewer({
      urls: imageGalleryUrls.length ? imageGalleryUrls : [url],
      index: idx >= 0 ? idx : 0,
    });
  }, [imageGalleryUrls]);

  const handleMentionClick = useCallback((u) => {
    setProfileUser(u);
    setShowUserProfile(true);
  }, []);

  const measureMenuPosition = (el) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const openUp = r.bottom > window.innerHeight - 12;
    el.classList.toggle('message-menu-open-up', openUp);
  };

  const canPin = type === 'user' || peer?.myRole === 'admin';
  const displayName = type === 'group' ? peer?.name : (contactNames?.[peer?.id] || peer?.displayName);
  const isVerifiedPeer = type === 'user' && !!peer?.isVerified;

  const groupBackgroundStyle = useMemo(
    () => (type === 'group' && peer?.backgroundPath ? getGroupBackgroundStyle(peer.backgroundPath, avatarUrl) : null),
    [type, peer?.backgroundPath]
  );
  // myBackgroundStyle применяется только для личных чатов (type === 'user'), не для групп
  const myBackgroundStyle = useMemo(
    () => (type === 'user' && myChatBackground ? getGroupBackgroundStyle(myChatBackground, avatarUrl) : null),
    [type, myChatBackground]
  );
  const messageListBackgroundStyle = groupBackgroundStyle || myBackgroundStyle || undefined;

  useEffect(() => {
    setSendByEnter(getSendByEnter());
    setEnableMessageReactions(getEnableMessageReactions());
    const onStorage = () => {
      setSendByEnter(getSendByEnter());
      setEnableMessageReactions(getEnableMessageReactions());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    setTypingUsers({});
    lastReadMarkRef.current = 0;
    setChatMuted(isChatMuted(recipientType, recipientId));
    setPhotoViewer(null);
    setMsgTranslations({});
  }, [recipientId, recipientType]);

  useEffect(() => {
    return () => {
      if (typingEmitTimerRef.current) clearTimeout(typingEmitTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!recipientId) return;
    setInput(loadDraft(recipientType, recipientId));
    skipDraftSaveRef.current = true;
  }, [recipientType, recipientId]);

  useEffect(() => {
    if (!recipientId) return;
    if (skipDraftSaveRef.current) {
      skipDraftSaveRef.current = false;
      return;
    }
    const t = setTimeout(() => saveDraft(recipientType, recipientId, input), 400);
    return () => clearTimeout(t);
  }, [input, recipientType, recipientId]);

  useEffect(() => {
    if (type !== 'user' || !recipientId || !socket || !messages.length) return;
    if (!getPrivacyReadReceipts()) return;
    const maxTs = Math.max(...messages.map((m) => m.createdAt || 0), 0);
    if (maxTs <= lastReadMarkRef.current) return;
    lastReadMarkRef.current = maxTs;
    socket.emit('mark_read', { peerId: recipientId, lastReadCreatedAt: maxTs });
  }, [messages, type, recipientId, socket]);

  useEffect(() => {
    if (!socket || type !== 'user') return;
    const onPeer = ({ readerId, lastReadCreatedAt }) => {
      if (String(readerId) !== String(recipientId)) return;
      const t = typeof lastReadCreatedAt === 'number' ? lastReadCreatedAt : 0;
      setPeerLastReadAt((prev) => Math.max(prev || 0, t));
    };
    socket.on('peer_read_receipt', onPeer);
    return () => socket.off('peer_read_receipt', onPeer);
  }, [socket, type, recipientId]);

  useEffect(() => {
    let id = null;
    try {
      id = sessionStorage.getItem('nova_scroll_msg');
      if (id) sessionStorage.removeItem('nova_scroll_msg');
    } catch {}
    const h = window.location.hash;
    if (!id && h.startsWith('#msg-')) id = h.slice(5);
    if (!id) return undefined;
    const t = setTimeout(() => {
      document.getElementById(`chat-msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flashMessage(id);
    }, 400);
    return () => clearTimeout(t);
  }, [recipientId, messages.length, flashMessage]);

  useEffect(() => {
    if (!voiceError) return;
    setVoiceErrorShake(true);
    const t = window.setTimeout(() => setVoiceErrorShake(false), 500);
    return () => window.clearTimeout(t);
  }, [voiceError]);

  useEffect(() => {
    if (pendingForwardMessage == null) return;
    setForwardMessage(pendingForwardMessage);
    onPendingForwardConsumed?.();
  }, [pendingForwardMessage]);

  useEffect(() => {
    if (!recipientId) return;
    setMessagesBootstrapping(true);
    setHasMoreHistory(true);
    oldestCreatedAtRef.current = null;
    getMessages(type, recipientId, { limit: 120 })
      .then(async (data) => {
        const msgs = data.messages || [];
        setHasMoreHistory(data.hasMore !== false);
        setPinnedMessages(data.pinned || []);
        if (type === 'user') {
          setPeerLastReadAt(data.peerLastReadAt != null ? Number(data.peerLastReadAt) : null);
        } else {
          setPeerLastReadAt(null);
        }
        if (type !== 'user') {
          setMessages(msgs);
          oldestCreatedAtRef.current = msgs.length ? Math.min(...msgs.map((m) => m.createdAt || 0).filter(Boolean)) : null;
          return;
        }
        try {
          const my = await ensureKeyPair();
          e2eKeysRef.current = my;
          const theirJwk = peer?.e2ePublicKey ? JSON.parse(peer.e2ePublicKey) : null;
          if (!my || !theirJwk) {
            setMessages(msgs);
            oldestCreatedAtRef.current = msgs.length ? Math.min(...msgs.map((m) => m.createdAt || 0).filter(Boolean)) : null;
            return;
          }
          const decrypted = [];
          for (const m of msgs) {
            if (m.content && typeof m.content === 'string' && m.content.startsWith('e2e:')) {
              const plain = await decryptFromPeer(my.privateKey, theirJwk, m.content);
              decrypted.push({ ...m, content: plain });
            } else {
              decrypted.push(m);
            }
          }
          setMessages(decrypted);
          oldestCreatedAtRef.current = decrypted.length ? Math.min(...decrypted.map((m) => m.createdAt || 0).filter(Boolean)) : null;
        } catch (e) {
          console.error('E2E decrypt history failed', e);
          setMessages(msgs);
          oldestCreatedAtRef.current = msgs.length ? Math.min(...msgs.map((m) => m.createdAt || 0).filter(Boolean)) : null;
        }
      })
      .catch(console.error)
      .finally(() => setMessagesBootstrapping(false));
  }, [recipientId, type, peer?.e2ePublicKey]);

  const loadOlder = useCallback(async () => {
    if (!recipientId) return;
    if (loadingOlder) return;
    if (!hasMoreHistory) return;
    const beforeTs = oldestCreatedAtRef.current;
    if (!beforeTs || !Number.isFinite(beforeTs)) return;
    setLoadingOlder(true);
    const container = listRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;
    try {
      const data = await getMessages(type, recipientId, { limit: 120, before: beforeTs });
      const older = data.messages || [];
      setHasMoreHistory(data.hasMore !== false);
      if (older.length) {
        setMessages((prev) => {
          const existing = new Set(prev.map((m) => m.id));
          const merged = [...older.filter((m) => !existing.has(m.id)), ...prev];
          return merged;
        });
        const minTs = Math.min(...older.map((m) => m.createdAt || 0).filter(Boolean), beforeTs);
        oldestCreatedAtRef.current = Number.isFinite(minTs) ? minTs : beforeTs;
      } else {
        setHasMoreHistory(false);
      }
    } catch (e) {
      // ignore
    } finally {
      setLoadingOlder(false);
      requestAnimationFrame(() => {
        if (!container) return;
        const nextScrollHeight = container.scrollHeight || 0;
        const delta = nextScrollHeight - prevScrollHeight;
        if (delta > 0) container.scrollTop = (container.scrollTop || 0) + delta;
      });
    }
  }, [recipientId, type, loadingOlder, hasMoreHistory]);

  useEffect(() => {
    peerActivitiesRef.current = [];
    if (type !== 'user' || !recipientId) {
      setPresence(null);
      if (presenceRefreshRef.current) {
        clearInterval(presenceRefreshRef.current);
        presenceRefreshRef.current = null;
      }
      return;
    }
    let cancelled = false;
    const load = () => {
      getPresence(recipientId)
        .then((p) => {
          if (cancelled || !p) return;
          const incoming = Array.isArray(p.activities) ? p.activities : [];
          const merged = mergePlaybackActivities(peerActivitiesRef.current, incoming);
          peerActivitiesRef.current = merged;
          setPresence({ ...p, activities: merged });
        })
        .catch(() => { if (!cancelled) setPresence(null); });
    };
    load();
    presenceRefreshRef.current = setInterval(load, 60000);
    return () => {
      cancelled = true;
      if (presenceRefreshRef.current) {
        clearInterval(presenceRefreshRef.current);
        presenceRefreshRef.current = null;
      }
    };
  }, [type, recipientId]);

  useEffect(() => () => {
    if (sendingTimeoutRef.current) clearTimeout(sendingTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!messageMenuId) return;
    const closeOnOutside = (e) => {
      const menu = document.querySelector('.message-menu');
      if (menu && !menu.contains(e.target)) setMessageMenuId(null);
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [messageMenuId]);

  useEffect(() => {
    if (!showHeaderMenu) return;
    const close = (e) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target)) setShowHeaderMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showHeaderMenu]);

  useEffect(() => {
    if (!socket) return;
    const isMessageForThisChat = (msg) => {
      if (msg.recipientType !== recipientType) return false;
      if (recipientType === 'group') return String(msg.recipientId) === String(recipientId);
      return (
        (String(msg.senderId) === String(recipientId) && String(msg.recipientId) === String(currentUser?.id)) ||
        (String(msg.senderId) === String(currentUser?.id) && String(msg.recipientId) === String(recipientId))
      );
    };
    const onNew = (msg) => {
      if (!isMessageForThisChat(msg)) return;
      if (msg.senderId === currentUser?.id) {
        if (sendingTimeoutRef.current) {
          clearTimeout(sendingTimeoutRef.current);
          sendingTimeoutRef.current = null;
        }
        setSendingRef.current?.(false);
      }
      const handle = async () => {
        let next = msg;
        if (type === 'user') {
          try {
            const my = e2eKeysRef.current || (await ensureKeyPair());
            e2eKeysRef.current = my;
            const theirJwk = peer?.e2ePublicKey ? JSON.parse(peer.e2ePublicKey) : null;
            if (my && theirJwk && next.content && typeof next.content === 'string' && next.content.startsWith('e2e:')) {
              const plain = await decryptFromPeer(my.privateKey, theirJwk, next.content);
              next = { ...next, content: plain };
            }
          } catch (e) {
            console.error('E2E decrypt incoming failed', e);
          }
        }
        const withReactions = { ...next, reactions: next.reactions || {} };
        markMessageIn(withReactions.id);
        setMessages((prev) => (prev.some((m) => m.id === withReactions.id) ? prev : [...prev, withReactions]));
        const fx = getMessageFx(withReactions);
        if (fx && lastFxHandledRef.current !== withReactions.id) {
          lastFxHandledRef.current = withReactions.id;
          triggerImbaFxRef.current?.(fx, isMessageCritical(withReactions));
        }
      };
      handle();
    };
    const onReaction = ({ messageId, recipientType: rt, recipientId: rid, reactions: grouped }) => {
      if (rt !== recipientType || String(rid) !== String(recipientId)) return;
      const next = reactionsFromGrouped(grouped, currentUser?.id);
      setMessages((prev) => prev.map((m) => (String(m.id) === String(messageId) ? { ...m, reactions: next } : m)));
    };
    const onPinsUpdated = ({ recipientType: rt, recipientId: rid, pinned }) => {
      if (rt !== recipientType || String(rid) !== String(recipientId)) return;
      setPinnedMessages(Array.isArray(pinned) ? pinned : []);
    };
    const onPeerTyping = (p) => {
      if (p.recipientType !== recipientType || String(p.recipientId) !== String(recipientId)) return;
      if (p.userId === currentUser?.id) return;
      setTypingUsers((prev) => {
        const n = { ...prev };
        if (p.active) n[p.userId] = p.displayName || '…';
        else delete n[p.userId];
        return n;
      });
    };
    const onPresenceChanged = ({ userId, online, lastSeenAt, customStatusEmoji, customStatusText, customStatusMode }) => {
      if (type !== 'user' || !peer?.id || String(userId) !== String(peer.id)) return;
      setPresence((prev) => ({
        ...(prev || {}),
        online: !!online,
        lastSeenAt: lastSeenAt ?? (online ? null : Math.floor(Date.now() / 1000)),
        customStatusEmoji: customStatusEmoji ?? prev?.customStatusEmoji,
        customStatusText: customStatusText ?? prev?.customStatusText,
        customStatusMode: customStatusMode ?? prev?.customStatusMode,
      }));
    };
    const onStatusChanged = ({ userId, customStatusEmoji, customStatusText, customStatusMode }) => {
      if (type !== 'user' || !peer?.id || String(userId) !== String(peer.id)) return;
      setPresence((prev) => ({
        ...(prev || {}),
        customStatusEmoji: customStatusEmoji || '',
        customStatusText: customStatusText || '',
        customStatusMode: customStatusMode || 'online',
      }));
    };
    const onActivityChanged = ({ userId, activities }) => {
      if (type !== 'user' || !peer?.id || String(userId) !== String(peer.id)) return;
      const incoming = Array.isArray(activities) ? activities : [];
      const merged = mergePlaybackActivities(peerActivitiesRef.current, incoming);
      peerActivitiesRef.current = merged;
      setPresence((prev) => ({
        ...(prev || {}),
        activities: merged,
      }));
    };
    const onPinError = ({ message: msg }) => {
      setVoiceError(msg || 'Ошибка закрепления');
    };
    const onStarUpdated = ({ messageId, starred, recipientType: rt, recipientId: rid }) => {
      if (rt !== recipientType || String(rid) !== String(recipientId)) return;
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, starredMe: !!starred } : m));
    };
    const onUpdated = ({ messageId, content, editedAt, messageMeta, recipientType: rt, recipientId: rid }) => {
      if (rt !== recipientType || String(rid) !== String(recipientId)) return;
      setMessages((prev) => prev.map((m) => {
        if (m.id !== messageId) return m;
        const next = { ...m };
        if (content !== undefined) next.content = content;
        if (editedAt !== undefined) next.editedAt = editedAt;
        if (messageMeta !== undefined) next.messageMeta = messageMeta;
        return next;
      }));
      if (editingMessageId === messageId && content !== undefined) {
        setEditingMessageId(null);
        setEditingContent('');
      }
    };
    const onDeleted = ({ messageId, recipientType: rt, recipientId: rid }) => {
      if (rt !== recipientType || String(rid) !== String(recipientId)) return;
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, isDeleted: true, content: '', reactions: {} } : m));
    };
    const onSendError = ({ code, message, waitSec }) => {
      setSendingRef.current?.(false);
      if (code === 'channel_readonly') {
        setVoiceError(t('channelReadOnlyHint'));
        return;
      }
      if (code === 'slow_mode') {
        const sec = waitSec ?? (message?.match(/\d+/)?.[0] ?? '');
        setVoiceError(t('channelSlowModeWait').replace('{sec}', String(sec)));
        return;
      }
      setVoiceError(message === 'You are blocked by this user' ? t('sendErrorBlocked') : (message || t('sendErrorGeneric')));
    };
    const onVoiceMetaUpdated = ({ messageId, voiceMeta, recipientType: rt, recipientId: rid }) => {
      if (rt !== recipientType || String(rid) !== String(recipientId)) return;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, voiceMeta } : m)));
    };
    const onChannelPostViews = ({ groupId, updates }) => {
      if (String(groupId) !== String(recipientId)) return;
      if (!Array.isArray(updates)) return;
      setMessages((prev) => prev.map((m) => {
        const hit = updates.find((u) => String(u.messageId) === String(m.id));
        return hit ? { ...m, viewCount: hit.viewCount } : m;
      }));
    };
    socket.on('new_message', onNew);
    socket.on('message_updated', onUpdated);
    socket.on('message_deleted', onDeleted);
    socket.on('send_message_error', onSendError);
    socket.on('reaction_updated', onReaction);
    socket.on('pins_updated', onPinsUpdated);
    socket.on('peer_typing', onPeerTyping);
    socket.on('presence_changed', onPresenceChanged);
    socket.on('status_changed', onStatusChanged);
    socket.on('activity_changed', onActivityChanged);
    socket.on('pin_error', onPinError);
    socket.on('star_updated', onStarUpdated);
    socket.on('voice_meta_updated', onVoiceMetaUpdated);
    socket.on('channel_post_views', onChannelPostViews);
    return () => {
      socket.off('new_message', onNew);
      socket.off('message_updated', onUpdated);
      socket.off('message_deleted', onDeleted);
      socket.off('send_message_error', onSendError);
      socket.off('reaction_updated', onReaction);
      socket.off('pins_updated', onPinsUpdated);
      socket.off('peer_typing', onPeerTyping);
      socket.off('presence_changed', onPresenceChanged);
      socket.off('status_changed', onStatusChanged);
      socket.off('activity_changed', onActivityChanged);
      socket.off('pin_error', onPinError);
      socket.off('star_updated', onStarUpdated);
      socket.off('voice_meta_updated', onVoiceMetaUpdated);
      socket.off('channel_post_views', onChannelPostViews);
    };
  }, [socket, recipientType, recipientId, currentUser.id, editingMessageId, type, peer?.e2ePublicKey, markMessageIn]);

  useEffect(() => {
    prevLastMsgIdRef.current = null;
    setPendingBelow(0);
    setShowScrollDown(false);
  }, [recipientType, recipientId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      const nearBottom = dist < 120;
      setShowScrollDown(!nearBottom);
      if (nearBottom) setPendingBelow(0);
      if (el.scrollTop < 80) {
        loadOlder();
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [loadOlder]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    const lastId = lastMsg?.id;
    const prevLastId = prevLastMsgIdRef.current;
    const isNewAtEnd = prevLastId != null && lastId != null && lastId !== prevLastId;
    prevLastMsgIdRef.current = lastId;

    // Реакции, правки и прочие патчи не должны кидать в конец чата
    if (prevLastId != null && !isNewAtEnd) return;

    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const wasNearBottom = dist < 120;
    const lastFromSelf = lastMsg.senderId === currentUser.id;

    if (prevLastId == null || wasNearBottom || lastFromSelf) {
      el.scrollTo(0, el.scrollHeight);
      setPendingBelow(0);
      if (wasNearBottom || lastFromSelf || prevLastId == null) setShowScrollDown(false);
    } else if (isNewAtEnd) {
      setPendingBelow((n) => n + 1);
      setShowScrollDown(true);
    }
  }, [messages, currentUser.id]);

  useEffect(() => {
    if (pendingBelow <= prevPendingBelowRef.current) {
      prevPendingBelowRef.current = pendingBelow;
      return undefined;
    }
    prevPendingBelowRef.current = pendingBelow;
    setScrollDownBump(true);
    if (getNotificationsPlaySound()) playNewMessageSound();
    const t = window.setTimeout(() => setScrollDownBump(false), 600);
    return () => window.clearTimeout(t);
  }, [pendingBelow]);

  const scrollToBottom = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setPendingBelow(0);
    setShowScrollDown(false);
  };

  const uploadAndSendAttachment = async (file) => {
    if (!file || !socket || !recipientId) return;
    setUploadingAttachment(true);
    try {
      const path = await uploadAttachment(file);
      const payload = { recipientType, recipientId, content: input.trim(), attachmentPath: path };
      if (replyTo?.id) payload.replyToId = replyTo.id;
      socket.emit('send_message', payload);
      setInput('');
      setReplyTo(null);
    } catch (err) {
      console.error('Attachment upload failed:', err);
      setVoiceError(err.message || 'Не удалось отправить файл');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const onAttachmentSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !socket || !recipientId) return;
    e.target.value = '';
    await uploadAndSendAttachment(file);
  };

  const onGalleryImagePick = async () => {
    if (!connected || !socket || !recipientId || uploadingAttachment) return;
    const file = await pickImageFromGallery();
    if (!file || !file.type.startsWith('image/')) return;
    await uploadAndSendAttachment(file);
  };


  const openStickerBotChat = async () => {
    const botId = await resolveBotUserId('StickerBot', users);
    if (!botId) {
      setVoiceError(t('stickerBotNotFound'));
      return;
    }
    if (onOpenUserChat) {
      onOpenUserChat(botId);
      setShowStickerPicker(false);
    }
  };

  const openStickerPackPreview = (m) => {
    const meta = m.messageMeta || {};
    if (!meta.packId) return;
    setStickerPackPreview({
      packId: meta.packId,
      stickerId: meta.stickerId,
      path: m.attachmentPath,
      emoji: meta.emoji,
      mediaType: meta.mediaType || 'static',
    });
  };

  const sendSticker = (sticker) => {
    if (!canPost) return;
    if (!socket || !recipientId || !sticker?.id) return;
    const meta = {
      stickerId: sticker.id,
      packId: sticker.packId,
      emoji: sticker.emoji,
      mediaType: sticker.mediaType || 'static',
    };
    const optId = `opt-sticker-${Date.now()}`;
    markMessageIn(optId);
    setMessages((prev) => [
      ...prev,
      {
        id: optId,
        senderId: currentUser.id,
        senderName: currentUser.displayName,
        content: '',
        attachmentPath: sticker.filePath,
        messageType: 'sticker',
        messageMeta: meta,
        createdAt: Math.floor(Date.now() / 1000),
        reactions: {},
        isDeleted: false,
      },
    ]);
    socket.emit('send_message', { recipientType, recipientId, content: '', stickerId: sticker.id });
    setShowStickerPicker(false);
  };

  const send = () => {
    if (!canPostInChat(peer, type, currentUser)) return;
    const isChannelChat = type === 'group' && isChannelGroup(peer);
    const rawText = input.trim();
    const isForward = forwardMessage != null;
    if (!socket || !recipientId) return;
    if (!isForward && !rawText) return;

    if (!isForward) {
      const slash = resolveBuiltinSlash(rawText);
      if (slash.handled) {
        if (slash.openPoll) {
          setShowPollComposer(true);
          setInput('');
          return;
        }
        if (slash.openSchedule) {
          setShowScheduleComposer(true);
          setInput('');
          return;
        }
        // replace input content with resolved slash result and continue
        // (fall through with rewritten text)
      }
    }

    try {
      socket.emit('typing', { recipientType, recipientId, active: false });
    } catch {}
    if (typingEmitTimerRef.current) {
      clearTimeout(typingEmitTimerRef.current);
      typingEmitTimerRef.current = null;
    }
    if (sendingTimeoutRef.current) clearTimeout(sendingTimeoutRef.current);
    setSending(true);

    const slash = !isForward ? resolveBuiltinSlash(rawText) : { handled: false };
    const sourceText = slash.handled && slash.content != null ? slash.content : rawText;
    const forcedType = slash.handled && slash.messageType ? slash.messageType : null;

    const imbaOn = getAppSettings().uiImbaFx !== false && forcedType !== 'action';
    let { fx, text: parsedText } = imbaOn
      ? parseMessageFx(sourceText, selectedFx)
      : { fx: null, text: sourceText };
    let critical = false;
    if (imbaOn) {
      if (chargeArmedRef.current && !fx) fx = 'nova';
      else if (chargeArmedRef.current && fx && fx !== 'nova') {
        critical = true;
      }
      const rolled = rollCriticalHit(fx);
      if (rolled.critical) {
        fx = rolled.fx;
        critical = true;
      }
      if (chargeArmedRef.current && fx === 'nova') critical = true;
    }
    chargeArmedRef.current = false;
    setSendCharging(false);
    const text = parsedText;

    if (showScheduleComposer && scheduleAt) {
      const at = new Date(scheduleAt).getTime();
      if (Number.isFinite(at) && at > Date.now() + 5000) {
        addScheduledMessage({
          recipientType,
          recipientId,
          content: text,
          messageType: forcedType,
          messageMeta: fx ? { fx, ...(critical ? { critical: true } : {}) } : null,
          replyToId: replyTo?.id || null,
          sendAt: at,
        });
        setScheduledList(getScheduledForChat(recipientType, recipientId));
        setShowScheduleComposer(false);
        setScheduleAt('');
        setInput('');
        setReplyTo(null);
        setSending(false);
        showToast(t('scheduleQueued'));
        return;
      }
    }

    const payload = {
      recipientType,
      recipientId,
      content: text,
      replyToId: replyTo?.id || undefined,
    };
    if (forcedType) payload.messageType = forcedType;
    if (fx) {
      payload.messageMeta = { ...(payload.messageMeta || {}), fx, ...(critical ? { critical: true } : {}) };
    }
    if (isForward) {
      payload.forwardFromId = forwardMessage.senderId;
      payload.forwardFromName = forwardMessage.senderName || '';
      payload.forwardContent = forwardMessage.content || '';
      payload.forwardAttachmentPath = forwardMessage.attachmentPath || '';
      if (text) payload.content = text;
    }
    if (isChannelChat && silentPost) payload.isSilent = true;
    socket.emit('send_message', payload);
    if (getNotificationsPlaySound()) playSendSound();
    setSendBurst(true);
    window.setTimeout(() => setSendBurst(false), 450);
    if (fx) triggerImbaFx(fx, critical);
    if (imbaOn) {
      const now = Date.now();
      const prev = sendStreakRef.current;
      const nextCount = now - prev.at < 5000 ? prev.count + 1 : 1;
      sendStreakRef.current = { count: nextCount, at: now };
      if (nextCount >= 3) {
        const id = `streak-${now}`;
        setImbaStreak({ id, n: nextCount });
        window.setTimeout(() => setImbaStreak((s) => (s && s.id === id ? null : s)), 1350);
      }
    }
    setInput('');
    if (!fxSticky) setSelectedFx(null);
    saveDraft(recipientType, recipientId, '');
    setReplyTo(null);
    setForwardMessage(null);
    if (isChannelChat) setSilentPost(false);
    sendingTimeoutRef.current = setTimeout(() => {
      setSending(false);
      sendingTimeoutRef.current = null;
    }, 5000);
  };

  const quickReactions = QUICK_REACTIONS;
  const enableLargeEmoji = getEnableLargeEmoji();
  const isChannel = type === 'group' && isChannelGroup(peer);
  const canPost = canPostInChat(peer, type, currentUser);
  const showReactions = enableMessageReactions && (!isChannel || peer?.reactionsEnabled !== false);
  const channelAllowCopy = !isChannel || peer?.allowCopy !== false;
  const channelAllowForward = !isChannel || peer?.allowForward !== false;

  useEffect(() => {
    channelViewsSentRef.current = new Set();
  }, [recipientId]);

  useEffect(() => {
    if (!isChannel || !socket || !recipientId) return;
    const pending = messages
      .filter((m) => m.id && !String(m.id).startsWith('opt-') && !channelViewsSentRef.current.has(String(m.id)))
      .slice(-20)
      .map((m) => m.id);
    if (!pending.length) return;
    pending.forEach((id) => channelViewsSentRef.current.add(String(id)));
    socket.emit('channel_post_views', { groupId: recipientId, messageIds: pending });
  }, [messages, isChannel, socket, recipientId]);

  const toggleReaction = (messageId, emoji) => {
    if (!socket || !recipientId) return;
    if (getNotificationsPlaySound()) playReactionSound();
    markReactionPop(messageId, emoji);
    if (getAppSettings().uiImbaFx !== false) {
      const now = Date.now();
      const prev = reactionComboRef.current;
      const nextCount = now - prev.at < 1400 ? prev.count + 1 : 1;
      reactionComboRef.current = { count: nextCount, at: now };
      if (nextCount >= 2) {
        const id = `${now}-${nextCount}`;
        setImbaCombo({ id, n: nextCount, fx: emoji === '🔥' ? 'fire' : emoji === '❄️' ? 'ice' : 'party' });
        window.setTimeout(() => {
          setImbaCombo((c) => (c && c.id === id ? null : c));
        }, 1100);
        const tier = comboTierLabel(nextCount);
        if (tier) {
          const mid = `mega-${id}`;
          setImbaMega({ id: mid, n: nextCount, tier: tier.toLowerCase(), label: tier });
          window.setTimeout(() => setImbaMega((c) => (c && c.id === mid ? null : c)), 1350);
          if (nextCount >= 7) {
            try { burstNovaConfetti({ count: nextCount >= 10 ? 80 : 50 }); } catch (_) { /* ignore */ }
            setImbaShakeToken((n) => n + 1);
            setImbaOverload(true);
            window.setTimeout(() => setImbaOverload(false), 2000);
            if (nextCount >= 10) {
              setImbaStarfall(true);
              window.setTimeout(() => setImbaStarfall(false), 2500);
            }
          }
        }
      }
    }
    setMessages((prev) => prev.map((m) => (
      String(m.id) === String(messageId)
        ? { ...m, reactions: toggleReactionLocal(m.reactions, emoji, currentUser?.id) }
        : m
    )));
    socket.emit('toggle_reaction', { messageId, emoji, recipientType, recipientId });
  };

  reactDoubleTapRef.current = (msgId) => {
    if (!showReactions) return;
    toggleReaction(msgId, '❤️');
    setFloatingHearts((prev) => new Set(prev).add(String(msgId)));
    window.setTimeout(() => {
      setFloatingHearts((prev) => {
        const next = new Set(prev);
        next.delete(String(msgId));
        return next;
      });
    }, 750);
  };
  if (!doubleTapHandlerRef.current) {
    doubleTapHandlerRef.current = createDoubleTapHandler((id) => reactDoubleTapRef.current?.(id));
  }
  const handleMessageTap = (msgId) => doubleTapHandlerRef.current?.(String(msgId));

  const handleCall = (e) => {
    e.stopPropagation();
    if (!recipientId) return;
    if (type === 'user' && recipientId === currentUser?.id) return; // не звонить самому себе
    if (type === 'group') startGroupCall(recipientId);
    else startCall(recipientId);
  };

  const hasRecipient = recipientId != null && String(recipientId) !== '';
  const canCall = Boolean(
    connected &&
    hasRecipient &&
    canCallInChat(peer, type) &&
    (type !== 'user' || String(recipientId) !== String(currentUser?.id))
  );

  const startRecording = async () => {
    if (!canPost) return;
    if (!connected || !recipientId || recording) return;
    recordPendingRef.current = true;
    setLiveWavePeaks([]);
    setLiveTranscript('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: getAudioConstraintsForMic() });
      if (!recordPendingRef.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      recordStreamRef.current = stream;

      const analyserPack = createLiveAnalyser(stream);
      liveAnalyserRef.current = analyserPack;
      if (analyserPack) {
        const tick = () => {
          if (!liveAnalyserRef.current) return;
          setLiveWavePeaks(readAnalyserPeaks(analyserPack.analyser, analyserPack.barCount));
          liveAnimRef.current = requestAnimationFrame(tick);
        };
        liveAnimRef.current = requestAnimationFrame(tick);
      }

      const lang = detectBrowserLang();
      const st = createSpeechTranscriber({
        lang: lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : `${lang}-${lang.toUpperCase()}`,
        onPartial: (final, interim) => setLiveTranscript(final || interim || ''),
      });
      speechTranscriberRef.current = st;
      st?.start();

      recordChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined });
      const recordedMimeType = mr.mimeType || mimeType;
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const wasCancel = cancelVoiceRef.current;
        if (wasCancel) cancelVoiceRef.current = false;
        if (liveAnimRef.current) cancelAnimationFrame(liveAnimRef.current);
        liveAnimRef.current = null;
        if (liveAnalyserRef.current?.ctx) {
          try { await liveAnalyserRef.current.ctx.close(); } catch (_) { /* ignore */ }
        }
        liveAnalyserRef.current = null;
        const clientTranscript = speechTranscriberRef.current?.stop() || liveTranscript;
        speechTranscriberRef.current = null;

        stream.getTracks().forEach((tr) => tr.stop());
        recordStreamRef.current = null;
        setRecording(false);
        setRecordSeconds(0);
        setLiveWavePeaks([]);
        setLiveTranscript('');
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        const chunks = recordChunksRef.current;
        recordChunksRef.current = [];
        if (!chunks.length) {
          if (!wasCancel) {
            setVoiceError('Запись пуста. Разрешите доступ к микрофону и попробуйте снова.');
          }
          return;
        }
        const blob = new Blob(chunks, { type: recordedMimeType });
        if (blob.size === 0) {
          if (!wasCancel) setVoiceError('Запись пуста. Попробуйте ещё раз.');
          return;
        }
        if (wasCancel) {
          playVoiceRecordCancel();
          return;
        }
        try {
          setVoiceError(null);
          const { peaks, durationSec } = await extractWaveformPeaks(blob);
          const { path, voiceMeta } = await uploadVoice(blob, {
            peaks,
            durationSec,
            transcript: clientTranscript,
            lang: detectBrowserLang(),
          });
          if (socket && recipientId) {
            const payload = { recipientType, recipientId, content: '', voicePath: path, voiceMeta };
            if (replyTo?.id) payload.replyToId = replyTo.id;
            socket.emit('send_message', payload);
          }
          playVoiceSend();
        } catch (err) {
          console.error('Voice upload failed:', err);
          setVoiceError(err.message || 'Не удалось отправить голосовое');
        }
      };
      mr.onerror = (e) => {
        console.error('MediaRecorder error:', e.error);
        setVoiceError(e.error?.message || 'Ошибка записи');
      };
      mr.start(250);
      setRecording(true);
      playVoiceRecordStart();
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (err) {
      console.error('Microphone access failed:', err);
      recordPendingRef.current = false;
      setVoiceError(err.message || 'Нет доступа к микрофону. Разрешите в настройках браузера.');
    }
  };

  const stopRecording = () => {
    recordPendingRef.current = false;
    const mr = mediaRecorderRef.current;
    if (!recording || !mr) return;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    if (mr.state === 'recording') {
      mr.requestData();
      mr.stop();
    }
    mediaRecorderRef.current = null;
  };

  const cancelRecording = () => {
    if (!recording) return;
    cancelVoiceRef.current = true;
    stopRecording();
  };

  const forwardPickItems = useMemo(() => {
    const q = forwardSearch.trim().toLowerCase();
    const userItems = (users || []).map((u) => ({
      key: `u-${u.id}`,
      target: { type: 'user', id: u.id },
      title: contactNames?.[u.id] || u.displayName || u.login,
      subtitle: u.login ? `@${u.login}` : '',
      avatarPath: u.avatarPath,
      userId: u.id,
      isGroup: false,
    }));
    const groupItems = (groups || []).map((g) => ({
      key: `g-${g.id}`,
      target: { type: 'group', id: g.id },
      title: g.name,
      subtitle: 'Группа',
      isGroup: true,
    }));
    const all = [...userItems, ...groupItems];
    if (!q) return all;
    return all.filter((item) => `${item.title} ${item.subtitle}`.toLowerCase().includes(q));
  }, [users, groups, forwardSearch, contactNames]);

  const handleForwardPick = (target) => {
    const msg = forwardPickMessage;
    if (!msg) return;
    const curType = type === 'group' ? 'group' : 'user';
    const same = String(target.id) === String(recipientId) && target.type === curType;
    if (same) {
      setForwardMessage(msg);
    } else {
      onForwardChoose?.(target, msg);
    }
    setForwardPickerOpen(false);
    setForwardPickMessage(null);
    setForwardSearch('');
  };

  const closeForwardPicker = () => {
    setForwardPickerOpen(false);
    setForwardPickMessage(null);
    setForwardSearch('');
  };

  const toggleSelectId = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const jumpToDate = useCallback(async () => {
    if (!recipientId || !jumpDateValue) return;
    const ts = Math.floor(new Date(`${jumpDateValue}T12:00:00`).getTime() / 1000);
    if (!Number.isFinite(ts)) return;
    setShowJumpDate(false);
    try {
      const data = await getMessages(type, recipientId, { limit: 120, around: ts });
      const list = data.messages || [];
      setMessages(list);
      setHasMoreHistory(data.hasMore !== false);
      if (list.length) {
        oldestCreatedAtRef.current = Math.min(...list.map((m) => m.createdAt || Infinity));
      }
      const focusId = data.aroundId || list[0]?.id;
      if (focusId) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            document.getElementById(`chat-msg-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            flashMessage(focusId);
          }, 80);
        });
      }
    } catch (e) {
      showToast(t('jumpToDateFail'));
    }
  }, [recipientId, jumpDateValue, type, flashMessage, showToast]);

  const sendPoll = useCallback(() => {
    if (!socket || !recipientId || !canPost) return;
    const question = pollQuestion.trim();
    const options = pollOptionsText.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 10);
    if (!question || options.length < 2) {
      showToast(t('pollNeedOptions'));
      return;
    }
    socket.emit('send_message', {
      recipientType,
      recipientId,
      content: question,
      messageType: 'poll',
      messageMeta: { options, multi: pollMulti },
    });
    setShowPollComposer(false);
    setPollQuestion('');
    setPollOptionsText('Да\nНет');
    setPollMulti(false);
    playSendSound();
  }, [socket, recipientId, canPost, pollQuestion, pollOptionsText, pollMulti, recipientType, showToast]);

  const votePoll = useCallback((messageId, optionIndex) => {
    socket?.emit('vote_poll', { messageId, optionIndex });
  }, [socket]);

  const batchCopySelected = useCallback(async () => {
    const texts = messages
      .filter((m) => selectedIds.has(m.id) && !m.isDeleted && m.content)
      .map((m) => m.content);
    if (!texts.length) return;
    const ok = await copyToClipboard(texts.join('\n\n'));
    showToast(ok ? t('copied') : '…');
  }, [messages, selectedIds, showToast]);

  const batchForwardSelected = useCallback(() => {
    const first = messages.find((m) => selectedIds.has(m.id) && !m.isDeleted);
    if (!first) return;
    setForwardPickMessage(first);
    setForwardPickerOpen(true);
    exitSelectMode();
  }, [messages, selectedIds, exitSelectMode]);

  const batchStarSelected = useCallback(() => {
    selectedIds.forEach((id) => {
      socket?.emit('toggle_star', { messageId: id, recipientType, recipientId });
    });
    exitSelectMode();
  }, [selectedIds, socket, recipientType, recipientId, exitSelectMode]);

  const saveToSavedMessages = useCallback((m) => {
    if (!socket || !currentUser?.id || !m) return;
    socket.emit('send_message', {
      recipientType: 'user',
      recipientId: currentUser.id,
      content: '',
      forwardFromId: m.senderId,
      forwardFromName: m.senderName || '',
      forwardContent: m.content || '',
      forwardAttachmentPath: m.attachmentPath || '',
    });
    showToast(t('savedToSaved'));
  }, [socket, currentUser?.id, showToast]);

  const translateMessage = useCallback(async (m) => {
    const id = String(m.id);
    const raw = displayMessageContent(m);
    if (!raw || typeof raw !== 'string' || raw.startsWith('e2e:')) {
      showToast(t('translateFail'));
      return;
    }
    if (msgTranslations[id]?.text) {
      setMsgTranslations((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    setMsgTranslations((prev) => ({ ...prev, [id]: { loading: true } }));
    try {
      const to = getStoredLang() === 'en' ? 'en' : 'ru';
      const data = await translateText(raw.slice(0, 4500), to);
      setMsgTranslations((prev) => ({
        ...prev,
        [id]: { text: data.text || '', loading: false },
      }));
    } catch {
      setMsgTranslations((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      showToast(t('translateFail'));
    }
  }, [msgTranslations, showToast]);

  const jumpToFirstUnread = useCallback(() => {
    if (!initialUnreadCount || initialUnreadCount <= 0 || !messages.length) return;
    const idx = Math.max(0, messages.length - initialUnreadCount);
    const id = messages[idx]?.id;
    if (!id) return;
    document.getElementById(`chat-msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flashMessage(id);
  }, [initialUnreadCount, messages, flashMessage]);

  const profileTargetUser = profileUser || (type === 'user' ? peer : null);
  const showChatProfileTop = getAppSettings().uiShowChatProfileTop === true;
  const peerTyping = Object.keys(typingUsers).length > 0;

  return (
    <div className={`chat-view${showUserProfile && profileTargetUser ? ' chat-view--profile' : ''}${chatEntering ? ' chat-view--entering' : ''}${imbaFlash || imbaShakeToken ? ' chat-view--fx-impact' : ''}${imbaOverload ? ' chat-view--overload' : ''}`}>
      <header className={`chat-header${peerTyping ? ' chat-header--peer-typing' : ''}`}>
        {onCycleChatList && (
          <button
            type="button"
            className="btn-icon btn-chat-list-toggle"
            onClick={onCycleChatList}
            title={
              chatListMode === 'hidden'
                ? t('chatListShow')
                : chatListMode === 'narrow'
                  ? t('chatListHide')
                  : t('chatListNarrow')
            }
            aria-label={t('chatListToggle')}
          >
            <span className={`icon-chat-list-toggle icon-chat-list-toggle--${chatListMode}`} aria-hidden />
          </button>
        )}
        <button type="button" className="btn-icon btn-back" onClick={onBack} aria-label="Back">
          <span className="icon-back" />
        </button>
        {type === 'user' ? (
          <div className="header-menu-wrap" ref={headerMenuRef}>
            <button
              type="button"
              className="btn-icon btn-menu"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setShowHeaderMenu((v) => !v); }}
              onClick={(e) => { e.stopPropagation(); }}
              aria-label="Меню"
              title="Меню"
            >
              <span className="icon-menu" />
            </button>
            {showHeaderMenu && (
              <div className="header-menu-dropdown">
                <button type="button" className="header-menu-item" onClick={() => { openChatSearch(); setShowHeaderMenu(false); }}>
                  {t('chatSearch')}
                </button>
                <button
                  type="button"
                  className="header-menu-item"
                  onClick={() => {
                    setShowJumpDate(true);
                    setShowHeaderMenu(false);
                  }}
                >
                  {t('jumpToDate')}
                </button>
                <button
                  type="button"
                  className="header-menu-item"
                  onClick={() => {
                    setSelectMode(true);
                    setSelectedIds(new Set());
                    setShowHeaderMenu(false);
                  }}
                >
                  {t('selectMessages')}
                </button>
                <button
                  type="button"
                  className="header-menu-item"
                  onClick={async () => {
                    setShowHeaderMenu(false);
                    setShowStarredPanel(true);
                    setStarredLoading(true);
                    try {
                      const rows = await getStarredMessages(80);
                      setStarredList(rows);
                    } catch {
                      setStarredList([]);
                    } finally {
                      setStarredLoading(false);
                    }
                  }}
                >
                  {t('starredMessages')}
                </button>
                {typeof isArchived === 'boolean' && (
                  <button
                    type="button"
                    className="header-menu-item"
                    onClick={() => {
                      if (isArchived) onUnarchiveChat?.();
                      else onArchiveChat?.();
                      setShowHeaderMenu(false);
                    }}
                  >
                    {isArchived ? 'Вернуть из архива' : 'Архивировать чат'}
                  </button>
                )}
                <button type="button" className="header-menu-item" onClick={() => { onOpenSettings?.(); setShowHeaderMenu(false); }}>
                  {t('settings')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="header-menu-wrap" ref={headerMenuRef}>
            <button
              type="button"
              className="btn-icon btn-menu"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setShowHeaderMenu((v) => !v); }}
              onClick={(e) => { e.stopPropagation(); }}
              aria-label="Меню"
              title="Меню"
            >
              <span className="icon-menu" />
            </button>
            {showHeaderMenu && (
              <div className="header-menu-dropdown">
                <button type="button" className="header-menu-item" onClick={() => { openChatSearch(); setShowHeaderMenu(false); }}>
                  {t('chatSearch')}
                </button>
                <button type="button" className="header-menu-item" onClick={() => { setShowJumpDate(true); setShowHeaderMenu(false); }}>
                  {t('jumpToDate')}
                </button>
                <button
                  type="button"
                  className="header-menu-item"
                  onClick={() => {
                    setSelectMode(true);
                    setSelectedIds(new Set());
                    setShowHeaderMenu(false);
                  }}
                >
                  {t('selectMessages')}
                </button>
                <button
                  type="button"
                  className="header-menu-item"
                  onClick={async () => {
                    setShowHeaderMenu(false);
                    setShowStarredPanel(true);
                    setStarredLoading(true);
                    try {
                      const rows = await getStarredMessages(80);
                      setStarredList(rows);
                    } catch {
                      setStarredList([]);
                    } finally {
                      setStarredLoading(false);
                    }
                  }}
                >
                  {t('starredMessages')}
                </button>
              </div>
            )}
          </div>
        )}
        <div
          className="chat-header-peer"
          onClick={() => {
            if (type === 'group') setShowGroupEdit(true);
            else if (type === 'user' && peer) {
              setProfileUser(null);
              setShowUserProfile(true);
            }
          }}
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            if (type === 'group') setShowGroupEdit(true);
            else if (type === 'user' && peer) {
              setProfileUser(null);
              setShowUserProfile(true);
            }
          }}
        >
          {type === 'user' && (
            <img
              className="avatar-sm"
              src={avatarUrl(peer?.avatarPath) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${peer?.id}`}
              alt=""
            />
          )}
          {type === 'group' && (
            peer?.avatarPath ? (
              <img
                className="avatar-sm"
                src={avatarUrl(peer?.avatarPath)}
                alt=""
              />
            ) : (
              <span className="chat-header-group-icon">{isChannel ? '📢' : '#'}</span>
            )
          )}
            <div className="chat-header-name-wrap">
              <span className="chat-header-name">
                {displayName}
                {isVerifiedPeer && <span className="verify-badge verify-badge-inline">✔</span>}
              </span>
            {type === 'user' && (
              <span className={`chat-header-presence${formatCustomStatusLine(presence) ? ' chat-header-presence--custom' : ''}`}>
                {presence === null
                  ? null
                  : formatCustomStatusLine(presence)
                    ? formatCustomStatusLine(presence)
                    : presence.online
                      ? t('statusOnline')
                      : presence.hideLastSeen && presence.lastSeenAt == null
                        ? t('statusLastSeenRecent')
                        : formatLastSeen(presence.lastSeenAt) != null
                          ? `${t('statusLastSeenWhen')} ${formatLastSeen(presence.lastSeenAt)}`
                          : t('statusLastSeenRecent')}
              </span>
            )}
            {type === 'user' && presence?.online && presence?.activities?.length > 0 && (
              <UserActivityOverlay activities={presence.activities} t={t} compact inline />
            )}
          </div>
        </div>
        <div className="chat-header-actions">
          {type === 'group' && (
            <button
              type="button"
              className={`btn-icon${showMembersPanel ? ' active' : ''}`}
              onClick={() => setShowMembersPanel((v) => !v)}
              title={t('membersPanel')}
              aria-label={t('membersPanel')}
            >
              <span aria-hidden>👥</span>
            </button>
          )}
          <button
            type="button"
            className="btn-icon"
            onClick={openChatSearch}
            title="Поиск в чате"
            aria-label="Поиск в чате"
          >
            <span aria-hidden>🔎</span>
          </button>
          {typeof isArchived === 'boolean' && (
            <button
              type="button"
              className="btn-icon"
              onClick={() => { if (isArchived) onUnarchiveChat?.(); else onArchiveChat?.(); }}
              title={isArchived ? 'Вернуть из архива' : 'Архивировать'}
              aria-label={isArchived ? 'Вернуть из архива' : 'Архивировать'}
            >
              <span aria-hidden>{isArchived ? '📥' : '📦'}</span>
            </button>
          )}
          <div className="chat-mute-wrap">
            <button
              type="button"
              className={`btn-icon chat-mute-toggle ${chatMuted ? 'active' : ''}`}
              onClick={() => setMuteMenuOpen((v) => !v)}
              title={chatMuted ? t('chatUnmute') : t('chatMute')}
              aria-label={chatMuted ? t('chatUnmute') : t('chatMute')}
            >
              <span aria-hidden>{chatMuted ? '🔕' : '🔔'}</span>
            </button>
            {muteMenuOpen && (
              <div className="chat-mute-menu">
                {chatMuted ? (
                  <button
                    type="button"
                    onClick={() => {
                      toggleChatMuted(recipientType, recipientId);
                      setChatMuted(false);
                      setMuteMenuOpen(false);
                    }}
                  >
                    {t('chatUnmute')}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        persistChatMuted(recipientType, recipientId, { until: Date.now() + 3600e3, hideBadge: true });
                        setChatMuted(true);
                        setMuteMenuOpen(false);
                      }}
                    >
                      {t('chatMute1h')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        persistChatMuted(recipientType, recipientId, { until: Date.now() + 8 * 3600e3, hideBadge: true });
                        setChatMuted(true);
                        setMuteMenuOpen(false);
                      }}
                    >
                      {t('chatMute8h')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        persistChatMuted(recipientType, recipientId, { until: null, hideBadge: true });
                        setChatMuted(true);
                        setMuteMenuOpen(false);
                      }}
                    >
                      {t('chatMuteForever')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        persistChatMuted(recipientType, recipientId, { until: null, hideBadge: false });
                        setChatMuted(true);
                        setMuteMenuOpen(false);
                      }}
                    >
                      {t('chatMuteKeepBadge')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <span
            className={`status-dot ${connected ? 'online' : ''}`}
            title={connected ? 'Подключено' : 'Отключено'}
          />
          {type === 'group' && (
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowGroupEdit(true)}
                title="Настройки группы"
                aria-label="Настройки группы"
              >
              <span className="icon-settings" />
            </button>
          )}
          <button
            type="button"
            className="btn-call"
            onClick={handleCall}
            disabled={!canCall || (type === 'group' && activeCall?.groupId === recipientId)}
            title={
              !connected
                ? t('callConnectToServer')
                : type === 'group' && activeCall?.groupId === recipientId
                  ? t('callAlreadyInCall')
                  : type === 'group' && activeGroupCallIds[recipientId]
                    ? t('callJoin')
                    : type === 'group'
                      ? t('callGroupButton')
                      : t('callButton')
            }
            aria-label={
              type === 'group' && activeCall?.groupId === recipientId
                ? t('callInCall')
                : type === 'group' && activeGroupCallIds[recipientId]
                  ? t('callJoin')
                  : type === 'group'
                    ? t('callGroupButton')
                    : t('callButton')
            }
          >
            <span className="icon-call" />
            {type === 'group' && activeCall?.groupId === recipientId
              ? t('callInCall')
              : type === 'group' && activeGroupCallIds[recipientId]
                ? t('callJoin')
                : type === 'group'
                  ? t('callGroupButton')
                  : t('callShort')}
          </button>
        </div>
      </header>

      {!isMediaCallSupportedInThisPage() && (
        <div className="chat-insecure-call-hint" role="status">
          {t('callInsecureContextHint')}
        </div>
      )}

      {showChatProfileTop && type === 'user' && peer && !showUserProfile && (
        <ChatDmProfilePanel
          peer={peer}
          currentUser={currentUser}
          presence={presence}
          displayName={displayName}
          isVerified={isVerifiedPeer}
          onViewFullProfile={() => {
            setProfileUser(null);
            setShowUserProfile(true);
          }}
        />
      )}

      {showChatProfileTop && type === 'group' && peer && !showUserProfile && (
        <ChatGroupProfilePanel
          peer={peer}
          memberCount={typeof peer.memberCount === 'number' ? peer.memberCount : undefined}
          onOpenGroupSettings={() => setShowGroupEdit(true)}
        />
      )}

      {pinnedMessages.length > 0 && (
        <div className="chat-pinned-bar" role="region" aria-label="Закреплённые сообщения">
          {pinnedMessages.map((p) => (
            <button
              key={p.id}
              type="button"
              className="chat-pinned-chip"
              onClick={() => {
                const el = document.getElementById(`chat-msg-${p.id}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                flashMessage(p.id);
              }}
            >
              📌 {p.senderName}: {p.isDeleted ? '…' : ((p.content && p.content.slice(0, 52)) || (p.attachmentPath ? '(файл)' : '…'))}
            </button>
          ))}
        </div>
      )}
      {Object.keys(typingUsers).length > 0 && (
        <div className="chat-typing-bar" aria-live="polite">
          <span className="typing-text">
            {Object.keys(typingUsers).length === 1
              ? `${Object.values(typingUsers)[0]} ${t('typingOne')}`
              : `${Object.keys(typingUsers).length} ${t('typingMany')}`}
          </span>
          <span className="typing-dots" aria-hidden="true">
            <span /><span /><span />
          </span>
        </div>
      )}

      <div
        className={`message-list-outer${messageListBackgroundStyle ? ' has-group-background' : ''}`}
        style={messageListBackgroundStyle}
      >
        {getAppSettings().uiImbaFx !== false && (
          <ImbaChatEffects
            shake={imbaShakeToken}
            flash={imbaFlash}
            rain={imbaRain}
            starfall={imbaStarfall}
            overload={imbaOverload}
            mood={chatMood}
          />
        )}
        <div className="message-list" ref={listRef}>
        {(loadingOlder || hasMoreHistory) && (
          <div className="chat-history-top">
            {loadingOlder ? 'Загрузка…' : (hasMoreHistory ? 'Потяни вверх, чтобы загрузить ещё' : null)}
          </div>
        )}
        {messagesBootstrapping ? (
          <div className="chat-messages-loading" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`chat-message-skeleton${i % 2 ? ' own' : ''}`} style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="skeleton-avatar" />
                <div className="chat-message-skeleton-bubble" style={{ width: `${48 + (i % 3) * 14}%` }} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">{isChannel ? '📢' : '💬'}</div>
            <h3>{isChannel ? t('chatEmptyChannelTitle') : t('chatEmptyTitle')}</h3>
            <p>{isChannel ? t('chatEmptyChannelHint') : t('chatEmptyHint')}</p>
            <div className="chat-empty-actions">
              {showReactions && <span className="chat-empty-chip">❤️ {t('welcomeTipReact')}</span>}
              {canPost && <span className="chat-empty-chip">✉️ {t('chatEmptySayHi')}</span>}
              {isChannel && !canPost && <span className="chat-empty-chip">👀 {t('chatEmptyReadOnly')}</span>}
            </div>
          </div>
        ) : null}
        {messages.map((m, i) => {
          const showDate = i === 0 || formatDateDay(m.createdAt) !== formatDateDay(messages[i - 1].createdAt);
          const prevMsg = i > 0 ? messages[i - 1] : null;
          const grouped = isMessageGrouped(m, prevMsg, showDate);
          const unreadDividerHere = initialUnreadCount > 0
            && i === Math.max(0, messages.length - initialUnreadCount);
          const largeEmoji = enableLargeEmoji && !m.isDeleted && !m.attachmentPath && isLargeEmojiText(displayMessageContent(m));
          const channelPost = isChannel && m.postedAsChannel !== false && peer?.postAsChannel !== false;
          const viewsLabel = (() => {
            const n = Number(m.viewCount) || 0;
            if (n <= 0) return '';
            const word = n === 1 ? t('channelViewsOne') : t('channelViews');
            return `${n} ${word}`;
          })();
          if (m.messageType === 'call_ended') {
            const timeStr = new Date(m.createdAt * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const durationStr = formatCallDuration(m.callDurationSec);
            return (
              <React.Fragment key={m.id}>
                {showDate && (
                  <div className="message-date-separator">{formatDateDay(m.createdAt)}</div>
                )}
                {unreadDividerHere && (
                  <div className="message-unread-separator" role="separator">{t('unreadDivider')}</div>
                )}
                <div className="message message-call-ended-wrap">
                  <div className="message-call-ended">
                    <div className="message-call-ended-text">
                      <strong>{m.senderName || 'Участник'}</strong> завершил звонок
                    </div>
                    <div className="message-call-ended-meta">
                      <span className="message-call-ended-icon" aria-hidden />
                      {timeStr}, {durationStr}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          }
          if (m.messageType === 'action' && !m.isDeleted) {
            return (
              <React.Fragment key={m.id}>
                {showDate && (
                  <div className="message-date-separator">{formatDateDay(m.createdAt)}</div>
                )}
                {unreadDividerHere && (
                  <div className="message-unread-separator" role="separator">{t('unreadDivider')}</div>
                )}
                <div className="message message-action-wrap">
                  <div className="message-action">
                    <em>* {m.senderName || '…'} {m.content} *</em>
                    <time>{new Date(m.createdAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                  </div>
                </div>
              </React.Fragment>
            );
          }
          return (
          <React.Fragment key={m.id}>
            {showDate && (
              <div className="message-date-separator">{formatDateDay(m.createdAt)}</div>
            )}
            {unreadDividerHere && (
              <div className="message-unread-separator" role="separator">{t('unreadDivider')}</div>
            )}
          <div id={`chat-msg-${m.id}`} className={`message ${m.senderId === currentUser.id ? 'own' : ''}${grouped ? ' message--grouped' : ''}${isStickerMessage(m) ? ' message-sticker-msg' : ''}${animatingMsgIds.has(String(m.id)) ? ' message-in' : ''}${highlightMsgId === String(m.id) ? ' message-highlight' : ''}${channelPost ? ' message--channel-post' : ''}${getMessageFx(m) ? ` message-fx--${getMessageFx(m)}` : ''}${isMessageCritical(m) ? ' message-fx--critical' : ''}${vanishingIds.has(String(m.id)) ? ' message-vanishing' : ''}${selectMode && selectedIds.has(m.id) ? ' message--selected' : ''}`}>
            {selectMode && !m.isDeleted && (
              <label className="message-select-check" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(m.id)}
                  onChange={() => toggleSelectId(m.id)}
                />
              </label>
            )}
            {(m.senderId !== currentUser.id || channelPost) && (
              grouped ? (
                <span className="message-avatar-spacer" aria-hidden />
              ) : (
              <img
                className={`avatar-sm message-avatar${channelPost ? ' message-avatar--channel' : ''}`}
                src={avatarUrl(m.senderAvatar) || (channelPost && peer?.avatarPath ? avatarUrl(peer.avatarPath) : null) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${channelPost ? recipientId : m.senderId}`}
                alt=""
                onClick={async () => {
                  try {
                    const users = await getUsers();
                    const user = users.find(u => u.id === m.senderId);
                    if (user) {
                      setProfileUser(user);
                      setShowUserProfile(true);
                    }
                  } catch (err) {
                    console.error('Failed to load user:', err);
                  }
                }}
                style={{ cursor: 'pointer' }}
              />
              )
            )}
            <div className="message-body" onClick={() => handleMessageTap(m.id)}>
              {isMessageCritical(m) && animatingMsgIds.has(String(m.id)) && (
                <span className="message-critical-stamp" aria-hidden>CRIT</span>
              )}
              {floatingHearts.has(String(m.id)) && (
                <span className="message-heart-float" aria-hidden>❤️</span>
              )}
              {showReactions && !m.isDeleted && (
                <div className="message-quick-react" aria-hidden="true">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={`message-quick-react-btn ${reactionIsActive(m.reactions, emoji) ? 'active' : ''}`}
                      title={emoji}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleReaction(m.id, emoji);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              {channelPost && !grouped && (
                <span className="message-sender message-sender--channel">{m.senderName || peer?.name}</span>
              )}
              {channelPost && m.authorName && !grouped && (
                <span className="message-channel-via">{t('channelAuthorVia').replace('{name}', m.authorName)}</span>
              )}
              {!channelPost && m.senderId !== currentUser.id && type === 'group' && !isStickerMessage(m) && !grouped && (
                <span className="message-sender" style={{ color: nameColor(m.senderId) }}>{m.senderName}</span>
              )}
              {!channelPost && m.senderId !== currentUser.id && type === 'group' && isStickerMessage(m) && !grouped && (
                <span className="message-sender message-sender-sticker" style={{ color: nameColor(m.senderId) }}>{m.senderName}</span>
              )}
              {isStickerMessage(m) ? (
                <div
                  className="message-sticker-wrap"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMessageMenuId(m.id);
                    menuCloseRef.current = () => setMessageMenuId(null);
                  }}
                >
                  <MessageSticker
                    path={m.attachmentPath}
                    animated={isAnimatedSticker(m)}
                    emoji={m.messageMeta?.emoji}
                    autoplayGif={getBatteryGifAutoplay()}
                    interactive
                    onClick={() => {
                      if (m.messageMeta?.packId) {
                        openStickerPackPreview(m);
                      }
                    }}
                  />
                  <time className="message-sticker-time">
                    {new Date(m.createdAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {type === 'user' && m.senderId === currentUser.id && (
                      <span
                        className={`message-read-ticks ${peerLastReadAt != null && m.createdAt <= peerLastReadAt ? 'read' : ''}`}
                        title={peerLastReadAt != null && m.createdAt <= peerLastReadAt ? 'Прочитано' : 'Доставлено'}
                      >
                        {peerLastReadAt != null && m.createdAt <= peerLastReadAt ? ' ✓✓' : ' ✓'}
                      </span>
                    )}
                  </time>
                </div>
              ) : (
              <div
                className={`message-bubble ${m.attachmentPath && isVoiceAttachment(m.attachmentPath) ? 'message-bubble-voice' : ''} ${m.isDeleted ? 'message-bubble-deleted' : ''} ${largeEmoji ? 'message-bubble-large-emoji' : ''}${copiedBubbleId === m.id ? ' message-bubble--copied' : ''}${channelPost ? ' message-bubble--channel' : ''}`}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMessageMenuId(m.id);
                  menuCloseRef.current = () => setMessageMenuId(null);
                }}
                onDoubleClick={async () => {
                  if (m.isDeleted || !m.content || typeof m.content !== 'string' || m.content.startsWith('e2e:')) return;
                  if (!channelAllowCopy) {
                    showToast(t('channelAllowCopyHint'));
                    return;
                  }
                  const ok = await copyToClipboard(m.content);
                  if (ok) {
                    setCopiedBubbleId(m.id);
                    window.setTimeout(() => setCopiedBubbleId(null), 520);
                    showToast(t('copied'));
                  }
                }}
              >
                {m.forwardFromName && (
                  <div className="message-forward-label">Переслано от {m.forwardFromName}</div>
                )}
                {m.replyToId && (m.replyToContent != null || m.replyToSenderName) && (
                  <button
                    type="button"
                    className="message-reply-preview"
                    onClick={() => {
                      const el = document.getElementById(`chat-msg-${m.replyToId}`);
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      flashMessage(m.replyToId);
                    }}
                  >
                    <span className="message-reply-sender">{m.replyToSenderName || '—'}</span>
                    <span className="message-reply-content">
                      {typeof m.replyToContent === 'string' && m.replyToContent && !m.replyToContent.startsWith('e2e:') ? (
                        <MessageFormattedText text={m.replyToContent} mentionUsers={mentionUsers} onMentionClick={handleMentionClick} />
                      ) : (
                        m.replyToContent || '(медиа)'
                      )}
                    </span>
                  </button>
                )}
                {m.isDeleted ? (
                  <p className="message-content message-content-deleted">Сообщение удалено</p>
                ) : editingMessageId === m.id ? (
                  <div className="message-edit-inline">
                    <input
                      type="text"
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (editingContent.trim() && socket) {
                            socket.emit('edit_message', { messageId: m.id, content: editingContent.trim() });
                            setEditingMessageId(null);
                            setEditingContent('');
                          }
                        }
                        if (e.key === 'Escape') {
                          setEditingMessageId(null);
                          setEditingContent('');
                        }
                      }}
                      autoFocus
                    />
                    <button type="button" className="btn-edit-save" onClick={() => {
                      if (editingContent.trim() && socket) {
                        socket.emit('edit_message', { messageId: m.id, content: editingContent.trim() });
                        setEditingMessageId(null);
                        setEditingContent('');
                      }
                    }}>Сохранить</button>
                    <button type="button" className="btn-edit-cancel" onClick={() => { setEditingMessageId(null); setEditingContent(''); }}>Отмена</button>
                  </div>
                ) : m.messageType === 'poll' && !m.isDeleted ? (
                  <PollMessage
                    message={m}
                    currentUserId={currentUser.id}
                    onVote={votePoll}
                    disabled={!canPost}
                  />
                ) : m.attachmentPath ? (
                  isVoiceAttachment(m.attachmentPath) ? (
                    <VoiceMessage
                      src={avatarUrl(m.attachmentPath)}
                      isOwn={m.senderId === currentUser.id}
                      messageId={m.id}
                      voiceMeta={m.voiceMeta}
                      durationSec={m.voiceMeta?.durationSec}
                      onVoiceMetaUpdate={(id, meta) => {
                        setMessages((prev) => prev.map((msg) => (msg.id === id ? { ...msg, voiceMeta: meta } : msg)));
                      }}
                    />
                  ) : (
                    <MessageAttachment path={m.attachmentPath} content={m.content} mentionUsers={mentionUsers} onMentionClick={handleMentionClick} onOpenImage={openImageViewer} />
                  )
                ) : (
                  <p className={`message-content ${largeEmoji ? 'message-content-large-emoji' : ''}`}>
                    {m.content && typeof m.content === 'string' && m.content.startsWith('e2e:') ? (
                      m.content
                    ) : (
                      <>
                        <MessageFormattedText text={displayMessageContent(m)} mentionUsers={mentionUsers} onMentionClick={handleMentionClick} />
                        {!m.isDeleted && !largeEmoji && <LinkPreview text={displayMessageContent(m)} />}
                      </>
                    )}
                  </p>
                )}
                {(msgTranslations[String(m.id)]?.loading || msgTranslations[String(m.id)]?.text) && (
                  <div className="message-translation">
                    {msgTranslations[String(m.id)]?.loading ? (
                      <span className="message-translation-loading">{t('translateLoading')}</span>
                    ) : (
                      <>
                        <span className="message-translation-label">{t('translatedLabel')}</span>
                        <p className="message-translation-text">{msgTranslations[String(m.id)].text}</p>
                      </>
                    )}
                  </div>
                )}
                <time className="message-time">
                  {new Date(m.createdAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {m.editedAt && <span className="message-edited"> (ред.)</span>}
                  {m.isSilent && <span className="message-silent-badge" title={t('channelSilentPostHint')}> 🔕</span>}
                  {viewsLabel && <span className="message-views"> · 👁 {viewsLabel}</span>}
                  {type === 'user' && m.senderId === currentUser.id && !m.isDeleted && m.messageType !== 'call_ended' && (
                    <span
                      className={`message-read-ticks ${peerLastReadAt != null && m.createdAt <= peerLastReadAt ? 'read' : ''}`}
                      title={peerLastReadAt != null && m.createdAt <= peerLastReadAt ? 'Прочитано' : 'Доставлено'}
                    >
                      {peerLastReadAt != null && m.createdAt <= peerLastReadAt ? ' ✓✓' : ' ✓'}
                    </span>
                  )}
                </time>
              </div>
              )}
              {messageMenuId === m.id && (
                <div
                  className="message-menu"
                  ref={(el) => {
                    if (el) {
                      el.classList.remove('message-menu-open-up');
                      setTimeout(() => measureMenuPosition(el), 0);
                      setTimeout(() => el.focus(), 0);
                    }
                  }}
                  tabIndex={0}
                  onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setMessageMenuId(null); }}
                >
                  {showReactions && (
                    <div className="message-menu-reactions">
                      {quickReactions.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className={`message-reaction-btn ${reactionIsActive(m.reactions, emoji) ? 'active' : ''}${poppingReactions.has(`${m.id}:${emoji}`) ? ' reaction-pop' : ''}`}
                          onMouseDown={(e) => { e.preventDefault(); toggleReaction(m.id, emoji); }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                  {canPin && !m.isDeleted && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const isPinned = pinnedMessages.some((p) => p.id === m.id);
                        if (isPinned) socket.emit('unpin_message', { messageId: m.id, recipientType, recipientId });
                        else socket.emit('pin_message', { messageId: m.id, recipientType, recipientId });
                        setMessageMenuId(null);
                      }}
                    >{pinnedMessages.some((p) => p.id === m.id) ? 'Открепить' : 'Закрепить'}</button>
                  )}
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSelectMode(true);
                      setSelectedIds(new Set([m.id]));
                      setMessageMenuId(null);
                    }}
                  >{t('selectMessages')}</button>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      saveToSavedMessages(m);
                      setMessageMenuId(null);
                    }}
                  >{t('saveToSaved')}</button>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); setReplyTo({ id: m.id, content: m.content || '', senderName: m.senderName }); setForwardMessage(null); setMessageMenuId(null); }}
                  >Ответить</button>
                  {m.senderId === currentUser.id && !m.attachmentPath && !m.isDeleted && (
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); setEditingMessageId(m.id); setEditingContent(m.content || ''); setMessageMenuId(null); }}
                    >Редактировать</button>
                  )}
                  {m.senderId === currentUser.id && !m.isDeleted && (
                    <button
                      type="button"
                      className="message-menu-delete"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const id = m.id;
                        if (!window.confirm('Удалить сообщение?')) {
                          setMessageMenuId(null);
                          return;
                        }
                        const finishDelete = () => {
                          setMessages((prev) => prev.map((msg) => msg.id === id ? { ...msg, isDeleted: true, content: '', reactions: {} } : msg));
                          socket?.emit('delete_message', { messageId: id });
                          setVanishingIds((prev) => {
                            const next = new Set(prev);
                            next.delete(String(id));
                            return next;
                          });
                        };
                        if (getAppSettings().uiImbaFx !== false) {
                          setVanishingIds((prev) => new Set(prev).add(String(id)));
                          window.setTimeout(finishDelete, 420);
                        } else {
                          finishDelete();
                        }
                        setMessageMenuId(null);
                      }}
                    >Удалить</button>
                  )}
                  {channelAllowForward && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setReplyTo(null);
                      setMessageMenuId(null);
                      setForwardPickMessage(m);
                      setForwardPickerOpen(true);
                      setForwardSearch('');
                    }}
                  >Переслать</button>
                  )}
                  {!m.isDeleted && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        socket?.emit('toggle_star', { messageId: m.id, recipientType, recipientId });
                        setMessageMenuId(null);
                      }}
                    >{m.starredMe ? 'Убрать из избранного' : '⭐ В избранное'}</button>
                  )}
                  {!m.isDeleted && typeof m.content === 'string' && m.content.length > 0 && channelAllowCopy && (
                    <button
                      type="button"
                      onMouseDown={async (e) => {
                        e.preventDefault();
                        const ok = await copyToClipboard(m.content);
                        showToast(ok ? 'Скопировано' : 'Не удалось скопировать');
                        setMessageMenuId(null);
                      }}
                    >Копировать текст</button>
                  )}
                  {!m.isDeleted && typeof m.content === 'string' && m.content.length > 0 && !m.content.startsWith('e2e:') && m.messageType !== 'poll' && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        translateMessage(m);
                        setMessageMenuId(null);
                      }}
                    >{msgTranslations[String(m.id)]?.text ? t('hideTranslation') : t('translateMessage')}</button>
                  )}
                  <button
                    type="button"
                    onMouseDown={async (e) => {
                      e.preventDefault();
                      const base = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname || '/'}` : '';
                      const ok = await copyToClipboard(`${base}#chat/${recipientType}/${recipientId}/msg/${m.id}`);
                      showToast(ok ? 'Ссылка скопирована' : 'Не удалось скопировать');
                      setMessageMenuId(null);
                    }}
                  >Ссылка на сообщение</button>
                </div>
              )}
              {showReactions && m.reactions && Object.keys(m.reactions).length > 0 && (
                <div className="message-reactions-line">
                  {Object.entries(m.reactions).map(([emoji, info]) => (
                    <button
                      key={`${m.id}-${emoji}`}
                      type="button"
                      className={`message-reaction-chip ${info.me ? 'active' : ''}${poppingReactions.has(`${m.id}:${emoji}`) ? ' reaction-pop' : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        toggleReaction(m.id, emoji);
                      }}
                    >
                      {emoji}{info.count > 1 ? ` ${info.count}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          </React.Fragment>
          );
        })}
        </div>
        {showScrollDown && (
          <button
            type="button"
            className={`chat-scroll-down-btn${scrollDownBump ? ' chat-scroll-down-btn--bump' : ''}`}
            onClick={scrollToBottom}
            aria-label={t('scrollToBottom')}
          >
            <span className="chat-scroll-down-arrow" aria-hidden />
            {pendingBelow > 0 && (
              <span className="chat-scroll-down-count">
                {pendingBelow > 99 ? '99+' : pendingBelow} {t('newMessagesCount')}
              </span>
            )}
          </button>
        )}
        {initialUnreadCount > 0 && messages.length > 0 && (
          <button
            type="button"
            className="chat-jump-unread-btn"
            onClick={jumpToFirstUnread}
          >
            {t('jumpToUnread')}
          </button>
        )}
        {imbaCombo && (
          <div className={`imba-combo-toast imba-combo-toast--${imbaCombo.fx || 'party'}`} aria-hidden>
            {t('imbaCombo').replace('{n}', String(imbaCombo.n))}
          </div>
        )}
        {imbaStreak && (
          <div className="imba-streak-toast" aria-hidden>
            {t('imbaStreak').replace('{n}', String(imbaStreak.n))}
          </div>
        )}
        {imbaCritToast && (
          <div className="imba-crit-toast" aria-hidden>
            {t('imbaCrit')}
          </div>
        )}
        {imbaMega && (
          <div className={`imba-mega-toast imba-mega-toast--${imbaMega.tier}`} aria-hidden>
            {t('imbaMega').replace('{tier}', imbaMega.label).replace('{n}', String(imbaMega.n))}
          </div>
        )}
      </div>

      {voiceError && (
        <div className={`chat-voice-error${voiceErrorShake ? ' chat-voice-error--shake' : ''}`}>
          {voiceError}
          <button type="button" className="chat-voice-error-close" onClick={() => setVoiceError(null)} aria-label="Закрыть">×</button>
        </div>
      )}
      {(replyTo || forwardMessage) && (
        <div className="chat-reply-bar">
          {replyTo && (
            <div className="chat-reply-preview">
              <span className="chat-reply-label">Ответ на {replyTo.senderName}</span>
              <span className="chat-reply-text">{replyTo.content.slice(0, 60)}{replyTo.content.length > 60 ? '…' : ''}</span>
              <button type="button" className="chat-reply-cancel" onClick={() => setReplyTo(null)} aria-label="Отмена">×</button>
            </div>
          )}
          {forwardMessage && (
            <div className="chat-forward-preview">
              <span className="chat-forward-label">Переслать: {forwardMessage.senderName} — {forwardMessage.content ? forwardMessage.content.slice(0, 40) + (forwardMessage.content.length > 40 ? '…' : '') : '(голосовое)'}</span>
              <button type="button" className="chat-reply-cancel" onClick={() => setForwardMessage(null)} aria-label="Отмена">×</button>
            </div>
          )}
        </div>
      )}
      {selectMode && (
        <div className="chat-select-bar" role="toolbar" aria-label={t('selectMessages')}>
          <span className="chat-select-count">{selectedIds.size}</span>
          <button type="button" onClick={batchCopySelected} disabled={!selectedIds.size}>{t('batchCopy')}</button>
          <button type="button" onClick={batchForwardSelected} disabled={!selectedIds.size}>{t('batchForward')}</button>
          <button type="button" onClick={batchStarSelected} disabled={!selectedIds.size}>⭐</button>
          <button type="button" className="chat-select-cancel" onClick={exitSelectMode}>{t('cancel')}</button>
        </div>
      )}
      {showScheduleComposer && (
        <div className="chat-schedule-bar">
          <label className="chat-schedule-label">
            {t('scheduleAt')}
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={!scheduleAt || !input.trim()}
            onClick={send}
          >
            {t('scheduleSend')}
          </button>
          <button type="button" onClick={() => { setShowScheduleComposer(false); setScheduleAt(''); }}>
            {t('cancel')}
          </button>
        </div>
      )}
      {scheduledList.length > 0 && (
        <div className="chat-scheduled-list">
          {scheduledList.map((item) => (
            <div key={item.id} className="chat-scheduled-item">
              <span>🕒 {new Date(item.sendAt).toLocaleString()} — {item.content.slice(0, 48)}{item.content.length > 48 ? '…' : ''}</span>
              <button
                type="button"
                onClick={() => {
                  removeScheduledMessage(item.id);
                  setScheduledList(getScheduledForChat(recipientType, recipientId));
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <footer className={`chat-footer${input.trim() ? ' chat-footer--typing' : ''}${inputFocused ? ' chat-footer--emoji-focus' : ''}`}>
        {!canPost ? (
          <div className="chat-channel-readonly" role="status">
            {t('channelReadOnlyHint')}
          </div>
        ) : (
        <>
        {canPost && isChannel && (
          <label className="channel-silent-toggle" title={t('channelSilentPostHint')}>
            <input
              type="checkbox"
              checked={silentPost}
              onChange={(e) => setSilentPost(e.target.checked)}
            />
            <span>{t('channelSilentPost')}</span>
          </label>
        )}
        {canPost && (
          <FormatToolbar inputRef={chatInputRef} value={input} setValue={setInput} />
        )}
        {canPost && (
          <QuickEmojiBar onPick={appendQuickEmoji} />
        )}
        {canPost && getMentionQuery(input) != null && (
          <MentionSuggest
            query={getMentionQuery(input)}
            users={mentionUsers}
            activeIndex={mentionIndex}
            onActiveIndexChange={setMentionIndex}
            allowEveryone={type === 'group'}
            onSelect={(u) => {
              setInput(insertMention(input, u.login));
              setMentionIndex(0);
              requestAnimationFrame(() => chatInputRef.current?.focus());
            }}
          />
        )}
        {canPost && getMentionQuery(input) == null && getEmojiQuery(input) != null && (
          <EmojiSuggest
            query={getEmojiQuery(input)}
            activeIndex={emojiIndex}
            onActiveIndexChange={setEmojiIndex}
            onSelect={(item) => {
              setInput(insertEmojiShortcode(input, item.emoji));
              setEmojiIndex(0);
              requestAnimationFrame(() => chatInputRef.current?.focus());
            }}
          />
        )}
        {canPost && getAppSettings().uiImbaFx !== false && (
          <MessageFxBar
            activeFx={selectedFx}
            onSelect={setSelectedFx}
            sticky={fxSticky}
            onToggleSticky={() => setFxSticky((v) => !v)}
            mood={chatMood}
            onMood={setChatMood}
          />
        )}
        <StickerPicker
          open={showStickerPicker}
          tab={stickerTab}
          onTabChange={setStickerTab}
          onSelect={sendSticker}
          onClose={() => {
            setShowStickerPicker(false);
            setStickerFocusPackId(null);
          }}
          focusPackId={stickerFocusPackId}
          refreshKey={stickerPacksRefreshKey}
          onOpenStickerBot={openStickerBotChat}
        />
        <input
          ref={attachmentInputRef}
          type="file"
          accept="image/*,video/*,.pdf,.doc,.docx,.txt,application/*"
          className="chat-attachment-input"
          aria-label="Прикрепить файл"
          onChange={onAttachmentSelect}
          disabled={!connected || uploadingAttachment}
        />
        <button
          type="button"
          className={`btn-attach btn-gallery${uploadingAttachment ? ' btn-attach--uploading' : ''}`}
          onClick={onGalleryImagePick}
          disabled={!connected || uploadingAttachment}
          title={t('pickFromGallery')}
          aria-label={t('pickFromGallery')}
        >
          <span className="icon-gallery" />
        </button>
        <button
          type="button"
          className={`btn-attach${uploadingAttachment ? ' btn-attach--uploading' : ''}`}
          onClick={() => attachmentInputRef.current?.click()}
          disabled={!connected || uploadingAttachment}
          title="Фото, видео, файл"
          aria-label="Прикрепить файл"
        >
          <span className="icon-attach" />
        </button>
        {isBotChat && (
          <button
            type="button"
            className="chat-footer-bot-cmd"
            title={t('botCommandsTitle')}
            aria-label={t('botCommandsTitle')}
            disabled={!connected}
            onClick={() => {
              setInput('/');
              requestAnimationFrame(() => chatInputRef.current?.focus());
            }}
          >
            /
          </button>
        )}
        <div className="chat-footer-input-wrap">
          {input.length >= 400 && (
            <span className={`chat-char-count${input.length >= 4000 ? ' chat-char-count--warn' : ''}`} aria-live="polite">
              {input.length}
            </span>
          )}
          {showBotCommandMenu && (
            <BotCommandMenu
              commands={botCommands}
              input={input}
              activeIndex={botCmdIndex}
              onActiveIndexChange={setBotCmdIndex}
              onSelect={applyBotCommand}
            />
          )}
          {showBuiltinSlash && (
            <div className="bot-command-menu builtin-slash-menu" role="listbox" aria-label={t('slashCommands')}>
              {builtinSlashCommands.map((c, i) => (
                <button
                  key={c.command}
                  type="button"
                  role="option"
                  aria-selected={i === slashIndex}
                  className={`bot-command-item${i === slashIndex ? ' active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (c.command === 'poll') {
                      setShowPollComposer(true);
                      setInput('');
                      return;
                    }
                    if (c.command === 'schedule') {
                      setShowScheduleComposer(true);
                      setInput('/schedule ');
                      return;
                    }
                    if (c.command === 'me' || c.command === 'spoiler' || c.command === 'code') {
                      setInput(`/${c.command} `);
                      return;
                    }
                    setInput(`/${c.command}`);
                  }}
                >
                  <span className="bot-command-name">/{c.command}</span>
                  <span className="bot-command-desc">{t(c.descriptionKey)}</span>
                </button>
              ))}
            </div>
          )}
          <input
            ref={chatInputRef}
            type="text"
            className="chat-footer-input"
            placeholder={
              forwardMessage
                ? 'Добавить комментарий (необязательно)'
                : isBotChat
                  ? 'Сообщение или /команда'
                  : showScheduleComposer
                    ? t('scheduleInputHint')
                    : 'Сообщение или /команда'
            }
            value={input}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onChange={(e) => {
              setInput(e.target.value);
              if (!socket || !recipientId) return;
              socket.emit('typing', { recipientType, recipientId, active: true });
              if (typingEmitTimerRef.current) clearTimeout(typingEmitTimerRef.current);
              typingEmitTimerRef.current = setTimeout(() => {
                socket.emit('typing', { recipientType, recipientId, active: false });
                typingEmitTimerRef.current = null;
              }, 2500);
            }}
            onKeyDown={(e) => {
              const mentionQ = getMentionQuery(input);
              const mentionOpen = mentionQ != null && canPost;
              if (mentionOpen) {
                const q = String(mentionQ).toLowerCase();
                const mentionItems = [];
                if (type === 'group' && (!q || 'everyone'.startsWith(q))) {
                  mentionItems.push({ login: 'everyone' });
                }
                (mentionUsers || []).forEach((u) => {
                  if (!u?.login) return;
                  const login = String(u.login).toLowerCase();
                  const name = String(u.displayName || '').toLowerCase();
                  if (!q || login.includes(q) || name.includes(q)) mentionItems.push(u);
                });
                const mentionCount = Math.min(mentionItems.length, 8);
                if (mentionCount > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setMentionIndex((i) => Math.min(i + 1, mentionCount - 1));
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setMentionIndex((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                    e.preventDefault();
                    const pick = mentionItems[mentionIndex] || mentionItems[0];
                    if (pick?.login) {
                      setInput(insertMention(input, pick.login));
                      setMentionIndex(0);
                    }
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setInput(input.replace(/@[a-zA-Z0-9_]*$/, ''));
                    setMentionIndex(0);
                    return;
                  }
                }
              }
              const emojiQ = !mentionOpen ? getEmojiQuery(input) : null;
              if (emojiQ != null && canPost) {
                const emojiItems = filterEmojiShortcodes(emojiQ, 8);
                if (emojiItems.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setEmojiIndex((i) => Math.min(i + 1, emojiItems.length - 1));
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setEmojiIndex((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                    e.preventDefault();
                    const pick = emojiItems[emojiIndex] || emojiItems[0];
                    if (pick?.emoji) {
                      setInput(insertEmojiShortcode(input, pick.emoji));
                      setEmojiIndex(0);
                    }
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setInput(input.replace(/:[a-zA-Z0-9_+-]*$/, ''));
                    setEmojiIndex(0);
                    return;
                  }
                }
              }
              if (e.key === 'Escape' && replyTo) {
                e.preventDefault();
                setReplyTo(null);
                return;
              }
              if (e.key === 'ArrowUp' && !input.trim() && !e.shiftKey && !replyTo) {
                const last = [...messages].reverse().find((m) => !m.isDeleted && m.messageType !== 'call_ended');
                if (last) {
                  e.preventDefault();
                  setReplyTo({ id: last.id, content: last.content || '', senderName: last.senderName });
                  setForwardMessage(null);
                  return;
                }
              }
              if ((e.ctrlKey || e.metaKey) && !e.altKey && chatInputRef.current) {
                const map = { b: ['**', '**'], i: ['*', '*'], u: ['__', '__'], e: ['||', '||'] };
                const pair = map[e.key?.toLowerCase?.()];
                if (pair) {
                  e.preventDefault();
                  const result = wrapInputSelection(chatInputRef.current, pair[0], pair[1]);
                  if (result) {
                    setInput(result.next);
                    requestAnimationFrame(() => {
                      chatInputRef.current?.setSelectionRange(result.cursorStart, result.cursorEnd);
                    });
                  }
                  return;
                }
              }
              if (getAppSettings().uiImbaFx !== false && e.altKey && !e.ctrlKey && !e.metaKey) {
                const num = e.code?.startsWith('Digit') ? Number(e.code.slice(5)) : NaN;
                if (num >= 1 && num <= 9) {
                  e.preventDefault();
                  const fx = FX_HOTKEYS[num - 1];
                  if (fx) setSelectedFx((cur) => (cur === fx.id ? null : fx.id));
                  return;
                }
              }
              if (showBuiltinSlash) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSlashIndex((i) => Math.min(i + 1, builtinSlashCommands.length - 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSlashIndex((i) => Math.max(i - 1, 0));
                  return;
                }
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const c = builtinSlashCommands[slashIndex] || builtinSlashCommands[0];
                  if (!c) return;
                  if (c.command === 'poll') {
                    setShowPollComposer(true);
                    setInput('');
                    return;
                  }
                  if (c.command === 'schedule') {
                    setShowScheduleComposer(true);
                    setInput('');
                    return;
                  }
                  if (c.command === 'me' || c.command === 'spoiler' || c.command === 'code') {
                    setInput(`/${c.command} `);
                    return;
                  }
                  setInput(`/${c.command}`);
                  return;
                }
              }
              if (showBotCommandMenu) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setBotCmdIndex((i) => Math.min(i + 1, filteredBotCommands.length - 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setBotCmdIndex((i) => Math.max(i - 1, 0));
                  return;
                }
                if (e.key === 'Tab' || e.key === 'Enter') {
                  e.preventDefault();
                  applyBotCommand(filteredBotCommands[botCmdIndex] || filteredBotCommands[0]);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setInput('');
                  return;
                }
              }
              if (sendByEnter) {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
                return;
              }
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={!connected}
          />
        </div>
        <div className="chat-footer-extras" role="toolbar" aria-label="Дополнительно">
          <button
            type="button"
            className={`chat-footer-extra${showStickerPicker && stickerTab === 'stickers' ? ' active' : ''}`}
            title={t('stickerTabStickers')}
            onClick={() => {
              setStickerTab('stickers');
              setStickerFocusPackId(null);
              setShowStickerPicker((v) => (stickerTab === 'stickers' && v ? false : true));
            }}
          >
            <span className="chat-footer-extra-icon chat-footer-extra-icon-sticker" aria-hidden />
          </button>
          <button
            type="button"
            className={`chat-footer-extra chat-footer-extra-text${showStickerPicker && stickerTab === 'gif' ? ' active' : ''}`}
            title="GIF"
            onClick={() => {
              setStickerTab('gif');
              setShowStickerPicker((v) => (stickerTab === 'gif' ? !v : true));
            }}
          >
            GIF
          </button>
          <button
            type="button"
            className="chat-footer-extra"
            onClick={() => appendToInput('😀')}
            title="Emoji"
            aria-label="Emoji"
          >
            😊
          </button>
          <button
            type="button"
            className={`chat-footer-extra chat-footer-extra-text${showScheduleComposer ? ' active' : ''}`}
            title={t('scheduleSend')}
            onClick={() => setShowScheduleComposer((v) => !v)}
          >
            🕒
          </button>
          <button
            type="button"
            className="chat-footer-extra chat-footer-extra-text"
            title={t('createPoll')}
            onClick={() => setShowPollComposer(true)}
          >
            📊
          </button>
        </div>
        {recording ? (
          <div className="chat-footer-voice chat-footer-voice-live chat-footer-voice--recording">
            <span className="chat-footer-voice-dot" />
            <span className="chat-footer-voice-time">{Math.floor(recordSeconds / 60)}:{(recordSeconds % 60).toString().padStart(2, '0')}</span>
            <div className="chat-footer-voice-wave" aria-hidden>
              {(liveWavePeaks.length ? liveWavePeaks : Array.from({ length: 24 }, () => 12)).map((h, i) => (
                <span key={i} className="chat-footer-voice-bar" style={{ height: `${Math.max(4, h)}%` }} />
              ))}
            </div>
            {liveTranscript && (
              <span className="chat-footer-voice-transcript chat-footer-voice-transcript--live" title={liveTranscript}>{liveTranscript}</span>
            )}
            <button type="button" className="btn-voice-cancel" onClick={cancelRecording} aria-label={t('voiceRecordCancel')} title={t('voiceRecordCancel')}>×</button>
            <button type="button" className="btn-send btn-send-voice" onClick={stopRecording} aria-label="Отправить голосовое">
              <span className="icon-send" />
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="btn-voice"
              onPointerDown={startRecording}
              onPointerUp={stopRecording}
              onPointerLeave={stopRecording}
              disabled={!connected}
              title="Удерживайте для записи голосового"
              aria-label="Запись голосового"
            >
              <span className="icon-mic" />
            </button>
            <button
              type="button"
              className={`btn-send${input.trim() || forwardMessage ? ' btn-send--ready' : ''}${sendBurst ? ' btn-send--burst' : ''}${sendCharging ? ' btn-send--charging' : ''}`}
              title={getAppSettings().uiImbaFx !== false ? t('imbaChargeHint') : undefined}
              onClick={send}
              onPointerDown={(e) => {
                if (getAppSettings().uiImbaFx === false) return;
                if (e.button !== 0) return;
                chargeArmedRef.current = false;
                setSendCharging(true);
                if (chargeTimerRef.current) clearTimeout(chargeTimerRef.current);
                chargeTimerRef.current = window.setTimeout(() => {
                  chargeArmedRef.current = true;
                }, 850);
              }}
              onPointerUp={() => {
                if (chargeTimerRef.current) {
                  clearTimeout(chargeTimerRef.current);
                  chargeTimerRef.current = null;
                }
                setSendCharging(false);
              }}
              onPointerLeave={() => {
                if (chargeTimerRef.current) {
                  clearTimeout(chargeTimerRef.current);
                  chargeTimerRef.current = null;
                }
                setSendCharging(false);
                chargeArmedRef.current = false;
              }}
              disabled={!connected || sending || (!input.trim() && !forwardMessage)}
              aria-label="Отправить"
            >
              {sendCharging && (
                <span className="btn-send-charge-bar" aria-hidden><span /></span>
              )}
              <span className="icon-send" />
            </button>
          </>
        )}
        </>
        )}
      </footer>

      {showGroupEdit && type === 'group' && recipientId && (
        <GroupEdit
          groupId={recipientId}
          onClose={() => setShowGroupEdit(false)}
          onUpdated={async () => {
            // Перезагружаем данные группы
            if (onUpdated) {
              await onUpdated();
            }
          }}
        />
      )}

      {showJumpDate && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowJumpDate(false)}>
          <div className="modal jump-date-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{t('jumpToDate')}</h3>
            <input
              type="date"
              className="jump-date-input"
              value={jumpDateValue}
              onChange={(e) => setJumpDateValue(e.target.value)}
            />
            <div className="modal-actions">
              <button type="button" onClick={() => setShowJumpDate(false)}>{t('cancel')}</button>
              <button type="button" className="btn-primary" onClick={jumpToDate} disabled={!jumpDateValue}>
                {t('jumpToDateGo')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPollComposer && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowPollComposer(false)}>
          <div className="modal poll-composer-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{t('createPoll')}</h3>
            <input
              type="text"
              className="poll-composer-question"
              placeholder={t('pollQuestion')}
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              maxLength={200}
            />
            <textarea
              className="poll-composer-options"
              placeholder={t('pollOptionsHint')}
              value={pollOptionsText}
              onChange={(e) => setPollOptionsText(e.target.value)}
              rows={5}
            />
            <label className="poll-composer-multi">
              <input type="checkbox" checked={pollMulti} onChange={(e) => setPollMulti(e.target.checked)} />
              <span>{t('pollMulti')}</span>
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setShowPollComposer(false)}>{t('cancel')}</button>
              <button type="button" className="btn-primary" onClick={sendPoll}>{t('createPoll')}</button>
            </div>
          </div>
        </div>
      )}

      {showStarredPanel && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowStarredPanel(false)}>
          <div className="modal starred-panel-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{t('starredMessages')}</h3>
            {starredLoading ? (
              <p className="starred-empty">{t('loading')}</p>
            ) : starredList.length === 0 ? (
              <p className="starred-empty">{t('starredEmpty')}</p>
            ) : (
              <ul className="starred-list">
                {starredList.map((m) => {
                  const inThisChat = m.recipientType === recipientType && (
                    m.recipientType === 'group'
                      ? String(m.recipientId) === String(recipientId)
                      : String(m.senderId) === String(recipientId) || String(m.recipientId) === String(recipientId)
                  );
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        className="starred-item"
                        onClick={() => {
                          setShowStarredPanel(false);
                          if (inThisChat) {
                            const el = document.getElementById(`chat-msg-${m.id}`);
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              flashMessage(m.id);
                            } else {
                              window.location.hash = `#chat/${m.recipientType === 'group' ? 'group' : 'user'}/${m.recipientType === 'group' ? m.recipientId : (String(m.senderId) === String(currentUser.id) ? m.recipientId : m.senderId)}/msg/${m.id}`;
                            }
                          } else {
                            const chatId = m.recipientType === 'group'
                              ? m.recipientId
                              : (String(m.senderId) === String(currentUser.id) ? m.recipientId : m.senderId);
                            if (m.recipientType === 'group') onOpenChannel?.(chatId);
                            else onOpenUserChat?.(chatId);
                            sessionStorage.setItem('nova_scroll_msg', m.id);
                          }
                        }}
                      >
                        <span className="starred-item-who">{m.senderName || '—'}</span>
                        <span className="starred-item-text">{m.isDeleted ? '…' : (m.content || (m.attachmentPath ? '(медиа)' : '…'))}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={() => setShowStarredPanel(false)}>{t('close')}</button>
            </div>
          </div>
        </div>
      )}

      <MembersPanel
        open={type === 'group' && showMembersPanel}
        onClose={() => setShowMembersPanel(false)}
        members={groupMembers}
        presenceByUserId={memberPresence}
        currentUserId={currentUser?.id}
        onOpenUser={(u) => {
          setProfileUser(u);
          setShowUserProfile(true);
        }}
      />

      {photoViewer && (
        <PhotoViewer
          open
          urls={photoViewer.urls}
          initialIndex={photoViewer.index}
          onClose={() => setPhotoViewer(null)}
        />
      )}

      {stickerPackPreview && (
        <StickerPackPreview
          packId={stickerPackPreview.packId}
          stickerId={stickerPackPreview.stickerId}
          previewPath={stickerPackPreview.path}
          previewEmoji={stickerPackPreview.emoji}
          previewMediaType={stickerPackPreview.mediaType}
          onClose={() => setStickerPackPreview(null)}
          onInstalled={() => {
            setStickerPacksRefreshKey((k) => k + 1);
            setStickerFocusPackId(stickerPackPreview.packId);
          }}
        />
      )}

      {forwardPickerOpen && (
        <div className="modal-overlay forward-picker-overlay" onClick={closeForwardPicker}>
          <div className="modal forward-picker" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="forward-picker-title">
            <div className="forward-picker-head">
              <h2 id="forward-picker-title">Переслать в…</h2>
              <button type="button" className="forward-picker-close" onClick={closeForwardPicker} aria-label="Закрыть">×</button>
            </div>
            <p className="forward-picker-hint">Выберите чат</p>
            <input
              type="search"
              className="forward-picker-search"
              placeholder="Поиск по имени или группе"
              value={forwardSearch}
              onChange={(e) => setForwardSearch(e.target.value)}
              autoFocus
            />
            <ul className="forward-picker-list">
              {forwardPickItems.length === 0 ? (
                <li className="forward-picker-empty">Никого не найдено</li>
              ) : (
                forwardPickItems.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      className="forward-picker-row"
                      onClick={() => handleForwardPick(item.target)}
                    >
                      {item.isGroup ? (
                        <span className="forward-picker-row-icon">#</span>
                      ) : (
                        <Avatar path={item.avatarPath} userId={item.userId} size="sm" />
                      )}
                      <span className="forward-picker-row-text">
                        <span className="forward-picker-row-title">{item.title}</span>
                        <span className="forward-picker-row-sub">{item.subtitle}</span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}

      {chatSearchOpen && (
        <div className="modal-overlay chat-search-overlay" onClick={closeChatSearch}>
          <div className="modal chat-search" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="chat-search-title">
            <div className="chat-search-head">
              <h2 id="chat-search-title">Поиск в чате</h2>
              <button type="button" className="chat-search-close" onClick={closeChatSearch} aria-label="Закрыть">×</button>
            </div>
            <input
              type="search"
              className="chat-search-input"
              placeholder="Введите текст (минимум 2 символа)…"
              value={chatSearchQ}
              onChange={(e) => setChatSearchQ(e.target.value)}
              autoFocus
            />
            <div className="chat-search-meta">
              {chatSearchLoading ? 'Поиск…' : (chatSearchQ.trim().length < 2 ? ' ' : (chatSearchResults.length ? `Найдено: ${chatSearchResults.length}` : 'Ничего не найдено'))}
            </div>
            <ul className="chat-search-list">
              {chatSearchResults.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="chat-search-row"
                    onClick={() => {
                      window.location.hash = `#msg-${r.id}`;
                      closeChatSearch();
                    }}
                  >
                    <span className="chat-search-row-title">{r.senderName || '—'}</span>
                    <span className="chat-search-row-text">{(r.content || '').slice(0, 120) || '(без текста)'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {showUserProfile && profileTargetUser && (
        <UserProfile
          variant="overlay"
          user={profileTargetUser}
          onClose={() => {
            setShowUserProfile(false);
            setProfileUser(null);
          }}
          onEditProfile={onEditProfile}
          onCreateChannel={onCreateChannel}
          onOpenChannel={onOpenChannel}
        />
      )}
    </div>
  );
}
