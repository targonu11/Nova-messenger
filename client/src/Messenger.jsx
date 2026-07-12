import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from './useAuth';
import { useSocket } from './SocketContext';
import { getUsers, getGroups, getMessages, getServers, getArchivedChats, archiveChat, unarchiveChat, getAchievementsCatalog, adminGrantAchievement, invalidateServersListCache, avatarUrl, getAdminSettings, setAdminSettings, getPresenceBatch, updateCustomStatus } from './api';
import { resolveBotUser } from './botChat';
import ServerCreate from './ServerCreate';
import ChannelCreateModal from './ChannelCreateModal';
import ServerInviteModal from './ServerInviteModal';
import ServerSettingsModal from './ServerSettingsModal';
import { Avatar } from './Avatar';
import ChatView from './ChatView';
import GroupCreate from './GroupCreate';
import ProfileEdit from './ProfileEdit';
import UserProfile from './UserProfile';
import ChannelCreate from './ChannelCreate';
import ChannelJoinModal from './ChannelJoinModal';
import CallPanel from './CallPanel';
import SettingsModal, { getStoredContactNames, getStoredChatBackground } from './SettingsModal';
import MessengerSettingsModal from './MessengerSettingsModal';
import { getStoredTheme, applyTheme } from './themeStorage';
import { applyUiCustomization } from './uiCustomize';
import { getAppSettings } from './appSettings';
import NotificationPanel from './NotificationPanel';
import { t, getStoredLang } from './i18n';
import { isChatMuted, getChatMuteState, unmuteChat, setChatMuted } from './chatMute';
import { isChatPinned, toggleChatPinned, getPinnedChatKeys } from './chatPins';
import {
  getCustomFolders,
  createCustomFolder,
  deleteCustomFolder,
  addChatToFolder,
  removeChatFromFolder,
  isChatInFolder,
} from './chatFolders';
import { useIdlePresence } from './useIdlePresence';
import { useAppUpdate } from './useAppUpdate';
import { playNotificationSound } from './useNotificationSound';
import { useSystemNotifications, showSystemNotification } from './useSystemNotifications';
import { formatMessagePreview, formatChatListTime } from './chatListPreview';
import { getUnreadCounts, incrementUnread, clearUnread, setUnread, getUnreadCount } from './chatUnread';
import { getDraftMap } from './chatDrafts';
import { formatCustomStatusLine, presenceModeFromEntity } from './customStatus';
import { mergePlaybackActivities } from './activityUtils';
import { UserActivityPreview } from './UserActivityOverlay';
import { useActivitySync } from './useActivitySync';
import SidebarUserPanel from './SidebarUserPanel';
import NovaAmbient from './NovaAmbient';
import ChatListSkeleton from './ChatListSkeleton';
import StatusPicker from './StatusPicker';
import QuickSwitcher from './QuickSwitcher';
import { takeDueScheduled } from './scheduledMessages';
import KeyboardShortcutsModal from './KeyboardShortcutsModal';
import { getTimeGreeting, getWelcomeQuote, flashThemeChange } from './novaMotion';
import { getNotificationsPlaySound } from './appSettings';
import { playConnectSound } from './useNotificationSound';
import './Messenger.css';

const LAST_CHAT_KEY = 'nova_last_chat';
const SELECTED_SERVER_KEY = 'nova_selected_server_id';
const SAVED_CHAT_ID = '__saved__';
const CHAT_LIST_MODE_KEY = 'nova_chat_list_mode';
const CHAT_LIST_MODES = ['full', 'narrow', 'hidden'];

function getStoredChatListMode() {
  try {
    const v = localStorage.getItem(CHAT_LIST_MODE_KEY);
    return CHAT_LIST_MODES.includes(v) ? v : 'full';
  } catch {
    return 'full';
  }
}

/** true/false для точки на аватаре; undefined — не показывать (нет данных или скрыт офлайн) */
function peerPresenceDot(entry) {
  if (!entry || typeof entry.online !== 'boolean') return undefined;
  if (entry.online) return true;
  if (entry.hideLastSeen) return undefined;
  return false;
}

function peerPresenceMode(entry) {
  if (!entry || !entry.online) return 'offline';
  return presenceModeFromEntity(entry);
}

function resolveUserPresence(presenceByUserId, users, userId) {
  const pid = String(userId);
  const live = presenceByUserId[pid];
  if (live) return live;
  const u = users.find((x) => String(x.id) === pid);
  if (!u) return null;
  return {
    online: false,
    customStatusEmoji: u.customStatusEmoji,
    customStatusText: u.customStatusText,
    customStatusMode: u.customStatusMode,
  };
}

function getStoredLastChat() {
  try {
    const raw = localStorage.getItem(LAST_CHAT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && (v.type === 'user' || v.type === 'group') && v.id) return { type: v.type, id: String(v.id) };
  } catch (e) {}
  return null;
}

function setStoredLastChat(selected) {
  try {
    if (selected) localStorage.setItem(LAST_CHAT_KEY, JSON.stringify({ type: selected.type, id: selected.id }));
    else localStorage.removeItem(LAST_CHAT_KEY);
  } catch (e) {}
}

