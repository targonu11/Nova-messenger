import crypto from 'node:crypto';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db, save as dbSave } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, 'uploads');
const STICKERS_DIR = join(UPLOADS_DIR, 'stickers');

export const STICKER_BOT_USERNAME = 'StickerBot';

export const STICKER_BOT_COMMANDS = [
  { command: 'start', description: 'Начать работу с ботом' },
  { command: 'help', description: 'Список команд и справка' },
  { command: 'newpack', description: 'Создать новый набор стикеров' },
  { command: 'addsticker', description: 'Добавить стикер в набор' },
  { command: 'publish', description: 'Опубликовать набор для всех' },
  { command: 'install', description: 'Добавить набор себе' },
  { command: 'mypacks', description: 'Мои наборы стикеров' },
  { command: 'public', description: 'Публичные наборы' },
];

export const DEFAULT_BOT_COMMANDS = [
  { command: 'start', description: 'Запустить бота' },
  { command: 'help', description: 'Справка по боту' },
];

function normalizeBotCommandName(raw) {
  const cmd = String(raw || '').trim().replace(/^\//, '').toLowerCase();
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(cmd)) return null;
  return cmd;
}

function replaceBotCommands(botId, commands) {
  db.prepare('DELETE FROM bot_commands WHERE bot_id = ?').run(botId);
  const ins = db.prepare('INSERT INTO bot_commands (bot_id, command, description, sort_order) VALUES (?, ?, ?, ?)');
  (commands || []).forEach((c, i) => {
    const cmd = normalizeBotCommandName(c.command);
    if (!cmd) return;
    ins.run(botId, cmd, String(c.description || '').slice(0, 256), i);
  });
  dbSave();
}

function seedBotCommandsIfEmpty(botId, commands) {
  const count = db.prepare('SELECT COUNT(*) as c FROM bot_commands WHERE bot_id = ?').get(botId);
  if (Number(count?.c || 0) > 0) return;
  replaceBotCommands(botId, commands);
}

export function ensureSystemBotCommands() {
  initBotSchema();
  const bot = getBotByUsername(STICKER_BOT_USERNAME);
  if (bot) seedBotCommandsIfEmpty(bot.id, STICKER_BOT_COMMANDS);
}

export function getBotCommandsForUserId(botUserId) {
  const bot = getBotByUserId(botUserId);
  if (!bot) return [];
  const rows = db.prepare(`
    SELECT command, description FROM bot_commands
    WHERE bot_id = ?
    ORDER BY sort_order ASC, command ASC
  `).all(bot.id);
  if (rows.length) {
    return rows.map((r) => ({ command: r.command, description: r.description || '' }));
  }
  if (bot.username === STICKER_BOT_USERNAME) return STICKER_BOT_COMMANDS;
  return DEFAULT_BOT_COMMANDS;
}

export function setBotCommandsForBot(botId, commands) {
  const list = Array.isArray(commands) ? commands.slice(0, 100) : [];
  replaceBotCommands(botId, list);
  return getBotCommandsForBotId(botId);
}

