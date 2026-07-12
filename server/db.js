import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'messenger.db');
const dbLockPath = join(__dirname, '.nova-db.lock');

let SQL = null;
let dbInstance = null;

function acquireDbLock() {
  if (fs.existsSync(dbLockPath)) {
    try {
      const pid = parseInt(fs.readFileSync(dbLockPath, 'utf8'), 10);
      process.kill(pid, 0);
      throw new Error(
        `Another Nova server is already using the database (PID ${pid}). ` +
        'Stop other server windows and run start-all.bat again.'
      );
    } catch (e) {
      if (e.code !== 'ESRCH') throw e;
      fs.unlinkSync(dbLockPath);
    }
  }
  fs.writeFileSync(dbLockPath, String(process.pid));
  const release = () => {
    try {
      if (fs.existsSync(dbLockPath) && fs.readFileSync(dbLockPath, 'utf8') === String(process.pid)) {
        fs.unlinkSync(dbLockPath);
      }
    } catch (_) { /* ignore */ }
  };
  process.on('exit', release);
  process.on('SIGINT', () => { release(); process.exit(0); });
  process.on('SIGTERM', () => { release(); process.exit(0); });
}

export function save() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const tmpPath = `${dbPath}.tmp`;
    fs.writeFileSync(tmpPath, Buffer.from(data));
    fs.renameSync(tmpPath, dbPath);
  } catch (e) {
    console.error('DB save error:', e.message);
  }
}

function prepare(sql) {
  return {
    run(...params) {
      const stmt = dbInstance.prepare(sql);
      const arr = params.length ? Array.from(params) : [];
      if (arr.length) stmt.bind(arr);
      stmt.step();
      stmt.free();
      save();
    },
    get(...params) {
      const stmt = dbInstance.prepare(sql);
      stmt.bind(params);
      const row = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();
      return row;
    },
    all(...params) {
      const stmt = dbInstance.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },
  };
}

export const db = {
  prepare(sql) {
    if (!dbInstance) throw new Error('DB not loaded');
    return prepare(sql);
  },
  exec(sql) {
    if (!dbInstance) throw new Error('DB not loaded');
    dbInstance.exec(sql);
    save();
  },
};