export default function Messenger() {
  const { user, logout, updateUser, refreshUser } = useAuth();
  useIdlePresence(!!user?.id, user?.customStatusMode || 'online', updateUser);
  const { socket, authFailed, connected } = useSocket();
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [servers, setServers] = useState([]);
  const [selectedServerId, setSelectedServerId] = useState(() => {
    try {
      const v = localStorage.getItem(SELECTED_SERVER_KEY);
      return v && v !== 'null' ? v : null;
    } catch {
      return null;
    }
  });
  const [recentChats, setRecentChats] = useState([]);
  const [archivedChats, setArchivedChats] = useState([]);
  const [showArchive, setShowArchive] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [showServerCreate, setShowServerCreate] = useState(false);
  const [showServerChannelCreate, setShowServerChannelCreate] = useState(false);
  const [showServerInvite, setShowServerInvite] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [showChannelCreate, setShowChannelCreate] = useState(false);
  const [showChannelJoin, setShowChannelJoin] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [chatFolder, setChatFolder] = useState('all');
  const [customFolders, setCustomFolders] = useState(() => getCustomFolders());
  const [folderMenuChat, setFolderMenuChat] = useState(null);
  const [chatCtxMenu, setChatCtxMenu] = useState(null);
  const [muteVersion, setMuteVersion] = useState(0);
  const [draftMap, setDraftMap] = useState(() => getDraftMap());
  const [draftTick, setDraftTick] = useState(0);

  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [pinnedVersion, setPinnedVersion] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showMessengerSettings, setShowMessengerSettings] = useState(false);
  const [contactNames, setContactNames] = useState(() => getStoredContactNames());
  // Фон чата теперь хранится для каждого чата отдельно, не нужен глобальный state
  const getChatBackground = (chatId) => {
    if (!chatId) return '';
    return getStoredChatBackground(chatId);
  };
  const setChatBackground = (chatId, value) => {
    if (!chatId) return;
    setStoredChatBackground(chatId, value);
    // Обновляем состояние для перерисовки текущего чата
    if (selected?.id === chatId) {
      // Принудительно обновляем через изменение selected
      setSelected({ ...selected });
    }
  };
  const [themeVersion, setThemeVersion] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const notificationIdRef = React.useRef(0);
  const { requestPermission } = useSystemNotifications();
  const myActivities = useActivitySync(Boolean(user?.id));
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [adminTab, setAdminTab] = useState('groups'); // 'groups' | 'users'
  const [adminGroupQuery, setAdminGroupQuery] = useState('');
  const [adminUserQuery, setAdminUserQuery] = useState('');
  const [adminAllowUsernameAll, setAdminAllowUsernameAll] = useState(true);
  const [adminAchievementsCatalog, setAdminAchievementsCatalog] = useState([]);
  /** Черновик пересылки при переходе в другой чат (как в Telegram) */
  const [pendingForwardMessage, setPendingForwardMessage] = useState(null);
  const [presenceByUserId, setPresenceByUserId] = useState({});
  const [unreadCounts, setUnreadCounts] = useState(() => getUnreadCounts());
  const [openedUnreadCount, setOpenedUnreadCount] = useState(0);
  const prevUnreadRef = useRef({});
  const [unreadBumpKeys, setUnreadBumpKeys] = useState(() => new Set());
  const [pinFlashKeys, setPinFlashKeys] = useState(() => new Set());
  const [chatListMode, setChatListMode] = useState(getStoredChatListMode);
  const remoteActivitiesRef = useRef({});
  const wasConnectedRef = useRef(null);
  const welcomeQuote = useMemo(() => getWelcomeQuote(getStoredLang()), []);

  const totalUnread = useMemo(
    () => Object.values(unreadCounts).reduce((s, n) => s + (Number(n) || 0), 0),
    [unreadCounts],
  );

  useEffect(() => {
    if (totalUnread > 0) {
      document.body.classList.add('nova-has-unread');
    } else {
      document.body.classList.remove('nova-has-unread');
    }
    return () => document.body.classList.remove('nova-has-unread');
  }, [totalUnread]);

  useEffect(() => {
    const base = 'Nova';
    if (totalUnread <= 0) {
      document.title = base;
      return undefined;
    }
    if (document.documentElement.getAttribute('data-reduce-motion') === 'true') {
      document.title = `(${totalUnread}) ${base}`;
      return undefined;
    }
    let showCount = true;
    document.title = `(${totalUnread}) ${base}`;
    const iv = window.setInterval(() => {
      showCount = !showCount;
      document.title = showCount ? `(${totalUnread}) ${base}` : base;
    }, 1400);
    return () => {
      window.clearInterval(iv);
      document.title = base;
    };
  }, [totalUnread]);

  useEffect(() => {
    if (connected) {
      if (wasConnectedRef.current === false && getNotificationsPlaySound()) {
        playConnectSound();
      }
    }
    wasConnectedRef.current = connected;
  }, [connected]);

  useEffect(() => {
    if (themeVersion > 0) flashThemeChange();
  }, [themeVersion]);

  // Запрашиваем разрешение на уведомления при первом запуске
  useEffect(() => {
    requestPermission().catch(() => {});
  }, [requestPermission]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowQuickSwitcher(true);
        return;
      }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const tag = e.target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
        const list = folderFilteredChatsRef.current;
        if (!list?.length) return;
        e.preventDefault();
        const idx = list.findIndex(
          (c) => selectedRef.current?.type === c.type && String(selectedRef.current?.id) === String(c.id)
        );
        const nextIdx = e.key === 'ArrowUp'
          ? (idx <= 0 ? list.length - 1 : idx - 1)
          : (idx < 0 || idx >= list.length - 1 ? 0 : idx + 1);
        const chat = list[nextIdx];
        if (!chat) return;
        if (chat.type === 'user') setSelectedServerId(null);
        if (chat.type === 'group') {
          const gr = groupsRef.current.find((x) => String(x.id) === String(chat.id));
          if (gr?.serverId) setSelectedServerId(gr.serverId);
          else setSelectedServerId(null);
        }
        setSelected({ type: chat.type, id: chat.id });
        setSidebarOpen(false);
        return;
      }
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
      e.preventDefault();
      setShowKeyboardShortcuts(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!socket || !connected) return undefined;
    const flush = () => {
      const due = takeDueScheduled();
      due.forEach((item) => {
        try {
          const payload = {
            recipientType: item.recipientType,
            recipientId: item.recipientId,
            content: item.content,
          };
          if (item.replyToId) payload.replyToId = item.replyToId;
          if (item.messageType) payload.messageType = item.messageType;
          if (item.messageMeta) payload.messageMeta = item.messageMeta;
          socket.emit('send_message', payload);
        } catch {}
      });
    };
    flush();
    const timer = window.setInterval(flush, 10000);
    const onVis = () => {
      if (document.visibilityState === 'visible') flush();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('nova-scheduled', flush);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('nova-scheduled', flush);
    };
  }, [socket, connected]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ok = params.get('connection_ok');
    const err = params.get('connection_error');
    if (!ok && !err) return;
    if (ok) refreshUser?.();
    const msg = ok
      ? t('connectionOk')
      : `${t('connectionError')}${err ? ` (${err})` : ''}`;
    const nid = `conn-${Date.now()}`;
    setNotifications((prev) => [...prev.slice(-19), {
      id: nid,
      type: 'system',
      chatName: msg,
      content: '',
    }]);
    const next = window.location.pathname + window.location.hash;
    window.history.replaceState({}, '', next);
  }, [refreshUser]);
  const setContactName = (userId, name) => {
    setContactNames((prev) => {
      const next = { ...prev };
      if (name) next[String(userId)] = name;
      else delete next[String(userId)];
      try {
        const raw = localStorage.getItem('nova_contact_names');
        const o = raw ? JSON.parse(raw) : {};
        if (name) o[String(userId)] = name;
        else delete o[String(userId)];
        localStorage.setItem('nova_contact_names', JSON.stringify(o));
      } catch (e) {}
      return next;
    });
  };
  const { updateState, installUpdate, isElectron } = useAppUpdate();
  const usersRef = useRef(users);
  const groupsRef = useRef(groups);
  const selectedRef = useRef(selected);
  usersRef.current = users;
  groupsRef.current = groups;
  selectedRef.current = selected;

  useEffect(() => {
    setStoredLastChat(selected);
  }, [selected]);

  useEffect(() => {
    try {
      if (selectedServerId == null) localStorage.removeItem(SELECTED_SERVER_KEY);
      else localStorage.setItem(SELECTED_SERVER_KEY, selectedServerId);
    } catch {}
  }, [selectedServerId]);

  useEffect(() => {
    if (selectedServerId && !servers.some((s) => String(s.id) === String(selectedServerId))) {
      setSelectedServerId(null);
    }
  }, [servers, selectedServerId]);

  // Восстановление всех настроек при монтировании компонента
  useEffect(() => {
    const sync = getAppSettings().syncThemeWithSystem;
    if (sync) {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(dark ? 'dark' : 'light');
    } else {
      applyTheme(getStoredTheme());
    }
    applyUiCustomization();

    const storedContactNames = getStoredContactNames();
    setContactNames(storedContactNames);
  }, []);

  // Тема следует за системой, пока включена синхронизация
  useEffect(() => {
    if (!getAppSettings().syncThemeWithSystem) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      applyTheme(mq.matches ? 'dark' : 'light');
      applyUiCustomization();
      setThemeVersion((v) => v + 1);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [themeVersion]);

  useEffect(() => {
    if (!selected) {
      setOpenedUnreadCount(0);
      return;
    }
    const n = getUnreadCount(selected.type, selected.id);
    setOpenedUnreadCount(n);
    clearUnread(selected.type, selected.id);
    setUnreadCounts(getUnreadCounts());
  }, [selected?.type, selected?.id]);

  useEffect(() => {
    const bumps = new Set();
    Object.entries(unreadCounts).forEach(([key, count]) => {
      const prev = prevUnreadRef.current[key] || 0;
      if (count > prev) bumps.add(key);
    });
    prevUnreadRef.current = { ...unreadCounts };
    if (!bumps.size) return undefined;
    setUnreadBumpKeys(bumps);
    const timer = window.setTimeout(() => setUnreadBumpKeys(new Set()), 500);
    return () => window.clearTimeout(timer);
  }, [unreadCounts]);

  const flashPinChat = (chatType, chatId) => {
    const key = `${chatType}:${chatId}`;
    setPinFlashKeys((prev) => new Set(prev).add(key));
    window.setTimeout(() => {
      setPinFlashKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 550);
  };

  useEffect(() => {
    if (!socket) return;
    const onPresence = ({ userId, online, lastSeenAt }) => {
      if (!userId) return;
      setPresenceByUserId((prev) => ({
        ...prev,
        [String(userId)]: {
          ...(prev[String(userId)] || {}),
          online: !!online,
          lastSeenAt: lastSeenAt ?? (online ? null : Math.floor(Date.now() / 1000)),
        },
      }));
    };
    socket.on('presence_changed', onPresence);
    const onStatus = ({ userId, customStatusEmoji, customStatusText, customStatusMode }) => {
      if (!userId) return;
      setPresenceByUserId((prev) => ({
        ...prev,
        [String(userId)]: {
          ...(prev[String(userId)] || {}),
          customStatusEmoji: customStatusEmoji || '',
          customStatusText: customStatusText || '',
          customStatusMode: customStatusMode || 'online',
        },
      }));
      setUsers((prev) => prev.map((u) => (
        String(u.id) === String(userId)
          ? { ...u, customStatusEmoji, customStatusText, customStatusMode }
          : u
      )));
      if (String(userId) === String(user?.id)) {
        updateUser({
          customStatusEmoji: customStatusEmoji || '',
          customStatusText: customStatusText || '',
          customStatusMode: customStatusMode || 'online',
        });
      }
    };
    socket.on('status_changed', onStatus);
    const onActivity = ({ userId, activities }) => {
      if (!userId) return;
      const uid = String(userId);
      const incoming = Array.isArray(activities) ? activities : [];
      const prevActs = remoteActivitiesRef.current[uid] || [];
      const merged = mergePlaybackActivities(prevActs, incoming);
      remoteActivitiesRef.current[uid] = merged;
      setPresenceByUserId((prev) => ({
        ...prev,
        [uid]: {
          ...(prev[uid] || {}),
          activities: merged,
        },
      }));
    };
    socket.on('activity_changed', onActivity);
    return () => {
      socket.off('presence_changed', onPresence);
      socket.off('status_changed', onStatus);
      socket.off('activity_changed', onActivity);
    };
  }, [socket, user?.id, updateUser]);

  // Загрузка данных и недавних чатов (параллельные запросы — без лагов)
  useEffect(() => {
    let cancelled = false;
    Promise.all([getUsers(), getGroups(), getServers(), getArchivedChats()])
      .then(([u, g, srv, arch]) => {
        if (cancelled) return;
        setArchivedChats(Array.isArray(arch) ? arch : []);
        const otherUsers = u.filter((x) => String(x.id) !== String(user.id));
        setUsers(otherUsers);
        setGroups(g);
        setServers(Array.isArray(srv) ? srv : []);
        const stored = getStoredLastChat();
        if (stored && stored.type === 'user' && String(stored.id) === SAVED_CHAT_ID) {
          setSelected({ type: 'user', id: SAVED_CHAT_ID });
        } else if (stored && ((stored.type === 'user' && otherUsers.some((us) => String(us.id) === String(stored.id))) || (stored.type === 'group' && g.some((gr) => String(gr.id) === String(stored.id))))) {
          setSelected(stored);
          const gr = g.find((x) => String(x.id) === String(stored.id));
          if (stored.type === 'group' && gr?.serverId) setSelectedServerId(gr.serverId);
        }
        const chatPromises = [
          getMessages('user', user.id).then((data) => ({ type: 'saved', msgs: data.messages })),
          ...otherUsers.map((u) => getMessages('user', u.id).then((data) => ({ type: 'user', user: u, msgs: data.messages }))),
          ...g.map((gr) => getMessages('group', gr.id).then((data) => ({ type: 'group', group: gr, msgs: data.messages }))),
        ];
        return Promise.allSettled(chatPromises).then((results) => {
          if (cancelled) return;
          const chats = [];
          results.forEach((r) => {
            if (r.status !== 'fulfilled') return;
            const { value } = r;
            const lastMsg = value.msgs?.length > 0 ? value.msgs[value.msgs.length - 1] : null;
            if (!lastMsg) return;
            if (value.type === 'saved') {
              chats.push({
                type: 'user',
                id: SAVED_CHAT_ID,
                name: 'Saved Messages',
                login: '',
                avatarPath: null,
                lastMessage: formatMessagePreview(lastMsg),
                lastMessageTime: lastMsg.createdAt,
              });
            } else if (value.type === 'user') {
              chats.push({
                type: 'user',
                id: value.user.id,
                name: value.user.displayName,
                login: value.user.login,
                avatarPath: value.user.avatarPath,
                lastMessage: formatMessagePreview(lastMsg),
                lastMessageTime: lastMsg.createdAt,
              });
            } else {
              chats.push({
                type: 'group',
                id: value.group.id,
                name: value.group.name,
                lastMessage: formatMessagePreview(lastMsg, { isGroup: true, senderName: lastMsg.senderName }),
                lastMessageTime: lastMsg.createdAt,
              });
            }
          });
          chats.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
          const archivedSet = new Set((Array.isArray(arch) ? arch : []).map((c) => `${c.type}:${c.id}`));
          setRecentChats(chats.filter((c) => !archivedSet.has(`${c.type}:${c.id}`)));
        });
      })
      .catch((e) => { if (!cancelled) console.error(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user.id]);

  useEffect(() => {
    if (!user?.id || !selectedUser?.id) return;
    if (String(selectedUser.id) !== String(user.id)) return;
    setSelectedUser((prev) => (prev ? { ...prev, ...user } : prev));
  }, [user, selectedUser?.id]);

  // Синхронизация веб ↔ приложение: при событии sync перезагружаем профиль или списки
  useEffect(() => {
    if (!socket) return;
    const onSync = (payload) => {
      if (payload?.type === 'profile') {
        refreshUser();
        getUsers()
          .then((u) => {
            setUsers(u.filter((x) => String(x.id) !== String(user.id)));
            setSelectedUser((prev) => {
              if (!prev) return prev;
              const fresh = u.find((x) => String(x.id) === String(prev.id));
              return fresh || prev;
            });
          })
          .catch(console.error);
      }
      if (payload?.type === 'groups' || payload?.type === 'servers') {
        invalidateServersListCache();
        Promise.all([getUsers(), getGroups(), getServers()]).then(([u, g, srv]) => {
          setUsers(u.filter((x) => String(x.id) !== String(user.id)));
          setGroups(g);
          setServers(Array.isArray(srv) ? srv : []);
          loadRecentChats(u, g);
        }).catch(console.error);
      }
    };
    const onAvatar = (payload) => {
      if (!payload?.userId || !payload?.avatarPath) return;
      const uid = String(payload.userId);
      setUsers((prev) => prev.map((u) => (String(u.id) === uid ? { ...u, avatarPath: payload.avatarPath } : u)));
      setSelectedUser((prev) => (prev && String(prev.id) === uid ? { ...prev, avatarPath: payload.avatarPath } : prev));
      setRecentChats((prev) =>
        Array.isArray(prev)
          ? prev.map((c) => (c.type === 'user' && String(c.id) === uid ? { ...c, avatarPath: payload.avatarPath } : c))
          : prev
      );
      if (user && String(user.id) === uid) {
        refreshUser();
      }
    };
    socket.on('sync', onSync);
    socket.on('user:avatar', onAvatar);
    return () => {
      socket.off('sync', onSync);
      socket.off('user:avatar', onAvatar);
    };
  }, [socket]);

  const loadRecentChats = (allUsers, allGroups) => {
    const otherUsers = allUsers.filter((x) => String(x.id) !== String(user.id));
    getArchivedChats().then((arch) => setArchivedChats(Array.isArray(arch) ? arch : [])).catch(() => {});
    const chatPromises = [
      getMessages('user', user.id).then((data) => ({ type: 'saved', msgs: data.messages })),
      ...otherUsers.map((u) => getMessages('user', u.id).then((data) => ({ type: 'user', user: u, msgs: data.messages }))),
      ...allGroups.map((gr) => getMessages('group', gr.id).then((data) => ({ type: 'group', group: gr, msgs: data.messages }))),
    ];
    Promise.allSettled(chatPromises).then((results) => {
      const chats = [];
      results.forEach((r) => {
        if (r.status !== 'fulfilled') return;
        const { value } = r;
        const lastMsg = value.msgs?.length > 0 ? value.msgs[value.msgs.length - 1] : null;
        if (value.type === 'saved') {
          if (!lastMsg) return;
          chats.push({
            type: 'user',
            id: SAVED_CHAT_ID,
            name: 'Saved Messages',
            login: '',
            avatarPath: null,
            lastMessage: formatMessagePreview(lastMsg),
            lastMessageTime: lastMsg.createdAt,
          });
        } else if (value.type === 'user') {
          if (!lastMsg) return;
          chats.push({
            type: 'user',
            id: value.user.id,
            name: value.user.displayName,
            login: value.user.login,
            avatarPath: value.user.avatarPath,
            lastMessage: formatMessagePreview(lastMsg),
            lastMessageTime: lastMsg.createdAt,
          });
        } else {
          if (!lastMsg) return;
          chats.push({
            type: 'group',
            id: value.group.id,
            name: value.group.name,
            lastMessage: formatMessagePreview(lastMsg, { isGroup: true, senderName: lastMsg.senderName }),
            lastMessageTime: lastMsg.createdAt,
          });
        }
      });
      getArchivedChats()
        .then((arch) => {
          const archivedSet = new Set((Array.isArray(arch) ? arch : []).map((c) => `${c.type}:${c.id}`));
          setArchivedChats(Array.isArray(arch) ? arch : []);
          setRecentChats(chats.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0)).filter((c) => !archivedSet.has(`${c.type}:${c.id}`)));
        })
        .catch(() => setRecentChats(chats.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0))));
    }).catch(console.error);
  };

  const refreshGroups = () => {
    Promise.all([getGroups(), getServers(), getUsers()]).then(([g, srv, u]) => {
      setGroups(g);
      setServers(Array.isArray(srv) ? srv : []);
      setUsers(u.filter((x) => String(x.id) !== String(user.id)));
      loadRecentChats(u, g);
    }).catch(console.error);
  };

  // Обновление недавних чатов при получении новых сообщений (актуальные users/groups из ref)
  useEffect(() => {
    if (!socket || !user?.id) return;
    const currentUserId = user.id;
    const onNewMessage = (msg) => {
      const isIncoming = String(msg.senderId) !== String(currentUserId);
      const chatType = msg.recipientType === 'group' ? 'group' : 'user';
      const chatId = chatType === 'group'
        ? msg.recipientId
        : (String(msg.recipientId) === String(currentUserId) ? msg.senderId : msg.recipientId);
      const u = usersRef.current;
      const g = groupsRef.current;
      const isBackground = typeof document !== 'undefined' && (document.hidden || !document.hasFocus?.());
      const sel = selectedRef.current;
      const isCurrentChat = sel?.type === chatType && String(sel?.id) === String(chatId);
      const mutedState = getChatMuteState(chatType, chatId);
      const muted = mutedState.muted;
      const silentMsg = !!msg.isSilent;
      if (isIncoming && isBackground && !isCurrentChat && !muted && !silentMsg) {
        const chatName = chatType === 'group'
          ? (g.find((gr) => gr.id === chatId)?.name || 'Group')
          : (u.find((us) => us.id === chatId)?.displayName || 'User');
        const avatarPath = chatType === 'user' ? u.find((us) => us.id === chatId)?.avatarPath : (g.find((gr) => gr.id === chatId)?.avatarPath ?? null);
        const content = msg.content || '';
        const nid = `n-${++notificationIdRef.current}-${Date.now()}`;
        setNotifications((prev) => [
          ...prev.slice(-19),
          { id: nid, type: chatType, chatId, chatName, avatarPath, senderName: msg.senderName || null, content },
        ]);
        playNotificationSound();

        // Показываем системное уведомление Windows
        const notificationTitle = chatType === 'group' && msg.senderName
          ? `${msg.senderName} в ${chatName}`
          : chatName;
        const notificationBody = content || (msg.voicePath ? 'Голосовое сообщение' : 'Вложение');
        const notificationIcon = avatarPath ? avatarUrl(avatarPath) : undefined;

        showSystemNotification({
          title: notificationTitle,
          body: notificationBody,
          icon: notificationIcon,
          tag: `chat-${chatType}-${chatId}`,
          onClick: () => {
            if (chatType === 'user') setSelectedServerId(null);
            else if (chatType === 'group') {
              const gr = groupsRef.current.find((gr) => String(gr.id) === String(chatId));
              if (gr?.serverId) setSelectedServerId(gr.serverId);
              else setSelectedServerId(null);
            }
            setSelected({ type: chatType, id: chatId });
            setNotifications((prev) => prev.filter((x) => x.id !== nid));
          },
        });
      }
      if (
        isIncoming
        && !isCurrentChat
        && getAppSettings().foldersShowUnreadBadge !== false
        && !(muted && mutedState.hideBadge)
        && !silentMsg
      ) {
        incrementUnread(chatType, chatId);
        setUnreadCounts(getUnreadCounts());
      }
      const preview = formatMessagePreview(msg, {
        isGroup: chatType === 'group',
        senderName: msg.senderName,
      });
      setRecentChats((prev) => {
        const existingIndex = prev.findIndex((c) => c.type === chatType && String(c.id) === String(chatId));
        const name = chatType === 'group'
          ? g.find((gr) => gr.id === chatId)?.name || 'Group'
          : u.find((us) => us.id === chatId)?.displayName || 'User';
        const login = chatType === 'user' ? u.find((us) => us.id === chatId)?.login : undefined;
        const avatarPath = chatType === 'user' ? u.find((us) => us.id === chatId)?.avatarPath : undefined;
        const newChat = {
          type: chatType,
          id: chatId,
          name,
          login,
          avatarPath,
          lastMessage: preview,
          lastMessageTime: msg.createdAt || Math.floor(Date.now() / 1000),
        };
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = newChat;
          return updated.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
        }
        return [newChat, ...prev].sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
      });
    };
    socket.on('new_message', onNewMessage);
    return () => socket.off('new_message', onNewMessage);
  }, [socket, user?.id]);

  const chatSearchLower = chatSearch.trim().toLowerCase();
  /** Запрос без ведущего @ — иначе @nick не совпадает с login "nick" */
  const searchQueryNoAt = chatSearchLower.replace(/^@+/, '');
  const matchUserText = (displayName, login) => {
    const dn = (displayName || '').toLowerCase();
    const lg = (login || '').toLowerCase();
    if (!chatSearchLower) return true;
    if (dn.includes(chatSearchLower) || lg.includes(chatSearchLower)) return true;
    if (searchQueryNoAt && (dn.includes(searchQueryNoAt) || lg.includes(searchQueryNoAt))) return true;
    return false;
  };
  /** Недавние чаты по запросу (имя, логин, текст последнего сообщения) */
  const filteredRecentChats = chatSearchLower
    ? recentChats.filter((chat) => {
        if (chat.type === 'user') {
          const displayName = contactNames[String(chat.id)] || chat.name;
          const lastMsg = typeof chat.lastMessage === 'string' ? chat.lastMessage.toLowerCase() : '';
          const byName = matchUserText(displayName, chat.login);
          const byMsg = lastMsg.includes(chatSearchLower) || (searchQueryNoAt && lastMsg.includes(searchQueryNoAt));
          return byName || byMsg;
        }
        const name = (chat.name || '').toLowerCase();
        return name.includes(chatSearchLower) || (searchQueryNoAt && name.includes(searchQueryNoAt));
      })
    : recentChats;
  /** Группы и каналы из полного списка, если в «недавних» ещё не было переписки */
  const extraGroupMatches = chatSearchLower
    ? groups
        .filter((g) => {
          const n = (g.name || '').toLowerCase();
          return n.includes(chatSearchLower) || (searchQueryNoAt && n.includes(searchQueryNoAt));
        })
        .filter((g) => !filteredRecentChats.some((c) => c.type === 'group' && String(c.id) === String(g.id)))
        .map((g) => ({
          type: 'group',
          id: g.id,
          name: g.name,
          lastMessage: '',
          lastMessageTime: 0,
          avatarPath: g.avatarPath,
        }))
    : [];
  const filteredChats = chatSearchLower ? [...filteredRecentChats, ...extraGroupMatches] : recentChats;

  const folderFilteredChats = useMemo(() => {
    let list = filteredChats;
    if (chatFolder === 'users') list = list.filter((c) => c.type === 'user');
    else if (chatFolder === 'groups') list = list.filter((c) => c.type === 'group');
    else if (chatFolder === 'unread') {
      list = list.filter((c) => (unreadCounts[`${c.type}:${c.id}`] || 0) > 0);
    } else if (String(chatFolder).startsWith('custom:')) {
      const fid = String(chatFolder).slice('custom:'.length);
      const folder = customFolders.find((f) => f.id === fid);
      const keys = new Set(folder?.chatKeys || []);
      list = list.filter((c) => keys.has(`${c.type}:${c.id}`));
    }
    const pinnedKeys = new Set(getPinnedChatKeys());
    return [...list].sort((a, b) => {
      const ap = pinnedKeys.has(`${a.type}:${a.id}`) ? 1 : 0;
      const bp = pinnedKeys.has(`${b.type}:${b.id}`) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
    });
  }, [filteredChats, chatFolder, unreadCounts, pinnedVersion, customFolders]);

  const folderFilteredChatsRef = useRef(folderFilteredChats);
  folderFilteredChatsRef.current = folderFilteredChats;

  useEffect(() => {
    const sync = () => {
      setDraftMap(getDraftMap());
      setDraftTick((n) => n + 1);
    };
    window.addEventListener('nova-drafts', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('nova-drafts', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    const parseDeepLink = () => {
      const h = String(window.location.hash || '');
      const m = h.match(/^#chat\/(user|group)\/([^/]+)\/msg\/([^/?#]+)/i);
      if (!m) return;
      const type = m[1].toLowerCase() === 'group' ? 'group' : 'user';
      const id = decodeURIComponent(m[2]);
      const msgId = decodeURIComponent(m[3]);
      setSelected({ type, id });
      sessionStorage.setItem('nova_scroll_msg', msgId);
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#msg-${msgId}`);
    };
    parseDeepLink();
    window.addEventListener('hashchange', parseDeepLink);
    return () => window.removeEventListener('hashchange', parseDeepLink);
  }, []);

  const searchMatchedUsers = chatSearchLower
    ? users
        .filter((u) => {
          if (!searchQueryNoAt && chatSearchLower.includes('@')) return false;
          return matchUserText(u.displayName, u.login);
        })
        .filter((u) => !filteredChats.some((c) => c.type === 'user' && String(c.id) === String(u.id)))
    : [];

  const { presenceFetchIds, presenceIdsKey } = useMemo(() => {
    if (!user?.id) return { presenceFetchIds: [], presenceIdsKey: '' };
    const uid = String(user.id);
    const ordered = [];
    const add = (id) => {
      const s = String(id);
      if (!s || s === SAVED_CHAT_ID || s === uid) return;
      if (!ordered.includes(s)) ordered.push(s);
    };
    for (const c of recentChats) {
      if (c.type === 'user') add(c.id);
    }
    for (const u of searchMatchedUsers) add(u.id);
    for (const u of users) add(u.id);
    const ids = ordered.slice(0, 100);
    return { presenceFetchIds: ids, presenceIdsKey: [...ids].sort().join(',') };
  }, [user?.id, users, recentChats, searchMatchedUsers]);

  const presenceFetchIdsRef = useRef(presenceFetchIds);
  presenceFetchIdsRef.current = presenceFetchIds;

  useEffect(() => {
    if (!user?.id || presenceFetchIds.length === 0) {
      setPresenceByUserId({});
      return;
    }
    let cancelled = false;
    const load = () => {
      const ids = presenceFetchIdsRef.current;
      if (!ids.length) return;
      getPresenceBatch(ids)
        .then((data) => {
          if (cancelled || !data) return;
          setPresenceByUserId((prev) => {
            const next = {};
            for (const [k, v] of Object.entries(data)) {
              const uid = String(k);
              const incoming = Array.isArray(v?.activities) ? v.activities : [];
              const prevActs = remoteActivitiesRef.current[uid] || prev[uid]?.activities || [];
              const merged = mergePlaybackActivities(prevActs, incoming);
              remoteActivitiesRef.current[uid] = merged;
              next[uid] = { ...v, activities: merged };
            }
            return next;
          });
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 45000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user?.id, presenceIdsKey]);

  useEffect(() => {
    if (!connected || !user?.id) return;
    const ids = presenceFetchIdsRef.current;
    if (!ids.length) return;
    getPresenceBatch(ids)
      .then((data) => {
        if (!data) return;
        setPresenceByUserId((prev) => {
          const next = {};
          for (const [k, v] of Object.entries(data)) {
            const uid = String(k);
            const incoming = Array.isArray(v?.activities) ? v.activities : [];
            const prevActs = remoteActivitiesRef.current[uid] || prev[uid]?.activities || [];
            const merged = mergePlaybackActivities(prevActs, incoming);
            remoteActivitiesRef.current[uid] = merged;
            next[uid] = { ...v, activities: merged };
          }
          return next;
        });
      })
      .catch(() => {});
  }, [connected, user?.id]);

  const openDmWithUser = (u) => {
    setSelectedServerId(null);
    setSelected({ type: 'user', id: u.id });
    setRecentChats((prev) => {
      const exists = prev.some((c) => c.type === 'user' && String(c.id) === String(u.id));
      if (exists) {
        return prev.map((c) =>
          c.type === 'user' && String(c.id) === String(u.id)
            ? { ...c, lastMessageTime: Math.floor(Date.now() / 1000) }
            : c
        ).sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
      }
      return [
        {
          type: 'user',
          id: u.id,
          name: u.displayName,
          login: u.login,
          avatarPath: u.avatarPath,
          lastMessage: '',
          lastMessageTime: Math.floor(Date.now() / 1000),
        },
        ...prev,
      ].sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
    });
    closeSidebar();
  };

  const currentChat = selected
    ? selected.type === 'user'
      ? (String(selected.id) === SAVED_CHAT_ID
        ? {
            id: user.id,
            displayName: 'Saved Messages',
            login: user.login || 'saved',
            avatarPath: user.avatarPath || null,
            bio: 'Your personal space',
            createdAt: user.createdAt ?? null,
            socialLinks: user.socialLinks || {},
          }
        : users.find((u) => u.id === selected.id) || { id: selected.id, displayName: 'User', avatarPath: null, bio: '' })
      : (() => {
          const group = groups.find((g) => g.id === selected.id);
          if (group) {
            return { ...group, name: group.name, avatarPath: group.avatarPath || null };
          }
          // Если группа не найдена в списке, возвращаем базовый объект
          return { id: selected.id, name: 'Group', avatarPath: null, isGroup: true };
        })()
    : null;

  const isSelectedArchived = selected
    ? archivedChats.some((c) => c.type === selected.type && String(c.id) === String(selected.id))
    : false;

  const closeSidebar = () => setSidebarOpen(false);

  const avatarRingForUserId = (userId) => {
    if (userId == null) return undefined;
    if (String(userId) === String(user?.id)) return user?.avatarRing;
    const u = users.find((x) => String(x.id) === String(userId));
    return u?.avatarRing;
  };

  const isAdmin = Boolean(user?.isAdmin ?? user?.login === 'lololowkid');

  useEffect(() => {
    if (!isAdmin || !showAdminPanel) return;
    let cancelled = false;
    getAdminSettings()
      .then((d) => {
        if (!cancelled && d) setAdminAllowUsernameAll(!!d.allowUsernameChangeAll);
      })
      .catch(() => {});
    getAchievementsCatalog()
      .then((rows) => { if (!cancelled) setAdminAchievementsCatalog(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setAdminAchievementsCatalog([]); });
    return () => { cancelled = true; };
  }, [isAdmin, showAdminPanel]);

  const normalizedSearch = (text) => text.trim().toLowerCase();

  const getFilteredAdminGroups = () => {
    const q = normalizedSearch(adminGroupQuery);
    if (!q) return groups;
    const withQuery = groups.filter((g) => (g.name || '').toLowerCase().includes(q));
    const exact = groups.filter((g) => (g.name || '').toLowerCase() === q);
    return exact.length > 0 ? exact : withQuery;
  };

  const getFilteredAdminUsers = () => {
    const q = normalizedSearch(adminUserQuery);
    if (!q) return users;
    const byText = users.filter((u) => {
      const name = (u.displayName || '').toLowerCase();
      const login = (u.login || '').toLowerCase();
      return name.includes(q) || login.includes(q);
    });
    const exact = users.filter((u) => {
      const name = (u.displayName || '').toLowerCase();
      const login = (u.login || '').toLowerCase();
      return name === q || login === q;
    });
    return exact.length > 0 ? exact : byText;
  };

  const navigateToChat = (sel) => {
    if (!sel || !sel.type) return;
    if (sel.type === 'user') {
      setSelectedServerId(null);
      setSelected(sel);
      return;
    }
    if (sel.type === 'group') {
      const gr = groups.find((x) => String(x.id) === String(sel.id));
      if (gr?.serverId) setSelectedServerId(gr.serverId);
      else setSelectedServerId(null);
      setSelected(sel);
    }
  };

  const handleOpenGroupFromAdmin = (groupId) => {
    navigateToChat({ type: 'group', id: groupId });
    setShowAdminPanel(false);
    closeSidebar();
  };

  const handleForwardChoose = (target, message) => {
    setSelected({ type: target.type, id: target.id });
    setPendingForwardMessage(message);
    if (target.type === 'group') {
      const gr = groups.find((x) => String(x.id) === String(target.id));
      if (gr?.serverId) setSelectedServerId(gr.serverId);
    }
    if (target.type === 'user') setSelectedServerId(null);
  };

  const homeGroups = groups.filter((g) => !g.serverId && g.kind !== 'channel');
  const homeChannels = groups.filter((g) => !g.serverId && g.kind === 'channel');
  const currentServer = servers.find((s) => String(s.id) === String(selectedServerId));
  const serverChannels = selectedServerId
    ? groups.filter((g) => g.serverId != null && String(g.serverId) === String(selectedServerId))
    : [];
  const serverChannelsFiltered = selectedServerId
    ? !chatSearch.trim()
      ? serverChannels
      : serverChannels.filter((g) => {
          const n = (g.name || '').toLowerCase();
          return n.includes(chatSearchLower) || (searchQueryNoAt && n.includes(searchQueryNoAt));
        })
    : [];

  /** Недавние ЛС для иконок в левой колонке */
  const railDmChats = useMemo(
    () =>
      recentChats
        .filter((c) => c.type === 'user')
        .sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0))
        .slice(0, 24),
    [recentChats]
  );

  const handleAdminBanUser = async (u, durationSec) => {
    try {
      const res = await import('./api');
      if (res.adminBanUser) {
        await res.adminBanUser(u.id, durationSec);
        await refreshUser();
        const updatedUsers = await getUsers();
        setUsers(updatedUsers.filter((x) => String(x.id) !== String(user.id)));
      } else {
        console.warn('adminBanUser API is not implemented on client');
      }
    } catch (e) {
      console.error('Admin ban failed', e);
    }
  };

  const handleAdminVerifyUser = async (u, nextVerified) => {
    try {
      const res = await import('./api');
      if (res.adminSetVerification) {
        await res.adminSetVerification(u.id, nextVerified);
        const updatedUsers = await getUsers();
        setUsers(updatedUsers.filter((x) => String(x.id) !== String(user.id)));
      } else {
        console.warn('adminSetVerification API is not implemented on client');
      }
    } catch (e) {
      console.error('Admin verify failed', e);
    }
  };

  const cycleChatList = () => {
    setChatListMode((prev) => {
      const idx = CHAT_LIST_MODES.indexOf(prev);
      const next = CHAT_LIST_MODES[(idx + 1) % CHAT_LIST_MODES.length];
      try { localStorage.setItem(CHAT_LIST_MODE_KEY, next); } catch {}
      return next;
    });
  };

  const openSelfProfile = () => {
    if (!user) return;
    setSelectedUser(user);
    setShowUserProfile(true);
    closeSidebar();
  };

  const handleSidebarStatus = async (preset) => {
    if (preset?.id != null) {
      try {
        const updated = await updateCustomStatus({
          emoji: preset.emoji,
          text: preset.text,
          mode: preset.mode,
        });
        updateUser(updated);
      } catch (e) {
        console.error(e);
      }
      return;
    }
    setShowStatusPicker(true);
  };

  const sidebarUserPanel = (
    <SidebarUserPanel
      user={user}
      connected={connected}
      activities={myActivities}
      t={t}
      lang={getStoredLang()}
      isAdmin={isAdmin}
      onStatusClick={handleSidebarStatus}
      onProfileClick={openSelfProfile}
      onSettingsClick={() => { setShowMessengerSettings(true); closeSidebar(); }}
      onAdminClick={() => { setShowAdminPanel(true); closeSidebar(); }}
    />
  );

  return (
    <div className="messenger">
      <NovaAmbient variant="messenger" density={22} />
      <aside className="server-rail" aria-label="Чаты, группы, каналы и серверы">
        <button
          type="button"
          className={`server-rail-btn server-rail-home ${selectedServerId == null ? 'active' : ''}`}
          onClick={() => {
            setSelectedServerId(null);
            closeSidebar();
          }}
          title="Личные сообщения"
        >
          <span className="server-rail-home-ico" aria-hidden />
        </button>
        {(homeGroups.length > 0 || homeChannels.length > 0 || railDmChats.length > 0 || servers.length > 0) && (
          <div className="server-rail-separator" role="presentation" />
        )}
        {homeGroups.map((g) => (
          <button
            key={`rail-group-${g.id}`}
            type="button"
            className={`server-rail-btn server-rail-group ${
              selectedServerId == null && selected?.type === 'group' && String(selected.id) === String(g.id) ? 'active' : ''
            }`}
            onClick={() => {
              setSelectedServerId(null);
              setSelected({ type: 'group', id: g.id });
              closeSidebar();
            }}
            title={g.name}
          >
            <span className="server-rail-abbr">{g.name.slice(0, 2).toUpperCase()}</span>
          </button>
        ))}
        {homeChannels.map((g) => (
          <button
            key={`rail-channel-${g.id}`}
            type="button"
            className={`server-rail-btn server-rail-channel ${
              selectedServerId == null && selected?.type === 'group' && String(selected.id) === String(g.id) ? 'active' : ''
            }`}
            onClick={() => {
              setSelectedServerId(null);
              setSelected({ type: 'group', id: g.id });
              closeSidebar();
            }}
            title={g.name}
          >
            <span className="server-rail-abbr">#</span>
          </button>
        ))}
        {homeGroups.length > 0 && railDmChats.length > 0 && <div className="server-rail-separator" role="presentation" />}
        {railDmChats.map((chat) => (
          <button
            key={`rail-dm-${chat.id}`}
            type="button"
            className={`server-rail-btn server-rail-dm ${
              selectedServerId == null && selected?.type === 'user' && String(selected.id) === String(chat.id) ? 'active' : ''
            }`}
            onClick={() => {
              const u = users.find((us) => String(us.id) === String(chat.id));
              if (u) openDmWithUser(u);
              else {
                setSelectedServerId(null);
                setSelected({ type: 'user', id: chat.id });
                closeSidebar();
              }
            }}
            title={contactNames[String(chat.id)] || chat.name || 'Личный чат'}
          >
            <Avatar
              path={chat.avatarPath}
              userId={chat.id}
              size="md"
              ring={avatarRingForUserId(chat.id)}
              presenceOnline={
                String(chat.id) === SAVED_CHAT_ID ? undefined : peerPresenceDot(presenceByUserId[String(chat.id)])
              }
            />
          </button>
        ))}
        {servers.length > 0 && (homeGroups.length > 0 || railDmChats.length > 0) && (
          <div className="server-rail-separator" role="presentation" />
        )}
        {servers.map((s) => {
          const chans = groups.filter(
            (g) => g.serverId != null && String(g.serverId) === String(s.id)
          );
          return (
            <React.Fragment key={`rail-srv-${s.id}`}>
              <button
                type="button"
                className={`server-rail-btn server-rail-server ${
                  selectedServerId != null && String(selectedServerId) === String(s.id) ? 'active' : ''
                }`}
                onClick={() => {
                  setSelectedServerId(s.id);
                  closeSidebar();
                }}
                title={s.name}
              >
                <span className="server-rail-abbr">{s.name.slice(0, 2).toUpperCase()}</span>
              </button>
              {chans.map((ch) => (
                <button
                  key={`rail-ch-${ch.id}`}
                  type="button"
                  className={`server-rail-btn server-rail-channel ${
                    selected?.type === 'group' && String(selected.id) === String(ch.id) ? 'active' : ''
                  }`}
                  onClick={() => {
                    setSelectedServerId(s.id);
                    setSelected({ type: 'group', id: ch.id });
                    closeSidebar();
                  }}
                  title={`#${ch.name}`}
                >
                  <span className="server-rail-ch-inner" aria-hidden>
                    <span className="server-rail-ch-hash">#</span>
                    <span className="server-rail-ch-letter">{ch.name.slice(0, 1).toUpperCase()}</span>
                  </span>
                </button>
              ))}
            </React.Fragment>
          );
        })}
        <div className="server-rail-separator" role="presentation" />
        <button
          type="button"
          className="server-rail-btn server-rail-add"
          onClick={() => setShowServerCreate(true)}
          title="Создать сервер"
        >
          +
        </button>
      </aside>

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}${chatListMode === 'hidden' ? ' sidebar--hidden' : ''}${chatListMode === 'narrow' ? ' sidebar--narrow' : ''}${!connected ? ' sidebar--offline' : ''}`}>
        {!connected && (
          <div className="sidebar-offline-banner" role="status">
            <span className="sidebar-offline-banner-dot" aria-hidden />
            {t('reconnecting')}
          </div>
        )}
        {selectedServerId == null ? (
        <>
        {sidebarUserPanel}
        <nav className="sidebar-nav sidebar-nav-home-search">
          {!loading && (
            <div className="sidebar-search-wrap sidebar-search-wrap-home">
              <input
                type="text"
                className="sidebar-search"
                placeholder={t('searchPlaceholder')}
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                aria-label={t('searchAriaLabel')}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
          {loading ? (
            <ChatListSkeleton rows={7} />
          ) : !chatSearch.trim() ? (
            <div className="sidebar-home-main">
              <p className="sidebar-home-hint sidebar-home-hint-compact">{t('sidebarHomeHint')}</p>
              <section className="nav-section">
                <h3>
                  {t('recentChats')}
                  {totalUnread > 0 && getAppSettings().foldersShowUnreadBadge !== false && (
                    <span className="sidebar-unread-total">{totalUnread > 99 ? '99+' : totalUnread}</span>
                  )}
                </h3>
                {!chatSearch.trim() && (
                  <div className="chat-folder-tabs" role="tablist" aria-label="Папки чатов">
                    {[
                      { id: 'all', label: t('folderAll') },
                      { id: 'users', label: t('folderUsers') },
                      { id: 'groups', label: t('folderGroups') },
                      { id: 'unread', label: t('folderUnread') },
                      ...customFolders.map((f) => ({ id: `custom:${f.id}`, label: f.name })),
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        role="tab"
                        aria-selected={chatFolder === f.id}
                        className={`chat-folder-tab${chatFolder === f.id ? ' active' : ''}`}
                        onClick={() => setChatFolder(f.id)}
                        onContextMenu={(e) => {
                          if (!String(f.id).startsWith('custom:')) return;
                          e.preventDefault();
                          const fid = String(f.id).slice('custom:'.length);
                          if (window.confirm(t('folderDeleteConfirm'))) {
                            deleteCustomFolder(fid);
                            setCustomFolders(getCustomFolders());
                            if (chatFolder === f.id) setChatFolder('all');
                          }
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="chat-folder-tab chat-folder-tab--add"
                      title={t('folderCreate')}
                      aria-label={t('folderCreate')}
                      onClick={() => {
                        const name = window.prompt(t('folderCreatePrompt'));
                        if (!name) return;
                        const created = createCustomFolder(name);
                        if (created) {
                          setCustomFolders(getCustomFolders());
                          setChatFolder(`custom:${created.id}`);
                        }
                      }}
                    >
                      +
                    </button>
                  </div>
                )}
                {archivedChats.length > 0 && (
                  <button type="button" className="messenger-settings-row" onClick={() => setShowArchive((v) => !v)}>
                    <span className="messenger-settings-row-left">
                      <span className="messenger-settings-row-icon">📦</span>
                      <span className="messenger-settings-row-text">{showArchive ? 'Hide archive' : `Archive (${archivedChats.length})`}</span>
                    </span>
                  </button>
                )}
                {showArchive && archivedChats.length > 0 && (
                  <ul className="chat-list">
                    {archivedChats.slice(0, 50).map((a) => (
                      <li key={`arch-${a.type}-${a.id}`} onClick={() => { setSelected({ type: a.type, id: a.id }); closeSidebar(); }}>
                        <span className="chat-list-icon">📦</span>
                        <span className="chat-list-name">{a.type === 'group' ? (groups.find((g) => String(g.id) === String(a.id))?.name || 'Group') : (a.id === SAVED_CHAT_ID ? 'Saved Messages' : (users.find((u) => String(u.id) === String(a.id))?.displayName || 'User'))}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <ul className="chat-list">
                  {folderFilteredChats.map((chat) => {
                    const unread = unreadCounts[`${chat.type}:${chat.id}`] || 0;
                    const hasUnread = unread > 0;
                    const chatPinned = isChatPinned(chat.type, chat.id);
                    const chatMuted = isChatMuted(chat.type, chat.id);
                    const peerPresence = chat.type === 'user' && String(chat.id) !== SAVED_CHAT_ID
                      ? resolveUserPresence(presenceByUserId, users, chat.id)
                      : null;
                    const statusLine = chat.type === 'user' && peerPresence?.online
                      ? formatCustomStatusLine(peerPresence)
                      : '';
                    const activityPreview = chat.type === 'user' && peerPresence?.online && peerPresence?.activities?.length
                      ? peerPresence.activities
                      : null;
                    return (
                    <li
                      key={`${chat.type}-${chat.id}`}
                      className={[
                        selected?.type === chat.type && String(selected.id) === String(chat.id) ? 'active' : '',
                        hasUnread ? 'chat-list-item-unread' : '',
                        chatPinned ? 'chat-list-item-pinned' : '',
                        pinFlashKeys.has(`${chat.type}:${chat.id}`) ? 'chat-list-item--pin-flash' : '',
                        unreadBumpKeys.has(`${chat.type}:${chat.id}`) ? 'chat-list-item--unread-pulse' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => {
                        if (chat.type === 'user') setSelectedServerId(null);
                        if (chat.type === 'group') {
                          const gr = groups.find((x) => String(x.id) === String(chat.id));
                          if (gr?.serverId) setSelectedServerId(gr.serverId);
                          else setSelectedServerId(null);
                        }
                        setSelected({ type: chat.type, id: chat.id });
                        closeSidebar();
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setChatCtxMenu({
                          x: e.clientX,
                          y: e.clientY,
                          type: chat.type,
                          id: chat.id,
                          muted: chatMuted,
                          pinned: chatPinned,
                          hasUnread,
                        });
                      }}
                    >
                      {chat.type === 'user' ? (
                        <>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              if (String(chat.id) === SAVED_CHAT_ID) return;
                              const u = users.find((us) => String(us.id) === String(chat.id));
                              if (u) {
                                setSelectedUser(u);
                                setShowUserProfile(true);
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            {String(chat.id) === SAVED_CHAT_ID ? (
                              <span className="chat-list-icon">🔖</span>
                            ) : (
                              <Avatar
                                path={chat.avatarPath}
                                userId={chat.id}
                                size="sm"
                                ring={avatarRingForUserId(chat.id)}
                                presenceOnline={peerPresenceDot(peerPresence)}
                                presenceMode={peerPresenceMode(peerPresence)}
                              />
                            )}
                          </span>
                          <div className="chat-list-info">
                            <div className="chat-list-top-row">
                              <span className="chat-list-name">
                                {chatPinned && <span className="chat-list-pin-icon" title={t('chatPinned')}>📌</span>}
                                {contactNames[String(chat.id)] || chat.name}
                              </span>
                              <span className="chat-list-top-actions">
                                <button
                                  type="button"
                                  className="chat-list-pin-btn"
                                  title={chatPinned ? t('chatUnpinned') : t('chatPinned')}
                                  aria-label={chatPinned ? t('chatUnpinned') : t('chatPinned')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleChatPinned(chat.type, chat.id);
                                    flashPinChat(chat.type, chat.id);
                                    setPinnedVersion((v) => v + 1);
                                  }}
                                >
                                  {chatPinned ? '📌' : '📍'}
                                </button>
                                <button
                                  type="button"
                                  className="chat-list-pin-btn"
                                  title={t('folderAddChat')}
                                  aria-label={t('folderAddChat')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFolderMenuChat({ type: chat.type, id: chat.id });
                                  }}
                                >
                                  📁
                                </button>
                                <button
                                  type="button"
                                  className="chat-list-pin-btn"
                                  title={hasUnread ? t('markRead') : t('markUnread')}
                                  aria-label={hasUnread ? t('markRead') : t('markUnread')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (hasUnread) clearUnread(chat.type, chat.id);
                                    else setUnread(chat.type, chat.id, 1);
                                    setUnreadCounts(getUnreadCounts());
                                  }}
                                >
                                  {hasUnread ? '✓' : '●'}
                                </button>
                                {chat.lastMessageTime ? (
                                  <span className="chat-list-time">{formatChatListTime(chat.lastMessageTime)}</span>
                                ) : null}
                              </span>
                            </div>
                            <div className="chat-list-bottom-row">
                              <span className="chat-list-preview">
                                {draftMap[`${chat.type}:${chat.id}`] ? (
                                  <span className="chat-list-draft">
                                    <span className="chat-list-draft-label">{t('draftLabel')}: </span>
                                    {draftMap[`${chat.type}:${chat.id}`]}
                                  </span>
                                ) : activityPreview ? (
                                  <UserActivityPreview activities={activityPreview} t={t} />
                                ) : statusLine || (chat.lastMessage ? chat.lastMessage : t('noMessages'))}
                              </span>
                              <span className="chat-list-badges">
                                {chatMuted && (
                                  <span className="chat-list-muted-icon" title={t('chatMutedBadge')}>🔇</span>
                                )}
                                {hasUnread && getAppSettings().foldersShowUnreadBadge !== false && (
                                  <span className={`chat-list-unread-badge${unreadBumpKeys.has(`${chat.type}:${chat.id}`) ? ' chat-list-unread-badge--bump' : ''}`} aria-label={`${unread} ${t('unreadChats')}`}>
                                    {unread > 99 ? '99+' : unread}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="chat-list-icon chat-list-icon--channel">#</span>
                          <div className="chat-list-info">
                            <div className="chat-list-top-row">
                              <span className="chat-list-name">
                                {chatPinned && <span className="chat-list-pin-icon" title={t('chatPinned')}>📌</span>}
                                {chat.name}
                              </span>
                              <span className="chat-list-top-actions">
                                <button
                                  type="button"
                                  className="chat-list-pin-btn"
                                  title={chatPinned ? t('chatUnpinned') : t('chatPinned')}
                                  aria-label={chatPinned ? t('chatUnpinned') : t('chatPinned')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleChatPinned(chat.type, chat.id);
                                    flashPinChat(chat.type, chat.id);
                                    setPinnedVersion((v) => v + 1);
                                  }}
                                >
                                  {chatPinned ? '📌' : '📍'}
                                </button>
                                <button
                                  type="button"
                                  className="chat-list-pin-btn"
                                  title={t('folderAddChat')}
                                  aria-label={t('folderAddChat')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFolderMenuChat({ type: chat.type, id: chat.id });
                                  }}
                                >
                                  📁
                                </button>
                                <button
                                  type="button"
                                  className="chat-list-pin-btn"
                                  title={hasUnread ? t('markRead') : t('markUnread')}
                                  aria-label={hasUnread ? t('markRead') : t('markUnread')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (hasUnread) clearUnread(chat.type, chat.id);
                                    else setUnread(chat.type, chat.id, 1);
                                    setUnreadCounts(getUnreadCounts());
                                  }}
                                >
                                  {hasUnread ? '✓' : '●'}
                                </button>
                                {chat.lastMessageTime ? (
                                  <span className="chat-list-time">{formatChatListTime(chat.lastMessageTime)}</span>
                                ) : null}
                              </span>
                            </div>
                            <div className="chat-list-bottom-row">
                              <span className="chat-list-preview">
                                {draftMap[`${chat.type}:${chat.id}`] ? (
                                  <span className="chat-list-draft">
                                    <span className="chat-list-draft-label">{t('draftLabel')}: </span>
                                    {draftMap[`${chat.type}:${chat.id}`]}
                                  </span>
                                ) : (chat.lastMessage || t('noMessages'))}
                              </span>
                              <span className="chat-list-badges">
                                {chatMuted && (
                                  <span className="chat-list-muted-icon" title={t('chatMutedBadge')}>🔇</span>
                                )}
                                {hasUnread && getAppSettings().foldersShowUnreadBadge !== false && (
                                  <span className={`chat-list-unread-badge${unreadBumpKeys.has(`${chat.type}:${chat.id}`) ? ' chat-list-unread-badge--bump' : ''}`} aria-label={`${unread} ${t('unreadChats')}`}>
                                    {unread > 99 ? '99+' : unread}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </li>
                    );
                  })}
                </ul>
                {folderFilteredChats.length === 0 && <p className="nav-loading">{t('noRecentChats')}</p>}
              </section>
              <section className="nav-section">
                <div className="section-head">
                  <h3>{t('groups')}</h3>
                  <button
                    type="button"
                    className="btn-new-group"
                    onClick={() => setShowGroupCreate(true)}
                    title={t('newGroup')}
                  >
                    +
                  </button>
                </div>
                <ul className="chat-list">
                  {homeGroups.map((g) => (
                    <li
                      key={g.id}
                      className={
                        selected?.type === 'group' && String(selected.id) === String(g.id) ? 'active' : ''
                      }
                      onClick={() => {
                        setSelectedServerId(null);
                        setSelected({ type: 'group', id: g.id });
                        closeSidebar();
                      }}
                    >
                      <span className="chat-list-icon">👥</span>
                      <span className="chat-list-name">{g.name}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="nav-section">
                <div className="section-head">
                  <h3>{t('channels')}</h3>
                  <div className="section-head-actions">
                    <button
                      type="button"
                      className="btn-new-group btn-new-group--secondary"
                      onClick={() => setShowChannelJoin(true)}
                      title={t('channelJoinBtn')}
                    >
                      🔗
                    </button>
                    <button
                      type="button"
                      className="btn-new-group"
                      onClick={() => setShowChannelCreate(true)}
                      title={t('profileCreateChannel')}
                    >
                      +
                    </button>
                  </div>
                </div>
                <ul className="chat-list">
                  {homeChannels.map((g) => (
                    <li
                      key={g.id}
                      className={
                        selected?.type === 'group' && String(selected.id) === String(g.id) ? 'active' : ''
                      }
                      onClick={() => {
                        setSelectedServerId(null);
                        setSelected({ type: 'group', id: g.id });
                        closeSidebar();
                      }}
                    >
                      <span className="chat-list-icon chat-list-icon--channel">#</span>
                      <span className="chat-list-name">{g.name}</span>
                    </li>
                  ))}
                  {homeChannels.length === 0 && (
                    <li className="nav-empty-hint">{t('channelCreateHint')}</li>
                  )}
                </ul>
              </section>
            </div>
          ) : (
            <div className="sidebar-search-results">
              {searchMatchedUsers.length > 0 && (
                <div className="sidebar-search-users sidebar-search-users-top">
                  <h4 className="sidebar-search-users-title">{t('users')}</h4>
                  <ul className="chat-list">
                    {searchMatchedUsers.map((u) => (
                      <li
                        key={u.id}
                        className={
                          selected?.type === 'user' && String(selected.id) === String(u.id) ? 'active' : ''
                        }
                        onClick={() => openDmWithUser(u)}
                      >
                        <Avatar
                          path={u.avatarPath}
                          userId={u.id}
                          size="sm"
                          ring={u.avatarRing}
                          presenceOnline={peerPresenceDot(presenceByUserId[String(u.id)])}
                        />
                        <div className="chat-list-info">
                          <span className="chat-list-name">
                            {u.displayName}
                            {u.isBot && <span className="chat-list-bot-badge">BOT</span>}
                          </span>
                          <span className="chat-list-preview">@{u.login}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {filteredChats.length > 0 && (
                <div className="sidebar-search-chats-block">
                  <h4 className="sidebar-search-users-title">{t('recentChats')}</h4>
                  <ul className="chat-list">
                    {filteredChats.map((chat) => (
                      <li
                        key={`${chat.type}-${chat.id}`}
                        className={
                          selected?.type === chat.type && String(selected.id) === String(chat.id) ? 'active' : ''
                        }
                        onClick={() => {
                          if (chat.type === 'user') setSelectedServerId(null);
                          if (chat.type === 'group') {
                            const gr = groups.find((x) => String(x.id) === String(chat.id));
                            if (gr?.serverId) setSelectedServerId(gr.serverId);
                            else setSelectedServerId(null);
                          }
                          setSelected({ type: chat.type, id: chat.id });
                          closeSidebar();
                        }}
                      >
                        {chat.type === 'user' ? (
                          <>
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                const u = users.find((us) => String(us.id) === String(chat.id));
                                if (u) {
                                  setSelectedUser(u);
                                  setShowUserProfile(true);
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            >
                              <Avatar
                                path={chat.avatarPath}
                                userId={chat.id}
                                size="sm"
                                ring={avatarRingForUserId(chat.id)}
                                presenceOnline={
                                  String(chat.id) === SAVED_CHAT_ID
                                    ? undefined
                                    : peerPresenceDot(presenceByUserId[String(chat.id)])
                                }
                              />
                            </span>
                            <div className="chat-list-info">
                              <span className="chat-list-name">{contactNames[String(chat.id)] || chat.name}</span>
                              <span className="chat-list-preview">{chat.lastMessage ? chat.lastMessage : t('noMessages')}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="chat-list-icon chat-list-icon--channel">#</span>
                            <div className="chat-list-info">
                              <span className="chat-list-name">{chat.name}</span>
                              {chat.lastMessage && <span className="chat-list-preview">{chat.lastMessage}</span>}
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {filteredChats.length === 0 && searchMatchedUsers.length === 0 && (
                <p className="nav-loading sidebar-search-empty">{t('nothingFound')}</p>
              )}
            </div>
          )}
        </nav>
        </>
        ) : (
        <>
        {sidebarUserPanel}
        <header className="sidebar-header server-sidebar-header">
          <div className="server-sidebar-title-wrap">
            <h2 className="server-sidebar-title">{currentServer?.name || 'Сервер'}</h2>
            <p className="server-sidebar-sub">Каналы</p>
          </div>
          <div className="server-sidebar-actions">
            <button type="button" className="btn-icon" onClick={() => setShowServerSettings(true)} title={t('serverSettingsButton')}>⚙</button>
            {currentServer?.myRole === 'admin' && (
              <>
                <button type="button" className="btn-icon" onClick={() => setShowServerChannelCreate(true)} title="Новый канал">+</button>
                <button type="button" className="btn-icon" onClick={() => setShowServerInvite(true)} title="Пригласить">👥</button>
              </>
            )}
          </div>
        </header>
        <nav className="sidebar-nav sidebar-nav-server-search">
          <div className="sidebar-search-wrap sidebar-search-wrap-server">
            <input
              type="text"
              className="sidebar-search"
              placeholder={t('searchPlaceholder')}
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              aria-label={t('searchAriaLabel')}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {!chatSearch.trim() ? (
            <section className="nav-section">
              <ul className="chat-list">
                {serverChannels.map((g) => (
                  <li
                    key={g.id}
                    className={selected?.type === 'group' && String(selected.id) === String(g.id) ? 'active' : ''}
                    onClick={() => {
                      setSelected({ type: 'group', id: g.id });
                      closeSidebar();
                    }}
                  >
                    <span className="chat-list-icon">#</span>
                    <span className="chat-list-name">{g.name}</span>
                  </li>
                ))}
              </ul>
              {serverChannels.length === 0 && <p className="nav-empty-hint">{t('serverNoChannels')}</p>}
            </section>
          ) : (
            <div className="sidebar-search-results sidebar-search-results-server">
              {searchMatchedUsers.length > 0 && (
                <div className="sidebar-search-users sidebar-search-users-top">
                  <h4 className="sidebar-search-users-title">{t('users')}</h4>
                  <ul className="chat-list">
                    {searchMatchedUsers.map((u) => (
                      <li
                        key={u.id}
                        className={
                          selected?.type === 'user' && String(selected.id) === String(u.id) ? 'active' : ''
                        }
                        onClick={() => openDmWithUser(u)}
                      >
                        <Avatar
                          path={u.avatarPath}
                          userId={u.id}
                          size="sm"
                          ring={u.avatarRing}
                          presenceOnline={peerPresenceDot(presenceByUserId[String(u.id)])}
                        />
                        <div className="chat-list-info">
                          <span className="chat-list-name">
                            {u.displayName}
                            {u.isBot && <span className="chat-list-bot-badge">BOT</span>}
                          </span>
                          <span className="chat-list-preview">@{u.login}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <section className="nav-section">
                <h4 className="sidebar-search-users-title">{t('channels')}</h4>
                <ul className="chat-list">
                  {serverChannelsFiltered.map((g) => (
                    <li
                      key={g.id}
                      className={selected?.type === 'group' && String(selected.id) === String(g.id) ? 'active' : ''}
                      onClick={() => {
                        setSelected({ type: 'group', id: g.id });
                        closeSidebar();
                      }}
                    >
                      <span className="chat-list-icon chat-list-icon--channel">#</span>
                      <span className="chat-list-name">{g.name}</span>
                    </li>
                  ))}
                </ul>
                {serverChannels.length === 0 && <p className="nav-empty-hint">{t('serverNoChannels')}</p>}
              </section>
              {chatSearch.trim() && searchMatchedUsers.length === 0 && serverChannelsFiltered.length === 0 && (
                <p className="nav-loading sidebar-search-empty">{t('nothingFound')}</p>
              )}
            </div>
          )}
        </nav>
        </>
        )}
      </aside>

      <div className="sidebar-backdrop" aria-hidden="true" onClick={closeSidebar} />

      <main className="main">
        {currentChat ? (
          <ChatView
            key={`${selected.type}:${selected.id}`}
            currentUser={user}
            peer={currentChat}
            type={selected.type}
            initialUnreadCount={openedUnreadCount}
            // Saved Messages: в ChatView это обычный user-chat, но id = мой user.id
            {...(selected?.type === 'user' && String(selected.id) === SAVED_CHAT_ID ? { type: 'user', peer: currentChat } : {})}
            users={users}
            groups={groups}
            pendingForwardMessage={pendingForwardMessage}
            onPendingForwardConsumed={() => setPendingForwardMessage(null)}
            onForwardChoose={handleForwardChoose}
            onBack={() => setSelected(null)}
            onMenu={() => setSidebarOpen(true)}
            onOpenSettings={() => setShowSettings(true)}
            myChatBackground={selected?.type === 'user' ? getChatBackground(selected.id) : ''}
            contactNames={contactNames}
            onEditProfile={() => setShowProfileEdit(true)}
            onCreateChannel={() => {
              if (selectedServerId) setShowServerChannelCreate(true);
              else setShowChannelCreate(true);
            }}
            onOpenChannel={(groupId) => navigateToChat({ type: 'group', id: groupId })}
            onOpenUserChat={(userId) => navigateToChat({ type: 'user', id: userId })}
            chatListMode={chatListMode}
            onCycleChatList={cycleChatList}
            onUpdated={async () => {
              const [u, g, srv] = await Promise.all([getUsers(), getGroups(), getServers()]);
              setUsers(u.filter((x) => String(x.id) !== String(user.id)));
              setGroups(g);
              setServers(Array.isArray(srv) ? srv : []);
              if (selected?.type === 'group' && !g.some((gr) => gr.id === selected.id)) {
                setSelected(null);
              }
              loadRecentChats(u, g);
            }}
            isArchived={isSelectedArchived}
            onArchiveChat={async () => {
              try {
                await archiveChat(selected.type, selected.id === SAVED_CHAT_ID ? user.id : selected.id);
                const arch = await getArchivedChats();
                setArchivedChats(Array.isArray(arch) ? arch : []);
                loadRecentChats(await getUsers(), await getGroups());
                setSelected(null);
              } catch (e) {
                console.error(e);
              }
            }}
            onUnarchiveChat={async () => {
              try {
                await unarchiveChat(selected.type, selected.id === SAVED_CHAT_ID ? user.id : selected.id);
                const arch = await getArchivedChats();
                setArchivedChats(Array.isArray(arch) ? arch : []);
                loadRecentChats(await getUsers(), await getGroups());
              } catch (e) {
                console.error(e);
              }
            }}
          />
        ) : (
          <div className="welcome">
            <div className="welcome-icon" />
            <p className="welcome-greeting">{getTimeGreeting(getStoredLang())}</p>
            <h2>Nova</h2>
            <p className="welcome-quote">{welcomeQuote}</p>
            <p>{t('chooseChatToStart')}</p>
            <div className="welcome-tips">
              <span className="welcome-tip">❤️ {t('welcomeTipReact')}</span>
              <span className="welcome-tip"># {t('welcomeTipChannels')}</span>
              <span className="welcome-tip">✨ {t('welcomeTipAnimations')}</span>
              <span className="welcome-tip">🔔 {t('welcomeTipSounds')}</span>
              <span className="welcome-tip">📌 {t('welcomeTipPin')}</span>
              <span className="welcome-tip">⌨️ {t('welcomeTipShortcuts')}</span>
              <span className="welcome-tip">↓ {t('welcomeTipScroll')}</span>
              <span className="welcome-tip">😀 {t('welcomeTipEmojiBar')}</span>
              <span className="welcome-tip">🔍 {t('welcomeTipSearch')}</span>
            </div>
            {chatListMode === 'hidden' && (
              <button type="button" className="welcome-show-chats-btn" onClick={() => setChatListMode('full')}>
                {t('chatListShow')}
              </button>
            )}
          </div>
        )}

      </main>

      {showUserProfile && selectedUser && (
        <UserProfile
          variant="overlay"
          user={selectedUser}
          onClose={() => {
            setShowUserProfile(false);
            setSelectedUser(null);
          }}
          onEditProfile={() => setShowProfileEdit(true)}
          onCreateChannel={() => {
            if (selectedServerId) setShowServerChannelCreate(true);
            else setShowChannelCreate(true);
          }}
          onOpenChannel={(groupId) => navigateToChat({ type: 'group', id: groupId })}
        />
      )}

      {showGroupCreate && (
        <GroupCreate
          users={users}
          onClose={() => setShowGroupCreate(false)}
          onCreated={() => {
            setShowGroupCreate(false);
            refreshGroups();
          }}
        />
      )}

      {showServerCreate && (
        <ServerCreate
          onClose={() => setShowServerCreate(false)}
          onCreated={(s) => {
            setShowServerCreate(false);
            setSelectedServerId(s.id);
            refreshGroups();
          }}
        />
      )}

      {showServerChannelCreate && selectedServerId && (
        <ChannelCreateModal
          serverId={selectedServerId}
          onClose={() => setShowServerChannelCreate(false)}
          onCreated={(ch) => {
            setShowServerChannelCreate(false);
            setSelected({ type: 'group', id: ch.id });
            refreshGroups();
          }}
        />
      )}

      {showServerInvite && selectedServerId && (
        <ServerInviteModal
          serverId={selectedServerId}
          users={users}
          onClose={() => setShowServerInvite(false)}
          onCreated={() => {
            setShowServerInvite(false);
            refreshGroups();
          }}
        />
      )}

      {showServerSettings && selectedServerId && (
        <ServerSettingsModal
          serverId={selectedServerId}
          onClose={() => setShowServerSettings(false)}
          onUpdated={async () => {
            invalidateServersListCache();
            await refreshGroups();
            const srv = await getServers();
            setServers(srv);
            if (!srv.some((s) => String(s.id) === String(selectedServerId))) {
              setSelectedServerId(null);
              setSelected(null);
            }
          }}
        />
      )}

      {showProfileEdit && (
        <ProfileEdit
          onClose={async () => {
            await refreshUser();
            setShowProfileEdit(false);
          }}
          onCreateChannel={() => {
            setShowProfileEdit(false);
            if (selectedServerId) setShowServerChannelCreate(true);
            else setShowChannelCreate(true);
          }}
        />
      )}

      {showSettings && selected?.type === 'user' && (
        <SettingsModal
          currentPeer={currentChat}
          contactName={currentChat ? contactNames[currentChat.id] : ''}
          setContactName={setContactName}
          chatBackground={selected?.id ? getChatBackground(selected.id) : ''}
          setChatBackground={setChatBackground}
          onClose={() => setShowSettings(false)}
          onCloseChat={(userId) => {
            setShowSettings(false);
            setSelected(null);
            Promise.all([getUsers(), getGroups()]).then(([u, g]) => {
              setUsers(u.filter((x) => String(x.id) !== String(user.id)));
              setGroups(g);
              loadRecentChats(u, g);
            }).catch(console.error);
          }}
        />
      )}

      {showStatusPicker && (
        <StatusPicker
          compact
          user={user}
          onClose={() => setShowStatusPicker(false)}
          onUpdated={(updated) => updateUser(updated)}
        />
      )}

      {folderMenuChat && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setFolderMenuChat(null)}
        >
          <div
            className="modal folder-assign-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{t('folderAddChat')}</h3>
            {customFolders.length === 0 ? (
              <p className="folder-assign-empty">{t('folderEmptyHint')}</p>
            ) : (
              <ul className="folder-assign-list">
                {customFolders.map((f) => {
                  const inFolder = isChatInFolder(f.id, folderMenuChat.type, folderMenuChat.id);
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        className={`folder-assign-item${inFolder ? ' active' : ''}`}
                        onClick={() => {
                          if (inFolder) removeChatFromFolder(f.id, folderMenuChat.type, folderMenuChat.id);
                          else addChatToFolder(f.id, folderMenuChat.type, folderMenuChat.id);
                          setCustomFolders(getCustomFolders());
                        }}
                      >
                        <span>{f.name}</span>
                        <span>{inFolder ? '✓' : '+'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={() => setFolderMenuChat(null)}>
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {chatCtxMenu && createPortal(
        <div
          className="chat-ctx-backdrop"
          role="presentation"
          onClick={() => setChatCtxMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setChatCtxMenu(null); }}
        >
          <ul
            className="chat-ctx-menu"
            style={{
              left: Math.min(chatCtxMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 400) - 200),
              top: Math.min(chatCtxMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 400) - 220),
            }}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            <li role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  toggleChatPinned(chatCtxMenu.type, chatCtxMenu.id);
                  flashPinChat(chatCtxMenu.type, chatCtxMenu.id);
                  setPinnedVersion((v) => v + 1);
                  setChatCtxMenu(null);
                }}
              >
                {chatCtxMenu.pinned ? t('chatUnpinned') : t('chatPinned')}
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  if (chatCtxMenu.muted) unmuteChat(chatCtxMenu.type, chatCtxMenu.id);
                  else setChatMuted(chatCtxMenu.type, chatCtxMenu.id, { until: null, hideBadge: true });
                  setMuteVersion((v) => v + 1);
                  setChatCtxMenu(null);
                }}
              >
                {chatCtxMenu.muted ? t('chatUnmute') : t('chatMute')}
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  if (chatCtxMenu.hasUnread) clearUnread(chatCtxMenu.type, chatCtxMenu.id);
                  else setUnread(chatCtxMenu.type, chatCtxMenu.id, 1);
                  setUnreadCounts(getUnreadCounts());
                  setChatCtxMenu(null);
                }}
              >
                {chatCtxMenu.hasUnread ? t('markRead') : t('markUnread')}
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFolderMenuChat({ type: chatCtxMenu.type, id: chatCtxMenu.id });
                  setChatCtxMenu(null);
                }}
              >
                {t('folderAddChat')}
              </button>
            </li>
            {String(chatCtxMenu.id) !== SAVED_CHAT_ID && (
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    try {
                      await archiveChat(
                        chatCtxMenu.type,
                        chatCtxMenu.id === SAVED_CHAT_ID ? user.id : chatCtxMenu.id
                      );
                      if (selected?.type === chatCtxMenu.type && String(selected.id) === String(chatCtxMenu.id)) {
                        setSelected(null);
                      }
                      const arch = await getArchivedChats();
                      setArchivedChats(Array.isArray(arch) ? arch : []);
                      loadRecentChats(await getUsers(), await getGroups());
                    } catch (err) {
                      console.error(err);
                    }
                    setChatCtxMenu(null);
                  }}
                >
                  {t('archiveChat')}
                </button>
              </li>
            )}
          </ul>
        </div>,
        document.body
      )}

      {showMessengerSettings && (
        <MessengerSettingsModal
          onClose={() => setShowMessengerSettings(false)}
          onThemeChange={() => setThemeVersion((v) => v + 1)}
          onLangChange={() => setThemeVersion((v) => v + 1)}
          onOpenProfileEdit={() => {
            setShowMessengerSettings(false);
            setShowProfileEdit(true);
          }}
          onOpenBotChat={async (login) => {
            const bot = await resolveBotUser(login, users);
            if (!bot?.id) return;
            setUsers((prev) => (prev.some((u) => String(u.id) === String(bot.id)) ? prev : [...prev, bot]));
            setShowMessengerSettings(false);
            navigateToChat({ type: 'user', id: bot.id });
            closeSidebar();
          }}
          onLogout={() => { setShowMessengerSettings(false); setStoredLastChat(null); logout(); }}
        />
      )}

      {showChannelJoin && (
        <ChannelJoinModal
          onClose={() => setShowChannelJoin(false)}
          onJoined={async (channel) => {
            const g = await getGroups();
            setGroups(g);
            if (channel?.id) {
              setSelectedServerId(channel.serverId || null);
              setSelected({ type: 'group', id: channel.id });
            }
          }}
        />
      )}
      {showChannelCreate && (
        <ChannelCreate
          onClose={() => setShowChannelCreate(false)}
          onCreated={() => {
            setShowChannelCreate(false);
            refreshGroups();
          }}
        />
      )}

      {authFailed && (
        <div className="socket-auth-fail-bar" role="alert">
          <span>Подключение к серверу отклонено. Звонки и сообщения в реальном времени не работают. Выйдите и войдите снова.</span>
        </div>
      )}

      <CallPanel onNavigateToChat={navigateToChat} />

      {isElectron && updateState && (
        <div className="app-update-bar">
          <span className="app-update-bar-text">
            {updateState.status === 'available' && 'Загрузка обновления…'}
            {updateState.status === 'downloaded' && (
              <>Вышло обновление{updateState.version ? ` ${updateState.version}` : ''}.</>
            )}
          </span>
          {updateState.status === 'downloaded' && (
            <button type="button" className="app-update-bar-btn" onClick={installUpdate}>
              Обновить приложение
            </button>
          )}
        </div>
      )}

      <NotificationPanel
        notifications={notifications}
        onDismiss={(id) => setNotifications((prev) => prev.filter((n) => n.id !== id))}
        onDismissAll={() => setNotifications([])}
        onSelect={(n) => {
          navigateToChat({ type: n.type, id: n.chatId });
          setNotifications((prev) => prev.filter((x) => x.id !== n.id));
        }}
      />

      {isAdmin && showAdminPanel && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-overlay modal-overlay-priority"
          role="presentation"
          onClick={() => setShowAdminPanel(false)}
        >
          <div className="modal admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 id="admin-modal-title">Админ-панель</h2>
              <button
                type="button"
                className="btn-icon-close"
                onClick={() => setShowAdminPanel(false)}
                aria-label="Закрыть"
              >
                <span className="icon-close">×</span>
              </button>
            </div>

            <div className="admin-tabs">
              <button
                type="button"
                className={`admin-tab ${adminTab === 'groups' ? 'active' : ''}`}
                onClick={() => setAdminTab('groups')}
              >
                Группы
              </button>
              <button
                type="button"
                className={`admin-tab ${adminTab === 'users' ? 'active' : ''}`}
                onClick={() => setAdminTab('users')}
              >
                Пользователи
              </button>
            </div>

            <div className="admin-global-settings">
              <label className="admin-toggle-row" htmlFor="admin-allow-username-all">
                <input
                  id="admin-allow-username-all"
                  type="checkbox"
                  checked={adminAllowUsernameAll}
                  onChange={async (e) => {
                    const next = e.target.checked;
                    const prev = adminAllowUsernameAll;
                    setAdminAllowUsernameAll(next);
                    try {
                      await setAdminSettings({ allowUsernameChangeAll: next });
                      refreshUser();
                    } catch (err) {
                      console.error(err);
                      setAdminAllowUsernameAll(prev);
                    }
                  }}
                />
                <span>{t('adminAllowUsernameToggle')}</span>
              </label>
              <p className="admin-global-hint">{t('adminAllowUsernameHint')}</p>
            </div>

            {adminTab === 'groups' && (
              <div className="admin-section">
                <div className="admin-search-row">
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Поиск групп по названию"
                    value={adminGroupQuery}
                    onChange={(e) => setAdminGroupQuery(e.target.value)}
                  />
                </div>
                <div className="admin-list">
                  {getFilteredAdminGroups().map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className="admin-list-item"
                      onClick={() => handleOpenGroupFromAdmin(g.id)}
                    >
                      <div className="admin-list-main">
                        <span className="admin-list-title">{g.name}</span>
                        <span className="admin-list-sub">ID: {g.id}</span>
                      </div>
                      <span className="admin-list-action">Открыть</span>
                    </button>
                  ))}
                  {getFilteredAdminGroups().length === 0 && (
                    <p className="admin-empty">Группы не найдены</p>
                  )}
                </div>
              </div>
            )}

            {adminTab === 'users' && (
              <div className="admin-section">
                <div className="admin-search-row">
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Поиск по имени или @username"
                    value={adminUserQuery}
                    onChange={(e) => setAdminUserQuery(e.target.value)}
                  />
                </div>
                <div className="admin-list">
                  {getFilteredAdminUsers().map((u) => {
                    const isVerified = !!u.isVerified || !!u.is_verified;
                    const banUntil = u.banUntil || u.ban_until || null;
                    const nowSec = Math.floor(Date.now() / 1000);
                    const isBanned = typeof banUntil === 'number' && banUntil > nowSec;
                    return (
                      <div key={u.id} className="admin-list-item admin-user-row">
                        <div className="admin-list-main">
                          <span className="admin-list-title">
                            {u.displayName}
                            {isVerified && <span className="admin-verify-badge">✔</span>}
                          </span>
                          <span className="admin-list-sub">@{u.login}</span>
                          {isBanned && (
                            <span className="admin-list-sub admin-banned">
                              Бан до {new Date(banUntil * 1000).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div className="admin-user-actions">
                          <select
                            className="admin-ban-select"
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v) return;
                              const sec = Number(v);
                              if (!Number.isNaN(sec)) {
                                handleAdminBanUser(u, sec);
                              }
                              e.target.value = '';
                            }}
                            defaultValue=""
                          >
                            <option value="">Бан</option>
                            <option value={60 * 60}>1 час</option>
                            <option value={60 * 60 * 24}>1 день</option>
                            <option value={60 * 60 * 24 * 7}>7 дней</option>
                            <option value={60 * 60 * 24 * 30}>30 дней</option>
                            <option value={60 * 60 * 24 * 365}>1 год</option>
                            <option value={0}>Снять бан</option>
                          </select>
                          <select
                            className="admin-ban-select"
                            onChange={async (e) => {
                              const aid = e.target.value;
                              if (!aid) return;
                              try {
                                await adminGrantAchievement(u.id, aid);
                                // обновим список пользователей, чтобы профиль подтянулся через sync
                                const updatedUsers = await getUsers();
                                setUsers(updatedUsers.filter((x) => String(x.id) !== String(user.id)));
                              } catch (err) {
                                console.error(err);
                              } finally {
                                e.target.value = '';
                              }
                            }}
                            defaultValue=""
                            title="Выдать ачивку"
                          >
                            <option value="">Ачивка</option>
                            {adminAchievementsCatalog.map((a) => (
                              <option key={a.id} value={a.id}>
                                {(a.icon || '') + ' '}{a.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className={`admin-verify-btn ${isVerified ? 'active' : ''}`}
                            onClick={() => handleAdminVerifyUser(u, !isVerified)}
                          >
                            {isVerified ? 'Снять галочку' : 'Выдать галочку'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {getFilteredAdminUsers().length === 0 && (
                    <p className="admin-empty">Пользователи не найдены</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {showKeyboardShortcuts && (
        <KeyboardShortcutsModal onClose={() => setShowKeyboardShortcuts(false)} />
      )}

      {showQuickSwitcher && (
        <QuickSwitcher
          open={showQuickSwitcher}
          onClose={() => setShowQuickSwitcher(false)}
          recentChats={recentChats}
          users={users}
          groups={groups}
          onSelect={(sel) => {
            navigateToChat(sel);
            closeSidebar();
          }}
        />
      )}
    </div>
  );
}
