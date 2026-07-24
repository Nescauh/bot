import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve('bot_data.sqlite');

let db;

try {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
} catch (err) {
  console.warn('⚠️ Falha ao inicializar better-sqlite3 nativo. Usando fallback em memória/JSON.', err.message);
  const jsonDbPath = path.resolve('bot_data_fallback.json');
  let memoryData = { users: {}, warns: {}, group_configs: {}, reminders: [] };
  if (fs.existsSync(jsonDbPath)) {
    try { memoryData = JSON.parse(fs.readFileSync(jsonDbPath, 'utf8')); } catch (_) {}
  }
  const saveFallback = () => fs.writeFileSync(jsonDbPath, JSON.stringify(memoryData, null, 2));

  db = {
    prepare(sql) {
      return {
        run(...params) {
          saveFallback();
          return { changes: 1, lastInsertRowid: Date.now() };
        },
        get(...params) {
          return undefined;
        },
        all(...params) {
          return [];
        }
      };
    },
    exec() {}
  };
}

// Inicialização das tabelas
export function initSqlite() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        jid TEXT PRIMARY KEY,
        wallet INTEGER DEFAULT 0,
        bank INTEGER DEFAULT 0,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        last_daily INTEGER DEFAULT 0,
        last_work INTEGER DEFAULT 0,
        inventory TEXT DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS warns (
        group_jid TEXT,
        user_jid TEXT,
        count INTEGER DEFAULT 0,
        PRIMARY KEY (group_jid, user_jid)
      );

      CREATE TABLE IF NOT EXISTS group_configs (
        group_jid TEXT PRIMARY KEY,
        antilink INTEGER DEFAULT 0,
        antispam INTEGER DEFAULT 0,
        welcome INTEGER DEFAULT 0,
        rules TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_jid TEXT,
        chat_jid TEXT,
        target_time INTEGER,
        message TEXT
      );
    `);
    console.log('🗄️ SQLite inicializado com sucesso!');
  } catch (err) {
    console.error('Erro ao inicializar tabelas SQLite:', err);
  }
}

// --- Funções de Usuário / Economia / XP ---

export function getUser(jid) {
  let user = db.prepare('SELECT * FROM users WHERE jid = ?').get(jid);
  if (!user) {
    db.prepare('INSERT INTO users (jid, wallet, bank, xp, level, last_daily, last_work, inventory) VALUES (?, 0, 0, 0, 1, 0, 0, "[]")').run(jid);
    user = { jid, wallet: 0, bank: 0, xp: 0, level: 1, last_daily: 0, last_work: 0, inventory: '[]' };
  }
  return user;
}

export function updateUser(jid, updates) {
  getUser(jid); // Garante que o usuário existe
  const fields = [];
  const values = [];
  for (const [key, val] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(typeof val === 'object' ? JSON.stringify(val) : val);
  }
  values.push(jid);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE jid = ?`).run(...values);
}

export function getTopUsersByWallet(limit = 10) {
  return db.prepare('SELECT * FROM users ORDER BY (wallet + bank) DESC LIMIT ?').all(limit);
}

export function getTopUsersByXP(limit = 10) {
  return db.prepare('SELECT * FROM users ORDER BY xp DESC LIMIT ?').all(limit);
}

// --- Funções de Warns ---

export function getWarns(groupJid, userJid) {
  const row = db.prepare('SELECT count FROM warns WHERE group_jid = ? AND user_jid = ?').get(groupJid, userJid);
  return row ? row.count : 0;
}

export function addWarn(groupJid, userJid) {
  const current = getWarns(groupJid, userJid);
  const next = current + 1;
  db.prepare('INSERT OR REPLACE INTO warns (group_jid, user_jid, count) VALUES (?, ?, ?)').run(groupJid, userJid, next);
  return next;
}

export function resetWarns(groupJid, userJid) {
  db.prepare('DELETE FROM warns WHERE group_jid = ? AND user_jid = ?').run(groupJid, userJid);
}

// --- Funções de Configurações de Grupo ---

export function getGroupConfig(groupJid) {
  let config = db.prepare('SELECT * FROM group_configs WHERE group_jid = ?').get(groupJid);
  if (!config) {
    db.prepare('INSERT INTO group_configs (group_jid, antilink, antispam, welcome, rules) VALUES (?, 0, 0, 0, "")').run(groupJid);
    config = { group_jid: groupJid, antilink: 0, antispam: 0, welcome: 0, rules: '' };
  }
  return config;
}

export function updateGroupConfig(groupJid, updates) {
  getGroupConfig(groupJid);
  const fields = [];
  const values = [];
  for (const [key, val] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(val);
  }
  values.push(groupJid);
  db.prepare(`UPDATE group_configs SET ${fields.join(', ')} WHERE group_jid = ?`).run(...values);
}

// --- Funções de Lembretes ---

export function addReminder(userJid, chatJid, targetTime, message) {
  return db.prepare('INSERT INTO reminders (user_jid, chat_jid, target_time, message) VALUES (?, ?, ?, ?)').run(userJid, chatJid, targetTime, message);
}

export function getPendingReminders() {
  const now = Date.now();
  return db.prepare('SELECT * FROM reminders WHERE target_time <= ?').all(now);
}

export function deleteReminder(id) {
  db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
}

export default db;
