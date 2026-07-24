import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve('bot_data.sqlite');
const FALLBACK_JSON_PATH = path.resolve('bot_data.json');

let dbInstance = null;
let memoryStore = null;

function getStore() {
  if (memoryStore) return memoryStore;

  if (fs.existsSync(FALLBACK_JSON_PATH)) {
    try {
      memoryStore = JSON.parse(fs.readFileSync(FALLBACK_JSON_PATH, 'utf-8'));
    } catch (_) {}
  }

  if (!memoryStore) {
    memoryStore = {
      users: {},
      warns: {},
      group_configs: {},
      reminders: []
    };
  }
  return memoryStore;
}

function saveStore() {
  if (!memoryStore) return;
  try {
    fs.writeFileSync(FALLBACK_JSON_PATH, JSON.stringify(memoryStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao salvar fallback do banco de dados:', err);
  }
}

function saveSqliteFile() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Erro ao salvar arquivo SQLite:', err);
  }
}

// Inicializa o SQLite via WebAssembly (sql.js - 100% puro JS sem dependência de C++/GLIBC)
export async function initSqlite() {
  try {
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
      const filebuffer = fs.readFileSync(DB_PATH);
      dbInstance = new SQL.Database(filebuffer);
    } else {
      dbInstance = new SQL.Database();
    }

    dbInstance.run(`
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

    saveSqliteFile();
    console.log('🗄️ Banco de dados SQLite WebAssembly (sql.js) ativado com sucesso!');
  } catch (err) {
    console.warn('⚠️ Falha ao carregar WebAssembly do SQLite. Utilizando armazenamento JSON local.', err.message);
    dbInstance = null;
  }
}

// --- Funções de Usuário / Economia / XP ---

export function getUser(jid) {
  const store = getStore();
  if (!store.users[jid]) {
    store.users[jid] = {
      jid,
      wallet: 0,
      bank: 0,
      xp: 0,
      level: 1,
      last_daily: 0,
      last_work: 0,
      inventory: '[]'
    };
    saveStore();

    if (dbInstance) {
      try {
        dbInstance.run(
          'INSERT OR IGNORE INTO users (jid, wallet, bank, xp, level, last_daily, last_work, inventory) VALUES (?, 0, 0, 0, 1, 0, 0, "[]")',
          [jid]
        );
        saveSqliteFile();
      } catch (_) {}
    }
  }
  return store.users[jid];
}

export function updateUser(jid, updates) {
  const user = getUser(jid);
  for (const [key, val] of Object.entries(updates)) {
    user[key] = typeof val === 'object' ? JSON.stringify(val) : val;
  }
  saveStore();

  if (dbInstance) {
    try {
      const fields = [];
      const values = [];
      for (const [key, val] of Object.entries(updates)) {
        fields.push(`${key} = ?`);
        values.push(typeof val === 'object' ? JSON.stringify(val) : val);
      }
      values.push(jid);
      dbInstance.run(`UPDATE users SET ${fields.join(', ')} WHERE jid = ?`, values);
      saveSqliteFile();
    } catch (_) {}
  }
}

export function getTopUsersByWallet(limit = 10) {
  const store = getStore();
  const list = Object.values(store.users);
  list.sort((a, b) => (b.wallet + b.bank) - (a.wallet + a.bank));
  return list.slice(0, limit);
}

export function getTopUsersByXP(limit = 10) {
  const store = getStore();
  const list = Object.values(store.users);
  list.sort((a, b) => b.xp - a.xp);
  return list.slice(0, limit);
}

// --- Funções de Warns ---

export function getWarns(groupJid, userJid) {
  const store = getStore();
  const key = `${groupJid}_${userJid}`;
  return store.warns[key] || 0;
}

export function addWarn(groupJid, userJid) {
  const store = getStore();
  const key = `${groupJid}_${userJid}`;
  const current = store.warns[key] || 0;
  const next = current + 1;
  store.warns[key] = next;
  saveStore();

  if (dbInstance) {
    try {
      dbInstance.run('INSERT OR REPLACE INTO warns (group_jid, user_jid, count) VALUES (?, ?, ?)', [groupJid, userJid, next]);
      saveSqliteFile();
    } catch (_) {}
  }
  return next;
}

export function resetWarns(groupJid, userJid) {
  const store = getStore();
  const key = `${groupJid}_${userJid}`;
  delete store.warns[key];
  saveStore();

  if (dbInstance) {
    try {
      dbInstance.run('DELETE FROM warns WHERE group_jid = ? AND user_jid = ?', [groupJid, userJid]);
      saveSqliteFile();
    } catch (_) {}
  }
}

// --- Funções de Configurações de Grupo ---

export function getGroupConfig(groupJid) {
  const store = getStore();
  if (!store.group_configs[groupJid]) {
    store.group_configs[groupJid] = {
      group_jid: groupJid,
      antilink: 0,
      antispam: 0,
      welcome: 0,
      rules: ''
    };
    saveStore();

    if (dbInstance) {
      try {
        dbInstance.run('INSERT OR IGNORE INTO group_configs (group_jid, antilink, antispam, welcome, rules) VALUES (?, 0, 0, 0, "")', [groupJid]);
        saveSqliteFile();
      } catch (_) {}
    }
  }
  return store.group_configs[groupJid];
}

export function updateGroupConfig(groupJid, updates) {
  const config = getGroupConfig(groupJid);
  Object.assign(config, updates);
  saveStore();

  if (dbInstance) {
    try {
      const fields = [];
      const values = [];
      for (const [key, val] of Object.entries(updates)) {
        fields.push(`${key} = ?`);
        values.push(val);
      }
      values.push(groupJid);
      dbInstance.run(`UPDATE group_configs SET ${fields.join(', ')} WHERE group_jid = ?`, values);
      saveSqliteFile();
    } catch (_) {}
  }
}

// --- Funções de Lembretes ---

export function addReminder(userJid, chatJid, targetTime, message) {
  const store = getStore();
  const reminder = {
    id: Date.now(),
    user_jid: userJid,
    chat_jid: chatJid,
    target_time: targetTime,
    message
  };
  store.reminders.push(reminder);
  saveStore();

  if (dbInstance) {
    try {
      dbInstance.run('INSERT INTO reminders (user_jid, chat_jid, target_time, message) VALUES (?, ?, ?, ?)', [userJid, chatJid, targetTime, message]);
      saveSqliteFile();
    } catch (_) {}
  }
  return reminder;
}

export function getPendingReminders() {
  const store = getStore();
  const now = Date.now();
  return store.reminders.filter(r => r.target_time <= now);
}

export function deleteReminder(id) {
  const store = getStore();
  store.reminders = store.reminders.filter(r => r.id !== id);
  saveStore();

  if (dbInstance) {
    try {
      dbInstance.run('DELETE FROM reminders WHERE id = ?', [id]);
      saveSqliteFile();
    } catch (_) {}
  }
}

export default dbInstance;
