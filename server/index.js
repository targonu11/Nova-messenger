import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { createServer } from 'http';
import { Server } from 'socket.io';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const __serverDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__serverDir, '.env') });
import { db, initDb, seedUsers, grantMainAdminPerks, ensureMainAdminPerksForUserId, verifyCredentials, save as dbSave, getAppSetting, setAppSetting, isMainAdminLogin } from './db.js';
import { parseSocialLinksJson, sanitizeSocialLinksPayload } from './socialLinks.js';
import { getUserActivities, setUserActivities, getActivitiesBatch } from './activity.js';
import {
  initConnectionsDb,
  listConfiguredProviders,
  buildConnectionStartUrl,
  handleConnectionCallback,
  getUserConnections,
  deleteUserConnection,
  parseJwtUserId,
} from './connections.js';
import {
  GROUP_KIND_CHANNEL,
  GROUP_KIND_GROUP,
  isChannelGroup,
  canPostInGroup,
  mapGroupKindField,
  mapGroupChannelSettings,
  checkSlowMode,
  reactionsEnabledForGroup,
  applyChannelPostDisplay,
} from './groupKind.js';
import {
  seedSystemBots,
  ensureSystemBotCommands,
  getBotCommandsForUserId,
  setBotCommandsForBot,
  getBotByToken,
  createUserBot,
  listBotsForOwner,
  revokeBot,
  rotateBotToken,
  getBotUpdates,
  consumeBotUpdates,
  botApiSendMessage,
  handleBotIncomingMessage,
  parseMessageMeta,
  getStickerById,
  getStickersForPack,
  listInstalledPacks,
  listPublicPacks,
  installPack,
  mapStickerRow,
  mapPackRow,
  isBotUserId,
  getPackPreviewInfo,
  canViewPackStickers,
} from './bots.js';
import { v4 as uuid } from 'uuid';
import { buildVoiceMeta, parseVoiceMeta, translateVoiceMeta, transcribeVoiceMeta } from './voiceAi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PKG = JSON.parse(fs.readFileSync(join(__dirname, 'package.json'), 'utf8'));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true }, pingTimeout: 60000 });

// Несколько сокетов на пользователя (веб + приложение) — синхронизация между вкладками/устройствами
const userSockets = new Map();

function emitToUser(userId, event, ...args) {
  const set = userSockets.get(userId);
  if (set) set.forEach((s) => { try { s.emit(event, ...args); } catch (e) { /* ignore */ } });
}

function generateChannelInviteCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 10; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function ensureChannelInviteCode(groupId) {
  try {
    if (!isChannelGroup(db, groupId)) return null;
    const row = db.prepare('SELECT invite_code FROM groups WHERE id = ?').get(groupId);
    if (row?.invite_code) return String(row.invite_code);
    let code = generateChannelInviteCode();
    for (let attempt = 0; attempt < 12; attempt++) {
      const exists = db.prepare('SELECT 1 FROM groups WHERE invite_code = ?').get(code);
      if (!exists) break;
      code = generateChannelInviteCode();
    }
    db.prepare('UPDATE groups SET invite_code = ? WHERE id = ?').run(code, groupId);
    return code;
  } catch {
    return null;
  }
}

function mapMessageExtraFields(m) {
  return {
    isSilent: Number(m.is_silent) === 1,
    viewCount: Number(m.view_count) || 0,
    postedAsChannel: Number(m.posted_as_channel) === 1,
  };
}

/** Всем сокетам пользователя, кроме одного (другие вкладки / устройства) */
function emitToUserExcept(userId, exceptSocket, event, payload) {
  const set = userSockets.get(userId);
  if (!set) return;
  set.forEach((s) => {
    if (exceptSocket != null && s === exceptSocket) return;
    try {
      s.emit(event, payload);
    } catch (e) { /* ignore */ }
  });
}

function emitSyncGroupsToGroupMembers(groupId) {
  try {
    const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId);
    members.forEach((m) => emitToUser(m.user_id, 'sync', { type: 'groups' }));
  } catch (e) { /* ignore */ }
}

// Группы, в которых идёт звонок: groupId -> userId инициатора
const activeGroupCalls = new Map();

const MAX_PINS_PER_CHAT = 5;

function messageBelongsToChat(messageRow, recipientType, recipientId, currentUserId) {
  if (!messageRow) return false;
  if (recipientType === 'group') {
    return messageRow.recipient_type === 'group' && String(messageRow.recipient_id) === String(recipientId);
  }
  const peer = String(recipientId);
  const me = String(currentUserId);
  return messageRow.recipient_type === 'user' && (
    (String(messageRow.sender_id) === me && String(messageRow.recipient_id) === peer) ||
    (String(messageRow.sender_id) === peer && String(messageRow.recipient_id) === me)
  );
}

function normalizeReactionEmoji(emoji) {
  return String(emoji || '').trim().normalize('NFC').replace(/\uFE0F/g, '');
}

function userCanAccessChat(userId, recipientType, recipientId) {
  if (recipientType === 'group') {
    return !!db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(recipientId, userId);
  }
  // Разрешаем чат "с собой" для Saved Messages
  return true;
}

function canPinInChat(userId, recipientType, recipientId) {
  if (recipientType === 'user') return true;
  const m = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(recipientId, userId);
  return !!(m && m.role === 'admin');
}

function getReactionsGroupedByMessageIds(messageIds) {
  if (!messageIds.length) return {};
  const placeholders = messageIds.map(() => '?').join(',');
  let rows;
  try {
    rows = db.prepare(`SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id IN (${placeholders})`).all(...messageIds);
  } catch (e) {
    return {};
  }
  const map = {};
  for (const r of rows) {
    if (!map[r.message_id]) map[r.message_id] = {};
    const em = normalizeReactionEmoji(r.emoji);
    if (!map[r.message_id][em]) map[r.message_id][em] = [];
    const uid = String(r.user_id);
    if (!map[r.message_id][em].includes(uid)) map[r.message_id][em].push(uid);
  }
  return map;
}

function toClientReactions(groupedForMessage, userId) {
  const uid = String(userId ?? '');
  const out = {};
  for (const [emoji, uids] of Object.entries(groupedForMessage || {})) {
    const arr = (uids || []).map(String);
    out[emoji] = { count: arr.length, me: arr.includes(uid) };
  }
  return out;
}

function getStarredSetForUserMessageIds(userId, messageIds) {
  if (!messageIds.length) return new Set();
  const placeholders = messageIds.map(() => '?').join(',');
  try {
    const rows = db.prepare(`SELECT message_id FROM starred_messages WHERE user_id = ? AND message_id IN (${placeholders})`).all(userId, ...messageIds);
    return new Set(rows.map((r) => r.message_id));
  } catch (e) {
    return new Set();
  }
}

function emitToChatParticipants(recipientType, recipientId, event, payload, senderUserId) {
  if (recipientType === 'user') {
    const peer = String(recipientId);
    emitToUser(peer, event, payload);
    if (senderUserId) emitToUser(senderUserId, event, payload);
  } else {
    try {
      const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(recipientId);
      members.forEach((m) => emitToUser(m.user_id, event, payload));
    } catch (e) { /* ignore */ }
  }
}

function getPinnedListForChat(recipientType, recipientId) {
  try {
    const rows = db.prepare(`
      SELECT p.message_id AS id, p.pinned_at, m.content, m.sender_id, m.created_at, m.attachment_path, m.is_deleted
      FROM pinned_messages p
      JOIN messages m ON m.id = p.message_id
      WHERE p.recipient_type = ? AND p.recipient_id = ?
      ORDER BY p.pinned_at ASC
    `).all(recipientType, recipientId);
    return rows.map((r) => {
      const sender = db.prepare('SELECT display_name FROM users WHERE id = ?').get(r.sender_id);
      return {
        id: r.id,
        content: Number(r.is_deleted) === 1 ? '' : (r.content || ''),
        senderName: sender?.display_name || '',
        createdAt: r.created_at,
        attachmentPath: r.attachment_path || null,
        isDeleted: Number(r.is_deleted) === 1,
      };
    });
  } catch (e) {
    return [];
  }
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use((err, req, res, next) => {
  if (err) {
    console.error('[SERVER] JSON/body parse error:', err.message);
    res.status(400).json({ error: 'Invalid request body: ' + err.message });
    return;
  }
  next();
});
if (!fs.existsSync(join(__dirname, 'uploads'))) fs.mkdirSync(join(__dirname, 'uploads'));
app.use('/uploads', express.static(join(__dirname, 'uploads')));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, join(__dirname, 'uploads')),
    filename: (_, file, cb) => cb(null, Date.now() + '-avatar.png'),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

const uploadVoice = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, join(__dirname, 'uploads')),
    filename: (_, file, cb) => cb(null, Date.now() + '-voice.' + (file.originalname?.split('.').pop() || 'webm')),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const mt = (file.mimetype || '').toLowerCase();
    const ok = mt.startsWith('audio/') || mt === 'video/webm' || mt === 'application/octet-stream' || !mt;
    if (!ok) {
      cb(new Error('Only audio files are allowed'));
      return;
    }
    cb(null, true);
  },
});

const uploadAttachment = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, join(__dirname, 'uploads')),
    filename: (_, file, cb) => {
      const ext = (file.originalname && file.originalname.split('.').pop()) || 'bin';
      const safe = ext.replace(/[^a-z0-9]/gi, '') || 'bin';
      cb(null, Date.now() + '-att.' + safe);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Инициализация БД и создание аккаунтов
await initDb();
initConnectionsDb(db);

// Миграция: фон группы
try {
  db.prepare('SELECT background_path FROM groups LIMIT 1').get();
} catch (e) {
  try {
    db.exec('ALTER TABLE groups ADD COLUMN background_path TEXT');
  } catch (err) {
    console.warn('Migration background_path:', err.message);
  }
}

// Миграция: обложка профиля (VK-style)
try {
  db.prepare('SELECT cover_path FROM users LIMIT 1').get();
} catch (e) {
  try {
    db.exec('ALTER TABLE users ADD COLUMN cover_path TEXT');
  } catch (err) {
    console.warn('Migration cover_path:', err.message);
  }
}

// Миграция: обводка аватара
try {
  db.prepare('SELECT avatar_ring FROM users LIMIT 1').get();
} catch (e) {
  try {
    db.exec("ALTER TABLE users ADD COLUMN avatar_ring TEXT DEFAULT 'none'");
  } catch (err) {
    console.warn('Migration avatar_ring:', err.message);
  }
}

await seedUsers();
grantMainAdminPerks();
seedSystemBots();
ensureSystemBotCommands();

// Логирование запросов (без сериализации body, чтобы не падать)
app.use('/api', (req, res, next) => {
  try {
    console.log(`[API] ${req.method} ${req.path}`);
  } catch (e) {
    console.error('[API] Log error:', e.message);
  }
  next();
});

const JWT_SECRET = process.env.JWT_SECRET || 'nova-dev-secret-change-me';

function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function base64UrlEncodeBuf(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function base64UrlDecodeToString(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  return Buffer.from(s + pad, 'base64').toString('utf8');
}
function signJwtHS256(payload, expiresInSec) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + Math.max(1, expiresInSec) };
  const p1 = base64UrlEncode(JSON.stringify(header));
  const p2 = base64UrlEncode(JSON.stringify(body));
  const data = `${p1}.${p2}`;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest();
  return `${data}.${base64UrlEncodeBuf(sig)}`;
}
function verifyJwtHS256(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [p1, p2, p3] = parts;
  const data = `${p1}.${p2}`;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(data).digest();
  const got = Buffer.from(String(p3).replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (p3.length % 4)) % 4), 'base64');
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(base64UrlDecodeToString(p2));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload || !payload.userId || (payload.exp && Number(payload.exp) < now)) return null;
  return payload;
}

function parseAuthToken(token) {
  const t = token && typeof token === 'string' ? token.trim() : '';
  if (!t) return null;
  // New: JWT
  const jwtPayload = verifyJwtHS256(t);
  if (jwtPayload) return { userId: jwtPayload.userId, sessionId: jwtPayload.sid || null };
  // Legacy: base64 JSON
  try {
    const payload = JSON.parse(Buffer.from(t, 'base64').toString());
    if (payload && payload.userId) return { userId: payload.userId, sessionId: null };
  } catch {}
  return null;
}

function getIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}

// Middleware для проверки токена (JWT access token или legacy)
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const parsed = parseAuthToken(token);
  if (!parsed) return res.status(401).json({ error: 'Invalid token' });
  req.userId = parsed.userId;
  req.sessionId = parsed.sessionId || null;
  next();
}

function isAdminUserId(userId) {
  try {
    const row = db.prepare('SELECT login FROM users WHERE id = ?').get(userId);
    return row && isMainAdminLogin(row.login);
  } catch (e) {
    console.error('isAdminUserId error:', e.message);
    return false;
  }
}

function adminMiddleware(req, res, next) {
  if (!req.userId || !isAdminUserId(req.userId)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function botAuthMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bot\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: 'Bot token required (Authorization: Bot TOKEN)' });
  const bot = getBotByToken(match[1].trim());
  if (!bot) return res.status(401).json({ error: 'Invalid bot token' });
  req.bot = bot;
  req.botUserId = bot.user_id;
  next();
}

/** Смена юзернейма: для всех по флагу; главный админ (lololowkid) всегда может. */
function isAllowUsernameChangeForUser(login) {
  if (!login || typeof login !== 'string') return false;
  if (isMainAdminLogin(login)) return true;
  return getAppSetting('allow_username_change_all', '1') === '1';
}

function mapCustomStatusFields(row) {
  if (!row) {
    return { customStatusEmoji: '', customStatusText: '', customStatusMode: 'online' };
  }
  return {
    customStatusEmoji: row.custom_status_emoji || '',
    customStatusText: row.custom_status_text || '',
    customStatusMode: row.custom_status_mode || 'online',
  };
}