function getBotCommandsForBotId(botId) {
  return db.prepare(`
    SELECT command, description FROM bot_commands
    WHERE bot_id = ?
    ORDER BY sort_order ASC, command ASC
  `).all(botId).map((r) => ({ command: r.command, description: r.description || '' }));
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function generateBotToken() {
  return `${crypto.randomBytes(16).toString('hex')}:${crypto.randomBytes(16).toString('hex')}`;
}

export function parseMessageMeta(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

export function initBotSchema() {
  try {
    const userCols = db.prepare('PRAGMA table_info(users)').all().map((r) => r.name);
    if (!userCols.includes('is_bot')) {
      db.exec('ALTER TABLE users ADD COLUMN is_bot INTEGER DEFAULT 0');
      console.log('Added is_bot column to users');
    }
  } catch (e) {
    console.warn('is_bot migration:', e.message);
  }

  try {
    const msgCols = db.prepare('PRAGMA table_info(messages)').all().map((r) => r.name);
    if (!msgCols.includes('message_meta')) {
      db.exec('ALTER TABLE messages ADD COLUMN message_meta TEXT');
      console.log('Added message_meta column to messages');
    }
  } catch (e) {
    console.warn('message_meta migration:', e.message);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      owner_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      description TEXT,
      webhook_url TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_bots_owner ON bots(owner_id);

    CREATE TABLE IF NOT EXISTS bot_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_id TEXT NOT NULL,
      update_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      consumed_at INTEGER,
      FOREIGN KEY (bot_id) REFERENCES bots(id)
    );
    CREATE INDEX IF NOT EXISTS idx_bot_updates_bot ON bot_updates(bot_id, id);

    CREATE TABLE IF NOT EXISTS bot_user_state (
      user_id TEXT NOT NULL,
      bot_user_id TEXT NOT NULL,
      state TEXT NOT NULL,
      data TEXT,
      updated_at INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (user_id, bot_user_id)
    );

    CREATE TABLE IF NOT EXISTS sticker_packs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      bot_id TEXT,
      is_public INTEGER DEFAULT 0,
      thumb_path TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sticker_packs_owner ON sticker_packs(owner_id);
    CREATE INDEX IF NOT EXISTS idx_sticker_packs_public ON sticker_packs(is_public);

    CREATE TABLE IF NOT EXISTS stickers (
      id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      emoji TEXT DEFAULT '🙂',
      media_type TEXT DEFAULT 'static',
      created_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (pack_id) REFERENCES sticker_packs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_stickers_pack ON stickers(pack_id);

    CREATE TABLE IF NOT EXISTS user_sticker_packs (
      user_id TEXT NOT NULL,
      pack_id TEXT NOT NULL,
      installed_at INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (user_id, pack_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (pack_id) REFERENCES sticker_packs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bot_commands (
      bot_id TEXT NOT NULL,
      command TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      PRIMARY KEY (bot_id, command),
      FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_bot_commands_bot ON bot_commands(bot_id, sort_order);
  `);

  if (!fs.existsSync(STICKERS_DIR)) {
    fs.mkdirSync(STICKERS_DIR, { recursive: true });
  }
}

export function isBotUserId(userId) {
  const row = db.prepare('SELECT is_bot FROM users WHERE id = ?').get(userId);
  return Number(row?.is_bot) === 1;
}

export function getBotByUserId(userId) {
  return db.prepare('SELECT * FROM bots WHERE user_id = ?').get(userId);
}

export function getBotByToken(token) {
  if (!token) return null;
  const hash = hashToken(token);
  return db.prepare('SELECT * FROM bots WHERE token_hash = ?').get(hash);
}

export function getBotByUsername(username) {
  const u = String(username || '').replace(/^@/, '').trim();
  if (!u) return null;
  return db.prepare('SELECT * FROM bots WHERE username = ?').get(u);
}

function queueBotUpdate(botId, updateType, payload) {
  db.prepare('INSERT INTO bot_updates (bot_id, update_type, payload) VALUES (?, ?, ?)').run(
    botId,
    updateType,
    JSON.stringify(payload)
  );
}

export function sendBotMessage(botUserId, recipientUserId, text, extra = {}, emitToUser) {
  const bot = getBotByUserId(botUserId);
  if (!bot) return null;

  const msgId = uuid();
  const sender = db.prepare('SELECT display_name, avatar_path, is_bot FROM users WHERE id = ?').get(botUserId);
  const content = String(text || '').trim();
  const attachmentPath = extra.attachmentPath || null;
  const messageType = extra.messageType || null;
  const messageMeta = extra.messageMeta ? JSON.stringify(extra.messageMeta) : null;

  db.prepare(`
    INSERT INTO messages (id, sender_id, recipient_type, recipient_id, content, attachment_path, message_type, message_meta)
    VALUES (?, ?, 'user', ?, ?, ?, ?, ?)
  `).run(msgId, botUserId, recipientUserId, content, attachmentPath, messageType, messageMeta);

  const msg = {
    id: msgId,
    senderId: botUserId,
    senderName: sender?.display_name,
    senderAvatar: sender?.avatar_path,
    senderIsBot: true,
    content,
    createdAt: Math.floor(Date.now() / 1000),
    attachmentPath,
    replyToId: null,
    replyToContent: null,
    replyToSenderName: null,
    editedAt: null,
    isDeleted: false,
    forwardFromId: null,
    forwardFromName: null,
    messageType,
    messageMeta: parseMessageMeta(messageMeta),
    voiceMeta: null,
    reactions: {},
    recipientType: 'user',
    recipientId: recipientUserId,
  };

  if (typeof emitToUser === 'function') {
    emitToUser(recipientUserId, 'new_message', msg);
    emitToUser(botUserId, 'new_message', msg);
  }

  queueBotUpdate(bot.id, 'message_sent', { messageId: msgId, recipientId: recipientUserId, content });

  return msg;
}

function setUserBotState(userId, botUserId, state, data = null) {
  db.prepare(`
    INSERT OR REPLACE INTO bot_user_state (user_id, bot_user_id, state, data, updated_at)
    VALUES (?, ?, ?, ?, strftime('%s','now'))
  `).run(userId, botUserId, state, data ? JSON.stringify(data) : null);
}

function clearUserBotState(userId, botUserId) {
  db.prepare('DELETE FROM bot_user_state WHERE user_id = ? AND bot_user_id = ?').run(userId, botUserId);
}

function getUserBotState(userId, botUserId) {
  const row = db.prepare('SELECT state, data FROM bot_user_state WHERE user_id = ? AND bot_user_id = ?').get(userId, botUserId);
  if (!row) return null;
  let data = null;
  try {
    data = row.data ? JSON.parse(row.data) : null;
  } catch {
    data = null;
  }
  return { state: row.state, data };
}

function isImagePath(path) {
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(String(path || ''));
}

function detectMediaType(path) {
  return /\.gif(\?|$)/i.test(String(path || '')) ? 'animated' : 'static';
}

function copyToStickersDir(sourcePath) {
  const rel = String(sourcePath || '').replace(/^\/uploads\//, '');
  const src = join(UPLOADS_DIR, rel);
  if (!fs.existsSync(src)) return null;
  const ext = rel.match(/\.[^.]+$/)?.[0] || '.png';
  const destName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  const dest = join(STICKERS_DIR, destName);
  fs.copyFileSync(src, dest);
  return `/uploads/stickers/${destName}`;
}

function createStickerPack(ownerId, title, botId = null) {
  const id = uuid();
  db.prepare('INSERT INTO sticker_packs (id, title, owner_id, bot_id) VALUES (?, ?, ?, ?)').run(id, title, ownerId, botId);
  db.prepare('INSERT OR IGNORE INTO user_sticker_packs (user_id, pack_id) VALUES (?, ?)').run(ownerId, id);
  return id;
}

function addStickerToPack(packId, filePath, emoji = '🙂') {
  const pack = db.prepare('SELECT id FROM sticker_packs WHERE id = ?').get(packId);
  if (!pack) return null;
  const stickerPath = copyToStickersDir(filePath) || filePath;
  const id = uuid();
  const mediaType = detectMediaType(stickerPath);
  db.prepare('INSERT INTO stickers (id, pack_id, file_path, emoji, media_type) VALUES (?, ?, ?, ?, ?)').run(
    id,
    packId,
    stickerPath,
    emoji,
    mediaType
  );
  const count = db.prepare('SELECT COUNT(*) as c FROM stickers WHERE pack_id = ?').get(packId);
  if (Number(count?.c) === 1) {
    db.prepare('UPDATE sticker_packs SET thumb_path = ? WHERE id = ?').run(stickerPath, packId);
  }
  return { id, filePath: stickerPath, mediaType, emoji };
}

function listUserPacks(userId) {
  return db.prepare(`
    SELECT sp.id, sp.title, sp.is_public, sp.thumb_path, sp.created_at,
           (SELECT COUNT(*) FROM stickers s WHERE s.pack_id = sp.id) as sticker_count
    FROM sticker_packs sp
    WHERE sp.owner_id = ?
    ORDER BY sp.created_at DESC
  `).all(userId);
}

function listInstalledPacks(userId) {
  return db.prepare(`
    SELECT sp.id, sp.title, sp.is_public, sp.thumb_path, sp.created_at,
           (SELECT COUNT(*) FROM stickers s WHERE s.pack_id = sp.id) as sticker_count
    FROM user_sticker_packs usp
    JOIN sticker_packs sp ON sp.id = usp.pack_id
    WHERE usp.user_id = ?
    ORDER BY usp.installed_at DESC
  `).all(userId);
}

function listPublicPacks() {
  return db.prepare(`
    SELECT sp.id, sp.title, sp.thumb_path, sp.created_at,
           (SELECT COUNT(*) FROM stickers s WHERE s.pack_id = sp.id) as sticker_count
    FROM sticker_packs sp
    WHERE sp.is_public = 1
    ORDER BY sp.created_at DESC
  `).all();
}

function installPack(userId, packId) {
  const pack = db.prepare('SELECT id, is_public, owner_id FROM sticker_packs WHERE id = ?').get(packId);
  if (!pack) return false;
  if (Number(pack.is_public) !== 1 && pack.owner_id !== userId) return false;
  db.prepare('INSERT OR IGNORE INTO user_sticker_packs (user_id, pack_id) VALUES (?, ?)').run(userId, packId);
  return true;
}

function userHasStickerInMessages(userId, stickerId) {
  if (!stickerId) return false;
  const needle = `%"stickerId":"${String(stickerId)}"%`;
  const row = db.prepare(`
    SELECT 1 FROM messages m
    WHERE m.message_type = 'sticker'
      AND m.message_meta LIKE ?
      AND (
        m.sender_id = ?
        OR (m.recipient_type = 'user' AND m.recipient_id = ?)
        OR (m.recipient_type = 'group' AND EXISTS (
          SELECT 1 FROM group_members gm WHERE gm.group_id = m.recipient_id AND gm.user_id = ?
        ))
      )
    LIMIT 1
  `).get(needle, userId, userId, userId);
  return !!row;
}

function canViewPackStickers(userId, pack, viaStickerId = null) {
  if (!pack) return false;
  const installed = !!db.prepare('SELECT 1 FROM user_sticker_packs WHERE user_id = ? AND pack_id = ?').get(userId, pack.id);
  if (installed) return true;
  if (Number(pack.is_public) === 1) return true;
  if (pack.owner_id === userId) return true;
  if (viaStickerId && userHasStickerInMessages(userId, viaStickerId)) return true;
  return false;
}

export function getPackPreviewInfo(userId, packId, viaStickerId = null) {
  const pack = db.prepare(`
    SELECT sp.*, (SELECT COUNT(*) FROM stickers s WHERE s.pack_id = sp.id) as sticker_count
    FROM sticker_packs sp WHERE sp.id = ?
  `).get(packId);
  if (!pack) return null;

  const installed = !!db.prepare('SELECT 1 FROM user_sticker_packs WHERE user_id = ? AND pack_id = ?').get(userId, packId);
  const isPublic = Number(pack.is_public) === 1;
  const isOwner = pack.owner_id === userId;
  const canViewStickers = canViewPackStickers(userId, pack, viaStickerId);
  const canInstall = !installed && isPublic;

  return {
    pack: mapPackRow(pack),
    installed,
    canViewStickers,
    canInstall,
    isPublic,
    isOwner,
  };
}

function publishPack(userId, packId) {
  const pack = db.prepare('SELECT id, owner_id FROM sticker_packs WHERE id = ?').get(packId);
  if (!pack || pack.owner_id !== userId) return false;
  const count = db.prepare('SELECT COUNT(*) as c FROM stickers WHERE pack_id = ?').get(packId);
  if (Number(count?.c || 0) < 1) return false;
  db.prepare('UPDATE sticker_packs SET is_public = 1 WHERE id = ?').run(packId);
  return true;
}

function stickerBotHelp() {
  return [
    'Привет! Я StickerBot — создаю наборы стикеров и GIF.',
    '',
    'Формат стикеров (как Telegram):',
    '• PNG или WebP с прозрачным фоном',
    '• Размер до 512×512 px',
    '• GIF — для анимированных стикеров',
    '• Не отправляйте обычные фото — они не станут стикерами',
    '',
    'Команды:',
    '/newpack Название — новый набор',
    '/addsticker ID_набора — затем отправьте картинку или GIF',
    '/publish ID_набора — опубликовать набор',
    '/install ID_набора — добавить набор себе',
    '/mypacks — ваши наборы',
    '/public — публичные наборы',
    '/help — эта справка',
  ].join('\n');
}

function handleStickerBotMessage(botUserId, senderId, content, attachmentPath, emitToUser) {
  const reply = (text) => sendBotMessage(botUserId, senderId, text, {}, emitToUser);
  const text = String(content || '').trim();
  const lower = text.toLowerCase();

  const pending = getUserBotState(senderId, botUserId);
  if (pending?.state === 'await_sticker' && attachmentPath && isImagePath(attachmentPath)) {
    const packId = pending.data?.packId;
    const emoji = pending.data?.emoji || '🙂';
    clearUserBotState(senderId, botUserId);
    if (!packId) {
      reply('Ошибка: набор не найден. Начните с /addsticker ID');
      return;
    }
    const pack = db.prepare('SELECT id, owner_id FROM sticker_packs WHERE id = ? AND owner_id = ?').get(packId, senderId);
    if (!pack) {
      reply('Набор не найден или вы не владелец.');
      return;
    }
    const sticker = addStickerToPack(packId, attachmentPath, emoji);
    if (!sticker) {
      reply('Не удалось добавить стикер.');
      return;
    }
    reply(`Стикер добавлен в набор ${packId.slice(0, 8)}… (${sticker.mediaType === 'animated' ? 'GIF' : 'стикер'})`);
    return;
  }

  if (attachmentPath && isImagePath(attachmentPath)) {
    reply('Чтобы добавить стикер, сначала: /addsticker ID_набора');
    return;
  }

  if (!text.startsWith('/')) {
    if (text) reply('Используйте /help для списка команд.');
    return;
  }

  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  if (cmd === '/start' || cmd === '/help') {
    reply(stickerBotHelp());
    return;
  }

  if (cmd === '/newpack') {
    const title = parts.slice(1).join(' ').trim();
    if (!title) {
      reply('Укажите название: /newpack Мои стикеры');
      return;
    }
    const bot = getBotByUserId(botUserId);
    const packId = createStickerPack(senderId, title.slice(0, 64), bot?.id || null);
    reply(`Набор «${title}» создан.\nID: ${packId}\n\nДобавьте стикер: /addsticker ${packId}`);
    return;
  }

  if (cmd === '/addsticker') {
    const packId = parts[1];
    if (!packId) {
      reply('Укажите ID: /addsticker PACK_ID');
      return;
    }
    const pack = db.prepare('SELECT id FROM sticker_packs WHERE id = ? AND owner_id = ?').get(packId, senderId);
    if (!pack) {
      reply('Набор не найден или вы не владелец.');
      return;
    }
    const emoji = parts[2] && !parts[2].startsWith('/') ? parts[2] : '🙂';
    setUserBotState(senderId, botUserId, 'await_sticker', { packId, emoji });
    reply(`Отправьте изображение или GIF для набора ${packId.slice(0, 8)}…`);
    return;
  }

  if (cmd === '/publish') {
    const packId = parts[1];
    if (!packId) {
      reply('Укажите ID: /publish PACK_ID');
      return;
    }
    if (publishPack(senderId, packId)) {
      reply(`Набор ${packId.slice(0, 8)}… опубликован. Другие могут: /install ${packId}`);
    } else {
      reply('Не удалось опубликовать. Проверьте ID и что в наборе есть хотя бы 1 стикер.');
    }
    return;
  }

  if (cmd === '/install') {
    const packId = parts[1];
    if (!packId) {
      reply('Укажите ID: /install PACK_ID');
      return;
    }
    if (installPack(senderId, packId)) {
      reply(`Набор установлен. Откройте 🎨 в чате, чтобы отправить стикеры.`);
    } else {
      reply('Набор не найден или не опубликован.');
    }
    return;
  }

  if (cmd === '/mypacks') {
    const packs = listUserPacks(senderId);
    if (!packs.length) {
      reply('У вас нет наборов. Создайте: /newpack Название');
      return;
    }
    const lines = packs.map((p) => {
      const pub = Number(p.is_public) === 1 ? ' [public]' : '';
      return `• ${p.title}${pub}\n  ID: ${p.id}\n  Стикеров: ${p.sticker_count || 0}`;
    });
    reply(lines.join('\n\n'));
    return;
  }

  if (cmd === '/public') {
    const packs = listPublicPacks();
    if (!packs.length) {
      reply('Публичных наборов пока нет.');
      return;
    }
    const lines = packs.map((p) => `• ${p.title}\n  ID: ${p.id}\n  Стикеров: ${p.sticker_count || 0}\n  /install ${p.id}`);
    reply(lines.join('\n\n'));
    return;
  }

  reply('Неизвестная команда. /help');
}

export function handleBotIncomingMessage(recipientUserId, senderUserId, content, attachmentPath, emitToUser) {
  if (!isBotUserId(recipientUserId)) return;
  const bot = getBotByUserId(recipientUserId);
  if (!bot) return;

  queueBotUpdate(bot.id, 'message', {
    from: senderUserId,
    content: content || '',
    attachmentPath: attachmentPath || null,
    date: Math.floor(Date.now() / 1000),
  });

  if (bot.username === STICKER_BOT_USERNAME) {
    handleStickerBotMessage(recipientUserId, senderUserId, content, attachmentPath, emitToUser);
    return;
  }

  if (String(content || '').trim().toLowerCase() === '/start') {
    sendBotMessage(
      recipientUserId,
      senderUserId,
      `Привет! Я @${bot.username}.\n\nОтправьте /help для справки.`,
      {},
      emitToUser
    );
    return;
  }

  if (String(content || '').trim().toLowerCase() === '/help') {
    const cmds = getBotCommandsForUserId(recipientUserId);
    const lines = cmds.length
      ? cmds.map((c) => `/${c.command} — ${c.description || c.command}`).join('\n')
      : 'Команд пока нет.';
    sendBotMessage(
      recipientUserId,
      senderUserId,
      `Команды @${bot.username}:\n\n${lines}`,
      {},
      emitToUser
    );
  }
}

export function createUserBot(ownerId, { username, displayName, description }) {
  const uname = String(username || '').replace(/^@/, '').trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_]{2,31}$/.test(uname)) {
    throw new Error('Username: 3–32 символа, буквы, цифры, _');
  }
  const existing = db.prepare('SELECT id FROM bots WHERE username = ?').get(uname);
  if (existing) throw new Error('Username already taken');
  const loginTaken = db.prepare('SELECT id FROM users WHERE login = ?').get(uname);
  if (loginTaken) throw new Error('Username already taken');

  const userId = uuid();
  const botId = uuid();
  const token = generateBotToken();
  const password = crypto.randomBytes(24).toString('hex');
  const name = String(displayName || uname).trim().slice(0, 50);

  db.prepare('INSERT INTO users (id, login, password, display_name, is_bot) VALUES (?, ?, ?, ?, 1)').run(
    userId,
    uname,
    password,
    name
  );
  db.prepare(`
    INSERT INTO bots (id, user_id, owner_id, token_hash, username, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(botId, userId, ownerId, hashToken(token), uname, description || '');

  return {
    id: botId,
    userId,
    username: uname,
    displayName: name,
    description: description || '',
    token,
  };
}

export function listBotsForOwner(ownerId) {
  return db.prepare(`
    SELECT b.id, b.user_id, b.username, b.description, b.created_at, u.display_name
    FROM bots b
    JOIN users u ON u.id = b.user_id
    WHERE b.owner_id = ?
    ORDER BY b.created_at DESC
  `).all(ownerId);
}

export function revokeBot(ownerId, botId) {
  const bot = db.prepare('SELECT * FROM bots WHERE id = ? AND owner_id = ?').get(botId, ownerId);
  if (!bot) return false;
  db.prepare('DELETE FROM bots WHERE id = ?').run(botId);
  db.prepare('DELETE FROM users WHERE id = ?').run(bot.user_id);
  return true;
}

export function rotateBotToken(ownerId, botId) {
  const bot = db.prepare('SELECT * FROM bots WHERE id = ? AND owner_id = ?').get(botId, ownerId);
  if (!bot) return null;
  const token = generateBotToken();
  db.prepare('UPDATE bots SET token_hash = ? WHERE id = ?').run(hashToken(token), botId);
  return token;
}

export function getBotUpdates(botId, offset = 0, limit = 50) {
  const rows = db.prepare(`
    SELECT id, update_type, payload, created_at
    FROM bot_updates
    WHERE bot_id = ? AND id > ? AND consumed_at IS NULL
    ORDER BY id ASC
    LIMIT ?
  `).all(botId, offset, limit);
  return rows.map((r) => ({
    updateId: r.id,
    type: r.update_type,
    payload: parseMessageMeta(r.payload),
    createdAt: r.created_at,
  }));
}

export function consumeBotUpdates(botId, maxId) {
  db.prepare('UPDATE bot_updates SET consumed_at = strftime(\'%s\', \'now\') WHERE bot_id = ? AND id <= ? AND consumed_at IS NULL').run(
    botId,
    maxId
  );
}

export function botApiSendMessage(bot, { chatId, text, attachmentPath, messageType, messageMeta }, emitToUser) {
  return sendBotMessage(
    bot.user_id,
    chatId,
    text,
    { attachmentPath, messageType, messageMeta },
    emitToUser
  );
}

export function getStickerById(stickerId) {
  return db.prepare('SELECT * FROM stickers WHERE id = ?').get(stickerId);
}

export function getStickersForPack(packId, mediaType = null) {
  if (mediaType === 'animated') {
    return db.prepare('SELECT * FROM stickers WHERE pack_id = ? AND media_type = ? ORDER BY created_at ASC').all(packId, 'animated');
  }
  if (mediaType === 'static') {
    return db.prepare('SELECT * FROM stickers WHERE pack_id = ? AND media_type = ? ORDER BY created_at ASC').all(packId, 'static');
  }
  return db.prepare('SELECT * FROM stickers WHERE pack_id = ? ORDER BY created_at ASC').all(packId);
}

export function getInstalledStickersForUser(userId, mediaType = null) {
  const packs = listInstalledPacks(userId);
  const out = [];
  for (const pack of packs) {
    const stickers = getStickersForPack(pack.id, mediaType);
    for (const s of stickers) {
      out.push({
        id: s.id,
        packId: s.pack_id,
        packTitle: pack.title,
        filePath: s.file_path,
        emoji: s.emoji,
        mediaType: s.media_type,
      });
    }
  }
  return out;
}

export function mapStickerRow(s) {
  return {
    id: s.id,
    packId: s.pack_id,
    filePath: s.file_path,
    emoji: s.emoji,
    mediaType: s.media_type,
    createdAt: s.created_at,
  };
}

export function mapPackRow(p) {
  return {
    id: p.id,
    title: p.title,
    isPublic: Number(p.is_public) === 1,
    thumbPath: p.thumb_path || null,
    stickerCount: Number(p.sticker_count || 0),
    createdAt: p.created_at,
  };
}

export function seedSystemBots() {
  initBotSchema();

  const existing = getBotByUsername(STICKER_BOT_USERNAME);
  if (existing) {
    console.log(`System bot @${STICKER_BOT_USERNAME} already exists`);
    ensureSystemBotCommands();
    return;
  }

  const userId = uuid();
  const botId = uuid();
  const token = generateBotToken();
  const password = crypto.randomBytes(24).toString('hex');

  db.prepare('INSERT INTO users (id, login, password, display_name, bio, is_bot, is_verified) VALUES (?, ?, ?, ?, ?, 1, 1)').run(
    userId,
    STICKER_BOT_USERNAME,
    password,
    'Sticker Bot',
    'Создаю наборы стикеров и GIF. Напишите /start'
  );

  db.prepare(`
    INSERT INTO bots (id, user_id, owner_id, token_hash, username, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    botId,
    userId,
    userId,
    hashToken(token),
    STICKER_BOT_USERNAME,
    'Official bot for sticker and GIF packs'
  );

  console.log('\n=== StickerBot ===');
  console.log(`Username: @${STICKER_BOT_USERNAME}`);
  console.log(`Bot token: ${token}`);
  console.log('==================\n');

  try {
    const botsFile = join(__dirname, 'bots.txt');
    fs.writeFileSync(
      botsFile,
      `=== Системные боты ===\n\n@${STICKER_BOT_USERNAME}\nToken: ${token}\n\nДата: ${new Date().toLocaleString('ru-RU')}\n`,
      'utf-8'
    );
  } catch (e) {
    console.warn('bots.txt:', e.message);
  }

  seedBotCommandsIfEmpty(botId, STICKER_BOT_COMMANDS);
  dbSave();
}

export {
  listInstalledPacks,
  listPublicPacks,
  listUserPacks,
  installPack,
  hashToken,
  canViewPackStickers,
  userHasStickerInMessages,
};
