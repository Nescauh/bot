import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve('bot_data.sqlite');
const FALLBACK_JSON_PATH = path.resolve('bot_data.json');

let dbInstance = null;
let memoryStore = null;

// Tenta inicializar o sqlite3 ou carrega o armazenamento em JSON
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

// Inicializa o SQLite
export function initSqlite() {
  try {
    dbInstance = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.warn('⚠️ SQLite nativo não disponível, utilizando banco local compatível.', err.message);
        dbInstance = null;
      } else {
        console.log('🗄️ Banco de dados SQLite ativado com sucesso!');
        dbInstance.serialize(() => {
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
          `);

          dbInstance.run(`
            CREATE TABLE IF NOT EXISTS warns (
              group_jid TEXT,
              user_jid TEXT,
              count INTEGER DEFAULT 0,
              PRIMARY KEY (group_jid, user_jid)
            );
          `);

          dbInstance.run(`
            CREATE TABLE IF NOT EXISTS group_configs (
              group_jid TEXT PRIMARY KEY,
              antilink INTEGER DEFAULT 0,
              antispam INTEGER DEFAULT 0,
              welcome INTEGER DEFAULT 0,
              rules TEXT DEFAULT ''
            );
          `);

          dbInstance.run(`
            CREATE TABLE IF NOT EXISTS reminders (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_jid TEXT,
              chat_jid TEXT,
              target_time INTEGER,
              message TEXT
            );
          `);
        });
      }
    });
  } catch (err) {
    console.warn('⚠️ Inicializando armazenamento JSON de fallback para o SQLite.');
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
      dbInstance.run(
        'INSERT OR IGNORE INTO users (jid, wallet, bank, xp, level, last_daily, last_work, inventory) VALUES (?, 0, 0, 0, 1, 0, 0, "[]")',
        [jid]
      );
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
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(typeof val === 'object' ? JSON.stringify(val) : val);
    }
    values.push(jid);
    dbInstance.run(`UPDATE users SET ${fields.join(', ')} WHERE jid = ?`, values);
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
    dbInstance.run('INSERT OR REPLACE INTO warns (group_jid, user_jid, count) VALUES (?, ?, ?)', [groupJid, userJid, next]);
  }
  return next;
}

export function resetWarns(groupJid, userJid) {
  const store = getStore();
  const key = `${groupJid}_${userJid}`;
  delete store.warns[key];
  saveStore();

  if (dbInstance) {
    dbInstance.run('DELETE FROM warns WHERE group_jid = ? AND user_jid = ?', [groupJid, userJid]);
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
      dbInstance.run('INSERT OR IGNORE INTO group_configs (group_jid, antilink, antispam, welcome, rules) VALUES (?, 0, 0, 0, "")', [groupJid]);
    }
  }
  return store.group_configs[groupJid];
}

export function updateGroupConfig(groupJid, updates) {
  const config = getGroupConfig(groupJid);
  Object.assign(config, updates);
  saveStore();

  if (dbInstance) {
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
    values.push(groupJid);
    dbInstance.run(`UPDATE group_configs SET ${fields.join(', ')} WHERE group_jid = ?`, values);
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
    dbInstance.run('INSERT INTO reminders (user_jid, chat_jid, target_time, message) VALUES (?, ?, ?, ?)', [userJid, chatJid, targetTime, message]);
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
    dbInstance.run('DELETE FROM reminders WHERE id = ?', [id]);
  }
}

export default dbInstance;