/** Нормализация даты рождения: YYYY-MM-DD или null (очистка). */
function parseBirthdayInput(value) {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  const s = String(value).trim();
  if (!s) return { ok: true, value: null };
  let iso = s;
  const dot = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dot) iso = `${dot[3]}-${dot[2]}-${dot[1]}`;
  const slash = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) iso = `${slash[3]}-${slash[2]}-${slash[1]}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return { ok: false, error: 'Invalid birthday format (use YYYY-MM-DD)' };
  }
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return { ok: false, error: 'Invalid birthday date' };
  }
  const maxY = new Date().getFullYear();
  if (y < 1900 || y > maxY) {
    return { ok: false, error: `Year must be between 1900 and ${maxY}` };
  }
  return { ok: true, value: iso };
}

function mapBirthdayField(row) {
  const b = row?.birthday;
  return { birthday: b && String(b).trim() ? String(b).trim() : '' };
}

function emitStatusChanged(userId) {
  try {
    const row = db.prepare('SELECT custom_status_emoji, custom_status_text, custom_status_mode FROM users WHERE id = ?').get(userId);
    io.emit('status_changed', { userId, ...mapCustomStatusFields(row) });
  } catch (e) { /* ignore */ }
}

function emitActivityChanged(userId) {
  try {
    const activities = getUserActivities(db, userId);
    io.emit('activity_changed', { userId, activities });
  } catch (e) { /* ignore */ }
}

function generateAccessToken(userId, sessionId) {
  // 15 минут как в типичных приложениях
  return signJwtHS256({ userId, sid: sessionId }, 15 * 60);
}

function generateRefreshToken() {
  // случайный токен для хранения в БД
  return crypto.randomBytes(32).toString('hex');
}

function hashPin(pin, saltHex) {
  const salt = Buffer.from(String(saltHex), 'hex');
  const key = crypto.pbkdf2Sync(String(pin), salt, 120000, 32, 'sha256');
  return key.toString('hex');
}

// Anti-bruteforce (in-memory, достаточно для MVP)
const loginAttempts = new Map(); // key -> { count, firstAt, blockedUntil }
function loginAttemptKey(req, login) {
  const ip = getIp(req) || '';
  return `${ip}::${String(login || '').toLowerCase()}`;
}
function isBlockedAttempt(key) {
  const rec = loginAttempts.get(key);
  if (!rec) return false;
  return rec.blockedUntil && rec.blockedUntil > Date.now();
}
function registerFailedAttempt(key) {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const max = 6;
  let rec = loginAttempts.get(key);
  if (!rec || now - rec.firstAt > windowMs) rec = { count: 0, firstAt: now, blockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= max) {
    rec.blockedUntil = now + 2 * 60 * 1000; // 2 минуты
  }
  loginAttempts.set(key, rec);
}
function clearAttempts(key) {
  loginAttempts.delete(key);
}

// Генерация кода подтверждения (6 цифр)
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Отправка кода подтверждения на телефон
app.post('/api/auth/send-verification-code', (req, res) => {
  const send = (status, body) => {
    if (res.headersSent) return;
    try {
      res.status(status).json(typeof body === 'object' ? body : { error: String(body) });
    } catch (e) {
      console.error('[SEND_CODE] send failed:', e.message);
    }
  };

  try {
    const body = req.body || {};
    const phone = body.phone;

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return send(400, 'Phone number is required');
    }

    // Нормализуем номер телефона (убираем все кроме цифр и +)
    const normalizedPhone = phone.replace(/[^\d+]/g, '');
    
    // Простая валидация формата (минимум 10 цифр)
    const digitsOnly = normalizedPhone.replace(/\+/g, '');
    if (digitsOnly.length < 10) {
      return send(400, 'Invalid phone number format');
    }

    // Генерируем код
    const code = generateVerificationCode();
    const expiresAt = Math.floor(Date.now() / 1000) + 300; // Код действителен 5 минут

    // Сохраняем код в БД
    try {
      db.prepare(`
        INSERT INTO phone_verification_codes (phone, code, expires_at, attempts)
        VALUES (?, ?, ?, 0)
        ON CONFLICT(phone) DO UPDATE SET
          code = ?,
          expires_at = ?,
          attempts = 0,
          created_at = strftime('%s','now')
      `).run(normalizedPhone, code, expiresAt, code, expiresAt);
    } catch (dbErr) {
      console.error('[SEND_CODE] DB error:', dbErr.message);
      return send(500, 'Database error: ' + String(dbErr.message));
    }

    // В реальном приложении здесь была бы отправка SMS через Twilio, AWS SNS и т.д.
    // Для разработки выводим код в консоль
    console.log(`[SMS] Verification code for ${normalizedPhone}: ${code}`);
    console.log(`[SMS] Code expires at: ${new Date(expiresAt * 1000).toLocaleString()}`);

    // В продакшене здесь был бы вызов SMS API
    // Например: await twilioClient.messages.create({ to: phone, body: `Your verification code: ${code}` });

    return send(200, { 
      message: 'Verification code sent',
      // В режиме разработки возвращаем код для тестирования
      code: process.env.NODE_ENV === 'development' ? code : undefined
    });
  } catch (err) {
    console.error('[SEND_CODE] Error:', err.message, err.stack);
    return send(500, 'Server error: ' + (err.message || 'Unknown'));
  }
});

// Проверка кода подтверждения
app.post('/api/auth/verify-phone-code', (req, res) => {
  const send = (status, body) => {
    if (res.headersSent) return;
    try {
      res.status(status).json(typeof body === 'object' ? body : { error: String(body) });
    } catch (e) {
      console.error('[VERIFY_CODE] send failed:', e.message);
    }
  };

  try {
    const body = req.body || {};
    const phone = body.phone;
    const code = body.code;

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return send(400, 'Phone number is required');
    }
    if (!code || typeof code !== 'string' || !code.trim()) {
      return send(400, 'Verification code is required');
    }

    const normalizedPhone = phone.replace(/[^\d+]/g, '');
    const trimmedCode = code.trim();

    // Получаем код из БД
    let verification;
    try {
      verification = db.prepare('SELECT code, expires_at, attempts FROM phone_verification_codes WHERE phone = ?').get(normalizedPhone);
    } catch (dbErr) {
      console.error('[VERIFY_CODE] DB error:', dbErr.message);
      return send(500, 'Database error: ' + String(dbErr.message));
    }

    if (!verification) {
      return send(400, 'Verification code not found. Please request a new code.');
    }

    // Проверяем количество попыток (максимум 5)
    if (verification.attempts >= 5) {
      return send(400, 'Too many attempts. Please request a new code.');
    }

    // Проверяем срок действия
    const now = Math.floor(Date.now() / 1000);
    if (verification.expires_at < now) {
      return send(400, 'Verification code expired. Please request a new code.');
    }

    // Увеличиваем счетчик попыток
    db.prepare('UPDATE phone_verification_codes SET attempts = attempts + 1 WHERE phone = ?').run(normalizedPhone);

    // Проверяем код
    if (verification.code !== trimmedCode) {
      return send(400, 'Invalid verification code');
    }

    // Код верный - удаляем его из БД
    db.prepare('DELETE FROM phone_verification_codes WHERE phone = ?').run(normalizedPhone);

    return send(200, { verified: true, message: 'Phone number verified successfully' });
  } catch (err) {
    console.error('[VERIFY_CODE] Error:', err.message, err.stack);
    return send(500, 'Server error: ' + (err.message || 'Unknown'));
  }
});

// Регистрация нового пользователя
app.post('/api/auth/register', (req, res) => {
  const send = (status, body) => {
    if (res.headersSent) return;
    try {
      res.status(status).json(typeof body === 'object' ? body : { error: String(body) });
    } catch (e) {
      console.error('[REGISTER] send failed:', e.message);
    }
  };

  try {
    const body = req.body || {};
    const login = body.login;
    const password = body.password;
    const displayName = body.displayName;
    const phone = body.phone;
    const verificationCode = body.verificationCode;

    if (!login || typeof login !== 'string' || !String(login).trim()) {
      return send(400, 'Login is required');
    }
    if (!password || typeof password !== 'string') {
      return send(400, 'Password is required');
    }
    if (password.length < 4) {
      return send(400, 'Password must be at least 4 characters');
    }
    if (!displayName || typeof displayName !== 'string' || !String(displayName).trim()) {
      return send(400, 'Display name is required');
    }
    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return send(400, 'Phone number is required');
    }
    if (!verificationCode || typeof verificationCode !== 'string' || !verificationCode.trim()) {
      return send(400, 'Verification code is required');
    }

    const trimmedLogin = String(login).trim();
    const trimmedDisplayName = String(displayName).trim();
    const normalizedPhone = phone.replace(/[^\d+]/g, '');
    const trimmedCode = verificationCode.trim();

    // Проверка формата логина
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedLogin)) {
      return send(400, 'Login can only contain letters, numbers, and underscores');
    }
    if (trimmedLogin.length > 30) {
      return send(400, 'Login must be 30 characters or less');
    }
    if (trimmedDisplayName.length > 50) {
      return send(400, 'Display name must be 50 characters or less');
    }

    // Проверка формата телефона
    const digitsOnly = normalizedPhone.replace(/\+/g, '');
    if (digitsOnly.length < 10) {
      return send(400, 'Invalid phone number format');
    }

    // Проверяем код подтверждения перед регистрацией
    let verification;
    try {
      verification = db.prepare('SELECT code, expires_at, attempts FROM phone_verification_codes WHERE phone = ?').get(normalizedPhone);
    } catch (dbErr) {
      console.error('[REGISTER] DB verification check error:', dbErr.message);
      return send(500, 'Database error: ' + String(dbErr.message));
    }

    if (!verification) {
      return send(400, 'Verification code not found. Please verify your phone number first.');
    }

    if (verification.attempts >= 5) {
      return send(400, 'Too many verification attempts. Please request a new code.');
    }

    const now = Math.floor(Date.now() / 1000);
    if (verification.expires_at < now) {
      return send(400, 'Verification code expired. Please request a new code.');
    }

    if (verification.code !== trimmedCode) {
      db.prepare('UPDATE phone_verification_codes SET attempts = attempts + 1 WHERE phone = ?').run(normalizedPhone);
      return send(400, 'Invalid verification code');
    }

    // Проверка уникальности логина
    let existing;
    try {
      existing = db.prepare('SELECT id FROM users WHERE login = ?').get(trimmedLogin);
    } catch (dbErr) {
      console.error('[REGISTER] DB error:', dbErr.message);
      return send(500, 'Database error: ' + String(dbErr.message));
    }

    if (existing) {
      return send(400, 'This login is already taken');
    }

    // Проверка уникальности телефона
    let existingPhone;
    try {
      existingPhone = db.prepare('SELECT id FROM users WHERE phone = ?').get(normalizedPhone);
    } catch (dbErr) {
      console.error('[REGISTER] DB phone check error:', dbErr.message);
      return send(500, 'Database error: ' + String(dbErr.message));
    }

    if (existingPhone) {
      return send(400, 'This phone number is already registered');
    }

    // Создаём нового пользователя
    const userId = uuid();
    try {
      db.prepare('INSERT INTO users (id, login, password, display_name, phone, phone_verified) VALUES (?, ?, ?, ?, ?, 1)').run(
        userId,
        trimmedLogin,
        password,
        trimmedDisplayName,
        normalizedPhone
      );
    } catch (dbErr) {
      console.error('[REGISTER] DB insert error:', dbErr.message);
      if (dbErr.message && dbErr.message.includes('UNIQUE constraint failed')) {
        if (dbErr.message.includes('login')) {
          return send(400, 'This login is already taken');
        }
        if (dbErr.message.includes('phone')) {
          return send(400, 'This phone number is already registered');
        }
      }
      return send(500, 'Database error: ' + String(dbErr.message));
    }

    // Удаляем использованный код подтверждения
    db.prepare('DELETE FROM phone_verification_codes WHERE phone = ?').run(normalizedPhone);

    const sessionId = uuid();
    const refreshToken = generateRefreshToken();
    try {
      db.prepare(`
        INSERT INTO user_sessions (id, user_id, refresh_token, user_agent, ip, last_seen_at)
        VALUES (?, ?, ?, ?, ?, strftime('%s','now'))
      `).run(sessionId, userId, refreshToken, String(req.headers['user-agent'] || ''), getIp(req));
    } catch (e) {
      console.warn('Create session on register failed:', e.message);
    }
    const token = generateAccessToken(userId, sessionId);
    const nowSec = Math.floor(Date.now() / 1000);
    const user = {
      id: userId,
      login: trimmedLogin,
      displayName: trimmedDisplayName,
      bio: '',
      avatarPath: null,
      allowUsernameChange: isAllowUsernameChangeForUser(trimmedLogin),
      socialLinks: {},
      createdAt: nowSec,
    };

    console.log('[REGISTER] New user created:', trimmedLogin, 'Phone:', normalizedPhone);
    return send(200, { token, refreshToken, user });
  } catch (err) {
    console.error('[REGISTER] Error:', err.message, err.stack);
    return send(500, 'Server error: ' + (err.message || 'Unknown'));
  }
});

// Тестовый endpoint
app.get('/api/test', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running', timestamp: Date.now() });
});

app.get('/api/version', (req, res) => {
  res.json({
    ok: true,
    version: SERVER_PKG.version,
    name: SERVER_PKG.name,
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, t: Date.now() });
});

const translateCache = new Map();
const TRANSLATE_TTL_MS = 60 * 60 * 1000;

app.post('/api/translate', authMiddleware, async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Empty text' });
    if (text.length > 4500) return res.status(400).json({ error: 'Text too long' });
    const to = String(req.body?.to || 'en').trim().toLowerCase().slice(0, 8) || 'en';
    const from = String(req.body?.from || 'auto').trim().toLowerCase().slice(0, 8) || 'auto';
    const cacheKey = `${from}|${to}|${text}`;
    const cached = translateCache.get(cacheKey);
    if (cached && Date.now() - cached.at < TRANSLATE_TTL_MS) {
      return res.json(cached.data);
    }
    const langpair = `Autodetect|${to}`;
    const chunks = [];
    const src = text.slice(0, 2000);
    for (let i = 0; i < src.length; i += 480) {
      chunks.push(src.slice(i, i + 480));
    }
    const translatedParts = [];
    for (const chunk of chunks) {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${encodeURIComponent(langpair)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      let upstream;
      try {
        upstream = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!upstream.ok) {
        return res.status(502).json({ error: 'Translate upstream failed' });
      }
      const raw = await upstream.json().catch(() => ({}));
      const part = String(raw?.responseData?.translatedText || '').trim();
      if (!part) {
        return res.status(502).json({ error: 'No translation' });
      }
      translatedParts.push(part);
    }
    const translated = translatedParts.join(' ');
    const data = {
      text: translated,
      to,
      from: 'auto',
    };
    translateCache.set(cacheKey, { at: Date.now(), data });
    if (translateCache.size > 300) {
      const first = translateCache.keys().next().value;
      translateCache.delete(first);
    }
    res.json(data);
  } catch (err) {
    if (err?.name === 'AbortError') {
      return res.status(504).json({ error: 'Translate timeout' });
    }
    console.error('translate', err);
    res.status(500).json({ error: 'Translate failed' });
  }
});

const linkPreviewCache = new Map();
const LINK_PREVIEW_TTL_MS = 30 * 60 * 1000;

function extractMeta(html, prop) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${prop}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  }
  return '';
}

app.get('/api/link-preview', authMiddleware, async (req, res) => {
  try {
    const raw = String(req.query.url || '').trim();
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    if (!/^https?:$/i.test(parsed.protocol)) {
      return res.status(400).json({ error: 'Only http(s) URLs' });
    }
    const key = parsed.href;
    const cached = linkPreviewCache.get(key);
    if (cached && Date.now() - cached.at < LINK_PREVIEW_TTL_MS) {
      return res.json(cached.data);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let html = '';
    try {
      const upstream = await fetch(key, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'NovaMessengerBot/1.0 (+link-preview)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!upstream.ok) {
        clearTimeout(timer);
        return res.status(404).json({ error: 'Fetch failed' });
      }
      const ctype = String(upstream.headers.get('content-type') || '');
      if (!/text\/html|application\/xhtml/i.test(ctype)) {
        clearTimeout(timer);
        const data = { url: key, title: parsed.hostname, description: '', image: '' };
        linkPreviewCache.set(key, { at: Date.now(), data });
        return res.json(data);
      }
      html = await upstream.text();
    } finally {
      clearTimeout(timer);
    }
    if (html.length > 400000) html = html.slice(0, 400000);
    const title = extractMeta(html, 'og:title')
      || extractMeta(html, 'twitter:title')
      || (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim();
    const description = extractMeta(html, 'og:description')
      || extractMeta(html, 'twitter:description')
      || extractMeta(html, 'description');
    let image = extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image');
    if (image) {
      try { image = new URL(image, key).href; } catch { image = ''; }
    }
    const data = {
      url: key,
      title: String(title || '').slice(0, 160),
      description: String(description || '').slice(0, 280),
      image: String(image || '').slice(0, 500),
    };
    linkPreviewCache.set(key, { at: Date.now(), data });
    if (linkPreviewCache.size > 300) {
      const first = linkPreviewCache.keys().next().value;
      linkPreviewCache.delete(first);
    }
    res.json(data);
  } catch (err) {
    if (err?.name === 'AbortError') return res.status(408).json({ error: 'Timeout' });
    console.error('link-preview error:', err.message);
    res.status(500).json({ error: 'Preview failed' });
  }
});

// Тестовый endpoint для проверки маршрута групп
app.get('/api/groups/test', authMiddleware, (req, res) => {
  res.json({ status: 'ok', message: 'Groups route is working', userId: req.userId });
});

// Аутентификация — всегда отправляем ответ с телом
app.post('/api/auth/login', (req, res) => {
  const send = (status, body) => {
    if (res.headersSent) return;
    try {
      res.status(status).json(typeof body === 'object' ? body : { error: String(body) });
    } catch (e) {
      console.error('[LOGIN] send failed:', e.message);
    }
  };

  try {
    const body = req.body || {};
    const login = body.login;
    const password = body.password;
    const pin = body.pin;

    if (!login || typeof login !== 'string' || !String(login).trim()) {
      return send(400, 'Login is required');
    }
    if (!password || typeof password !== 'string') {
      return send(400, 'Password is required');
    }

    const trimmedLogin = String(login).trim();
    const attemptKey = loginAttemptKey(req, trimmedLogin);
    if (isBlockedAttempt(attemptKey)) {
      return send(429, { error: 'Too many attempts. Try again later.' });
    }

    let row;
    try {
      row = db.prepare('SELECT id, login, password, display_name, bio, avatar_path, cover_path, avatar_ring, ban_until, is_verified, selected_badge_id, twofa_enabled, twofa_pin_salt, twofa_pin_hash, social_links, created_at FROM users WHERE login = ?').get(trimmedLogin);
    } catch (dbErr) {
      console.error('[LOGIN] DB error:', dbErr.message);
      return send(500, 'Database error: ' + String(dbErr.message));
    }

    if (!row) {
      registerFailedAttempt(attemptKey);
      return send(401, 'Invalid login or password');
    }

    if (row.password !== password) {
      registerFailedAttempt(attemptKey);
      return send(401, 'Invalid login or password');
    }

    // 2FA PIN (если включено)
    if (Number(row.twofa_enabled) === 1) {
      const p = pin != null ? String(pin).trim() : '';
      if (!p) {
        return send(428, { error: '2FA PIN required', need2fa: true });
      }
      const saltHex = row.twofa_pin_salt || '';
      const expected = row.twofa_pin_hash || '';
      if (!saltHex || !expected) {
        return send(500, { error: '2FA misconfigured' });
      }
      const got = hashPin(p, saltHex);
      if (got !== expected) {
        registerFailedAttempt(attemptKey);
        return send(401, { error: 'Invalid PIN', need2fa: true });
      }
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof row.ban_until === 'number' && row.ban_until > nowSec) {
      return send(403, `Account is banned until ${new Date(row.ban_until * 1000).toISOString()}`);
    }

    clearAttempts(attemptKey);

    if (isMainAdminLogin(trimmedLogin)) {
      grantMainAdminPerks(trimmedLogin);
    }

    const profile = db.prepare(`
      SELECT u.id, u.login, u.display_name, u.bio, u.avatar_path, u.cover_path, u.avatar_ring, u.is_verified,
             u.selected_badge_id, u.social_links, u.created_at, u.birthday, u.custom_status_emoji, u.custom_status_text, u.custom_status_mode,
             a.name AS badge_name, a.icon AS badge_icon
      FROM users u
      LEFT JOIN achievements a ON a.id = u.selected_badge_id
      WHERE u.login = ?
    `).get(trimmedLogin);

    const sessionId = uuid();
    const refreshToken = generateRefreshToken();
    try {
      db.prepare(`
        INSERT INTO user_sessions (id, user_id, refresh_token, user_agent, ip, last_seen_at)
        VALUES (?, ?, ?, ?, ?, strftime('%s','now'))
      `).run(sessionId, profile.id, refreshToken, String(req.headers['user-agent'] || ''), getIp(req));
    } catch (e) {
      console.warn('Create session on login failed:', e.message);
    }
    const token = generateAccessToken(profile.id, sessionId);
    const user = {
      id: profile.id,
      login: profile.login,
      displayName: profile.display_name || profile.login,
      bio: profile.bio ?? '',
      avatarPath: profile.avatar_path ?? null,
      coverPath: profile.cover_path ?? null,
      avatarRing: profile.avatar_ring || 'none',
      isVerified: !!profile.is_verified,
      badgeId: profile.selected_badge_id || null,
      badgeName: profile.badge_name || null,
      badgeIcon: profile.badge_icon || null,
      allowUsernameChange: isAllowUsernameChangeForUser(profile.login),
      isAdmin: isMainAdminLogin(profile.login),
      socialLinks: parseSocialLinksJson(profile.social_links),
      createdAt: typeof profile.created_at === 'number' ? profile.created_at : null,
      ...mapBirthdayField(profile),
      ...mapCustomStatusFields(profile),
    };

    return send(200, { token, refreshToken, user });
  } catch (err) {
    console.error('[LOGIN] Error:', err.message, err.stack);
    return send(500, 'Server error: ' + (err.message || 'Unknown'));
  }
});

// Включить/изменить/выключить 2FA PIN (требует пароль)
app.put('/api/users/me/2fa-pin', authMiddleware, (req, res) => {
  try {
    const { enabled, pin, password } = req.body || {};
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) is required' });
    const pass = password != null ? String(password) : '';
    if (!pass) return res.status(400).json({ error: 'password is required' });
    const u = db.prepare('SELECT id, password FROM users WHERE id = ?').get(req.userId);
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (u.password !== pass) return res.status(401).json({ error: 'Invalid password' });

    if (!enabled) {
      db.prepare('UPDATE users SET twofa_enabled = 0, twofa_pin_salt = NULL, twofa_pin_hash = NULL WHERE id = ?').run(req.userId);
      return res.json({ twofaEnabled: false });
    }
    const p = pin != null ? String(pin).trim() : '';
    if (!/^\d{4,8}$/.test(p)) return res.status(400).json({ error: 'PIN must be 4-8 digits' });
    const saltHex = crypto.randomBytes(16).toString('hex');
    const h = hashPin(p, saltHex);
    db.prepare('UPDATE users SET twofa_enabled = 1, twofa_pin_salt = ?, twofa_pin_hash = ? WHERE id = ?').run(saltHex, h, req.userId);
    return res.json({ twofaEnabled: true });
  } catch (err) {
    console.error('Set 2FA pin error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh access token по refresh token (сессия устройства)
app.post('/api/auth/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    const rt = refreshToken && typeof refreshToken === 'string' ? refreshToken.trim() : '';
    if (!rt) return res.status(400).json({ error: 'refreshToken is required' });
    const row = db.prepare(`
      SELECT id, user_id, revoked_at FROM user_sessions
      WHERE refresh_token = ?
      LIMIT 1
    `).get(rt);
    if (!row || row.revoked_at) return res.status(401).json({ error: 'Invalid refresh token' });
    try {
      db.prepare('UPDATE user_sessions SET last_seen_at = strftime(\'%s\', \'now\') WHERE id = ?').run(row.id);
    } catch {}
    const token = generateAccessToken(row.user_id, row.id);
    return res.json({ token });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout только текущей сессии (по refreshToken)
app.post('/api/auth/logout', (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    const rt = refreshToken && typeof refreshToken === 'string' ? refreshToken.trim() : '';
    if (!rt) return res.status(400).json({ error: 'refreshToken is required' });
    db.prepare('UPDATE user_sessions SET revoked_at = strftime(\'%s\', \'now\') WHERE refresh_token = ?').run(rt);
    res.json({ ok: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Active sessions list (как "Устройства" в Telegram)
app.get('/api/auth/sessions', authMiddleware, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, user_agent, ip, created_at, last_seen_at, revoked_at
      FROM user_sessions
      WHERE user_id = ?
      ORDER BY COALESCE(last_seen_at, created_at) DESC
      LIMIT 50
    `).all(req.userId);
    res.json(rows.map((s) => ({
      id: s.id,
      userAgent: s.user_agent || '',
      ip: s.ip || '',
      createdAt: s.created_at || null,
      lastSeenAt: s.last_seen_at || null,
      revokedAt: s.revoked_at || null,
      current: req.sessionId ? String(req.sessionId) === String(s.id) : false,
    })));
  } catch (err) {
    console.error('List sessions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Revoke one session
app.post('/api/auth/sessions/:id/revoke', authMiddleware, (req, res) => {
  try {
    const sid = req.params.id;
    if (!sid) return res.status(400).json({ error: 'Session id required' });
    db.prepare(`
      UPDATE user_sessions
      SET revoked_at = strftime('%s','now')
      WHERE id = ? AND user_id = ?
    `).run(sid, req.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Revoke session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout all devices except current
app.post('/api/auth/logout-all', authMiddleware, (req, res) => {
  try {
    if (req.sessionId) {
      db.prepare(`
        UPDATE user_sessions
        SET revoked_at = strftime('%s','now')
        WHERE user_id = ? AND id != ?
      `).run(req.userId, req.sessionId);
    } else {
      db.prepare(`
        UPDATE user_sessions
        SET revoked_at = strftime('%s','now')
        WHERE user_id = ?
      `).run(req.userId);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Logout all error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение списка пользователей
app.get('/api/users', authMiddleware, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.login, u.display_name, u.bio, u.avatar_path, u.cover_path, u.avatar_ring, u.is_verified, u.is_bot, u.ban_until, u.e2e_public_key, u.selected_badge_id,
             u.social_links, u.created_at, u.birthday, u.custom_status_emoji, u.custom_status_text, u.custom_status_mode,
             a.name AS badge_name, a.icon AS badge_icon
      FROM users u
      LEFT JOIN achievements a ON a.id = u.selected_badge_id
      ORDER BY u.display_name
    `).all();
    res.json(users.map(u => ({
      id: u.id,
      login: u.login,
      displayName: u.display_name,
      bio: u.bio || '',
      avatarPath: u.avatar_path,
      coverPath: u.cover_path || null,
      avatarRing: u.avatar_ring || 'none',
      isVerified: !!u.is_verified,
      isBot: Number(u.is_bot) === 1,
      banUntil: typeof u.ban_until === 'number' ? u.ban_until : null,
      e2ePublicKey: u.e2e_public_key || null,
      badgeId: u.selected_badge_id || null,
      badgeName: u.badge_name || null,
      badgeIcon: u.badge_icon || null,
      socialLinks: parseSocialLinksJson(u.social_links),
      createdAt: typeof u.created_at === 'number' ? u.created_at : null,
      ...mapBirthdayField(u),
      ...mapCustomStatusFields(u),
    })));
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/lookup/:login', authMiddleware, (req, res) => {
  try {
    const login = String(req.params.login || '').replace(/^@/, '').trim();
    if (!login) return res.status(400).json({ error: 'Login required' });
    const u = db.prepare(`
      SELECT id, login, display_name, avatar_path, is_bot, bio
      FROM users WHERE login = ?
    `).get(login);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: u.id,
      login: u.login,
      displayName: u.display_name || u.login,
      avatarPath: u.avatar_path || null,
      isBot: Number(u.is_bot) === 1,
      bio: u.bio || '',
    });
  } catch (err) {
    console.error('User lookup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/:userId/bot-commands', authMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    if (!isBotUserId(userId)) {
      return res.json({ commands: [] });
    }
    const commands = getBotCommandsForUserId(userId);
    res.json({ commands });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Bots (Telegram/Discord-style) ---
app.post('/api/bots', authMiddleware, (req, res) => {
  try {
    const { username, displayName, description } = req.body || {};
    const bot = createUserBot(req.userId, { username, displayName, description });
    res.status(201).json({
      id: bot.id,
      userId: bot.userId,
      username: bot.username,
      displayName: bot.displayName,
      description: bot.description,
      token: bot.token,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to create bot' });
  }
});

app.get('/api/bots', authMiddleware, (req, res) => {
  try {
    const rows = listBotsForOwner(req.userId);
    res.json(rows.map((b) => ({
      id: b.id,
      userId: b.user_id,
      username: b.username,
      displayName: b.display_name,
      description: b.description || '',
      createdAt: b.created_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/bots/:id', authMiddleware, (req, res) => {
  try {
    const ok = revokeBot(req.userId, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Bot not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/bots/:id/rotate-token', authMiddleware, (req, res) => {
  try {
    const token = rotateBotToken(req.userId, req.params.id);
    if (!token) return res.status(404).json({ error: 'Bot not found' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/bot/me', botAuthMiddleware, (req, res) => {
  try {
    const u = db.prepare('SELECT display_name, bio FROM users WHERE id = ?').get(req.bot.user_id);
    res.json({
      id: req.bot.id,
      userId: req.bot.user_id,
      username: req.bot.username,
      displayName: u?.display_name || req.bot.username,
      description: req.bot.description || '',
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/bot/sendMessage', botAuthMiddleware, (req, res) => {
  try {
    const { chatId, text, attachmentPath, messageType, messageMeta } = req.body || {};
    if (!chatId) return res.status(400).json({ error: 'chatId required' });
    const msg = botApiSendMessage(req.bot, { chatId, text, attachmentPath, messageType, messageMeta }, emitToUser);
    if (!msg) return res.status(500).json({ error: 'Failed to send' });
    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.get('/api/bot/getUpdates', botAuthMiddleware, (req, res) => {
  try {
    const offset = Number(req.query.offset || 0);
    const updates = getBotUpdates(req.bot.id, offset, 50);
    res.json({ updates });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/bot/ackUpdates', botAuthMiddleware, (req, res) => {
  try {
    const maxId = Number(req.body?.maxUpdateId || 0);
    if (maxId > 0) consumeBotUpdates(req.bot.id, maxId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/bot/getMyCommands', botAuthMiddleware, (req, res) => {
  try {
    const commands = getBotCommandsForUserId(req.bot.user_id);
    res.json({ commands });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/bot/setMyCommands', botAuthMiddleware, (req, res) => {
  try {
    const { commands } = req.body || {};
    const saved = setBotCommandsForBot(req.bot.id, commands);
    res.json({ ok: true, commands: saved });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to set commands' });
  }
});

// --- Stickers ---
app.get('/api/stickers/installed', authMiddleware, (req, res) => {
  try {
    const packs = listInstalledPacks(req.userId).map(mapPackRow);
    res.json({ packs });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/stickers/packs/public', authMiddleware, (req, res) => {
  try {
    const packs = listPublicPacks().map(mapPackRow);
    res.json({ packs });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/stickers/packs/:packId', authMiddleware, (req, res) => {
  try {
    const viaStickerId = typeof req.query.viaStickerId === 'string' ? req.query.viaStickerId.trim() : null;
    const info = getPackPreviewInfo(req.userId, req.params.packId, viaStickerId);
    if (!info) return res.status(404).json({ error: 'Pack not found' });
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/stickers/packs/:packId/stickers', authMiddleware, (req, res) => {
  try {
    const { packId } = req.params;
    const mediaType = req.query.type === 'animated' ? 'animated' : (req.query.type === 'static' ? 'static' : null);
    const viaStickerId = typeof req.query.viaStickerId === 'string' ? req.query.viaStickerId.trim() : null;
    const pack = db.prepare('SELECT id, is_public, owner_id FROM sticker_packs WHERE id = ?').get(packId);
    if (!pack) return res.status(404).json({ error: 'Pack not found' });
    if (!canViewPackStickers(req.userId, pack, viaStickerId)) {
      return res.status(403).json({ error: 'Pack not accessible' });
    }
    const stickers = getStickersForPack(packId, mediaType).map(mapStickerRow);
    res.json({ stickers });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/stickers/packs/:packId/install', authMiddleware, (req, res) => {
  try {
    const ok = installPack(req.userId, req.params.packId);
    if (!ok) return res.status(400).json({ error: 'Cannot install pack' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Пакетный presence для списков (ограничение по числу id)
app.get('/api/users/presence-batch', authMiddleware, (req, res) => {
  try {
    const raw = req.query.ids;
    const list =
      typeof raw === 'string'
        ? raw.split(/[, ]+/).map((s) => s.trim()).filter(Boolean)
        : Array.isArray(raw)
          ? raw.map((s) => String(s).trim()).filter(Boolean)
          : [];
    const unique = [...new Set(list.map(String))].slice(0, 100);
    const out = {};
    for (const targetId of unique) {
      const row = db.prepare('SELECT last_seen_at, hide_last_seen, custom_status_emoji, custom_status_text, custom_status_mode FROM users WHERE id = ?').get(targetId);
      if (!row) continue;
      const online = userSockets.has(targetId);
      const hideLastSeen = !!row.hide_last_seen;
      out[targetId] = {
        online,
        lastSeenAt: hideLastSeen && !online ? null : (row.last_seen_at || null),
        hideLastSeen,
        ...mapCustomStatusFields(row),
        activities: getUserActivities(db, targetId),
      };
    }
    res.json(out);
  } catch (err) {
    console.error('Presence batch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Наличие пользователя (онлайн / был в сети)
app.get('/api/users/:id/presence', authMiddleware, (req, res) => {
  try {
    const targetId = req.params.id;
    const row = db.prepare('SELECT last_seen_at, hide_last_seen, custom_status_emoji, custom_status_text, custom_status_mode FROM users WHERE id = ?').get(targetId);
    if (!row) return res.status(404).json({ error: 'User not found' });
    const online = userSockets.has(targetId);
    const hideLastSeen = !!row.hide_last_seen;
    res.json({
      online,
      lastSeenAt: hideLastSeen && !online ? null : (row.last_seen_at || null),
      hideLastSeen,
      ...mapCustomStatusFields(row),
      activities: getUserActivities(db, targetId),
    });
  } catch (err) {
    console.error('Presence error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Общие группы и «знакомые через группы» с пользователем (как Mutual servers / friends в Discord)
app.get('/api/users/:id/mutual', authMiddleware, (req, res) => {
  try {
    const peerId = String(req.params.id || '');
    if (!peerId) return res.status(400).json({ error: 'Invalid user id' });
    const peer = db.prepare('SELECT id FROM users WHERE id = ?').get(peerId);
    if (!peer) return res.status(404).json({ error: 'User not found' });
    if (peerId === req.userId) {
      return res.json({ mutualGroups: [], mutualFriends: [] });
    }

    const myGroupRows = db.prepare('SELECT group_id FROM group_members WHERE user_id = ?').all(req.userId);
    const mySet = new Set(myGroupRows.map((r) => r.group_id));
    const peerGroupRows = db.prepare('SELECT group_id FROM group_members WHERE user_id = ?').all(peerId);
    const mutualGroupIds = peerGroupRows.map((r) => r.group_id).filter((gid) => mySet.has(gid));

    const mutualGroups = mutualGroupIds.map((gid) => {
      const g = db.prepare('SELECT id, name FROM groups WHERE id = ?').get(gid);
      return { id: gid, name: g?.name || gid };
    });

    const friendIdSet = new Set();
    for (const gid of mutualGroupIds) {
      const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(gid);
      for (const m of members) {
        const uid = m.user_id;
        if (uid !== req.userId && uid !== peerId) friendIdSet.add(uid);
      }
    }
    const friendIds = [...friendIdSet].slice(0, 80);
    const mutualFriends = friendIds
      .map((uid) => {
        const u = db.prepare('SELECT id, login, display_name FROM users WHERE id = ?').get(uid);
        if (!u) return null;
        return {
          id: u.id,
          login: u.login,
          displayName: u.display_name || u.login,
        };
      })
      .filter(Boolean);

    res.json({ mutualGroups, mutualFriends });
  } catch (err) {
    console.error('Mutual users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение профиля текущего пользователя
app.get('/api/users/me', authMiddleware, (req, res) => {
  try {
    ensureMainAdminPerksForUserId(req.userId);
    const user = db.prepare(`
      SELECT u.id, u.login, u.display_name, u.bio, u.avatar_path, u.cover_path, u.avatar_ring, u.hide_last_seen, u.is_verified, u.ban_until, u.e2e_public_key, u.twofa_enabled,
             u.selected_badge_id, u.social_links, u.created_at, u.birthday, u.custom_status_emoji, u.custom_status_text, u.custom_status_mode,
             a.name AS badge_name, a.icon AS badge_icon
      FROM users u
      LEFT JOIN achievements a ON a.id = u.selected_badge_id
      WHERE u.id = ?
    `).get(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      id: user.id,
      login: user.login,
      displayName: user.display_name,
      bio: user.bio || '',
      avatarPath: user.avatar_path,
      coverPath: user.cover_path || null,
      avatarRing: user.avatar_ring || 'none',
      hideLastSeen: !!user.hide_last_seen,
      isVerified: !!user.is_verified,
      banUntil: typeof user.ban_until === 'number' ? user.ban_until : null,
      e2ePublicKey: user.e2e_public_key || null,
      twofaEnabled: Number(user.twofa_enabled) === 1,
      badgeId: user.selected_badge_id || null,
      badgeName: user.badge_name || null,
      badgeIcon: user.badge_icon || null,
      allowUsernameChange: isAllowUsernameChangeForUser(user.login),
      isAdmin: isMainAdminLogin(user.login),
      socialLinks: parseSocialLinksJson(user.social_links),
      createdAt: typeof user.created_at === 'number' ? user.created_at : null,
      ...mapBirthdayField(user),
      ...mapCustomStatusFields(user),
    });
  } catch (err) {
    console.error('Get user profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Список всех доступных достижений/бейджей
app.get('/api/achievements', authMiddleware, (req, res) => {
  try {
    const rows = db.prepare('SELECT id, name, icon, description FROM achievements ORDER BY created_at ASC').all();
    res.json(rows.map((a) => ({
      id: a.id,
      name: a.name,
      icon: a.icon,
      description: a.description || '',
    })));
  } catch (err) {
    console.error('Get achievements error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Мои достижения + текущий выбранный бейдж
app.get('/api/users/me/achievements', authMiddleware, (req, res) => {
  try {
    ensureMainAdminPerksForUserId(req.userId);
    const rows = db.prepare(`
      SELECT a.id, a.name, a.icon, a.description, ua.earned_at
      FROM user_achievements ua
      JOIN achievements a ON a.id = ua.achievement_id
      WHERE ua.user_id = ?
      ORDER BY ua.earned_at DESC
    `).all(req.userId);
    const me = db.prepare('SELECT selected_badge_id FROM users WHERE id = ?').get(req.userId);
    res.json({
      selectedBadgeId: me?.selected_badge_id || null,
      achievements: rows.map((r) => ({
        id: r.id,
        name: r.name,
        icon: r.icon,
        description: r.description || '',
        earnedAt: r.earned_at || null,
      })),
    });
  } catch (err) {
    console.error('Get my achievements error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Ачивки другого пользователя (публично для авторизованных, без скрытых полей)
app.get('/api/users/:id/achievements', authMiddleware, (req, res) => {
  try {
    const userId = String(req.params.id || '');
    if (!userId) return res.status(400).json({ error: 'Invalid user id' });
    const rows = db.prepare(`
      SELECT a.id, a.name, a.icon, a.description, ua.earned_at
      FROM user_achievements ua
      JOIN achievements a ON a.id = ua.achievement_id
      WHERE ua.user_id = ?
      ORDER BY ua.earned_at DESC
    `).all(userId);
    const u = db.prepare('SELECT selected_badge_id FROM users WHERE id = ?').get(userId);
    res.json({
      selectedBadgeId: u?.selected_badge_id || null,
      achievements: rows.map((r) => ({
        id: r.id,
        name: r.name,
        icon: r.icon,
        description: r.description || '',
        earnedAt: r.earned_at || null,
      })),
    });
  } catch (err) {
    console.error('Get user achievements error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Выбрать 1 бейдж для профиля (можно снять)
app.put('/api/users/me/badge', authMiddleware, (req, res) => {
  try {
    const { badgeId } = req.body || {};
    const next = badgeId == null || badgeId === '' ? null : String(badgeId);
    if (next) {
      const has = db.prepare('SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_id = ?').get(req.userId, next);
      if (!has) return res.status(400).json({ error: 'You do not have this badge' });
    }
    db.prepare('UPDATE users SET selected_badge_id = ? WHERE id = ?').run(next, req.userId);
    emitToUser(req.userId, 'sync', { type: 'profile' });
    const a = next ? db.prepare('SELECT id, name, icon FROM achievements WHERE id = ?').get(next) : null;
    res.json({ badgeId: next, badgeName: a?.name || null, badgeIcon: a?.icon || null });
  } catch (err) {
    console.error('Set badge error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Админ: выдать достижение пользователю (для теста/модерации)
app.post('/api/admin/users/:id/achievements', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const targetId = req.params.id;
    const { achievementId } = req.body || {};
    const aid = achievementId && typeof achievementId === 'string' ? achievementId.trim() : '';
    if (!targetId || !aid) return res.status(400).json({ error: 'achievementId is required' });
    const exists = db.prepare('SELECT 1 FROM achievements WHERE id = ?').get(aid);
    if (!exists) return res.status(404).json({ error: 'Achievement not found' });
    db.prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)').run(targetId, aid);
    emitToUser(targetId, 'sync', { type: 'profile' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin grant achievement error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Обновление профиля
app.put('/api/users/me', authMiddleware, (req, res) => {
  try {
    console.log('[UPDATE PROFILE] Request body:', JSON.stringify(req.body));
    const { login, displayName, bio, hideLastSeen, socialLinks, birthday } = req.body || {};
    console.log('[UPDATE PROFILE] Extracted login from body:', login, 'type:', typeof login);
    const current = db.prepare('SELECT login, display_name, bio, hide_last_seen, social_links, birthday FROM users WHERE id = ?').get(req.userId);
    console.log('[UPDATE PROFILE] Current user login:', current?.login);
    if (!current) return res.status(404).json({ error: 'User not found' });
    let loginVal = current.login;
    let display_name = current.display_name;
    let bioVal = current.bio;
    let hide_last_seen_val = current.hide_last_seen != null ? current.hide_last_seen : 0;
    
    // Обновление логина
    if (login !== undefined && login !== null) {
      console.log('[UPDATE PROFILE] Login update requested:', { current: current.login, new: login });
      if (!login || typeof login !== 'string' || !login.trim()) {
        return res.status(400).json({ error: 'Username is required' });
      }
      const trimmedLogin = login.trim();
      // Проверка формата юзернейма (только буквы, цифры, подчеркивания)
      if (!/^[a-zA-Z0-9_]+$/.test(trimmedLogin)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
      }
      if (trimmedLogin.length > 30) {
        return res.status(400).json({ error: 'Username must be 30 characters or less' });
      }
      // Проверка уникальности логина (если изменился)
      if (trimmedLogin !== current.login) {
        if (!isAllowUsernameChangeForUser(current.login)) {
          return res.status(403).json({ error: 'Username change is disabled by the administrator' });
        }
        console.log('[UPDATE PROFILE] Login changed, checking uniqueness...');
        const existing = db.prepare('SELECT id FROM users WHERE login = ?').get(trimmedLogin);
        if (existing && existing.id !== req.userId) {
          console.log('[UPDATE PROFILE] Login already taken by user:', existing.id);
          return res.status(400).json({ error: 'This login is already taken' });
        }
        loginVal = trimmedLogin;
        console.log('[UPDATE PROFILE] Login will be updated to:', loginVal);
      } else {
        console.log('[UPDATE PROFILE] Login unchanged, keeping:', current.login);
      }
    } else {
      console.log('[UPDATE PROFILE] Login not provided, keeping current:', current.login);
    }
    
    if (displayName !== undefined) {
      if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
        return res.status(400).json({ error: 'Display name is required' });
      }
      display_name = displayName.trim();
    }
    if (bio !== undefined) bioVal = bio ? String(bio).trim() : null;
    if (typeof hideLastSeen === 'boolean') hide_last_seen_val = hideLastSeen ? 1 : 0;

    let socialLinksJson = current.social_links && String(current.social_links).trim()
      ? String(current.social_links)
      : '{}';
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'socialLinks')) {
      try {
        const sanitized = sanitizeSocialLinksPayload(socialLinks);
        socialLinksJson = JSON.stringify(sanitized);
      } catch (e) {
        if (e.message === 'INVALID_SHAPE') {
          return res.status(400).json({ error: 'socialLinks must be an object' });
        }
        throw e;
      }
    }

    let birthdayVal = current.birthday ?? null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'birthday')) {
      const parsed = parseBirthdayInput(birthday);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      birthdayVal = parsed.value;
    }

    console.log('[UPDATE PROFILE] About to update DB with login:', loginVal, 'for user:', req.userId);
    db.prepare('UPDATE users SET login = ?, display_name = ?, bio = ?, hide_last_seen = ?, social_links = ?, birthday = ? WHERE id = ?').run(
      loginVal,
      display_name,
      bioVal,
      hide_last_seen_val,
      socialLinksJson,
      birthdayVal,
      req.userId
    );
    dbSave();
    const updated = db.prepare('SELECT id, login, display_name, bio, avatar_path, cover_path, avatar_ring, hide_last_seen, is_verified, ban_until, e2e_public_key, social_links, created_at, birthday, custom_status_emoji, custom_status_text, custom_status_mode FROM users WHERE id = ?').get(req.userId);
    console.log('[UPDATE PROFILE] Updated user from DB:', { id: updated.id, login: updated.login, displayName: updated.display_name });
    console.log('[UPDATE PROFILE] Sending response with login:', updated.login);
    emitToUser(req.userId, 'sync', { type: 'profile' });
    const response = {
      id: updated.id,
      login: updated.login,
      displayName: updated.display_name,
      bio: updated.bio || '',
      avatarPath: updated.avatar_path,
      coverPath: updated.cover_path || null,
      avatarRing: updated.avatar_ring || 'none',
      hideLastSeen: !!updated.hide_last_seen,
      isVerified: !!updated.is_verified,
      banUntil: typeof updated.ban_until === 'number' ? updated.ban_until : null,
      e2ePublicKey: updated.e2e_public_key || null,
      allowUsernameChange: isAllowUsernameChangeForUser(updated.login),
      socialLinks: parseSocialLinksJson(updated.social_links),
      createdAt: typeof updated.created_at === 'number' ? updated.created_at : null,
      ...mapBirthdayField(updated),
      ...mapCustomStatusFields(updated),
    };
    console.log('[UPDATE PROFILE] Response object:', JSON.stringify(response));
    res.json(response);
  } catch (err) {
    console.error('Update profile error:', err);
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'This username is already taken' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Быстрая смена кастомного статуса (Discord / Telegram style)
app.put('/api/users/me/status', authMiddleware, (req, res) => {
  try {
    const { emoji, text, mode } = req.body || {};
    const current = db.prepare('SELECT custom_status_emoji, custom_status_text, custom_status_mode FROM users WHERE id = ?').get(req.userId) || {};
    const emojiVal = emoji !== undefined
      ? String(emoji || '').trim().slice(0, 8)
      : (current.custom_status_emoji || '');
    const textVal = text !== undefined
      ? String(text || '').trim().slice(0, 80)
      : (current.custom_status_text || '');
    const modeVal = ['online', 'idle', 'dnd'].includes(mode)
      ? mode
      : (['online', 'idle', 'dnd'].includes(current.custom_status_mode) ? current.custom_status_mode : 'online');
    db.prepare(`
      UPDATE users SET custom_status_emoji = ?, custom_status_text = ?, custom_status_mode = ? WHERE id = ?
    `).run(emojiVal || null, textVal || null, modeVal, req.userId);
    dbSave();
    const row = db.prepare(`
      SELECT id, login, display_name, bio, avatar_path, cover_path, avatar_ring, hide_last_seen, is_verified, custom_status_emoji, custom_status_text, custom_status_mode
      FROM users WHERE id = ?
    `).get(req.userId);
    emitStatusChanged(req.userId);
    emitToUser(req.userId, 'sync', { type: 'profile' });
    res.json({
      id: row.id,
      login: row.login,
      displayName: row.display_name,
      bio: row.bio || '',
      avatarPath: row.avatar_path,
      coverPath: row.cover_path || null,
      avatarRing: row.avatar_ring || 'none',
      hideLastSeen: !!row.hide_last_seen,
      isVerified: !!row.is_verified,
      ...mapCustomStatusFields(row),
    });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Rich presence: игра / музыка / YouTube (как Discord)
app.put('/api/users/me/activity', authMiddleware, (req, res) => {
  try {
    const { activities } = req.body || {};
    const saved = setUserActivities(db, req.userId, activities);
    dbSave();
    emitActivityChanged(req.userId);
    res.json({ activities: saved });
  } catch (err) {
    console.error('Update activity error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/me/activity', authMiddleware, (req, res) => {
  try {
    res.json({ activities: getUserActivities(db, req.userId) });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/activity-batch', authMiddleware, (req, res) => {
  try {
    const raw = req.query.ids;
    const list =
      typeof raw === 'string'
        ? raw.split(/[, ]+/).map((s) => s.trim()).filter(Boolean)
        : Array.isArray(raw)
          ? raw.map((s) => String(s).trim()).filter(Boolean)
          : [];
    const unique = [...new Set(list.map(String))].slice(0, 100);
    res.json(getActivitiesBatch(db, unique));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// OAuth-привязки (Discord / Steam / Spotify)
app.get('/api/connections/providers', authMiddleware, (req, res) => {
  res.json({ providers: listConfiguredProviders() });
});

app.get('/api/connections/me', authMiddleware, (req, res) => {
  try {
    res.json({ connections: getUserConnections(db, req.userId) });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/connections/:provider/start', (req, res) => {
  try {
    const provider = String(req.params.provider || '').toLowerCase();
    const token = req.query.token || '';
    const userId = parseJwtUserId(token, parseAuthToken);
    if (!userId) return res.status(401).send('Authentication required');
    const url = buildConnectionStartUrl(db, userId, provider);
    if (!url) return res.status(503).send('Provider not configured');
    res.redirect(url);
  } catch (err) {
    console.error('Connection start error:', err);
    res.status(500).send('Internal server error');
  }
});

app.get('/api/connections/:provider/callback', async (req, res) => {
  try {
    const provider = String(req.params.provider || '').toLowerCase();
    const redirectUrl = await handleConnectionCallback(db, provider, req);
    dbSave();
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('Connection callback error:', err);
    res.status(500).send('Internal server error');
  }
});

app.delete('/api/connections/:provider', authMiddleware, (req, res) => {
  try {
    const provider = String(req.params.provider || '').toLowerCase();
    const ok = deleteUserConnection(db, req.userId, provider);
    if (!ok) return res.status(404).json({ error: 'Not connected' });
    dbSave();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/:userId/connections', authMiddleware, (req, res) => {
  try {
    res.json({ connections: getUserConnections(db, req.params.userId) });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Установка публичного ключа для сквозного шифрования
app.put('/api/users/me/e2e-key', authMiddleware, (req, res) => {
  try {
    const { publicKey } = req.body || {};
    if (!publicKey || typeof publicKey !== 'string' || publicKey.length > 8000) {
      return res.status(400).json({ error: 'Invalid public key' });
    }
    db.prepare('UPDATE users SET e2e_public_key = ? WHERE id = ?').run(publicKey, req.userId);
    const row = db.prepare('SELECT e2e_public_key FROM users WHERE id = ?').get(req.userId);
    res.json({ e2ePublicKey: row?.e2e_public_key || null });
  } catch (err) {
    console.error('Set e2e key error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Загрузка аватара
app.post('/api/users/avatar', authMiddleware, upload.single('avatar'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const prev = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(req.userId);
    const avatarPath = '/uploads/' + req.file.filename;
    db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(avatarPath, req.userId);
    dbSave();

    // Удаляем старый файл аватара (только из /uploads, не трогаем чужие)
    try {
      const old = prev?.avatar_path;
      if (old && typeof old === 'string' && old.startsWith('/uploads/') && old !== avatarPath) {
        const oldFile = join(__dirname, old.replace(/^\//, ''));
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
      }
    } catch (e) {
      console.warn('Old avatar cleanup:', e.message);
    }

    emitToUser(req.userId, 'sync', { type: 'profile', avatarPath });
    try {
      io.emit('user:avatar', { userId: req.userId, avatarPath });
    } catch (_) { /* ignore */ }
    res.json({ avatarPath });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Обложка профиля — загрузка своего фото
app.post('/api/users/cover', authMiddleware, upload.single('cover'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const coverPath = '/uploads/' + req.file.filename;
    db.prepare('UPDATE users SET cover_path = ? WHERE id = ?').run(coverPath, req.userId);
    dbSave();
    emitToUser(req.userId, 'sync', { type: 'profile' });
    res.json({ coverPath });
  } catch (err) {
    console.error('Cover upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Обложка профиля — пресет или сброс
app.put('/api/users/me/cover', authMiddleware, (req, res) => {
  try {
    const { coverPath } = req.body || {};
    let val = null;
    if (coverPath != null && coverPath !== '') {
      if (typeof coverPath !== 'string') {
        return res.status(400).json({ error: 'Invalid cover path' });
      }
      const t = coverPath.trim();
      if (!t.startsWith('preset:') && !t.startsWith('/uploads/')) {
        return res.status(400).json({ error: 'Invalid cover path' });
      }
      val = t;
    }
    db.prepare('UPDATE users SET cover_path = ? WHERE id = ?').run(val, req.userId);
    dbSave();
    emitToUser(req.userId, 'sync', { type: 'profile' });
    res.json({ coverPath: val });
  } catch (err) {
    console.error('Set cover error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const AVATAR_RING_IDS = new Set(['none', 'nova', 'purple', 'orange', 'white', 'blue', 'pink', 'rainbow']);

app.put('/api/users/me/avatar-ring', authMiddleware, (req, res) => {
  try {
    const { avatarRing } = req.body || {};
    let val = 'none';
    if (avatarRing != null && avatarRing !== '') {
      if (typeof avatarRing !== 'string') {
        return res.status(400).json({ error: 'Invalid avatar ring' });
      }
      const t = avatarRing.trim();
      if (!AVATAR_RING_IDS.has(t)) {
        return res.status(400).json({ error: 'Invalid avatar ring' });
      }
      val = t;
    }
    db.prepare('UPDATE users SET avatar_ring = ? WHERE id = ?').run(val, req.userId);
    dbSave();
    emitToUser(req.userId, 'sync', { type: 'profile' });
    res.json({ avatarRing: val });
  } catch (err) {
    console.error('Set avatar ring error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CORS preflight для загрузки фона чата
app.options('/api/users/me/chat-background', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(204);
});

// Фон чата (своё фото) — только для отображения у себя
app.post('/api/users/me/chat-background', authMiddleware, upload.single('background'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const path = '/uploads/' + req.file.filename;
    res.json({ path });
  } catch (err) {
    console.error('Chat background upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Заблокировать пользователя
app.post('/api/users/me/block/:userId', authMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || userId === req.userId) return res.status(400).json({ error: 'Invalid user' });
    try {
      db.prepare('INSERT INTO blocks (user_id, blocked_user_id) VALUES (?, ?)').run(req.userId, userId);
    } catch (e) {
      if (!e.message || !e.message.includes('UNIQUE')) throw e;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Block user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Разблокировать
app.delete('/api/users/me/block/:userId', authMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'Invalid user' });
    db.prepare('DELETE FROM blocks WHERE user_id = ? AND blocked_user_id = ?').run(req.userId, userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Unblock error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Список заблокированных
app.get('/api/users/me/blocked', authMiddleware, (req, res) => {
  try {
    const rows = db.prepare('SELECT blocked_user_id FROM blocks WHERE user_id = ?').all(req.userId);
    res.json(rows.map((r) => r.blocked_user_id));
  } catch (err) {
    console.error('Get blocked error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CORS preflight для DELETE личного чата и блокировки
app.options('/api/messages/direct/:userId', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(204);
});
app.options('/api/users/me/block/:userId', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(204);
});

// Удалить личную переписку с пользователем (все сообщения между мной и userId)
app.delete('/api/messages/direct/:userId', authMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || userId === req.userId) return res.status(400).json({ error: 'Invalid user' });
    db.prepare(`
      DELETE FROM messages
      WHERE recipient_type = 'user' AND (
        (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      )
    `).run(req.userId, userId, userId, req.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete direct chat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CORS preflight для голосовых (чтобы браузер не получал 404 на OPTIONS)
app.options('/api/voice/upload', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(204);
});

// Загрузка вложений (фото, видео, файлы) для чата
app.options('/api/attachments/upload', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.sendStatus(204);
});
app.post('/api/attachments/upload', authMiddleware, (req, res, next) => {
  uploadAttachment.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Файл слишком большой (макс. 50 МБ)' : (err.message || 'Upload failed');
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'No file' });
    try {
      res.json({ path: '/uploads/' + req.file.filename });
    } catch (e) {
      res.status(500).json({ error: 'Upload failed' });
    }
  });
});

// Загрузка голосового сообщения (+ аудиограмма и транскрипт)
app.post('/api/voice/upload', authMiddleware, (req, res, next) => {
  uploadVoice.single('voice')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Voice upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file' });
    }
    try {
      const absPath = join(__dirname, 'uploads', req.file.filename);
      let peaks = [];
      try {
        const wf = req.body?.waveform ? JSON.parse(String(req.body.waveform)) : null;
        if (Array.isArray(wf?.peaks)) peaks = wf.peaks;
      } catch (_) { /* ignore */ }
      const durationSec = Number(req.body?.durationSec) || 0;
      const transcript = String(req.body?.transcript || '').trim();
      const lang = String(req.body?.lang || '').trim();
      const voiceMeta = await buildVoiceMeta({
        absPath,
        clientTranscript: transcript,
        waveform: { peaks },
        durationSec,
        clientLang: lang,
      });
      res.json({ path: '/uploads/' + req.file.filename, voiceMeta });
    } catch (e) {
      console.error('Voice process error:', e);
      res.json({ path: '/uploads/' + req.file.filename, voiceMeta: null });
    }
  });
});

// Перевод текста голосового сообщения
app.post('/api/voice/translate', authMiddleware, async (req, res) => {
  try {
    const { messageId, targetLang } = req.body || {};
    if (!messageId || !targetLang) {
      return res.status(400).json({ error: 'messageId and targetLang required' });
    }
    const row = db.prepare(`
      SELECT id, sender_id, recipient_type, recipient_id, voice_meta, attachment_path
      FROM messages WHERE id = ?
    `).get(messageId);
    if (!row || !row.attachment_path) {
      return res.status(404).json({ error: 'Voice message not found' });
    }
    if (!userCanAccessChat(req.userId, row.recipient_type, row.recipient_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const updated = await translateVoiceMeta(row.voice_meta, targetLang);
    db.prepare('UPDATE messages SET voice_meta = ? WHERE id = ?').run(JSON.stringify(updated), messageId);
    dbSave();
    const payload = {
      messageId,
      voiceMeta: updated,
      recipientType: row.recipient_type,
      recipientId: row.recipient_id,
    };
    emitToChatParticipants(row.recipient_type, row.recipient_id, 'voice_meta_updated', payload, row.sender_id);
    res.json({ voiceMeta: updated });
  } catch (err) {
    console.error('Voice translate error:', err);
    res.status(500).json({ error: 'Translation failed' });
  }
});

// Расшифровка голосового в текст (как в Telegram — «В текст»)
app.post('/api/voice/transcribe', authMiddleware, async (req, res) => {
  try {
    const { messageId } = req.body || {};
    if (!messageId) {
      return res.status(400).json({ error: 'messageId required' });
    }
    const row = db.prepare(`
      SELECT id, sender_id, recipient_type, recipient_id, voice_meta, attachment_path
      FROM messages WHERE id = ?
    `).get(messageId);
    if (!row || !row.attachment_path) {
      return res.status(404).json({ error: 'Voice message not found' });
    }
    if (!userCanAccessChat(req.userId, row.recipient_type, row.recipient_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const rel = String(row.attachment_path).replace(/^\/uploads\//, '');
    const absPath = join(__dirname, 'uploads', rel);
    const updated = await transcribeVoiceMeta(row.voice_meta, absPath);
    db.prepare('UPDATE messages SET voice_meta = ? WHERE id = ?').run(JSON.stringify(updated), messageId);
    dbSave();
    const payload = {
      messageId,
      voiceMeta: updated,
      recipientType: row.recipient_type,
      recipientId: row.recipient_id,
    };
    emitToChatParticipants(row.recipient_type, row.recipient_id, 'voice_meta_updated', payload, row.sender_id);
    if (!updated.transcript) {
      return res.status(503).json({
        error: 'no_transcript',
        message: 'Не удалось распознать. Добавьте GROQ_API_KEY или OPENAI_API_KEY в server/.env (бесплатно: console.groq.com)',
        voiceMeta: updated,
      });
    }
    res.json({ voiceMeta: updated });
  } catch (err) {
    console.error('Voice transcribe error:', err);
    res.status(500).json({ error: 'Transcription failed' });
  }
});

function emitSyncServersToUsers(userIds) {
  [...new Set(userIds)].filter(Boolean).forEach((uid) => {
    emitToUser(uid, 'sync', { type: 'servers' });
    emitToUser(uid, 'sync', { type: 'groups' });
  });
}

// Список серверов (Discord-style)
app.get('/api/servers', authMiddleware, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT s.id, s.name, s.icon_path, s.created_by, s.created_at, sm.role AS my_role
      FROM servers s
      INNER JOIN server_members sm ON sm.server_id = s.id AND sm.user_id = ?
      ORDER BY s.created_at ASC
    `).all(req.userId);
    res.json(rows.map((s) => ({
      id: s.id,
      name: s.name,
      iconPath: s.icon_path || null,
      createdBy: s.created_by,
      createdAt: s.created_at,
      myRole: s.my_role || 'member',
    })));
  } catch (err) {
    console.error('Get servers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/servers', authMiddleware, (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Server name is required' });
    }
    const serverId = uuid();
    db.prepare('INSERT INTO servers (id, name, created_by) VALUES (?, ?, ?)').run(serverId, name.trim(), req.userId);
    db.prepare('INSERT INTO server_members (server_id, user_id, role) VALUES (?, ?, ?)').run(serverId, req.userId, 'admin');
    dbSave();
    emitSyncServersToUsers([req.userId]);
    res.json({ id: serverId, name: name.trim() });
  } catch (err) {
    console.error('Create server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/servers/:serverId/channels', authMiddleware, (req, res) => {
  try {
    const { serverId } = req.params;
    const { name, description } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Channel name is required' });
    }
    const desc = description && typeof description === 'string' ? description.trim().slice(0, 500) : '';
    const m = db.prepare('SELECT role FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, req.userId);
    if (!m || m.role !== 'admin') {
      return res.status(403).json({ error: 'Only server admins can create channels' });
    }
    const memberRows = db.prepare('SELECT user_id FROM server_members WHERE server_id = ?').all(serverId);
    if (!memberRows.length) return res.status(400).json({ error: 'Server has no members' });

    const groupId = uuid();
    try {
      db.prepare('INSERT INTO groups (id, name, created_by, avatar_path, server_id, group_kind) VALUES (?, ?, ?, ?, ?, ?)').run(groupId, name.trim(), req.userId, null, serverId, GROUP_KIND_CHANNEL);
    } catch (e) {
      try {
        db.prepare('INSERT INTO groups (id, name, created_by, server_id, group_kind) VALUES (?, ?, ?, ?, ?)').run(groupId, name.trim(), req.userId, serverId, GROUP_KIND_CHANNEL);
      } catch (e2) {
        db.prepare('INSERT INTO groups (id, name, created_by) VALUES (?, ?, ?)').run(groupId, name.trim(), req.userId);
        try {
          db.prepare('UPDATE groups SET server_id = ?, group_kind = ? WHERE id = ?').run(serverId, GROUP_KIND_CHANNEL, groupId);
        } catch (e3) { /* ignore */ }
      }
    }

    let addMember;
    try {
      addMember = db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)');
    } catch (e) {
      addMember = db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)');
    }
    memberRows.forEach(({ user_id }) => {
      const role = user_id === req.userId ? 'admin' : 'member';
      try {
        addMember.run(groupId, user_id, role);
      } catch (e2) {
        try {
          db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, user_id);
        } catch (e3) { /* ignore duplicate */ }
      }
    });
    if (desc) {
      try {
        db.prepare('UPDATE groups SET description = ? WHERE id = ?').run(desc, groupId);
      } catch (e) { /* ignore */ }
    }
    dbSave();
    ensureChannelInviteCode(groupId);
    const notifyIds = memberRows.map((r) => r.user_id);
    notifyIds.forEach((uid) => emitToUser(uid, 'sync', { type: 'groups' }));
    emitSyncServersToUsers(notifyIds);
    res.json({ id: groupId, name: name.trim(), serverId, kind: GROUP_KIND_CHANNEL, description: desc });
  } catch (err) {
    console.error('Create channel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/servers/:serverId/members', authMiddleware, (req, res) => {
  try {
    const { serverId } = req.params;
    const { userIds } = req.body || {};
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array required' });
    }
    const m = db.prepare('SELECT role FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, req.userId);
    if (!m || m.role !== 'admin') {
      return res.status(403).json({ error: 'Only server admins can invite' });
    }
    const channelRows = db.prepare('SELECT id FROM groups WHERE server_id = ?').all(serverId);
    const toNotify = new Set();
    userIds.forEach((uid) => {
      if (!uid || typeof uid !== 'string') return;
      try {
        db.prepare('INSERT OR IGNORE INTO server_members (server_id, user_id, role) VALUES (?, ?, ?)').run(serverId, uid, 'member');
        toNotify.add(uid);
      } catch (e) { /* ignore */ }
      channelRows.forEach((ch) => {
        try {
          db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)').run(ch.id, uid, 'member');
        } catch (e2) {
          try {
            db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').run(ch.id, uid);
          } catch (e3) { /* ignore */ }
        }
      });
    });
    dbSave();
    [...toNotify].forEach((uid) => emitToUser(uid, 'sync', { type: 'groups' }));
    emitSyncServersToUsers([...toNotify]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Server invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/servers/:serverId', authMiddleware, (req, res) => {
  try {
    const { serverId } = req.params;
    const m = db.prepare('SELECT role FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, req.userId);
    if (!m) return res.status(403).json({ error: 'Not a server member' });
    const s = db.prepare('SELECT id, name, icon_path, created_by, created_at FROM servers WHERE id = ?').get(serverId);
    if (!s) return res.status(404).json({ error: 'Server not found' });
    const channelCount = db.prepare('SELECT COUNT(1) AS c FROM groups WHERE server_id = ?').get(serverId)?.c || 0;
    const memberCount = db.prepare('SELECT COUNT(1) AS c FROM server_members WHERE server_id = ?').get(serverId)?.c || 0;
    res.json({
      id: s.id,
      name: s.name,
      iconPath: s.icon_path || null,
      createdBy: s.created_by,
      createdAt: s.created_at,
      myRole: m.role || 'member',
      channelCount: Number(channelCount),
      memberCount: Number(memberCount),
    });
  } catch (err) {
    console.error('Get server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/servers/:serverId', authMiddleware, (req, res) => {
  try {
    const { serverId } = req.params;
    const { name } = req.body || {};
    const m = db.prepare('SELECT role FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, req.userId);
    if (!m || m.role !== 'admin') {
      return res.status(403).json({ error: 'Only server admins can edit server' });
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Server name is required' });
    }
    db.prepare('UPDATE servers SET name = ? WHERE id = ?').run(name.trim(), serverId);
    dbSave();
    const members = db.prepare('SELECT user_id FROM server_members WHERE server_id = ?').all(serverId);
    emitSyncServersToUsers(members.map((r) => r.user_id));
    res.json({ id: serverId, name: name.trim() });
  } catch (err) {
    console.error('Update server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/servers/:serverId/leave', authMiddleware, (req, res) => {
  try {
    const { serverId } = req.params;
    const m = db.prepare('SELECT role FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, req.userId);
    if (!m) return res.status(403).json({ error: 'Not a server member' });
    const adminCount = db.prepare("SELECT COUNT(1) AS c FROM server_members WHERE server_id = ? AND role = 'admin'").get(serverId)?.c || 0;
    if (m.role === 'admin' && adminCount <= 1) {
      return res.status(400).json({ error: 'Transfer admin role before leaving' });
    }
    const channelRows = db.prepare('SELECT id FROM groups WHERE server_id = ?').all(serverId);
    channelRows.forEach((ch) => {
      try {
        db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(ch.id, req.userId);
      } catch (e) { /* ignore */ }
    });
    db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(serverId, req.userId);
    dbSave();
    emitToUser(req.userId, 'sync', { type: 'groups' });
    emitToUser(req.userId, 'sync', { type: 'servers' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Leave server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/servers/:serverId', authMiddleware, (req, res) => {
  try {
    const { serverId } = req.params;
    const m = db.prepare('SELECT role FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, req.userId);
    if (!m || m.role !== 'admin') {
      return res.status(403).json({ error: 'Only server admins can delete server' });
    }
    const memberIds = db.prepare('SELECT user_id FROM server_members WHERE server_id = ?').all(serverId).map((r) => r.user_id);
    const channelRows = db.prepare('SELECT id FROM groups WHERE server_id = ?').all(serverId);
    channelRows.forEach((ch) => {
      try {
        db.prepare('DELETE FROM messages WHERE recipient_type = ? AND recipient_id = ?').run('group', ch.id);
        db.prepare('DELETE FROM group_members WHERE group_id = ?').run(ch.id);
        db.prepare('DELETE FROM groups WHERE id = ?').run(ch.id);
      } catch (e) { /* ignore */ }
    });
    db.prepare('DELETE FROM server_members WHERE server_id = ?').run(serverId);
    db.prepare('DELETE FROM servers WHERE id = ?').run(serverId);
    dbSave();
    memberIds.forEach((uid) => {
      emitToUser(uid, 'sync', { type: 'groups' });
      emitToUser(uid, 'sync', { type: 'servers' });
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение списка групп
app.get('/api/groups', authMiddleware, (req, res) => {
  try {
    let rows;
    try {
      rows = db.prepare(`
        SELECT g.id, g.name, g.avatar_path, g.background_path, g.created_by, g.created_at, g.server_id, g.group_kind,
          g.description, g.slow_mode_sec, g.reactions_enabled, g.invite_code, g.post_as_channel, g.allow_forward, g.allow_copy,
          gm.role AS my_role,
          (SELECT COUNT(1) FROM group_members gm2 WHERE gm2.group_id = g.id) AS member_count
        FROM groups g 
        INNER JOIN group_members gm ON gm.group_id = g.id 
        WHERE gm.user_id = ? 
        ORDER BY g.created_at DESC
      `).all(req.userId);
    } catch (e) {
      rows = db.prepare(`
        SELECT g.id, g.name, g.avatar_path, g.background_path, g.created_by, g.created_at, g.server_id, gm.role AS my_role,
          (SELECT COUNT(1) FROM group_members gm2 WHERE gm2.group_id = g.id) AS member_count
        FROM groups g 
        INNER JOIN group_members gm ON gm.group_id = g.id 
        WHERE gm.user_id = ? 
        ORDER BY g.created_at DESC
      `).all(req.userId);
    }
    
    res.json(rows.map(g => ({
      id: g.id,
      name: g.name,
      avatarPath: g.avatar_path || null,
      backgroundPath: g.background_path || null,
      createdBy: g.created_by,
      createdAt: g.created_at,
      myRole: g.my_role || 'member',
      serverId: g.server_id || null,
      kind: mapGroupKindField(g),
      memberCount: typeof g.member_count === 'number' ? g.member_count : Number(g.member_count) || 0,
      ...mapGroupChannelSettings(g),
    })));
  } catch (err) {
    console.error('Get groups error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Присоединиться к каналу по invite-коду
app.post('/api/channels/join', authMiddleware, (req, res) => {
  try {
    const code = req.body?.inviteCode && String(req.body.inviteCode).trim().toLowerCase();
    if (!code) return res.status(400).json({ error: 'Invite code is required' });

    let group;
    try {
      group = db.prepare(`
        SELECT id, name, avatar_path, server_id, group_kind, description, slow_mode_sec, reactions_enabled,
               invite_code, post_as_channel, allow_forward, allow_copy
        FROM groups WHERE invite_code = ?
      `).get(code);
    } catch {
      return res.status(404).json({ error: 'Channel not found' });
    }
    if (!group || !isChannelGroup(db, group.id)) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const existing = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(group.id, req.userId);
    if (!existing) {
      try {
        db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)').run(group.id, req.userId, 'member');
      } catch {
        db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(group.id, req.userId);
      }
      emitSyncGroupsToGroupMembers(group.id);
    }

    res.json({
      id: group.id,
      name: group.name,
      avatarPath: group.avatar_path || null,
      serverId: group.server_id || null,
      kind: mapGroupKindField(group),
      ...mapGroupChannelSettings(group),
    });
  } catch (err) {
    console.error('Channel join error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить / обновить invite-ссылку канала
app.post('/api/groups/:id/invite-link', authMiddleware, (req, res) => {
  try {
    const groupId = req.params.id;
    const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, req.userId);
    if (!member || member.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can manage invite link' });
    }
    if (!isChannelGroup(db, groupId)) {
      return res.status(400).json({ error: 'Not a channel' });
    }
    const regenerate = Boolean(req.body?.regenerate);
    let code;
    if (regenerate) {
      code = generateChannelInviteCode();
      for (let attempt = 0; attempt < 12; attempt++) {
        const exists = db.prepare('SELECT 1 FROM groups WHERE invite_code = ? AND id != ?').get(code, groupId);
        if (!exists) break;
        code = generateChannelInviteCode();
      }
      db.prepare('UPDATE groups SET invite_code = ? WHERE id = ?').run(code, groupId);
    } else {
      code = ensureChannelInviteCode(groupId);
    }
    emitSyncGroupsToGroupMembers(groupId);
    res.json({ inviteCode: code });
  } catch (err) {
    console.error('Invite link error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение информации о группе (ВАЖНО: должен быть ПЕРЕД /api/groups/:id/members)
app.get('/api/groups/:id', authMiddleware, (req, res) => {
  console.log('=== GROUP ROUTE HIT ===');
  console.log('req.params:', req.params);
  console.log('req.path:', req.path);
  console.log('req.url:', req.url);
  try {
    const groupId = req.params.id;
    console.log(`[GET /api/groups/${groupId}] Request received, userId: ${req.userId}`);
    
    // Проверяем, что пользователь является участником группы
    let member;
    try {
      member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, req.userId);
      console.log(`[GET /api/groups/${groupId}] Member check result:`, member);
    } catch (e) {
      console.warn(`[GET /api/groups/${groupId}] Role check failed, trying without role:`, e.message);
      // Если поле role не существует, проверяем только членство
      const memberCheck = db.prepare('SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, req.userId);
      if (!memberCheck) {
        console.log(`[GET /api/groups/${groupId}] User is not a member of the group`);
        return res.status(403).json({ error: 'Not a member of this group' });
      }
      member = { role: 'member' }; // По умолчанию member для старых записей
    }
    
    if (!member) {
      console.log(`[GET /api/groups/${groupId}] Member not found`);
      return res.status(403).json({ error: 'Not a member of this group' });
    }
    
    // Получаем группу
    let group;
    try {
      group = db.prepare('SELECT id, name, avatar_path, background_path, created_by, created_at, server_id, group_kind, description, slow_mode_sec, reactions_enabled, invite_code, post_as_channel, allow_forward, allow_copy FROM groups WHERE id = ?').get(groupId);
    } catch (e) {
      try {
        group = db.prepare('SELECT id, name, avatar_path, created_by, created_at, server_id FROM groups WHERE id = ?').get(groupId);
      } catch (e2) {
        group = db.prepare('SELECT id, name, created_by, created_at FROM groups WHERE id = ?').get(groupId);
        if (group) group.avatar_path = null;
      }
      if (group) group.background_path = null;
    }
    
    if (!group) {
      console.log(`[GET /api/groups/${groupId}] Group not found in database`);
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json({
      id: group.id,
      name: group.name,
      avatarPath: group.avatar_path || null,
      backgroundPath: group.background_path || null,
      createdBy: group.created_by,
      createdAt: group.created_at,
      serverId: group.server_id || null,
      kind: mapGroupKindField(group),
      userRole: member.role || 'member',
      ...mapGroupChannelSettings(group),
    });
  } catch (err) {
    console.error(`[GET /api/groups/${req.params.id}] Error:`, err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});

// Создание группы
app.post('/api/groups', authMiddleware, (req, res) => {
  try {
  const { name, memberIds, kind } = req.body || {};
    
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    if (!Array.isArray(memberIds)) {
      return res.status(400).json({ error: 'memberIds must be an array' });
    }

    const groupKind = kind === GROUP_KIND_CHANNEL ? GROUP_KIND_CHANNEL : GROUP_KIND_GROUP;
    
    const groupId = uuid();
    try {
      db.prepare('INSERT INTO groups (id, name, created_by, avatar_path, group_kind) VALUES (?, ?, ?, ?, ?)').run(groupId, name.trim(), req.userId, null, groupKind);
    } catch (e) {
      try {
        db.prepare('INSERT INTO groups (id, name, created_by, group_kind) VALUES (?, ?, ?, ?)').run(groupId, name.trim(), req.userId, groupKind);
      } catch (e2) {
        db.prepare('INSERT INTO groups (id, name, created_by, avatar_path) VALUES (?, ?, ?, ?)').run(groupId, name.trim(), req.userId, null);
      }
    }
    
    let addMember;
    try {
      addMember = db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)');
    } catch (e) {
      // Если role не существует, создаём без него
      addMember = db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)');
    }
    const uniqueMemberIds = [...new Set([...memberIds, req.userId])];
    
    uniqueMemberIds.forEach(uid => {
      try {
        // Создатель группы становится администратором
        const role = uid === req.userId ? 'admin' : 'member';
        // Пробуем добавить с role, если не получится - без него
        try {
          addMember.run(groupId, uid, role);
        } catch (e) {
          // Если не получилось с role, пробуем без него
          db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, uid);
        }
      } catch (e) {
        console.error(`Failed to add member ${uid}:`, e.message);
      }
    });
    
    uniqueMemberIds.forEach(uid => emitToUser(uid, 'sync', { type: 'groups' }));
    if (groupKind === GROUP_KIND_CHANNEL) ensureChannelInviteCode(groupId);
    res.json({ id: groupId, name: name.trim(), kind: groupKind });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Обновление группы
app.put('/api/groups/:id', authMiddleware, (req, res) => {
  try {
    const { name, backgroundPath, description, slowModeSec, reactionsEnabled, postAsChannel, allowForward, allowCopy } = req.body || {};
    
    const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!member || member.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can edit group' });
    }
    
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Group name is required' });
      }
      db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
    }
    
    if (backgroundPath !== undefined) {
      const val = backgroundPath === null || backgroundPath === '' ? null : String(backgroundPath);
      try {
        db.prepare('UPDATE groups SET background_path = ? WHERE id = ?').run(val, req.params.id);
      } catch (e) {
        // колонка может отсутствовать в старых БД
      }
    }

    if (description !== undefined) {
      const val = description == null ? '' : String(description).trim().slice(0, 500);
      try {
        db.prepare('UPDATE groups SET description = ? WHERE id = ?').run(val, req.params.id);
      } catch (e) { /* ignore */ }
    }

    if (slowModeSec !== undefined) {
      const sec = Math.max(0, Math.min(3600, Number(slowModeSec) || 0));
      try {
        db.prepare('UPDATE groups SET slow_mode_sec = ? WHERE id = ?').run(sec, req.params.id);
      } catch (e) { /* ignore */ }
    }

    if (reactionsEnabled !== undefined) {
      const val = reactionsEnabled ? 1 : 0;
      try {
        db.prepare('UPDATE groups SET reactions_enabled = ? WHERE id = ?').run(val, req.params.id);
      } catch (e) { /* ignore */ }
    }

    if (postAsChannel !== undefined) {
      const val = postAsChannel ? 1 : 0;
      try {
        db.prepare('UPDATE groups SET post_as_channel = ? WHERE id = ?').run(val, req.params.id);
      } catch (e) { /* ignore */ }
    }

    if (allowForward !== undefined) {
      const val = allowForward ? 1 : 0;
      try {
        db.prepare('UPDATE groups SET allow_forward = ? WHERE id = ?').run(val, req.params.id);
      } catch (e) { /* ignore */ }
    }

    if (allowCopy !== undefined) {
      const val = allowCopy ? 1 : 0;
      try {
        db.prepare('UPDATE groups SET allow_copy = ? WHERE id = ?').run(val, req.params.id);
      } catch (e) { /* ignore */ }
    }
    
    let group;
    try {
      group = db.prepare('SELECT id, name, avatar_path, background_path, created_by, created_at, server_id, group_kind, description, slow_mode_sec, reactions_enabled, invite_code, post_as_channel, allow_forward, allow_copy FROM groups WHERE id = ?').get(req.params.id);
    } catch (e) {
      group = db.prepare('SELECT id, name, avatar_path, created_by, created_at FROM groups WHERE id = ?').get(req.params.id);
      if (group) group.background_path = null;
    }
    emitSyncGroupsToGroupMembers(req.params.id);
    res.json({
      id: group.id,
      name: group.name,
      avatarPath: group.avatar_path || null,
      backgroundPath: (group && group.background_path) || null,
      createdBy: group.created_by,
      createdAt: group.created_at,
      serverId: group.server_id || null,
      kind: mapGroupKindField(group),
      ...mapGroupChannelSettings(group),
    });
  } catch (err) {
    console.error('Update group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Загрузка аватара группы
app.post('/api/groups/:id/avatar', authMiddleware, upload.single('avatar'), (req, res) => {
  try {
    // Проверяем, что пользователь является администратором группы
    const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!member || member.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can change group avatar' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const avatarPath = '/uploads/' + req.file.filename;
    db.prepare('UPDATE groups SET avatar_path = ? WHERE id = ?').run(avatarPath, req.params.id);
    emitSyncGroupsToGroupMembers(req.params.id);
    res.json({ avatarPath });
  } catch (err) {
    console.error('Group avatar upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Загрузка фона группы (как в Telegram)
app.post('/api/groups/:id/background', authMiddleware, upload.single('background'), (req, res) => {
  try {
    const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!member || member.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can change group background' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const backgroundPath = '/uploads/' + req.file.filename;
    try {
      db.prepare('UPDATE groups SET background_path = ? WHERE id = ?').run(backgroundPath, req.params.id);
    } catch (e) {
      return res.status(500).json({ error: 'Database update failed' });
    }
    dbSave();
    emitSyncGroupsToGroupMembers(req.params.id);
    res.json({ backgroundPath });
  } catch (err) {
    console.error('Group background upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Убрать фон группы
app.delete('/api/groups/:id/background', authMiddleware, (req, res) => {
  try {
    const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!member || member.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can change group background' });
    }
    try {
      db.prepare('UPDATE groups SET background_path = NULL WHERE id = ?').run(req.params.id);
    } catch (e) {
      return res.status(500).json({ error: 'Database update failed' });
    }
    dbSave();
    emitSyncGroupsToGroupMembers(req.params.id);
    res.json({ backgroundPath: null });
  } catch (err) {
    console.error('Group background clear error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Удаление группы (только администратор)
app.delete('/api/groups/:id', authMiddleware, (req, res) => {
  try {
    const groupId = req.params.id;
    const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, req.userId);
    if (!member || member.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete the group' });
    }
    const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId);
    db.prepare('DELETE FROM messages WHERE recipient_type = ? AND recipient_id = ?').run('group', groupId);
    db.prepare('DELETE FROM group_members WHERE group_id = ?').run(groupId);
    db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
    dbSave();
    members.forEach((m) => emitToUser(m.user_id, 'sync', { type: 'groups' }));
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение участников группы
app.get('/api/groups/:id/members', authMiddleware, (req, res) => {
  try {
    // Проверяем, что пользователь является участником группы
    let userMember;
    try {
      userMember = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.userId);
    } catch (e) {
      // Если поле role не существует, проверяем только членство
      const memberCheck = db.prepare('SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.userId);
      if (!memberCheck) {
        return res.status(403).json({ error: 'Not a member of this group' });
      }
      userMember = { role: 'member' };
    }
    
    if (!userMember) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }
    
    // Получаем участников, обрабатывая случай отсутствия поля role
    let rows;
    try {
      rows = db.prepare(`
        SELECT u.id, u.login, u.display_name, u.bio, u.avatar_path, u.cover_path, u.avatar_ring, u.social_links, gm.role 
        FROM group_members gm 
        JOIN users u ON u.id = gm.user_id 
        WHERE gm.group_id = ?
        ORDER BY 
          CASE WHEN gm.role = 'admin' THEN 1 ELSE 2 END,
          u.display_name
      `).all(req.params.id);
    } catch (e) {
      // Если поле role не существует, получаем без него
      rows = db.prepare(`
        SELECT u.id, u.login, u.display_name, u.bio, u.avatar_path, u.cover_path, u.avatar_ring, u.social_links, g.created_by
        FROM group_members gm 
        JOIN users u ON u.id = gm.user_id 
        JOIN groups g ON g.id = gm.group_id
        WHERE gm.group_id = ?
        ORDER BY u.display_name
      `).all(req.params.id);
      
      // Определяем роль: создатель группы = admin, остальные = member
      rows = rows.map(r => ({
        ...r,
        role: r.created_by === r.id ? 'admin' : 'member'
      }));
    }
    
    res.json(rows.map(u => ({
      id: u.id,
      login: u.login,
      displayName: u.display_name,
      bio: u.bio || '',
      avatarPath: u.avatar_path,
      coverPath: u.cover_path || null,
      avatarRing: u.avatar_ring || 'none',
      role: u.role || 'member',
      socialLinks: parseSocialLinksJson(u.social_links),
    })));
  } catch (err) {
    console.error('Get group members error:', err);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});

// Добавление участников в группу
app.post('/api/groups/:id/members', authMiddleware, (req, res) => {
  try {
    const { userIds } = req.body || {};
    
    // Проверяем, что пользователь является администратором группы
    const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!member || member.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can add members' });
    }
    
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds must be a non-empty array' });
    }
    
    const addMember = db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)');
    const added = [];
    
    userIds.forEach(uid => {
      try {
        addMember.run(req.params.id, uid, 'member');
        added.push(uid);
      } catch (err) {
        console.error(`Failed to add member ${uid}:`, err);
      }
    });
    if (added.length) emitSyncGroupsToGroupMembers(req.params.id);
    res.json({ added });
  } catch (err) {
    console.error('Add group members error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Удаление участника из группы
app.delete('/api/groups/:id/members/:userId', authMiddleware, (req, res) => {
  try {
    const { id: groupId, userId } = req.params;
    
    // Проверяем права доступа
    const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, req.userId);
    if (!member) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }
    
    // Администратор может удалять кого угодно, обычный участник может удалить только себя
    if (member.role !== 'admin' && userId !== req.userId) {
      return res.status(403).json({ error: 'You can only remove yourself from the group' });
    }
    
    // Нельзя удалить создателя группы
    const group = db.prepare('SELECT created_by FROM groups WHERE id = ?').get(groupId);
    if (group && group.created_by === userId) {
      return res.status(400).json({ error: 'Cannot remove group creator' });
    }
    
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
    emitSyncGroupsToGroupMembers(groupId);
    res.json({ success: true });
  } catch (err) {
    console.error('Remove group member error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Изменение роли участника
app.put('/api/groups/:id/members/:userId/role', authMiddleware, (req, res) => {
  try {
    const { id: groupId, userId } = req.params;
    const { role } = req.body || {};
    
    if (role !== 'admin' && role !== 'member') {
      return res.status(400).json({ error: 'Role must be "admin" or "member"' });
    }
    
    // Только администратор может изменять роли
    const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, req.userId);
    if (!member || member.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can change roles' });
    }
    
    // Нельзя изменить роль создателя группы
    const group = db.prepare('SELECT created_by FROM groups WHERE id = ?').get(groupId);
    if (group && group.created_by === userId && role !== 'admin') {
      return res.status(400).json({ error: 'Group creator must remain admin' });
    }
    
    db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run(role, groupId, userId);
    emitSyncGroupsToGroupMembers(groupId);
    res.json({ success: true, role });
  } catch (err) {
    console.error('Change member role error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение сообщений
app.get('/api/messages', authMiddleware, (req, res) => {
  try {
  const { type, id, limit, before, around } = req.query;

    if (!type || !id) {
      return res.status(400).json({ error: 'type and id are required' });
    }

    const recipientType = type === 'group' ? 'group' : 'user';
    const lim = Math.min(300, Math.max(1, Number(limit) || 120));
    const beforeTs = before != null && before !== '' ? Number(before) : null;
    const aroundTs = around != null && around !== '' ? Number(around) : null;
    let aroundId = null;

    // Jump-to-date: load a window around a unix timestamp
    if (Number.isFinite(aroundTs) && aroundTs > 0 && !Number.isFinite(beforeTs)) {
      const half = Math.max(20, Math.floor(lim / 2));
      const baseWhereUser = `m.recipient_type = 'user' AND (
          (m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)
        )`;
      const baseWhereGroup = `m.recipient_type = ? AND m.recipient_id = ?`;
      let beforeRows;
      let afterRows;
      if (recipientType === 'user') {
        beforeRows = db.prepare(`
          SELECT m.id, m.sender_id, m.recipient_type, m.recipient_id, m.content, m.created_at, m.attachment_path,
                 m.reply_to_id, m.edited_at, m.is_deleted, m.forward_from_id, m.forward_from_name,
                 m.message_type, m.call_duration_sec, m.voice_meta, m.message_meta,
                 m.is_silent, m.view_count, m.posted_as_channel
          FROM messages m
          WHERE ${baseWhereUser} AND m.created_at <= ?
          ORDER BY m.created_at DESC
          LIMIT ?
        `).all(req.userId, id, id, req.userId, aroundTs, half + 1);
        afterRows = db.prepare(`
          SELECT m.id, m.sender_id, m.recipient_type, m.recipient_id, m.content, m.created_at, m.attachment_path,
                 m.reply_to_id, m.edited_at, m.is_deleted, m.forward_from_id, m.forward_from_name,
                 m.message_type, m.call_duration_sec, m.voice_meta, m.message_meta,
                 m.is_silent, m.view_count, m.posted_as_channel
          FROM messages m
          WHERE ${baseWhereUser} AND m.created_at > ?
          ORDER BY m.created_at ASC
          LIMIT ?
        `).all(req.userId, id, id, req.userId, aroundTs, half);
      } else {
        beforeRows = db.prepare(`
          SELECT m.id, m.sender_id, m.recipient_type, m.recipient_id, m.content, m.created_at, m.attachment_path,
                 m.reply_to_id, m.edited_at, m.is_deleted, m.forward_from_id, m.forward_from_name,
                 m.message_type, m.call_duration_sec, m.voice_meta, m.message_meta,
                 m.is_silent, m.view_count, m.posted_as_channel
          FROM messages m
          WHERE ${baseWhereGroup} AND m.created_at <= ?
          ORDER BY m.created_at DESC
          LIMIT ?
        `).all(recipientType, id, aroundTs, half + 1);
        afterRows = db.prepare(`
          SELECT m.id, m.sender_id, m.recipient_type, m.recipient_id, m.content, m.created_at, m.attachment_path,
                 m.reply_to_id, m.edited_at, m.is_deleted, m.forward_from_id, m.forward_from_name,
                 m.message_type, m.call_duration_sec, m.voice_meta, m.message_meta,
                 m.is_silent, m.view_count, m.posted_as_channel
          FROM messages m
          WHERE ${baseWhereGroup} AND m.created_at > ?
          ORDER BY m.created_at ASC
          LIMIT ?
        `).all(recipientType, id, aroundTs, half);
      }
      const hasMoreAround = beforeRows.length > half;
      if (hasMoreAround) beforeRows = beforeRows.slice(0, half);
      aroundId = beforeRows[0]?.id || afterRows[0]?.id || null;
      let rows = [...beforeRows.reverse(), ...afterRows];
      // fall through to shared mapping below via assigning to outer rows
      const getReplyToAround = (replyToId) => {
        if (!replyToId) return null;
        const r = db.prepare('SELECT id, content, sender_id FROM messages WHERE id = ?').get(replyToId);
        if (!r) return null;
        const s = db.prepare('SELECT display_name FROM users WHERE id = ?').get(r.sender_id);
        return { id: r.id, content: r.content || '', senderName: s?.display_name || '' };
      };
      const messageIds = rows.map((row) => row.id);
      const reactionGroups = getReactionsGroupedByMessageIds(messageIds);
      const starredSet = getStarredSetForUserMessageIds(req.userId, messageIds);
      const messages = rows.map((m) => {
        const sender = db.prepare('SELECT display_name, avatar_path FROM users WHERE id = ?').get(m.sender_id);
        const replyTo = getReplyToAround(m.reply_to_id);
        const rg = reactionGroups[m.id] || {};
        let msg = {
          id: m.id,
          senderId: m.sender_id,
          senderName: sender?.display_name,
          senderAvatar: sender?.avatar_path,
          content: m.content,
          createdAt: m.created_at,
          attachmentPath: m.attachment_path || null,
          replyToId: m.reply_to_id || null,
          replyToContent: replyTo?.content ?? null,
          replyToSenderName: replyTo?.senderName ?? null,
          editedAt: m.edited_at || null,
          isDeleted: Number(m.is_deleted) === 1,
          forwardFromId: m.forward_from_id || null,
          forwardFromName: m.forward_from_name || null,
          messageType: m.message_type || null,
          messageMeta: parseMessageMeta(m.message_meta),
          callDurationSec: m.call_duration_sec != null ? m.call_duration_sec : null,
          voiceMeta: parseVoiceMeta(m.voice_meta),
          reactions: toClientReactions(rg, req.userId),
          starredMe: starredSet.has(m.id),
          ...mapMessageExtraFields(m),
        };
        if (recipientType === 'group') {
          msg = applyChannelPostDisplay(db, id, msg);
        }
        return msg;
      });
      const pinned = getPinnedListForChat(recipientType, id);
      let peerLastReadAt = null;
      if (recipientType === 'user') {
        try {
          const rr = db.prepare('SELECT last_read_created_at FROM dm_read_receipts WHERE reader_id = ? AND peer_id = ?').get(id, req.userId);
          peerLastReadAt = rr?.last_read_created_at != null ? Number(rr.last_read_created_at) : null;
        } catch {
          peerLastReadAt = null;
        }
      }
      return res.json({ messages, pinned, peerLastReadAt, hasMore: hasMoreAround, aroundId });
    }

    let rows;
    if (recipientType === 'user') {
      // Личный чат: сообщения в обе стороны (я → другой и другой → я)
      rows = db.prepare(`
        SELECT m.id, m.sender_id, m.recipient_type, m.recipient_id, m.content, m.created_at, m.attachment_path,
               m.reply_to_id, m.edited_at, m.is_deleted, m.forward_from_id, m.forward_from_name,
               m.message_type, m.call_duration_sec, m.voice_meta, m.message_meta,
               m.is_silent, m.view_count, m.posted_as_channel
        FROM messages m
        WHERE m.recipient_type = 'user' AND (
          (m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)
        )
          ${beforeTs ? 'AND m.created_at < ?' : ''}
        ORDER BY m.created_at DESC
        LIMIT ?
      `).all(
        ...(beforeTs
          ? [req.userId, id, id, req.userId, beforeTs, lim + 1]
          : [req.userId, id, id, req.userId, lim + 1]
        )
      );
    } else {
      rows = db.prepare(`
        SELECT m.id, m.sender_id, m.recipient_type, m.recipient_id, m.content, m.created_at, m.attachment_path,
               m.reply_to_id, m.edited_at, m.is_deleted, m.forward_from_id, m.forward_from_name,
               m.message_type, m.call_duration_sec, m.voice_meta, m.message_meta,
               m.is_silent, m.view_count, m.posted_as_channel
        FROM messages m
        WHERE m.recipient_type = ? AND m.recipient_id = ?
          ${beforeTs ? 'AND m.created_at < ?' : ''}
        ORDER BY m.created_at DESC
        LIMIT ?
      `).all(
        ...(beforeTs ? [recipientType, id, beforeTs, lim + 1] : [recipientType, id, lim + 1])
      );
    }

    const hasMore = rows.length > lim;
    if (hasMore) rows = rows.slice(0, lim);
    rows = rows.reverse(); // клиенту отдаем как раньше: ASC

    const getReplyTo = (replyToId) => {
      if (!replyToId) return null;
      const r = db.prepare('SELECT id, content, sender_id FROM messages WHERE id = ?').get(replyToId);
      if (!r) return null;
      const s = db.prepare('SELECT display_name FROM users WHERE id = ?').get(r.sender_id);
      return { id: r.id, content: r.content || '', senderName: s?.display_name || '' };
    };

    const messageIds = rows.map((row) => row.id);
    const reactionGroups = getReactionsGroupedByMessageIds(messageIds);
    const starredSet = getStarredSetForUserMessageIds(req.userId, messageIds);

    const messages = rows.map(m => {
      const sender = db.prepare('SELECT display_name, avatar_path FROM users WHERE id = ?').get(m.sender_id);
      const replyTo = getReplyTo(m.reply_to_id);
      const rg = reactionGroups[m.id] || {};
      let msg = {
        id: m.id,
        senderId: m.sender_id,
        senderName: sender?.display_name,
        senderAvatar: sender?.avatar_path,
        content: m.content,
        createdAt: m.created_at,
        attachmentPath: m.attachment_path || null,
        replyToId: m.reply_to_id || null,
        replyToContent: replyTo?.content ?? null,
        replyToSenderName: replyTo?.senderName ?? null,
        editedAt: m.edited_at || null,
        isDeleted: Number(m.is_deleted) === 1,
        forwardFromId: m.forward_from_id || null,
        forwardFromName: m.forward_from_name || null,
        messageType: m.message_type || null,
        messageMeta: parseMessageMeta(m.message_meta),
        callDurationSec: m.call_duration_sec != null ? m.call_duration_sec : null,
        voiceMeta: parseVoiceMeta(m.voice_meta),
        reactions: toClientReactions(rg, req.userId),
        starredMe: starredSet.has(m.id),
        ...mapMessageExtraFields(m),
      };
      if (recipientType === 'group') {
        msg = applyChannelPostDisplay(db, id, msg);
      }
      return msg;
    });

    const pinned = getPinnedListForChat(recipientType, id);

    let peerLastReadAt = null;
    if (recipientType === 'user') {
      try {
        const rr = db.prepare('SELECT last_read_created_at FROM dm_read_receipts WHERE reader_id = ? AND peer_id = ?').get(id, req.userId);
        peerLastReadAt = rr?.last_read_created_at != null ? Number(rr.last_read_created_at) : null;
      } catch (e) {
        peerLastReadAt = null;
      }
    }

    res.json({ messages, pinned, peerLastReadAt: recipientType === 'user' ? peerLastReadAt : null, hasMore });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Избранное: список сохранённых сообщений (последние N)
app.get('/api/users/me/starred', authMiddleware, (req, res) => {
  try {
    const lim = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
    const rows = db.prepare(`
      SELECT sm.created_at as starred_at,
             m.id, m.sender_id, m.recipient_type, m.recipient_id, m.content, m.created_at, m.attachment_path,
             m.reply_to_id, m.edited_at, m.is_deleted, m.forward_from_id, m.forward_from_name,
             m.message_type, m.call_duration_sec
      FROM starred_messages sm
      JOIN messages m ON m.id = sm.message_id
      WHERE sm.user_id = ?
      ORDER BY sm.created_at DESC
      LIMIT ?
    `).all(req.userId, lim);
    const out = rows.map((m) => {
      const sender = db.prepare('SELECT display_name, avatar_path FROM users WHERE id = ?').get(m.sender_id);
      return {
        id: m.id,
        recipientType: m.recipient_type,
        recipientId: m.recipient_id,
        senderId: m.sender_id,
        senderName: sender?.display_name || '',
        senderAvatar: sender?.avatar_path || null,
        content: Number(m.is_deleted) === 1 ? '' : (m.content || ''),
        createdAt: m.created_at,
        starredAt: m.starred_at,
        attachmentPath: m.attachment_path || null,
        editedAt: m.edited_at || null,
        isDeleted: Number(m.is_deleted) === 1,
        forwardFromId: m.forward_from_id || null,
        forwardFromName: m.forward_from_name || null,
        messageType: m.message_type || null,
        callDurationSec: m.call_duration_sec != null ? m.call_duration_sec : null,
      };
    });
    res.json({ results: out });
  } catch (err) {
    console.error('Get starred error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Архивировать/разархивировать чат
app.post('/api/chats/:type/:id/archive', authMiddleware, (req, res) => {
  try {
    const chatType = req.params.type === 'group' ? 'group' : 'user';
    const chatId = String(req.params.id || '');
    if (!chatId) return res.status(400).json({ error: 'Invalid chat id' });
    if (!userCanAccessChat(req.userId, chatType, chatId)) return res.status(403).json({ error: 'Forbidden' });
    if (chatType === 'group') {
      const member = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(chatId, req.userId);
      if (!member) return res.status(403).json({ error: 'Not a member of this group' });
    }
    db.prepare('INSERT OR REPLACE INTO archived_chats (user_id, chat_type, chat_id, archived_at) VALUES (?, ?, ?, strftime(\'%s\',\'now\'))')
      .run(req.userId, chatType, chatId);
    res.json({ archived: true });
  } catch (err) {
    console.error('Archive chat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/chats/:type/:id/archive', authMiddleware, (req, res) => {
  try {
    const chatType = req.params.type === 'group' ? 'group' : 'user';
    const chatId = String(req.params.id || '');
    if (!chatId) return res.status(400).json({ error: 'Invalid chat id' });
    db.prepare('DELETE FROM archived_chats WHERE user_id = ? AND chat_type = ? AND chat_id = ?').run(req.userId, chatType, chatId);
    res.json({ archived: false });
  } catch (err) {
    console.error('Unarchive chat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/chats/archived', authMiddleware, (req, res) => {
  try {
    const lim = Math.min(200, Math.max(1, Number(req.query.limit) || 200));
    const rows = db.prepare(`
      SELECT chat_type, chat_id, archived_at
      FROM archived_chats
      WHERE user_id = ?
      ORDER BY archived_at DESC
      LIMIT ?
    `).all(req.userId, lim);
    res.json({ results: rows.map((r) => ({ type: r.chat_type, id: r.chat_id, archivedAt: r.archived_at })) });
  } catch (err) {
    console.error('Get archived chats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Поиск по сообщениям внутри конкретного чата (Telegram-style: "найти в чате")
app.get('/api/messages/search', authMiddleware, (req, res) => {
  try {
    const { type, id, q, limit } = req.query;
    if (!type || !id) return res.status(400).json({ error: 'type and id are required' });
    const query = q != null ? String(q).trim() : '';
    if (!query) return res.json({ results: [] });
    const recipientType = type === 'group' ? 'group' : 'user';
    const recipientId = String(id);

    if (!userCanAccessChat(req.userId, recipientType, recipientId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const lim = Math.min(100, Math.max(1, Number(limit) || 30));
    const like = `%${query}%`;

    let rows = [];
    if (recipientType === 'user') {
      // Пытаемся через FTS (если доступно), иначе LIKE
      const ftsQuery = query.split(/\s+/).map((t) => t.replace(/["'`]/g, '')).filter(Boolean).join(' ');
      try {
        rows = db.prepare(`
          SELECT m.id, m.sender_id, m.recipient_type, m.recipient_id, m.content, m.created_at, m.attachment_path,
                 m.reply_to_id, m.edited_at, m.is_deleted, m.forward_from_id, m.forward_from_name,
                 m.message_type, m.call_duration_sec
          FROM messages m
          JOIN messages_fts f ON f.rowid = m.rowid
          WHERE m.recipient_type = 'user'
            AND (
              (m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)
            )
            AND COALESCE(m.is_deleted, 0) != 1
            AND f.content MATCH ?
          ORDER BY m.created_at DESC
          LIMIT ?
        `).all(req.userId, recipientId, recipientId, req.userId, ftsQuery, lim);
      } catch (e) {
        rows = db.prepare(`
          SELECT m.id, m.sender_id, m.recipient_type, m.recipient_id, m.content, m.created_at, m.attachment_path,
                 m.reply_to_id, m.edited_at, m.is_deleted, m.forward_from_id, m.forward_from_name,
                 m.message_type, m.call_duration_sec
          FROM messages m
          WHERE m.recipient_type = 'user'
            AND (
              (m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)
            )
            AND COALESCE(m.is_deleted, 0) != 1
            AND COALESCE(m.content, '') LIKE ?
          ORDER BY m.created_at DESC
          LIMIT ?
        `).all(req.userId, recipientId, recipientId, req.userId, like, lim);
      }
    } else {
      // В группе: только участникам
      const member = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(recipientId, req.userId);
      if (!member) return res.status(403).json({ error: 'Not a member of this group' });
      const ftsQuery = query.split(/\s+/).map((t) => t.replace(/["'`]/g, '')).filter(Boolean).join(' ');
      try {
        rows = db.prepare(`
          SELECT m.id, m.sender_id, m.recipient_type, m.recipient_id, m.content, m.created_at, m.attachment_path,
                 m.reply_to_id, m.edited_at, m.is_deleted, m.forward_from_id, m.forward_from_name,
                 m.message_type, m.call_duration_sec
          FROM messages m
          JOIN messages_fts f ON f.rowid = m.rowid
          WHERE m.recipient_type = 'group' AND m.recipient_id = ?
            AND COALESCE(m.is_deleted, 0) != 1
            AND f.content MATCH ?
          ORDER BY m.created_at DESC
          LIMIT ?
        `).all(recipientId, ftsQuery, lim);
      } catch (e) {
        rows = db.prepare(`
          SELECT m.id, m.sender_id, m.recipient_type, m.recipient_id, m.content, m.created_at, m.attachment_path,
                 m.reply_to_id, m.edited_at, m.is_deleted, m.forward_from_id, m.forward_from_name,
                 m.message_type, m.call_duration_sec
          FROM messages m
          WHERE m.recipient_type = 'group' AND m.recipient_id = ?
            AND COALESCE(m.is_deleted, 0) != 1
            AND COALESCE(m.content, '') LIKE ?
          ORDER BY m.created_at DESC
          LIMIT ?
        `).all(recipientId, like, lim);
      }
    }

    const results = rows.map((m) => {
      const sender = db.prepare('SELECT display_name, avatar_path FROM users WHERE id = ?').get(m.sender_id);
      return {
        id: m.id,
        senderId: m.sender_id,
        senderName: sender?.display_name || '',
        senderAvatar: sender?.avatar_path || null,
        content: m.content || '',
        createdAt: m.created_at,
        attachmentPath: m.attachment_path || null,
        editedAt: m.edited_at || null,
        forwardFromId: m.forward_from_id || null,
        forwardFromName: m.forward_from_name || null,
        messageType: m.message_type || null,
        callDurationSec: m.call_duration_sec != null ? m.call_duration_sec : null,
      };
    });

    res.json({ results });
  } catch (err) {
    console.error('Search messages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/settings', authMiddleware, adminMiddleware, (req, res) => {
  try {
    res.json({
      allowUsernameChangeAll: getAppSetting('allow_username_change_all', '1') === '1',
    });
  } catch (err) {
    console.error('Admin get settings:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/admin/settings', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { allowUsernameChangeAll } = req.body || {};
    if (typeof allowUsernameChangeAll !== 'boolean') {
      return res.status(400).json({ error: 'allowUsernameChangeAll (boolean) is required' });
    }
    setAppSetting('allow_username_change_all', allowUsernameChangeAll ? '1' : '0');
    res.json({ allowUsernameChangeAll });
  } catch (err) {
    console.error('Admin put settings:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Админ: временный бан пользователя
app.post('/api/admin/users/:id/ban', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const targetId = req.params.id;
    const { durationSec } = req.body || {};
    if (!targetId) return res.status(400).json({ error: 'User id is required' });
    if (targetId === req.userId) return res.status(400).json({ error: 'Cannot ban yourself' });
    const nowSec = Math.floor(Date.now() / 1000);
    const banUntil = typeof durationSec === 'number' && durationSec > 0 ? nowSec + Math.floor(durationSec) : null;
    db.prepare('UPDATE users SET ban_until = ? WHERE id = ?').run(banUntil, targetId);
    res.json({ ok: true, banUntil });
  } catch (err) {
    console.error('Admin ban error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Админ: выдать / снять галочку верификации
app.post('/api/admin/users/:id/verify', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const targetId = req.params.id;
    const { verified } = req.body || {};
    if (!targetId) return res.status(400).json({ error: 'User id is required' });
    const val = verified ? 1 : 0;
    db.prepare('UPDATE users SET is_verified = ? WHERE id = ?').run(val, targetId);
    res.json({ ok: true, isVerified: !!val });
  } catch (err) {
    console.error('Admin verify error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function emitPresenceChanged(userId, online) {
  let lastSeenAt = null;
  if (!online) {
    try {
      db.prepare('UPDATE users SET last_seen_at = strftime(\'%s\', \'now\') WHERE id = ?').run(userId);
      const row = db.prepare('SELECT last_seen_at FROM users WHERE id = ?').get(userId);
      lastSeenAt = row?.last_seen_at || Math.floor(Date.now() / 1000);
    } catch (e) { /* ignore */ }
  }
  io.emit('presence_changed', { userId, online: !!online, lastSeenAt });
}

// WebSocket соединения
io.on('connection', (socket) => {
  let currentUserId = null;
  
  socket.on('auth', (token) => {
    const parsed = parseAuthToken(token);
    if (!parsed?.userId) {
      socket.emit('auth_fail');
      return;
    }
    currentUserId = parsed.userId;
    if (!userSockets.has(currentUserId)) userSockets.set(currentUserId, new Set());
    userSockets.get(currentUserId).add(socket);
    try {
      db.prepare('UPDATE users SET last_seen_at = strftime(\'%s\', \'now\') WHERE id = ?').run(currentUserId);
    } catch (e) { /* ignore */ }
    socket.emit('auth_ok');
    emitPresenceChanged(currentUserId, true);
  });

  // Отправка сообщения (текст, голосовое, вложение, стикер, ответ, пересланное)
  socket.on('send_message', ({ recipientType, recipientId, content, voicePath, voiceMeta, replyToId, forwardFromId, forwardFromName, forwardContent, forwardAttachmentPath, attachmentPath: attachmentPathPayload, messageType: messageTypePayload, messageMeta: messageMetaPayload, stickerId, isSilent }) => {
    const isVoice = voicePath && typeof voicePath === 'string' && voicePath.trim().length > 0;
    const isForward = forwardContent !== undefined || (forwardAttachmentPath && forwardAttachmentPath.trim());
    const hasFileAttachment = attachmentPathPayload && typeof attachmentPathPayload === 'string' && attachmentPathPayload.trim().length > 0;
    const hasSticker = stickerId && typeof stickerId === 'string' && stickerId.trim().length > 0;
    const contentVal = isVoice ? '' : (content?.trim() ?? '');
    const wantsPoll = messageTypePayload === 'poll'
      || (messageMetaPayload && typeof messageMetaPayload === 'object' && Array.isArray(messageMetaPayload.options));
    if (!currentUserId) return;
    if (!isVoice && !isForward && !contentVal && !hasFileAttachment && !hasSticker && !wantsPoll) return;


    if (recipientType === 'user') {
      const blocked = db.prepare('SELECT 1 FROM blocks WHERE user_id = ? AND blocked_user_id = ?').get(recipientId, currentUserId);
      if (blocked) {
        socket.emit('send_message_error', { code: 'blocked', message: 'You are blocked by this user' });
        return;
      }
    } else if (recipientType === 'group') {
      if (!userCanAccessChat(currentUserId, recipientType, recipientId)) return;
      if (!canPostInGroup(db, currentUserId, recipientId)) {
        socket.emit('send_message_error', { code: 'channel_readonly', message: 'Only channel admins can post' });
        return;
      }
      const slow = checkSlowMode(db, currentUserId, recipientId);
      if (!slow.ok) {
        socket.emit('send_message_error', {
          code: 'slow_mode',
          message: `Подождите ${slow.waitSec} сек. перед следующим сообщением`,
          waitSec: slow.waitSec,
        });
        return;
      }
    }

    const replyToIdVal = replyToId && typeof replyToId === 'string' ? replyToId.trim() : null;
    const fwdId = forwardFromId && typeof forwardFromId === 'string' ? forwardFromId.trim() : null;
    const fwdName = forwardFromName && typeof forwardFromName === 'string' ? forwardFromName.trim() : null;
    const fwdContent = forwardContent != null ? String(forwardContent) : null;
    const fwdPath = forwardAttachmentPath && typeof forwardAttachmentPath === 'string' ? forwardAttachmentPath.trim() : null;
    let filePath = hasFileAttachment ? attachmentPathPayload.trim() : null;
    let messageType = messageTypePayload && typeof messageTypePayload === 'string' ? messageTypePayload.trim() : null;
    let messageMeta = messageMetaPayload && typeof messageMetaPayload === 'object' ? messageMetaPayload : parseMessageMeta(messageMetaPayload);
    // Imba FX whitelist
    if (messageMeta && typeof messageMeta === 'object') {
      const allowedFx = new Set(['fire', 'ice', 'party', 'shock', 'void', 'neon', 'glitch', 'rainbow', 'boom', 'love', 'matrix', 'ghost', 'gold', 'wave', 'meteor', 'laser', 'pixel', 'smoke', 'thunder', 'candy', 'cyber', 'nova', 'hologram', 'toxic', 'mirror', 'pulse', 'eclipse', 'drift', 'spark', 'blizzard', 'portal', 'shadow', 'chrome', 'venom', 'aurora', 'quake', 'starfall', 'bubble', 'ember', 'static']);
      if (messageMeta.fx != null && !allowedFx.has(String(messageMeta.fx))) {
        const { fx: _drop, ...rest } = messageMeta;
        messageMeta = Object.keys(rest).length ? rest : null;
      }
      if (messageMeta && messageMeta.critical != null) {
        messageMeta.critical = !!messageMeta.critical;
      }
    }

    if (hasSticker) {
      const sticker = getStickerById(stickerId.trim());
      if (!sticker) return;
      const access = db.prepare(`
        SELECT 1 FROM user_sticker_packs usp
        JOIN sticker_packs sp ON sp.id = usp.pack_id
        WHERE usp.user_id = ? AND usp.pack_id = ? AND (sp.is_public = 1 OR sp.owner_id = ?)
      `).get(currentUserId, sticker.pack_id, currentUserId);
      if (!access) {
        socket.emit('send_message_error', { code: 'sticker', message: 'Sticker pack not installed' });
        return;
      }
      filePath = sticker.file_path;
      messageType = 'sticker';
      messageMeta = {
        stickerId: sticker.id,
        packId: sticker.pack_id,
        emoji: sticker.emoji,
        mediaType: sticker.media_type,
      };
    }

    if (wantsPoll && !hasSticker && !isVoice && !isForward) {
      const opts = Array.isArray(messageMeta?.options)
        ? messageMeta.options.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 10)
        : [];
      if (opts.length < 2 || !contentVal) {
        socket.emit('send_message_error', { code: 'poll', message: 'Poll needs a question and at least 2 options' });
        return;
      }
      messageType = 'poll';
      const votes = {};
      opts.forEach((_, i) => { votes[String(i)] = []; });
      messageMeta = {
        options: opts,
        votes,
        multi: !!messageMeta?.multi,
        closed: false,
      };
    }

    try {
      const msgId = uuid();
      const sender = db.prepare('SELECT display_name, avatar_path FROM users WHERE id = ?').get(currentUserId);
      const attachmentPath = isVoice ? voicePath.trim() : (fwdPath || filePath || null);
      const voiceMetaJson = isVoice && voiceMeta
        ? JSON.stringify(typeof voiceMeta === 'string' ? (parseVoiceMeta(voiceMeta) || {}) : voiceMeta)
        : null;
      const messageMetaJson = messageMeta ? JSON.stringify(messageMeta) : null;
      const silentVal = isSilent ? 1 : 0;
      let postedAsChannelVal = 0;
      if (recipientType === 'group' && isChannelGroup(db, recipientId)) {
        const chRow = db.prepare('SELECT post_as_channel FROM groups WHERE id = ?').get(recipientId);
        if (chRow?.post_as_channel == null || Number(chRow.post_as_channel) !== 0) postedAsChannelVal = 1;
      }

      db.prepare(`
        INSERT INTO messages (id, sender_id, recipient_type, recipient_id, content, attachment_path, reply_to_id, forward_from_id, forward_from_name, voice_meta, message_type, message_meta, is_silent, posted_as_channel)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(msgId, currentUserId, recipientType, recipientId, isForward ? (contentVal || fwdContent || '') : contentVal, attachmentPath, replyToIdVal || null, fwdId || null, fwdName || null, voiceMetaJson, messageType, messageMetaJson, silentVal, postedAsChannelVal);

      const getReplyTo = (rid) => {
        if (!rid) return null;
        const r = db.prepare('SELECT id, content, sender_id FROM messages WHERE id = ?').get(rid);
        if (!r) return null;
        const s = db.prepare('SELECT display_name FROM users WHERE id = ?').get(r.sender_id);
        return { content: r.content || '', senderName: s?.display_name || '' };
      };
      const replyTo = getReplyTo(replyToIdVal);

      const msg = {
        id: msgId,
        senderId: currentUserId,
        senderName: sender?.display_name,
        senderAvatar: sender?.avatar_path,
        content: isForward ? (contentVal || fwdContent || '') : contentVal,
        createdAt: Math.floor(Date.now() / 1000),
        attachmentPath,
        replyToId: replyToIdVal,
        replyToContent: replyTo?.content ?? null,
        replyToSenderName: replyTo?.senderName ?? null,
        editedAt: null,
        isDeleted: false,
        forwardFromId: fwdId,
        forwardFromName: fwdName,
        messageType: messageType || null,
        messageMeta: messageMeta || null,
        voiceMeta: parseVoiceMeta(voiceMetaJson),
        reactions: {},
        isSilent: silentVal === 1,
        viewCount: 0,
        postedAsChannel: postedAsChannelVal === 1,
      };

      const payload = { ...msg, recipientType, recipientId };
      if (recipientType === 'group') {
        Object.assign(payload, applyChannelPostDisplay(db, recipientId, msg));
      }
      if (recipientType === 'user') {
        emitToUser(recipientId, 'new_message', payload);
        emitToUser(currentUserId, 'new_message', payload);
        if (isBotUserId(recipientId)) {
          handleBotIncomingMessage(recipientId, currentUserId, isForward ? (contentVal || fwdContent || '') : contentVal, attachmentPath, emitToUser);
        }
      } else {
        const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(recipientId);
        members.forEach(member => emitToUser(member.user_id, 'new_message', payload));
      }
    } catch (err) {
      console.error('Send message error:', err);
    }
  });

  socket.on('channel_post_views', ({ groupId, messageIds }) => {
    if (!currentUserId || !groupId || !Array.isArray(messageIds) || !messageIds.length) return;
    if (!isChannelGroup(db, groupId)) return;
    const member = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, currentUserId);
    if (!member) return;
    const uniqueIds = [...new Set(messageIds.map((id) => String(id)).filter(Boolean))].slice(0, 40);
    const updates = [];
    uniqueIds.forEach((messageId) => {
      try {
        const msg = db.prepare('SELECT id FROM messages WHERE id = ? AND recipient_type = ? AND recipient_id = ?').get(messageId, 'group', groupId);
        if (!msg) return;
        const seen = db.prepare('SELECT 1 FROM channel_post_views WHERE message_id = ? AND user_id = ?').get(messageId, currentUserId);
        if (seen) return;
        db.prepare('INSERT INTO channel_post_views (message_id, user_id) VALUES (?, ?)').run(messageId, currentUserId);
        db.prepare('UPDATE messages SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?').run(messageId);
        const row = db.prepare('SELECT view_count FROM messages WHERE id = ?').get(messageId);
        updates.push({ messageId, viewCount: Number(row?.view_count) || 0 });
      } catch (e) { /* ignore */ }
    });
    if (updates.length) {
      const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId);
      members.forEach(({ user_id }) => {
        emitToUser(user_id, 'channel_post_views', { groupId, updates });
      });
    }
  });

  // Редактирование сообщения (только своё)
  socket.on('edit_message', ({ messageId, content }) => {
    if (!currentUserId || !messageId || content == null) return;
    const c = String(content).trim();
    try {
      const row = db.prepare('SELECT id, sender_id, recipient_type, recipient_id, attachment_path, message_type FROM messages WHERE id = ?').get(messageId);
      if (!row || row.sender_id !== currentUserId) return;
      if (row.attachment_path) return; // голосовые не редактируем
      if (row.message_type === 'poll') return;
      const editedAt = Math.floor(Date.now() / 1000);
      db.prepare('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?').run(c, editedAt, messageId);
      const payload = { messageId, content: c, editedAt, recipientType: row.recipient_type, recipientId: row.recipient_id };
      if (row.recipient_type === 'user') {
        emitToUser(row.recipient_id, 'message_updated', payload);
        emitToUser(currentUserId, 'message_updated', payload);
    } else {
        const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(row.recipient_id);
        members.forEach(member => emitToUser(member.user_id, 'message_updated', payload));
      }
    } catch (err) {
      console.error('Edit message error:', err);
    }
  });

  socket.on('vote_poll', ({ messageId, optionIndex }) => {
    if (!currentUserId || !messageId) return;
    const idx = Number(optionIndex);
    if (!Number.isInteger(idx) || idx < 0) return;
    try {
      const row = db.prepare('SELECT id, sender_id, recipient_type, recipient_id, message_type, message_meta FROM messages WHERE id = ? AND is_deleted = 0').get(messageId);
      if (!row || row.message_type !== 'poll') return;
      if (!userCanAccessChat(currentUserId, row.recipient_type, row.recipient_id)) return;
      const meta = parseMessageMeta(row.message_meta) || {};
      const options = Array.isArray(meta.options) ? meta.options : [];
      if (idx >= options.length) return;
      if (meta.closed) return;
      const votes = meta.votes && typeof meta.votes === 'object' ? { ...meta.votes } : {};
      options.forEach((_, i) => {
        const k = String(i);
        if (!Array.isArray(votes[k])) votes[k] = [];
        else votes[k] = votes[k].map(String);
      });
      const key = String(idx);
      const uid = String(currentUserId);
      const already = votes[key].includes(uid);
      if (meta.multi) {
        votes[key] = already ? votes[key].filter((x) => x !== uid) : [...votes[key], uid];
      } else {
        Object.keys(votes).forEach((k) => {
          votes[k] = votes[k].filter((x) => x !== uid);
        });
        if (!already) votes[key].push(uid);
      }
      const nextMeta = { ...meta, options, votes, multi: !!meta.multi, closed: !!meta.closed };
      db.prepare('UPDATE messages SET message_meta = ? WHERE id = ?').run(JSON.stringify(nextMeta), messageId);
      dbSave();
      const payload = {
        messageId,
        messageMeta: nextMeta,
        recipientType: row.recipient_type,
        recipientId: String(row.recipient_id),
      };
      if (row.recipient_type === 'user') {
        emitToUser(row.recipient_id, 'message_updated', payload);
        emitToUser(currentUserId, 'message_updated', payload);
      } else {
        const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(row.recipient_id);
        members.forEach((member) => emitToUser(member.user_id, 'message_updated', payload));
      }
    } catch (err) {
      console.error('vote_poll error:', err.message);
    }
  });

  // Удаление сообщения (только своё, мягкое удаление)
  socket.on('delete_message', ({ messageId }) => {
    if (!currentUserId || !messageId) return;
    try {
      const row = db.prepare('SELECT id, sender_id, recipient_type, recipient_id FROM messages WHERE id = ?').get(messageId);
      if (!row || row.sender_id !== currentUserId) return;
      let hadPin = false;
      try {
        hadPin = !!db.prepare('SELECT 1 FROM pinned_messages WHERE message_id = ?').get(messageId);
        db.prepare('DELETE FROM message_reactions WHERE message_id = ?').run(messageId);
        db.prepare('DELETE FROM pinned_messages WHERE message_id = ?').run(messageId);
      } catch (e) { /* ignore */ }
      db.prepare('UPDATE messages SET is_deleted = 1, content = ? WHERE id = ?').run('', messageId);
      dbSave();
      setImmediate(() => dbSave());
      const check = db.prepare('SELECT is_deleted FROM messages WHERE id = ?').get(messageId);
      if (check && Number(check.is_deleted) !== 1) {
        console.error('[delete_message] UPDATE не применился для', messageId, check);
      }
      const payload = { messageId, recipientType: row.recipient_type, recipientId: String(row.recipient_id) };
      if (row.recipient_type === 'user') {
        emitToUser(row.recipient_id, 'message_deleted', payload);
        emitToUser(currentUserId, 'message_deleted', payload);
      } else {
        const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(row.recipient_id);
        members.forEach(member => emitToUser(member.user_id, 'message_deleted', payload));
      }
      if (hadPin) {
        try {
          const pinned = getPinnedListForChat(row.recipient_type, row.recipient_id);
          emitToChatParticipants(row.recipient_type, row.recipient_id, 'pins_updated', { recipientType: row.recipient_type, recipientId: String(row.recipient_id), pinned }, currentUserId);
        } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.error('Delete message error:', err);
    }
  });

  socket.on('mark_read', ({ peerId, lastReadCreatedAt }) => {
    if (!currentUserId || !peerId) return;
    const peer = String(peerId).trim();
    const t = typeof lastReadCreatedAt === 'number' && lastReadCreatedAt > 0 ? Math.floor(lastReadCreatedAt) : 0;
    if (!t || String(peer) === String(currentUserId)) return;
    if (!userCanAccessChat(currentUserId, 'user', peer)) return;
    try {
      const cur = db.prepare('SELECT last_read_created_at FROM dm_read_receipts WHERE reader_id = ? AND peer_id = ?').get(currentUserId, peer);
      const prev = cur?.last_read_created_at != null ? Number(cur.last_read_created_at) : 0;
      const next = Math.max(prev, t);
      db.prepare('INSERT OR REPLACE INTO dm_read_receipts (reader_id, peer_id, last_read_created_at) VALUES (?, ?, ?)').run(currentUserId, peer, next);
      dbSave();
      emitToUser(peer, 'peer_read_receipt', { readerId: currentUserId, lastReadCreatedAt: next });
    } catch (err) {
      console.error('mark_read error:', err);
    }
  });

  socket.on('toggle_reaction', ({ messageId, emoji, recipientType, recipientId }) => {
    if (!currentUserId || !messageId || emoji == null || !recipientType || recipientId == null) return;
    const rt = recipientType === 'group' ? 'group' : 'user';
    const rid = String(recipientId).trim();
    if (!rid || !userCanAccessChat(currentUserId, rt, rid)) return;
    if (rt === 'group' && !reactionsEnabledForGroup(db, rid)) return;
    const e = normalizeReactionEmoji(emoji);
    if (!e || [...e].length > 16) return;
    const row = db.prepare('SELECT id, sender_id, recipient_type, recipient_id FROM messages WHERE id = ?').get(String(messageId));
    if (!row || !messageBelongsToChat(row, rt, rid, currentUserId)) return;
    const existingRows = db.prepare('SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?').all(String(messageId), currentUserId);
    const existing = existingRows.find((r) => normalizeReactionEmoji(r.emoji) === e);
    if (existing) {
      db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(String(messageId), currentUserId, existing.emoji);
    } else {
      db.prepare('INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)').run(String(messageId), currentUserId, e);
    }
    dbSave();
    const grouped = getReactionsGroupedByMessageIds([String(messageId)])[String(messageId)] || {};
    const payload = { messageId: String(messageId), recipientType: rt, recipientId: rid, reactions: grouped };
    emitToChatParticipants(rt, rid, 'reaction_updated', payload, currentUserId);
    try { socket.emit('reaction_updated', payload); } catch (err) { /* ignore */ }
  });

  socket.on('typing', ({ recipientType, recipientId, active }) => {
    if (!currentUserId) return;
    const rt = recipientType === 'group' ? 'group' : 'user';
    const rid = recipientId != null ? String(recipientId).trim() : '';
    if (!rid || !userCanAccessChat(currentUserId, rt, rid)) return;
    const sender = db.prepare('SELECT display_name FROM users WHERE id = ?').get(currentUserId);
    const payload = { userId: currentUserId, displayName: sender?.display_name || '', recipientType: rt, recipientId: rid, active: !!active };
    if (rt === 'user') {
      emitToUser(rid, 'peer_typing', payload);
    } else {
      try {
        const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(rid);
        members.forEach((m) => {
          if (m.user_id !== currentUserId) emitToUser(m.user_id, 'peer_typing', payload);
        });
      } catch (e) { /* ignore */ }
    }
  });

  socket.on('pin_message', ({ messageId, recipientType, recipientId }) => {
    if (!currentUserId || !messageId || !recipientType || recipientId == null) return;
    const rt = recipientType === 'group' ? 'group' : 'user';
    const rid = String(recipientId).trim();
    if (!canPinInChat(currentUserId, rt, rid)) {
      socket.emit('pin_error', { message: 'Недостаточно прав для закрепления' });
      return;
    }
    if (!userCanAccessChat(currentUserId, rt, rid)) return;
    const row = db.prepare('SELECT id, sender_id, recipient_type, recipient_id FROM messages WHERE id = ?').get(messageId);
    if (!row || !messageBelongsToChat(row, rt, rid, currentUserId)) return;
    const n = db.prepare('SELECT COUNT(*) as c FROM pinned_messages WHERE recipient_type = ? AND recipient_id = ?').get(rt, rid);
    if (n && Number(n.c) >= MAX_PINS_PER_CHAT) {
      socket.emit('pin_error', { message: `Максимум ${MAX_PINS_PER_CHAT} закреплённых сообщений` });
      return;
    }
    try {
      db.prepare('INSERT INTO pinned_messages (message_id, recipient_type, recipient_id, pinned_by) VALUES (?, ?, ?, ?)').run(messageId, rt, rid, currentUserId);
      dbSave();
    } catch (err) {
      if (err && String(err.message || '').includes('UNIQUE')) return;
      console.error('pin_message', err);
      return;
    }
    const pinned = getPinnedListForChat(rt, rid);
    emitToChatParticipants(rt, rid, 'pins_updated', { recipientType: rt, recipientId: rid, pinned }, currentUserId);
  });

  socket.on('unpin_message', ({ messageId, recipientType, recipientId }) => {
    if (!currentUserId || !messageId || !recipientType || recipientId == null) return;
    const rt = recipientType === 'group' ? 'group' : 'user';
    const rid = String(recipientId).trim();
    if (!canPinInChat(currentUserId, rt, rid)) {
      socket.emit('pin_error', { message: 'Недостаточно прав' });
      return;
    }
    if (!userCanAccessChat(currentUserId, rt, rid)) return;
    const pin = db.prepare('SELECT message_id FROM pinned_messages WHERE message_id = ? AND recipient_type = ? AND recipient_id = ?').get(messageId, rt, rid);
    if (!pin) return;
    db.prepare('DELETE FROM pinned_messages WHERE message_id = ?').run(messageId);
    dbSave();
    const pinned = getPinnedListForChat(rt, rid);
    emitToChatParticipants(rt, rid, 'pins_updated', { recipientType: rt, recipientId: rid, pinned }, currentUserId);
  });

  socket.on('toggle_star', ({ messageId, recipientType, recipientId }) => {
    if (!currentUserId || !messageId || !recipientType || recipientId == null) return;
    const rt = recipientType === 'group' ? 'group' : 'user';
    const rid = String(recipientId).trim();
    if (!rid || !userCanAccessChat(currentUserId, rt, rid)) return;
    const row = db.prepare('SELECT id, sender_id, recipient_type, recipient_id FROM messages WHERE id = ?').get(messageId);
    if (!row || !messageBelongsToChat(row, rt, rid, currentUserId)) return;
    try {
      const existing = db.prepare('SELECT 1 FROM starred_messages WHERE user_id = ? AND message_id = ?').get(currentUserId, messageId);
      let starred = false;
      if (existing) {
        db.prepare('DELETE FROM starred_messages WHERE user_id = ? AND message_id = ?').run(currentUserId, messageId);
        starred = false;
      } else {
        db.prepare('INSERT INTO starred_messages (user_id, message_id) VALUES (?, ?)').run(currentUserId, messageId);
        starred = true;
      }
      dbSave();
      emitToUser(currentUserId, 'star_updated', { messageId, starred, recipientType: rt, recipientId: rid });
    } catch (e) {
      console.error('toggle_star error:', e.message);
    }
  });

  // WebRTC сигналинг для звонков (работают только после auth)
  socket.on('call:offer', ({ to, offer, isGroup, groupId }) => {
    if (!currentUserId) return;
    const hasOffer = offer && typeof offer === 'object' && offer.type && typeof offer.sdp === 'string';
    if (!hasOffer) return;
    let targets = [];
    if (isGroup && groupId) {
      if (isChannelGroup(db, groupId)) {
        socket.emit('call:error', { code: 'channel_no_calls', message: 'Calls are not available in channels' });
        return;
      }
      activeGroupCalls.set(groupId, currentUserId);
      const rows = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId);
      targets = rows.map(r => r.user_id).filter(uid => uid !== currentUserId);
      targets.forEach(uid => {
        emitToUser(uid, 'call:group_call_started', { groupId });
      });
    } else if (!isGroup && to) {
      targets = [to];
    }
    targets.forEach(uid => {
      emitToUser(uid, 'call:incoming', { from: currentUserId, offer, isGroup: !!isGroup, groupId: groupId || null });
    });
    // Другие вкладки/устройства звонящего: показать, что исходящий уже начат (не дублировать звонок)
    if (isGroup && groupId) {
      emitToUserExcept(currentUserId, socket, 'call:outgoing_started', { isGroup: true, groupId });
    } else if (!isGroup && to) {
      emitToUserExcept(currentUserId, socket, 'call:outgoing_started', { isGroup: false, peerId: to });
    }
  });

  socket.on('call:answer', ({ to, groupId, answer }) => {
    if (!currentUserId || !answer) return;
    if (groupId) {
      // Для групповых звонков отправляем answer всем участникам группы
      const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId);
      members.forEach((m) => {
        if (m.user_id !== currentUserId) {
          emitToUser(m.user_id, 'call:answer', { from: currentUserId, answer, groupId });
        }
      });
      // Остальные устройства отвечающего: убрать входящий звонок
      emitToUserExcept(currentUserId, socket, 'call:inbound_dismiss', { from: null, groupId });
    } else if (to) {
      // Для одиночных звонков отправляем конкретному пользователю
      emitToUser(to, 'call:answer', { from: currentUserId, answer });
      emitToUserExcept(currentUserId, socket, 'call:inbound_dismiss', { from: to, groupId: null });
      // Остальные устройства звонящего: снять баннер «исходящий на другом устройстве»
      emitToUserExcept(to, null, 'call:outgoing_ended', { peerId: currentUserId, groupId: null });
    }
  });

  /** Отклонение входящего (ЛС или группа) — уведомить звонящего и снять звонок на других своих устройствах */
  socket.on('call:reject_incoming', ({ to, groupId }) => {
    if (!currentUserId) return;
    if (groupId) {
      // Только свои другие устройства: отказ участника не рвёт групповой звонок для остальных
      emitToUserExcept(currentUserId, socket, 'call:inbound_dismiss', { from: null, groupId });
    } else if (to) {
      emitToUser(to, 'call:hangup', { from: currentUserId });
      emitToUserExcept(currentUserId, socket, 'call:inbound_dismiss', { from: to, groupId: null });
      emitToUserExcept(to, null, 'call:outgoing_ended', { peerId: currentUserId, groupId: null });
    }
  });

  socket.on('call:ice', ({ to, groupId, candidate }) => {
    if (!currentUserId || !candidate) return;
    if (groupId) {
      // Для групповых звонков отправляем ICE кандидаты всем участникам группы
      const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId);
      members.forEach((m) => {
        if (m.user_id !== currentUserId) {
          emitToUser(m.user_id, 'call:ice', { from: currentUserId, candidate, groupId });
        }
      });
    } else if (to) {
      // Для одиночных звонков отправляем конкретному пользователю
      emitToUser(to, 'call:ice', { from: currentUserId, candidate });
    }
  });

  socket.on('call:hangup', ({ to, groupId }) => {
    if (!currentUserId) return;
    if (groupId) {
      const isStarter = activeGroupCalls.get(groupId) === currentUserId;
      if (isStarter) {
        activeGroupCalls.delete(groupId);
        const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId);
        members.forEach(({ user_id }) => {
          emitToUser(user_id, 'call:group_call_ended', { groupId });
        });
      }
      const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId);
      members.forEach(({ user_id }) => {
        if (user_id !== currentUserId) emitToUser(user_id, 'call:hangup', { from: currentUserId });
      });
    }
    if (to) {
      emitToUser(to, 'call:hangup', { from: currentUserId });
      // Другие вкладки звонящего: сбросить «исходящий» при отмене до ответа
      emitToUserExcept(currentUserId, socket, 'call:outgoing_ended', { peerId: to, groupId: null });
    }
  });

  socket.on('call:end_for_all', ({ groupId }) => {
    if (!currentUserId || !groupId) return;
    // Проверяем, что пользователь является администратором группы
    const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, currentUserId);
    if (!member || member.role !== 'admin') return;
    // Завершаем звонок для всех участников
    activeGroupCalls.delete(groupId);
    const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId);
    members.forEach(({ user_id }) => {
      emitToUser(user_id, 'call:group_call_ended', { groupId });
      emitToUser(user_id, 'call:hangup', { from: currentUserId, endForAll: true });
    });
  });

  socket.on('call:renegotiate', ({ to, groupId, offer }) => {
    if (!currentUserId || !offer) return;
    if (groupId) {
      // Для групповых звонков отправляем всем участникам группы
      const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId);
      members.forEach((m) => {
        if (m.user_id !== currentUserId) {
          emitToUser(m.user_id, 'call:renegotiate', { from: currentUserId, offer, groupId });
        }
      });
    } else if (to) {
      // Для одиночных звонков отправляем конкретному пользователю
      emitToUser(to, 'call:renegotiate', { from: currentUserId, offer });
    }
  });

  socket.on('call:renegotiate-answer', ({ to, groupId, answer }) => {
    if (!currentUserId || !answer) return;
    if (groupId) {
      // Для групповых звонков отправляем ответ всем участникам группы
      const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId);
      members.forEach((m) => {
        if (m.user_id !== currentUserId) {
          emitToUser(m.user_id, 'call:renegotiate-answer', { from: currentUserId, answer, groupId });
        }
      });
    } else if (to) {
      // Для одиночных звонков отправляем конкретному пользователю
      emitToUser(to, 'call:renegotiate-answer', { from: currentUserId, answer });
    }
  });

  socket.on('call:mute_participant', ({ to, groupId }) => {
    if (!currentUserId || !to) return;
    if (!groupId) return;
    const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, currentUserId);
    if (!member || member.role !== 'admin') return;
    emitToUser(to, 'call:you_are_muted');
  });

  socket.on('call:unmute_participant', ({ to, groupId }) => {
    if (!currentUserId || !to) return;
    if (!groupId) return;
    const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, currentUserId);
    if (!member || member.role !== 'admin') return;
    emitToUser(to, 'call:you_are_unmuted');
  });

  socket.on('call:get_active_group_calls', () => {
    if (!currentUserId) return;
    const myGroups = db.prepare('SELECT group_id FROM group_members WHERE user_id = ?').all(currentUserId).map(r => r.group_id);
    const groupIds = myGroups.filter(gid => activeGroupCalls.has(gid));
    socket.emit('call:active_group_calls', { groupIds });
  });

  socket.on('call_ended', ({ recipientType, recipientId, durationSec }) => {
    if (!currentUserId) return;
    const type = recipientType === 'group' ? 'group' : 'user';
    const id = recipientId && typeof recipientId === 'string' ? recipientId.trim() : null;
    if (!id) return;
    const duration = typeof durationSec === 'number' && durationSec >= 0 ? Math.floor(durationSec) : 0;
    try {
      const msgId = uuid();
      const sender = db.prepare('SELECT display_name, avatar_path FROM users WHERE id = ?').get(currentUserId);
      db.prepare(`
        INSERT INTO messages (id, sender_id, recipient_type, recipient_id, content, message_type, call_duration_sec)
        VALUES (?, ?, ?, ?, '', 'call_ended', ?)
      `).run(msgId, currentUserId, type, id, duration);
      const msg = {
        id: msgId,
        senderId: currentUserId,
        senderName: sender?.display_name,
        senderAvatar: sender?.avatar_path,
        content: '',
        createdAt: Math.floor(Date.now() / 1000),
        attachmentPath: null,
        replyToId: null,
        replyToContent: null,
        replyToSenderName: null,
        editedAt: null,
        isDeleted: false,
        forwardFromId: null,
        forwardFromName: null,
        messageType: 'call_ended',
        callDurationSec: duration,
        reactions: {},
      };
      if (type === 'user') {
        // Чтобы оба участника чата добавили сообщение: у каждого в чате recipientId = "другой"
        emitToUser(currentUserId, 'new_message', { ...msg, recipientType: type, recipientId: id });
        emitToUser(id, 'new_message', { ...msg, recipientType: type, recipientId: currentUserId });
      } else {
        const payload = { ...msg, recipientType: type, recipientId: id };
        const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(id);
        members.forEach((m) => emitToUser(m.user_id, 'new_message', payload));
      }
    } catch (err) {
      console.error('call_ended error:', err);
    }
  });

  socket.on('disconnect', () => {
    if (currentUserId) {
      const set = userSockets.get(currentUserId);
      if (set) {
        set.delete(socket);
        if (set.size === 0) {
          userSockets.delete(currentUserId);
          setUserActivities(db, currentUserId, []);
          dbSave();
          emitActivityChanged(currentUserId);
          emitPresenceChanged(currentUserId, false);
        }
      }
    }
  });
});

// CORS preflight для DELETE (браузер может слать OPTIONS перед DELETE)
app.options('/api/groups/:id', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(204);
});

// Обработка 404 для API маршрутов (любой /api/... не совпавший с маршрутами выше)
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[404] ${req.method} ${req.originalUrl} - Route not found`);
    return res.status(404).json({ error: 'API route not found', path: req.path });
  }
  next();
});

// Раздача веб-клиента (React/Vite) прямо Node-сервером.
// Это упрощает хостинг на VPS без nginx: достаточно положить client/dist рядом с server/.
const webDistDir = join(__dirname, '..', 'client', 'dist');
const webIndexHtml = join(webDistDir, 'index.html');
if (fs.existsSync(webIndexHtml)) {
  // Локальная разработка: не открывайте UI на :3001 — там старая сборка dist.
  // Перенаправляем на Vite dev-сервер (:5173), API остаётся на :3001.
  if (process.env.NOVA_NO_VITE_REDIRECT !== '1') {
    app.get('/', (req, res, next) => {
      const host = req.hostname || '';
      if (host === 'localhost' || host === '127.0.0.1') {
        return res.redirect(302, 'http://localhost:5173/');
      }
      next();
    });
  }
  app.use(express.static(webDistDir));
  app.get('*', (req, res, next) => {
    // Не трогаем сокеты и загрузки.
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/socket.io') ||
      req.path.startsWith('/uploads')
    ) {
      return next();
    }
    return res.sendFile(webIndexHtml);
  });
}

// Глобальный обработчик ошибок — всегда JSON с телом
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('[SERVER] Unhandled error:', err && err.message, err && err.stack);
  try {
    res.status(500).json({ error: 'Server error: ' + (err && err.message ? err.message : 'Unknown') });
  } catch (e) {
    res.status(500).end('Server error');
  }
});

function persistAndBackup(reason = 'shutdown') {
  try {
    dbSave();
  } catch (e) {
    console.warn('[server] dbSave on', reason, e.message);
  }
  try {
    // динамический импорт, чтобы не ломать старт при отсутствии файла
    import('./create-backup.js')
      .then((m) => {
        const r = m.createFullBackup(reason);
        console.log(`[server] Backup (${reason}):`, r.dir);
      })
      .catch((e) => console.warn('[server] Backup skipped:', e.message));
  } catch (e) {
    console.warn('[server] Backup skipped:', e.message);
  }
}

process.on('SIGINT', () => {
  persistAndBackup('sigint');
  setTimeout(() => process.exit(0), 400);
});
process.on('SIGTERM', () => {
  persistAndBackup('sigterm');
  setTimeout(() => process.exit(0), 400);
});

// Периодическое сохранение БД (на случай аварийного закрытия окна)
setInterval(() => {
  try { dbSave(); } catch (_) { /* ignore */ }
}, 30_000).unref?.();

const PORT = Number(process.env.PORT) || 3001;
const portFilePath = join(__dirname, '.nova-port');

function writeServerPort(port) {
  try {
    fs.writeFileSync(portFilePath, String(port), 'utf8');
  } catch (e) {
    console.warn('[server] Could not write .nova-port:', e.message);
  }
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    // Слушаем на всех интерфейсах (0.0.0.0) для доступа с мобильных устройств
    const domain = process.env.DOMAIN || 'localhost';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    httpServer.listen(port, '0.0.0.0', () => {
      writeServerPort(port);
      console.log(`Server running on http://localhost:${port} (API)`);
      if (port !== 3001) {
        console.warn(
          `[server] WARNING: expected port 3001 but using ${port}. ` +
          'Vite dev proxy reads .nova-port — restart start-all.bat if login fails.'
        );
      }
      if (fs.existsSync(webIndexHtml)) {
        console.log('Web UI (dev): http://localhost:5173 — запустите start-all.bat или npm run dev в client/');
        if (process.env.NOVA_NO_VITE_REDIRECT !== '1') {
          console.log('  → http://localhost:' + port + '/ перенаправляет на :5173');
        }
      }
      console.log(`Server accessible from network at http://${domain}:${port}`);
      if (process.env.NODE_ENV === 'production') {
        console.log(`Production mode: API available at ${protocol}://${domain}`);
      }
      console.log('Registered routes:');
      console.log('  GET  /api/test');
      console.log('  GET  /api/version');
      console.log('  GET  /api/health');
      console.log('  POST /api/auth/login');
      console.log('  GET  /api/users');
      console.log('  GET  /api/users/me');
      console.log('  PUT  /api/users/me');
      console.log('  POST /api/users/avatar');
      console.log('  POST /api/voice/upload');
      console.log('  GET  /api/groups');
      console.log('  GET  /api/groups/:id');
      console.log('  POST /api/groups');
      console.log('  PUT  /api/groups/:id');
      console.log('  POST /api/groups/:id/avatar');
      console.log('  GET  /api/groups/:id/members');
      console.log('  POST /api/groups/:id/members');
      console.log('  DELETE /api/groups/:id/members/:userId');
      console.log('  PUT  /api/groups/:id/members/:userId/role');
      console.log('  GET  /api/connections/providers');
      console.log('  GET  /api/connections/me');
      console.log('  GET  /api/users/:userId/connections');
      resolve(port);
    }).on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`Port ${port} is already in use. Trying port ${port + 1}...`);
        reject(err);
      } else {
        console.error(`Failed to start server:`, err);
        reject(err);
      }
    });
  });
}

// Один экземпляр API — порт 3001 (или PORT из env). Не переключаемся на 3002 молча:
// иначе Vite проксирует на :3001 и логин падает с «disk I/O error» от второго процесса.
startServer(PORT).catch((err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(
      `\n[server] Port ${PORT} is already in use.\n` +
      'Close other Nova server windows (or old node index.js) and run start-all.bat again.\n'
    );
  } else {
    console.error('[server] Failed to start:', err && err.message ? err.message : err);
  }
  process.exit(1);
});