export async function initDb() {
  if (SQL === null) SQL = await initSqlJs();
  if (process.env.NOVA_SKIP_DB_LOCK !== '1') acquireDbLock();

  // Закрываем старую базу если она открыта
  if (dbInstance) {
    try {
      dbInstance.close();
      dbInstance = null;
    } catch (e) {
      console.warn('Error closing old database:', e.message);
    }
  }
  
  // Загружаем существующую базу или создаём новую
  let data = null;
  if (fs.existsSync(dbPath)) {
    data = new Uint8Array(fs.readFileSync(dbPath));
  }
  dbInstance = new SQL.Database(data);

  // Создаём таблицы если их нет
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      login TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL,
      bio TEXT,
      avatar_path TEXT,
      phone TEXT UNIQUE,
      phone_verified INTEGER DEFAULT 0,
      birthday TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS phone_verification_codes (
      phone TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar_path TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      recipient_type TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (sender_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_type, recipient_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_chat_time ON messages(recipient_type, recipient_id, created_at);
    CREATE TABLE IF NOT EXISTS blocks (
      user_id TEXT NOT NULL,
      blocked_user_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (user_id, blocked_user_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (blocked_user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_blocks_user ON blocks(user_id);
  `);

  // FTS для быстрого поиска по сообщениям (если доступно в текущей сборке SQLite)
  try {
    dbInstance.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content,
        message_id UNINDEXED,
        recipient_type UNINDEXED,
        recipient_id UNINDEXED,
        sender_id UNINDEXED,
        created_at UNINDEXED
      );

      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, content, message_id, recipient_type, recipient_id, sender_id, created_at)
        VALUES (new.rowid, new.content, new.id, new.recipient_type, new.recipient_id, new.sender_id, new.created_at);
      END;
      CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
        DELETE FROM messages_fts WHERE rowid = old.rowid;
      END;
      CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
        UPDATE messages_fts SET
          content = new.content,
          message_id = new.id,
          recipient_type = new.recipient_type,
          recipient_id = new.recipient_id,
          sender_id = new.sender_id,
          created_at = new.created_at
        WHERE rowid = old.rowid;
      END;
    `);
  } catch (e) {
    console.warn('FTS not available, search will use LIKE:', e.message);
  }

  // Бэкофис: если FTS есть, но пустой (например, добавили в проект позже) — заполним.
  try {
    const ftsOk = dbInstance.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'`);
    const hasFts = !!(ftsOk && ftsOk[0] && ftsOk[0].values && ftsOk[0].values.length);
    if (hasFts) {
      const c = db.prepare('SELECT COUNT(*) as c FROM messages_fts').get();
      const n = db.prepare('SELECT COUNT(*) as c FROM messages').get();
      const ftsCount = Number(c?.c || 0);
      const msgCount = Number(n?.c || 0);
      if (msgCount > 0 && ftsCount === 0) {
        console.log('Backfilling messages_fts…');
        dbInstance.exec(`
          INSERT INTO messages_fts(rowid, content, message_id, recipient_type, recipient_id, sender_id, created_at)
          SELECT rowid, content, id, recipient_type, recipient_id, sender_id, created_at FROM messages;
        `);
      }
    }
  } catch (e) {
    // ignore
  }
  
  // Миграция: добавляем поля phone и phone_verified в таблицу users если их нет
  try {
    dbInstance.exec(`
      ALTER TABLE users ADD COLUMN phone TEXT;
      ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0;
    `);
  } catch (err) {
    // Поля уже существуют или другая ошибка - игнорируем
  }
  
  // Обновляем схему существующих таблиц (миграции)
  try {
    // Проверяем наличие полей в users
    const usersInfo = dbInstance.exec("PRAGMA table_info(users)");
    const userCols = usersInfo[0]?.values?.map(row => row[1]) || [];
    if (!userCols.includes('bio')) {
      dbInstance.exec('ALTER TABLE users ADD COLUMN bio TEXT');
      console.log('Added bio column to users table');
    }
    if (!userCols.includes('last_seen_at')) {
      dbInstance.exec('ALTER TABLE users ADD COLUMN last_seen_at INTEGER');
      console.log('Added last_seen_at column to users table');
    }
    if (!userCols.includes('hide_last_seen')) {
      dbInstance.exec('ALTER TABLE users ADD COLUMN hide_last_seen INTEGER DEFAULT 0');
      console.log('Added hide_last_seen column to users table');
    }
    if (!userCols.includes('is_verified')) {
      dbInstance.exec('ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0');
      console.log('Added is_verified column to users table (migration)');
    }
    if (!userCols.includes('ban_until')) {
      dbInstance.exec('ALTER TABLE users ADD COLUMN ban_until INTEGER');
      console.log('Added ban_until column to users table (migration)');
    }
    if (!userCols.includes('e2e_public_key')) {
      dbInstance.exec('ALTER TABLE users ADD COLUMN e2e_public_key TEXT');
      console.log('Added e2e_public_key column to users table');
    }
    if (!userCols.includes('twofa_pin_salt')) {
      dbInstance.exec('ALTER TABLE users ADD COLUMN twofa_pin_salt TEXT');
      console.log('Added twofa_pin_salt column to users table');
    }
    if (!userCols.includes('twofa_pin_hash')) {
      dbInstance.exec('ALTER TABLE users ADD COLUMN twofa_pin_hash TEXT');
      console.log('Added twofa_pin_hash column to users table');
    }
    if (!userCols.includes('twofa_enabled')) {
      dbInstance.exec('ALTER TABLE users ADD COLUMN twofa_enabled INTEGER DEFAULT 0');
      console.log('Added twofa_enabled column to users table');
    }
    if (!userCols.includes('selected_badge_id')) {
      dbInstance.exec('ALTER TABLE users ADD COLUMN selected_badge_id TEXT');
      console.log('Added selected_badge_id column to users table');
    }
    if (!userCols.includes('cover_path')) {
      dbInstance.exec('ALTER TABLE users ADD COLUMN cover_path TEXT');
      console.log('Added cover_path column to users table');
    }
    if (!userCols.includes('avatar_ring')) {
      dbInstance.exec("ALTER TABLE users ADD COLUMN avatar_ring TEXT DEFAULT 'none'");
      console.log('Added avatar_ring column to users table');
    }
    
    // Проверяем наличие поля avatar_path в groups
    const groupsInfo = dbInstance.exec("PRAGMA table_info(groups)");
    const hasGroupAvatar = groupsInfo[0]?.values?.some(row => row[1] === 'avatar_path');
    if (!hasGroupAvatar) {
      dbInstance.exec('ALTER TABLE groups ADD COLUMN avatar_path TEXT');
      console.log('Added avatar_path column to groups table');
    }
    
    // Проверяем наличие поля attachment_path в messages
    const messagesInfo = dbInstance.exec("PRAGMA table_info(messages)");
    const msgCols = messagesInfo[0]?.values?.map(row => row[1]) || [];
    if (!msgCols.includes('attachment_path')) {
      dbInstance.exec('ALTER TABLE messages ADD COLUMN attachment_path TEXT');
      console.log('Added attachment_path column to messages table');
    }
    if (!msgCols.includes('reply_to_id')) {
      dbInstance.exec('ALTER TABLE messages ADD COLUMN reply_to_id TEXT');
      console.log('Added reply_to_id column to messages table');
    }
    if (!msgCols.includes('edited_at')) {
      dbInstance.exec('ALTER TABLE messages ADD COLUMN edited_at INTEGER');
      console.log('Added edited_at column to messages table');
    }
    try {
      dbInstance.exec('ALTER TABLE messages ADD COLUMN is_deleted INTEGER DEFAULT 0');
      console.log('Added is_deleted column to messages table');
    } catch (e) {
      if (!e.message || !e.message.includes('duplicate column')) console.warn('is_deleted migration:', e.message);
    }
    if (!msgCols.includes('forward_from_id')) {
      dbInstance.exec('ALTER TABLE messages ADD COLUMN forward_from_id TEXT');
      console.log('Added forward_from_id column to messages table');
    }
    if (!msgCols.includes('forward_from_name')) {
      dbInstance.exec('ALTER TABLE messages ADD COLUMN forward_from_name TEXT');
      console.log('Added forward_from_name column to messages table');
    }
    if (!msgCols.includes('message_type')) {
      dbInstance.exec('ALTER TABLE messages ADD COLUMN message_type TEXT');
      console.log('Added message_type column to messages table');
    }
    if (!msgCols.includes('call_duration_sec')) {
      dbInstance.exec('ALTER TABLE messages ADD COLUMN call_duration_sec INTEGER');
      console.log('Added call_duration_sec column to messages table');
    }
    if (!msgCols.includes('voice_meta')) {
      dbInstance.exec('ALTER TABLE messages ADD COLUMN voice_meta TEXT');
      console.log('Added voice_meta column to messages table');
    }

    // Проверяем наличие поля role в group_members
    const membersInfo = dbInstance.exec("PRAGMA table_info(group_members)");
    const hasRole = membersInfo[0]?.values?.some(row => row[1] === 'role');
    if (!hasRole) {
      dbInstance.exec('ALTER TABLE group_members ADD COLUMN role TEXT DEFAULT \'member\'');
      // Обновляем существующие записи: создатель группы = admin
      dbInstance.exec(`
        UPDATE group_members 
        SET role = 'admin' 
        WHERE EXISTS (
          SELECT 1 FROM groups g 
          WHERE g.id = group_members.group_id 
          AND g.created_by = group_members.user_id
        )
      `);
      console.log('Added role column to group_members table');
    }
  } catch (e) {
    console.warn('Schema migration warning:', e.message);
  }

  try {
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS message_reactions (
        message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        emoji TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        PRIMARY KEY (message_id, user_id, emoji)
      );
      CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);
      CREATE TABLE IF NOT EXISTS pinned_messages (
        message_id TEXT PRIMARY KEY,
        recipient_type TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        pinned_by TEXT NOT NULL,
        pinned_at INTEGER DEFAULT (strftime('%s','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_pins_recipient ON pinned_messages(recipient_type, recipient_id);
      CREATE TABLE IF NOT EXISTS dm_read_receipts (
        reader_id TEXT NOT NULL,
        peer_id TEXT NOT NULL,
        last_read_created_at INTEGER NOT NULL,
        PRIMARY KEY (reader_id, peer_id)
      );
      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon_path TEXT,
        created_by TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS server_members (
        server_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        joined_at INTEGER DEFAULT (strftime('%s','now')),
        PRIMARY KEY (server_id, user_id),
        FOREIGN KEY (server_id) REFERENCES servers(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id);
    `);
  } catch (e) {
    console.warn('message_reactions/pinned_messages:', e.message);
  }

  try {
    const gInfo = dbInstance.exec('PRAGMA table_info(groups)');
    const gCols = gInfo[0]?.values?.map((row) => row[1]) || [];
    if (!gCols.includes('server_id')) {
      dbInstance.exec('ALTER TABLE groups ADD COLUMN server_id TEXT');
      console.log('Added server_id to groups');
    }
    if (!gCols.includes('group_kind')) {
      dbInstance.exec("ALTER TABLE groups ADD COLUMN group_kind TEXT DEFAULT 'group'");
      console.log('Added group_kind to groups');
      try {
        dbInstance.exec("UPDATE groups SET group_kind = 'channel' WHERE server_id IS NOT NULL AND server_id != ''");
      } catch { /* ignore */ }
    }
  } catch (e) {
    console.warn('groups server_id migration:', e.message);
  }

  try {
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
    const hasAllow = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('allow_username_change_all');
    if (!hasAllow) {
      db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('allow_username_change_all', '1');
    }
  } catch (e) {
    console.warn('app_settings migration:', e.message);
  }

  // Избранное (Telegram-style Saved/Starred messages)
  try {
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS starred_messages (
        user_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        PRIMARY KEY (user_id, message_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (message_id) REFERENCES messages(id)
      );
      CREATE INDEX IF NOT EXISTS idx_starred_user ON starred_messages(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_starred_message ON starred_messages(message_id);
    `);
  } catch (e) {
    console.warn('starred_messages migration:', e.message);
  }

  // Архив чатов (Telegram-style)
  try {
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS archived_chats (
        user_id TEXT NOT NULL,
        chat_type TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        archived_at INTEGER DEFAULT (strftime('%s','now')),
        PRIMARY KEY (user_id, chat_type, chat_id)
      );
      CREATE INDEX IF NOT EXISTS idx_archived_user ON archived_chats(user_id, archived_at);
    `);
  } catch (e) {
    console.warn('archived_chats migration:', e.message);
  }

  // Достижения/бейджи (Discord-style) — выбрать можно только 1 активный
  try {
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS achievements (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        description TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now'))
      );
      CREATE TABLE IF NOT EXISTS user_achievements (
        user_id TEXT NOT NULL,
        achievement_id TEXT NOT NULL,
        earned_at INTEGER DEFAULT (strftime('%s','now')),
        PRIMARY KEY (user_id, achievement_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (achievement_id) REFERENCES achievements(id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id, earned_at);
    `);
  } catch (e) {
    console.warn('achievements migration:', e.message);
  }

  // Сид / обновление каталога бейджей
  try {
    ensureAchievementsCatalog();
  } catch (e) {
    console.warn('achievements catalog:', e.message);
  }

  // Backfill: всем пользователям выдаём базовый бейдж nova_user, если ещё не выдан
  try {
    const users = db.prepare('SELECT id FROM users').all();
    users.forEach((u) => {
      try {
        db.prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)').run(u.id, 'nova_user');
      } catch {}
    });
  } catch (e) {
    // ignore
  }

  // Сессии устройств (Telegram-style): refresh tokens + список активных сеансов
  try {
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        refresh_token TEXT NOT NULL UNIQUE,
        user_agent TEXT,
        ip TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        last_seen_at INTEGER,
        revoked_at INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_refresh ON user_sessions(refresh_token);
    `);
  } catch (e) {
    console.warn('user_sessions migration:', e.message);
  }

  try {
    dbInstance.exec('ALTER TABLE users ADD COLUMN social_links TEXT');
  } catch (e) {
    if (!e.message || !e.message.includes('duplicate column')) {
      console.warn('social_links migration:', e.message);
    }
  }

  try {
    const usersInfo2 = dbInstance.exec('PRAGMA table_info(users)');
    const cols2 = usersInfo2[0]?.values?.map((row) => row[1]) || [];
    if (!cols2.includes('custom_status_emoji')) {
      dbInstance.exec('ALTER TABLE users ADD COLUMN custom_status_emoji TEXT');
    }
    if (!cols2.includes('custom_status_text')) {
      dbInstance.exec('ALTER TABLE users ADD COLUMN custom_status_text TEXT');
    }
    if (!cols2.includes('custom_status_mode')) {
      dbInstance.exec("ALTER TABLE users ADD COLUMN custom_status_mode TEXT DEFAULT 'online'");
    }
  } catch (e) {
    console.warn('custom_status migration:', e.message);
  }

  try {
    const usersInfo3 = dbInstance.exec('PRAGMA table_info(users)');
    const cols3 = usersInfo3[0]?.values?.map((row) => row[1]) || [];
    if (!cols3.includes('birthday')) {
      dbInstance.exec('ALTER TABLE users ADD COLUMN birthday TEXT');
      console.log('[db] Added users.birthday column');
    }
  } catch (e) {
    console.warn('birthday migration:', e.message);
  }

  try {
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS user_activities (
        user_id TEXT PRIMARY KEY,
        activities_json TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER
      )
    `);
  } catch (e) {
    console.warn('user_activities migration:', e.message);
  }

  try {
    const gInfo = dbInstance.exec('PRAGMA table_info(groups)');
    const gCols = gInfo[0]?.values?.map((row) => row[1]) || [];
    if (!gCols.includes('description')) {
      dbInstance.exec('ALTER TABLE groups ADD COLUMN description TEXT');
      console.log('[db] Added groups.description column');
    }
    if (!gCols.includes('slow_mode_sec')) {
      dbInstance.exec('ALTER TABLE groups ADD COLUMN slow_mode_sec INTEGER DEFAULT 0');
      console.log('[db] Added groups.slow_mode_sec column');
    }
    if (!gCols.includes('reactions_enabled')) {
      dbInstance.exec('ALTER TABLE groups ADD COLUMN reactions_enabled INTEGER DEFAULT 1');
      console.log('[db] Added groups.reactions_enabled column');
    }
    if (!gCols.includes('invite_code')) {
      dbInstance.exec('ALTER TABLE groups ADD COLUMN invite_code TEXT');
      console.log('[db] Added groups.invite_code column');
    }
    if (!gCols.includes('post_as_channel')) {
      dbInstance.exec('ALTER TABLE groups ADD COLUMN post_as_channel INTEGER DEFAULT 1');
      console.log('[db] Added groups.post_as_channel column');
    }
    if (!gCols.includes('allow_forward')) {
      dbInstance.exec('ALTER TABLE groups ADD COLUMN allow_forward INTEGER DEFAULT 1');
      console.log('[db] Added groups.allow_forward column');
    }
    if (!gCols.includes('allow_copy')) {
      dbInstance.exec('ALTER TABLE groups ADD COLUMN allow_copy INTEGER DEFAULT 1');
      console.log('[db] Added groups.allow_copy column');
    }
  } catch (e) {
    console.warn('groups channel settings migration:', e.message);
  }

  try {
    const mInfo = dbInstance.exec('PRAGMA table_info(messages)');
    const mCols = mInfo[0]?.values?.map((row) => row[1]) || [];
    if (!mCols.includes('is_silent')) {
      dbInstance.exec('ALTER TABLE messages ADD COLUMN is_silent INTEGER DEFAULT 0');
      console.log('[db] Added messages.is_silent column');
    }
    if (!mCols.includes('view_count')) {
      dbInstance.exec('ALTER TABLE messages ADD COLUMN view_count INTEGER DEFAULT 0');
      console.log('[db] Added messages.view_count column');
    }
    if (!mCols.includes('posted_as_channel')) {
      dbInstance.exec('ALTER TABLE messages ADD COLUMN posted_as_channel INTEGER DEFAULT 0');
      console.log('[db] Added messages.posted_as_channel column');
    }
  } catch (e) {
    console.warn('messages channel migration:', e.message);
  }

  try {
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS channel_post_views (
        message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        PRIMARY KEY (message_id, user_id)
      );
    `);
  } catch (e) {
    console.warn('channel_post_views migration:', e.message);
  }

  save();
  console.log('Database initialized.');
}

/** Чтение серверной настройки (после initDb). */
export function getAppSetting(key, defaultVal = '') {
  try {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    if (row && row.value != null && row.value !== '') return String(row.value);
  } catch (e) {
    console.warn('getAppSetting:', e.message);
  }
  return defaultVal;
}

export function setAppSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, String(value));
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// Генерация случайного пароля
function generatePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Список юзернеймов и имён для сидирования (+55 дополнительных аккаунтов)
const ACCOUNTS_BASE = [
  { login: 'lololowkid', name: 'lololowkid' },
  { login: 'After_981', name: 'After_981' },
  { login: 'Bandl1k', name: 'Bandl1k' },
  { login: 'Shadow_2024', name: 'Shadow_2024' },
  { login: 'NeonX7', name: 'NeonX7' },
  { login: 'CyberWolf', name: 'CyberWolf' },
  { login: 'DarkPhoenix', name: 'DarkPhoenix' },
  { login: 'StormRider', name: 'StormRider' },
  { login: 'NightHawk', name: 'NightHawk' },
  { login: 'Quantum99', name: 'Quantum99' },
  { login: 'StarLight', name: 'StarLight' },
  { login: 'MysticX', name: 'MysticX' },
  { login: 'ThunderBolt', name: 'ThunderBolt' },
  { login: 'FireStorm', name: 'FireStorm' },
  { login: 'IceBreaker', name: 'IceBreaker' },
  { login: 'SkyWalker', name: 'SkyWalker' },
  { login: 'DragonSlayer', name: 'DragonSlayer' },
  { login: 'BladeRunner', name: 'BladeRunner' },
  { login: 'GhostRider', name: 'GhostRider' },
  { login: 'NovaStar', name: 'NovaStar' },
];

const ACCOUNTS_EXTRA = Array.from({ length: 55 }, (_, i) => {
  const n = String(i + 1).padStart(3, '0');
  const login = `nova_user_${n}`;
  return { login, name: `Nova User ${n}` };
});

const ACCOUNTS = [...ACCOUNTS_BASE, ...ACCOUNTS_EXTRA];

/** Главный администратор — единственный с полным доступом к админ-панели */
export const MAIN_ADMIN_LOGIN = 'lololowkid';

/** Каталог достижений / бейджей Nova */
export const ACHIEVEMENTS_CATALOG = [
  { id: 'nova_user', name: 'Nova User', icon: '✨', description: 'Базовый бейдж Nova' },
  { id: 'early_adopter', name: 'Early Adopter', icon: '🚀', description: 'С самых ранних версий' },
  { id: 'helper', name: 'Helper', icon: '🛠️', description: 'Помогает развивать Nova' },
  { id: 'verified', name: 'Verified', icon: '✔️', description: 'Верифицированный аккаунт' },
  { id: 'vip', name: 'VIP', icon: '💎', description: 'VIP-статус' },
  { id: 'champion', name: 'Champion', icon: '🏆', description: 'Чемпион Nova' },
  { id: 'legend', name: 'Legend', icon: '⭐', description: 'Легенда сообщества' },
  { id: 'sigma', name: 'Sigma', icon: '🐺', description: 'Высший уровень профиля' },
  { id: 'developer', name: 'Developer', icon: '💻', description: 'Разработчик Nova' },
  { id: 'moderator', name: 'Moderator', icon: '🛡️', description: 'Модератор' },
  { id: 'og', name: 'OG', icon: '🔥', description: 'Original — с самого начала' },
  { id: 'founder', name: 'Founder', icon: '👑', description: 'Основатель Nova' },
];

export function ensureAchievementsCatalog() {
  const ins = db.prepare('INSERT OR IGNORE INTO achievements (id, name, icon, description) VALUES (?, ?, ?, ?)');
  for (const a of ACHIEVEMENTS_CATALOG) {
    ins.run(a.id, a.name, a.icon, a.description);
  }
}

/** Все ачивки и «крутые» перки для главного админа */
export function grantMainAdminPerks(login = MAIN_ADMIN_LOGIN) {
  const user = db.prepare(`
    SELECT id, bio, birthday, custom_status_emoji, custom_status_text, avatar_ring, cover_path, avatar_path
    FROM users WHERE login = ?
  `).get(login);
  if (!user) return false;

  ensureAchievementsCatalog();

  const allAchievements = db.prepare('SELECT id FROM achievements').all();
  const grant = db.prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)');
  for (const a of allAchievements) {
    grant.run(user.id, a.id);
  }

  db.prepare(`
    UPDATE users SET
      is_verified = 1,
      selected_badge_id = 'founder',
      avatar_ring = 'rainbow',
      bio = CASE
        WHEN bio IS NULL OR TRIM(bio) = '' THEN 'Основатель Nova · главный администратор 👑'
        ELSE bio
      END,
      custom_status_emoji = CASE
        WHEN custom_status_emoji IS NULL OR TRIM(custom_status_emoji) = '' THEN '👑'
        ELSE custom_status_emoji
      END,
      custom_status_text = CASE
        WHEN custom_status_text IS NULL OR TRIM(custom_status_text) = '' THEN 'Nova Admin'
        ELSE custom_status_text
      END,
      custom_status_mode = CASE
        WHEN custom_status_mode IS NULL OR TRIM(custom_status_mode) = '' THEN 'online'
        ELSE custom_status_mode
      END,
      birthday = CASE
        WHEN birthday IS NULL OR TRIM(birthday) = '' THEN '2000-01-01'
        ELSE birthday
      END,
      display_name = CASE
        WHEN display_name IS NULL OR TRIM(display_name) = '' THEN ?
        ELSE display_name
      END
    WHERE id = ?
  `).run(login, user.id);

  console.log(`[admin] Perks granted for @${login} (${allAchievements.length} badges, verified, founder)`);
  return true;
}

export function isMainAdminLogin(login) {
  return String(login || '').trim() === MAIN_ADMIN_LOGIN;
}

/** При каждом входе / запросе профиля — гарантировать перки главного админа в живой БД сервера */
export function ensureMainAdminPerksForUserId(userId) {
  if (!userId) return false;
  const row = db.prepare('SELECT login FROM users WHERE id = ?').get(userId);
  if (!row || !isMainAdminLogin(row.login)) return false;
  grantMainAdminPerks(row.login);
  return true;
}

// Создание аккаунтов с случайными паролями
export async function seedUsers() {
  const { v4: uuid } = await import('uuid');
  
  // Не удаляем пользователей — только добавляем недостающие (группы и участники сохраняются)
  const insert = db.prepare('INSERT INTO users (id, login, password, display_name) VALUES (?, ?, ?, ?)');
  const credentials = [];
  
  console.log('Seeding accounts (only adding missing, keeping existing users and groups)...');
  
  for (const account of ACCOUNTS) {
    const existing = db.prepare('SELECT id, login, password FROM users WHERE login = ?').get(account.login);
    if (existing) {
      if (account.login === MAIN_ADMIN_LOGIN) {
        try {
          db.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(existing.id);
        } catch (e) {
          console.warn(`Failed to set is_verified for existing ${MAIN_ADMIN_LOGIN}:`, e.message);
        }
      }
      credentials.push({ login: account.login, password: '(existing)' });
      continue;
    }
    const password = generatePassword();
    const userId = uuid();
    try {
      insert.run(userId, account.login, password, account.name);
      if (account.login === MAIN_ADMIN_LOGIN) {
        try {
          db.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(userId);
        } catch (e) {
          console.warn(`Failed to set is_verified for new ${MAIN_ADMIN_LOGIN}:`, e.message);
        }
      }
      credentials.push({ login: account.login, password });
      console.log(`Created account: ${account.login}`);
    } catch (err) {
      console.error(`Failed to create account ${account.login}:`, err.message);
    }
  }
  
  const finalCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
  console.log(`Total users: ${finalCount?.c || 0}`);
  
  // Для файла — все 20 аккаунтов с паролями из БД (у существующих пароль уже есть в БД)
  const allForFile = [];
  for (const acc of ACCOUNTS) {
    const row = db.prepare('SELECT id, login, password, display_name FROM users WHERE login = ?').get(acc.login);
    if (row) {
      allForFile.push({ login: row.login, password: row.password || '(n/a)', name: row.display_name });
    }
  }
  
  console.log('\n=== Account Credentials ===');
  credentials.forEach(({ login, password }) => console.log(`${login}: ${password}`));
  console.log('===========================\n');
  
  try {
    const accountsFilePath = join(__dirname, '..', 'accounts.txt');
    let content = '=== Все аккаунты и пароли ===\n\n';
    allForFile.forEach((u, index) => {
      content += `${index + 1}. Юзернейм: ${u.login}\n   Пароль: ${u.password}\n   Имя: ${u.name}\n\n`;
    });
    content += `==============================\nВсего записей: ${allForFile.length} (базовые + nova_user_001…)\n`;
    content += `Дата обновления: ${new Date().toLocaleString('ru-RU')}\n`;
    fs.writeFileSync(accountsFilePath, content, 'utf-8');
    console.log('✅ Список аккаунтов сохранен в файл: accounts.txt');
  } catch (err) {
    console.warn('Не удалось сохранить файл accounts.txt:', err.message);
  }
  
  return credentials;
}

export async function seedUsersAndAdmin() {
  const creds = await seedUsers();
  grantMainAdminPerks();
  return creds;
}

// Поиск пользователя по логину
export function getUserByLogin(login) {
  return db.prepare('SELECT id, login, display_name, bio, avatar_path FROM users WHERE login = ?').get(login);
}

// Проверка логина и пароля (переписано с нуля, упрощенная версия)
export function verifyCredentials(login, password) {
  console.log('[AUTH] verifyCredentials called with login:', login);
  
  // Проверяем входные данные
  if (!login || typeof login !== 'string') {
    console.log('[AUTH] Missing or invalid login');
    return null;
  }
  
  if (!password || typeof password !== 'string') {
    console.log('[AUTH] Missing or invalid password');
    return null;
  }
  
  // Проверяем, что база данных инициализирована
  if (!db) {
    console.error('[AUTH] Database object is null');
    throw new Error('Database not initialized');
  }
  
  if (typeof db.prepare !== 'function') {
    console.error('[AUTH] db.prepare is not a function');
    throw new Error('Database prepare method not available');
  }
  
  const trimmedLogin = login.trim();
  console.log(`[AUTH] Looking up user: ${trimmedLogin}`);
  
  // Ищем пользователя по логину
  let user;
  try {
    const query = db.prepare('SELECT id, login, password, display_name, bio, avatar_path FROM users WHERE login = ?');
    user = query.get(trimmedLogin);
    console.log('[AUTH] Query executed, user found:', !!user);
  } catch (dbError) {
    console.error('[AUTH] Database query error:', dbError.message);
    console.error('[AUTH] Database error type:', dbError.constructor.name);
    if (dbError.stack) {
      console.error('[AUTH] Database error stack:', dbError.stack);
    }
    throw new Error('Database query failed: ' + dbError.message);
  }
  
  if (!user) {
    console.log(`[AUTH] User not found: ${trimmedLogin}`);
    return null;
  }
  
  console.log(`[AUTH] User found: ${user.login}, checking password...`);
  
  // Проверяем пароль
  if (user.password !== password) {
    console.log(`[AUTH] Password mismatch for user: ${trimmedLogin}`);
    return null;
  }
  
  // Возвращаем данные пользователя (без пароля)
  console.log(`[AUTH] Successfully authenticated user: ${trimmedLogin}`);
  const result = {
    id: user.id,
    login: user.login,
    displayName: user.display_name,
    bio: user.bio || '',
    avatarPath: user.avatar_path || null,
  };
  console.log('[AUTH] Returning user data:', JSON.stringify(result, null, 2));
  return result;
}
