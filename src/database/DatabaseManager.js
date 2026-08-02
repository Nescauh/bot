import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve('bot_data.sqlite');
const LEGACY_JSON_PATH = path.resolve('database.json');
const BOT_DATA_JSON_PATH = path.resolve('bot_data.json');
const BACKUPS_DIR = path.resolve('backups');

class DatabaseManager {
  constructor() {
    this.dbInstance = null;
    this.pgClient = null;
    this.isPg = false;
    this.memoryStore = {
      users: {},
      warns: {},
      group_configs: {},
      configGrupos: {},
      reminders: [],
      casamentos: {},
      pedidosCasamento: {},
      autorizadosVer: []
    };
    this.isInitialized = false;
  }

  // --- LOGGING HELPER ---
  log(msg) {
    console.log(`[DATABASE]\n${msg}`);
  }

  logErr(msg, err) {
    console.error(`[DATABASE ERROR] ${msg}`, err || '');
  }

  // --- BACKUP AUTOMÁTICO ---
  createBackup() {
    try {
      if (!fs.existsSync(BACKUPS_DIR)) {
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
      }

      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-');

      if (fs.existsSync(DB_PATH)) {
        fs.copyFileSync(DB_PATH, path.join(BACKUPS_DIR, `backup-${timestamp}.sqlite`));
      }
      if (fs.existsSync(LEGACY_JSON_PATH)) {
        fs.copyFileSync(LEGACY_JSON_PATH, path.join(BACKUPS_DIR, `backup-${timestamp}-database.json`));
      }
      if (fs.existsSync(BOT_DATA_JSON_PATH)) {
        fs.copyFileSync(BOT_DATA_JSON_PATH, path.join(BACKUPS_DIR, `backup-${timestamp}-bot_data.json`));
      }

      this.log('Backup concluído.');
      return true;
    } catch (err) {
      this.logErr('Falha ao criar backup:', err);
      return false;
    }
  }

  // --- INICIALIZAÇÃO ---
  async initialize() {
    if (this.isInitialized) return;

    // 1. Backup antes de qualquer migração/carregamento
    this.createBackup();

    const pgUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

    if (pgUrl) {
      try {
        const pg = await import('pg');
        const Client = pg.default ? pg.default.Client : pg.Client;
        this.pgClient = new Client({
          connectionString: pgUrl,
          ssl: process.env.PG_NO_SSL ? false : { rejectUnauthorized: false }
        });
        await this.pgClient.connect();
        this.isPg = true;
        this.log('Conectado ao PostgreSQL (Railway/Nuvem) com sucesso.');
      } catch (err) {
        this.logErr('Não foi possível conectar ao PostgreSQL. Alternando para SQLite local.', err.message);
        this.isPg = false;
      }
    }

    if (!this.isPg) {
      try {
        const SQL = await initSqlJs();
        if (fs.existsSync(DB_PATH)) {
          const filebuffer = fs.readFileSync(DB_PATH);
          this.dbInstance = new SQL.Database(filebuffer);
        } else {
          this.dbInstance = new SQL.Database();
        }
      } catch (err) {
        this.logErr('Erro ao inicializar sql.js WebAssembly, utilizando em-memória pura.', err);
        const SQL = await initSqlJs();
        this.dbInstance = new SQL.Database();
      }
    }

    // 2. Criação das Tabelas
    await this.createTables();
    this.log('Banco carregado com sucesso.');

    // 3. Hidratação + Migração de dados legados
    await this.migrateAndHydrate();
    this.log('Migração executada.');
    this.log('Nenhum dado perdido.');

    this.isInitialized = true;
  }

  persistSqliteFile() {
    if (this.dbInstance && !this.isPg) {
      try {
        const data = this.dbInstance.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
      } catch (err) {
        this.logErr('Erro ao gravar arquivo SQLite:', err);
      }
    }
  }

  async createTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS users (
        jid TEXT PRIMARY KEY,
        wallet INTEGER DEFAULT 0,
        bank INTEGER DEFAULT 0,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        aura INTEGER DEFAULT 0,
        last_daily INTEGER DEFAULT 0,
        last_work INTEGER DEFAULT 0,
        last_aura_farm INTEGER DEFAULT 0,
        daily_streak INTEGER DEFAULT 0,
        inventory TEXT DEFAULT '[]',
        extra_data TEXT DEFAULT '{}'
      );`,

      `CREATE TABLE IF NOT EXISTS warns (
        group_jid TEXT,
        user_jid TEXT,
        count INTEGER DEFAULT 0,
        PRIMARY KEY (group_jid, user_jid)
      );`,

      `CREATE TABLE IF NOT EXISTS group_configs (
        group_jid TEXT PRIMARY KEY,
        antilink INTEGER DEFAULT 0,
        antispam INTEGER DEFAULT 0,
        welcome INTEGER DEFAULT 0,
        rules TEXT DEFAULT '',
        anti_delete INTEGER DEFAULT 0
      );`,

      `CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY,
        user_jid TEXT,
        chat_jid TEXT,
        target_time INTEGER,
        message TEXT
      );`,

      `CREATE TABLE IF NOT EXISTS casamentos (
        user_jid TEXT PRIMARY KEY,
        parceiro_jid TEXT,
        since INTEGER
      );`,

      `CREATE TABLE IF NOT EXISTS pedidos_casamento (
        target_jid TEXT PRIMARY KEY,
        sender_jid TEXT
      );`,

      `CREATE TABLE IF NOT EXISTS autorizados_ver (
        user_jid TEXT PRIMARY KEY
      );`
    ];

    for (const q of queries) {
      if (this.isPg) {
        let pgQuery = q.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/i, 'SERIAL PRIMARY KEY');
        await this.pgClient.query(pgQuery);
      } else {
        this.dbInstance.run(q);
      }
    }

    if (!this.isPg && this.dbInstance) {
      const alters = [
        'ALTER TABLE users ADD COLUMN aura INTEGER DEFAULT 0',
        'ALTER TABLE users ADD COLUMN last_aura_farm INTEGER DEFAULT 0',
        'ALTER TABLE users ADD COLUMN daily_streak INTEGER DEFAULT 0',
        'ALTER TABLE users ADD COLUMN extra_data TEXT DEFAULT "{}"',
        'ALTER TABLE group_configs ADD COLUMN anti_delete INTEGER DEFAULT 0'
      ];
      for (const alt of alters) {
        try { this.dbInstance.run(alt); } catch (_) {}
      }
    }
  }

  // --- MIGRAÇÃO E CARREGAMENTO DE DADOS ---
  async migrateAndHydrate() {
    // Carrega do Banco Relacional Principal
    await this.loadFromDb();

    // Importa dados legados de database.json e bot_data.json se existirem
    if (fs.existsSync(LEGACY_JSON_PATH)) {
      try {
        const raw = fs.readFileSync(LEGACY_JSON_PATH, 'utf-8');
        const legacyData = JSON.parse(raw);
        await this.mergeLegacyData(legacyData);
      } catch (e) {
        this.logErr('Erro ao ler database.json legado:', e);
      }
    }

    if (fs.existsSync(BOT_DATA_JSON_PATH)) {
      try {
        const raw = fs.readFileSync(BOT_DATA_JSON_PATH, 'utf-8');
        const legacyData = JSON.parse(raw);
        await this.mergeLegacyData(legacyData);
      } catch (e) {
        this.logErr('Erro ao ler bot_data.json legado:', e);
      }
    }

    // Salva estado unificado de volta no DB
    await this.saveDatabase();
  }

  async loadFromDb() {
    if (this.isPg) {
      const resUsers = await this.pgClient.query('SELECT * FROM users');
      resUsers.rows.forEach(u => {
        const extra = u.extra_data ? JSON.parse(u.extra_data) : {};
        this.memoryStore.users[u.jid] = { ...u, ...extra };
      });

      const resWarns = await this.pgClient.query('SELECT * FROM warns');
      resWarns.rows.forEach(w => {
        this.memoryStore.warns[`${w.group_jid}_${w.user_jid}`] = w.count;
      });

      const resGroups = await this.pgClient.query('SELECT * FROM group_configs');
      resGroups.rows.forEach(g => {
        this.memoryStore.group_configs[g.group_jid] = g;
        this.memoryStore.configGrupos[g.group_jid] = { antiDelete: Boolean(g.anti_delete) };
      });

      const resReminders = await this.pgClient.query('SELECT * FROM reminders');
      this.memoryStore.reminders = resReminders.rows;

      const resCasamentos = await this.pgClient.query('SELECT * FROM casamentos');
      resCasamentos.rows.forEach(c => {
        this.memoryStore.casamentos[c.user_jid] = { parceiro: c.parceiro_jid, since: Number(c.since) };
      });

      const resPedidos = await this.pgClient.query('SELECT * FROM pedidos_casamento');
      resPedidos.rows.forEach(p => {
        this.memoryStore.pedidosCasamento[p.target_jid] = p.sender_jid;
      });

      const resAutorizados = await this.pgClient.query('SELECT * FROM autorizados_ver');
      this.memoryStore.autorizadosVer = resAutorizados.rows.map(a => a.user_jid);

    } else if (this.dbInstance) {
      try {
        const resUsers = this.dbInstance.exec('SELECT * FROM users');
        if (resUsers.length > 0) {
          const cols = resUsers[0].columns;
          resUsers[0].values.forEach(row => {
            const u = {};
            cols.forEach((col, idx) => u[col] = row[idx]);
            if (u.jid) {
              const extra = u.extra_data ? JSON.parse(u.extra_data) : {};
              this.memoryStore.users[u.jid] = { ...u, ...extra };
            }
          });
        }
      } catch (_) {}

      try {
        const resWarns = this.dbInstance.exec('SELECT * FROM warns');
        if (resWarns.length > 0) {
          const cols = resWarns[0].columns;
          resWarns[0].values.forEach(row => {
            const w = {};
            cols.forEach((col, idx) => w[col] = row[idx]);
            if (w.group_jid && w.user_jid) {
              this.memoryStore.warns[`${w.group_jid}_${w.user_jid}`] = w.count;
            }
          });
        }
      } catch (_) {}

      try {
        const resGroups = this.dbInstance.exec('SELECT * FROM group_configs');
        if (resGroups.length > 0) {
          const cols = resGroups[0].columns;
          resGroups[0].values.forEach(row => {
            const g = {};
            cols.forEach((col, idx) => g[col] = row[idx]);
            if (g.group_jid) {
              this.memoryStore.group_configs[g.group_jid] = g;
              this.memoryStore.configGrupos[g.group_jid] = { antiDelete: Boolean(g.anti_delete) };
            }
          });
        }
      } catch (_) {}

      try {
        const resReminders = this.dbInstance.exec('SELECT * FROM reminders');
        if (resReminders.length > 0) {
          const cols = resReminders[0].columns;
          this.memoryStore.reminders = resReminders[0].values.map(row => {
            const r = {};
            cols.forEach((col, idx) => r[col] = row[idx]);
            return r;
          });
        }
      } catch (_) {}

      try {
        const resCasamentos = this.dbInstance.exec('SELECT * FROM casamentos');
        if (resCasamentos.length > 0) {
          const cols = resCasamentos[0].columns;
          resCasamentos[0].values.forEach(row => {
            const c = {};
            cols.forEach((col, idx) => c[col] = row[idx]);
            if (c.user_jid) {
              this.memoryStore.casamentos[c.user_jid] = { parceiro: c.parceiro_jid, since: Number(c.since) };
            }
          });
        }
      } catch (_) {}

      try {
        const resPedidos = this.dbInstance.exec('SELECT * FROM pedidos_casamento');
        if (resPedidos.length > 0) {
          const cols = resPedidos[0].columns;
          resPedidos[0].values.forEach(row => {
            const p = {};
            cols.forEach((col, idx) => p[col] = row[idx]);
            if (p.target_jid) {
              this.memoryStore.pedidosCasamento[p.target_jid] = p.sender_jid;
            }
          });
        }
      } catch (_) {}

      try {
        const resAutorizados = this.dbInstance.exec('SELECT * FROM autorizados_ver');
        if (resAutorizados.length > 0) {
          this.memoryStore.autorizadosVer = resAutorizados[0].values.map(row => row[0]);
        }
      } catch (_) {}
    }
  }

  async mergeLegacyData(legacyData) {
    if (!legacyData || typeof legacyData !== 'object') return;

    if (legacyData.users) {
      for (const [jid, u] of Object.entries(legacyData.users)) {
        if (!this.memoryStore.users[jid]) {
          this.memoryStore.users[jid] = u;
        } else {
          this.memoryStore.users[jid] = {
            ...u,
            ...this.memoryStore.users[jid]
          };
        }
      }
    }

    if (legacyData.warns) {
      for (const [k, v] of Object.entries(legacyData.warns)) {
        if (!this.memoryStore.warns[k]) {
          this.memoryStore.warns[k] = v;
        }
      }
    }

    if (legacyData.group_configs) {
      for (const [gJid, cfg] of Object.entries(legacyData.group_configs)) {
        if (!this.memoryStore.group_configs[gJid]) {
          this.memoryStore.group_configs[gJid] = cfg;
        }
      }
    }

    if (legacyData.configGrupos) {
      for (const [gJid, cfg] of Object.entries(legacyData.configGrupos)) {
        if (!this.memoryStore.configGrupos[gJid]) {
          this.memoryStore.configGrupos[gJid] = cfg;
        }
      }
    }

    if (Array.isArray(legacyData.reminders)) {
      for (const r of legacyData.reminders) {
        if (!this.memoryStore.reminders.some(existing => existing.id === r.id)) {
          this.memoryStore.reminders.push(r);
        }
      }
    }

    if (legacyData.casamentos) {
      for (const [uJid, cInfo] of Object.entries(legacyData.casamentos)) {
        if (!this.memoryStore.casamentos[uJid]) {
          this.memoryStore.casamentos[uJid] = cInfo;
        }
      }
    }

    if (legacyData.pedidosCasamento) {
      for (const [tJid, sJid] of Object.entries(legacyData.pedidosCasamento)) {
        if (!this.memoryStore.pedidosCasamento[tJid]) {
          this.memoryStore.pedidosCasamento[tJid] = sJid;
        }
      }
    }

    if (Array.isArray(legacyData.autorizadosVer)) {
      for (const jid of legacyData.autorizadosVer) {
        if (!this.memoryStore.autorizadosVer.includes(jid)) {
          this.memoryStore.autorizadosVer.push(jid);
        }
      }
    }
  }

  // --- PERSISTÊNCIA TOTAL / SALVAMENTO ---
  async saveDatabase() {
    // 1. Salva Usuários
    for (const [jid, user] of Object.entries(this.memoryStore.users)) {
      await this.persistUser(user);
    }

    // 2. Salva Warns
    for (const [key, count] of Object.entries(this.memoryStore.warns)) {
      const parts = key.split('_');
      if (parts.length >= 2) {
        const group_jid = parts[0];
        const user_jid = parts.slice(1).join('_');
        if (this.isPg) {
          await this.pgClient.query(
            'INSERT INTO warns (group_jid, user_jid, count) VALUES ($1, $2, $3) ON CONFLICT (group_jid, user_jid) DO UPDATE SET count = $3',
            [group_jid, user_jid, count]
          );
        } else if (this.dbInstance) {
          this.dbInstance.run(
            'INSERT OR REPLACE INTO warns (group_jid, user_jid, count) VALUES (?, ?, ?)',
            [group_jid, user_jid, count]
          );
        }
      }
    }

    // 3. Salva Configurações de Grupos
    for (const [gJid, cfg] of Object.entries(this.memoryStore.group_configs)) {
      const antiDel = this.memoryStore.configGrupos[gJid]?.antiDelete ? 1 : 0;
      if (this.isPg) {
        await this.pgClient.query(
          'INSERT INTO group_configs (group_jid, antilink, antispam, welcome, rules, anti_delete) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (group_jid) DO UPDATE SET antilink = $2, antispam = $3, welcome = $4, rules = $5, anti_delete = $6',
          [gJid, cfg.antilink || 0, cfg.antispam || 0, cfg.welcome || 0, cfg.rules || '', antiDel]
        );
      } else if (this.dbInstance) {
        this.dbInstance.run(
          'INSERT OR REPLACE INTO group_configs (group_jid, antilink, antispam, welcome, rules, anti_delete) VALUES (?, ?, ?, ?, ?, ?)',
          [gJid, cfg.antilink || 0, cfg.antispam || 0, cfg.welcome || 0, cfg.rules || '', antiDel]
        );
      }
    }

    // 4. Salva Casamentos (Com Sincronização de Remoções)
    if (this.isPg) {
      await this.pgClient.query('DELETE FROM casamentos');
    } else if (this.dbInstance) {
      this.dbInstance.run('DELETE FROM casamentos');
    }
    for (const [uJid, cInfo] of Object.entries(this.memoryStore.casamentos)) {
      if (cInfo && cInfo.parceiro) {
        if (this.isPg) {
          await this.pgClient.query(
            'INSERT INTO casamentos (user_jid, parceiro_jid, since) VALUES ($1, $2, $3)',
            [uJid, cInfo.parceiro, cInfo.since || Date.now()]
          );
        } else if (this.dbInstance) {
          this.dbInstance.run(
            'INSERT INTO casamentos (user_jid, parceiro_jid, since) VALUES (?, ?, ?)',
            [uJid, cInfo.parceiro, cInfo.since || Date.now()]
          );
        }
      }
    }

    // 5. Salva Pedidos de Casamento (Com Sincronização de Remoções)
    if (this.isPg) {
      await this.pgClient.query('DELETE FROM pedidos_casamento');
    } else if (this.dbInstance) {
      this.dbInstance.run('DELETE FROM pedidos_casamento');
    }
    for (const [tJid, sJid] of Object.entries(this.memoryStore.pedidosCasamento)) {
      if (sJid) {
        if (this.isPg) {
          await this.pgClient.query(
            'INSERT INTO pedidos_casamento (target_jid, sender_jid) VALUES ($1, $2)',
            [tJid, sJid]
          );
        } else if (this.dbInstance) {
          this.dbInstance.run(
            'INSERT INTO pedidos_casamento (target_jid, sender_jid) VALUES (?, ?)',
            [tJid, sJid]
          );
        }
      }
    }

    // 6. Salva Autorizados Ver (Com Sincronização de Remoções)
    if (this.isPg) {
      await this.pgClient.query('DELETE FROM autorizados_ver');
    } else if (this.dbInstance) {
      this.dbInstance.run('DELETE FROM autorizados_ver');
    }
    for (const jid of this.memoryStore.autorizadosVer) {
      if (jid) {
        if (this.isPg) {
          await this.pgClient.query(
            'INSERT INTO autorizados_ver (user_jid) VALUES ($1)',
            [jid]
          );
        } else if (this.dbInstance) {
          this.dbInstance.run(
            'INSERT INTO autorizados_ver (user_jid) VALUES (?)',
            [jid]
          );
        }
      }
    }

    // Grava também no disco se for SQLite
    this.persistSqliteFile();
  }

  async persistUser(user) {
    if (!user || !user.jid) return;

    const jid = user.jid;
    const wallet = Number(user.wallet) || 0;
    const bank = Number(user.bank) || 0;
    const xp = Number(user.xp) || 0;
    const level = Number(user.level) || 1;
    const aura = Number(user.aura) || 0;
    const last_daily = Number(user.last_daily) || 0;
    const last_work = Number(user.last_work) || 0;
    const last_aura_farm = Number(user.last_aura_farm) || 0;
    const daily_streak = Number(user.daily_streak) || 0;
    const inventory = typeof user.inventory === 'string' ? user.inventory : JSON.stringify(user.inventory || []);

    const knownKeys = ['jid', 'wallet', 'bank', 'xp', 'level', 'aura', 'last_daily', 'last_work', 'last_aura_farm', 'daily_streak', 'inventory', 'extra_data'];
    const extraObj = {};
    for (const [k, v] of Object.entries(user)) {
      if (!knownKeys.includes(k)) {
        extraObj[k] = v;
      }
    }
    const extra_data = JSON.stringify(extraObj);

    if (this.isPg) {
      await this.pgClient.query(
        `INSERT INTO users (jid, wallet, bank, xp, level, aura, last_daily, last_work, last_aura_farm, daily_streak, inventory, extra_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (jid) DO UPDATE SET
         wallet = $2, bank = $3, xp = $4, level = $5, aura = $6, last_daily = $7, last_work = $8, last_aura_farm = $9, daily_streak = $10, inventory = $11, extra_data = $12`,
        [jid, wallet, bank, xp, level, aura, last_daily, last_work, last_aura_farm, daily_streak, inventory, extra_data]
      );
    } else if (this.dbInstance) {
      this.dbInstance.run(
        `INSERT OR REPLACE INTO users (jid, wallet, bank, xp, level, aura, last_daily, last_work, last_aura_farm, daily_streak, inventory, extra_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [jid, wallet, bank, xp, level, aura, last_daily, last_work, last_aura_farm, daily_streak, inventory, extra_data]
      );
      this.persistSqliteFile();
    }
  }

  // --- API DE COMANDOS / USUÁRIO ---

  getUser(jid) {
    if (!jid) return null;

    if (!this.memoryStore.users[jid]) {
      this.memoryStore.users[jid] = {
        jid,
        wallet: 0,
        bank: 0,
        xp: 0,
        level: 1,
        aura: 0,
        last_daily: 0,
        last_work: 0,
        last_aura_farm: 0,
        daily_streak: 0,
        inventory: '[]'
      };
      this.persistUser(this.memoryStore.users[jid]);
      this.log('Usuário salvo.');
    }

    const u = this.memoryStore.users[jid];
    u.wallet = Number(u.wallet) || 0;
    u.bank = Number(u.bank) || 0;
    u.xp = Number(u.xp) || 0;
    u.level = Number(u.level) || 1;
    u.aura = Number(u.aura) || 0;
    u.last_daily = Number(u.last_daily) || 0;
    u.last_work = Number(u.last_work) || 0;
    u.last_aura_farm = Number(u.last_aura_farm) || 0;
    u.daily_streak = Number(u.daily_streak) || 0;
    u.inventory = u.inventory || '[]';

    return u;
  }

  updateUser(jid, updates) {
    const user = this.getUser(jid);
    if (!user) return;

    for (const [key, val] of Object.entries(updates)) {
      user[key] = typeof val === 'object' ? JSON.stringify(val) : val;
    }

    this.persistUser(user);
    this.log('Usuário salvo.');
  }

  getTopUsersByWallet(limit = 10) {
    const list = Object.values(this.memoryStore.users);
    list.sort((a, b) => (Number(b.wallet || 0) + Number(b.bank || 0)) - (Number(a.wallet || 0) + Number(a.bank || 0)));
    return list.slice(0, limit);
  }

  getTopUsersByXP(limit = 10) {
    const list = Object.values(this.memoryStore.users);
    list.sort((a, b) => Number(b.xp || 0) - Number(a.xp || 0));
    return list.slice(0, limit);
  }

  // --- WARNS ---
  getWarns(groupJid, userJid) {
    const key = `${groupJid}_${userJid}`;
    return this.memoryStore.warns[key] || 0;
  }

  addWarn(groupJid, userJid) {
    const key = `${groupJid}_${userJid}`;
    const current = this.memoryStore.warns[key] || 0;
    const next = current + 1;
    this.memoryStore.warns[key] = next;

    if (this.isPg) {
      this.pgClient.query(
        'INSERT INTO warns (group_jid, user_jid, count) VALUES ($1, $2, $3) ON CONFLICT (group_jid, user_jid) DO UPDATE SET count = $3',
        [groupJid, userJid, next]
      );
    } else if (this.dbInstance) {
      this.dbInstance.run(
        'INSERT OR REPLACE INTO warns (group_jid, user_jid, count) VALUES (?, ?, ?)',
        [groupJid, userJid, next]
      );
      this.persistSqliteFile();
    }

    this.log('Usuário salvo.');
    return next;
  }

  resetWarns(groupJid, userJid) {
    const key = `${groupJid}_${userJid}`;
    delete this.memoryStore.warns[key];

    if (this.isPg) {
      this.pgClient.query('DELETE FROM warns WHERE group_jid = $1 AND user_jid = $2', [groupJid, userJid]);
    } else if (this.dbInstance) {
      this.dbInstance.run('DELETE FROM warns WHERE group_jid = ? AND user_jid = ?', [groupJid, userJid]);
      this.persistSqliteFile();
    }
  }

  // --- CONFIGURAÇÕES DE GRUPO ---
  getGroupConfig(groupJid) {
    if (!this.memoryStore.group_configs[groupJid]) {
      this.memoryStore.group_configs[groupJid] = {
        group_jid: groupJid,
        antilink: 0,
        antispam: 0,
        welcome: 0,
        rules: ''
      };
      this.memoryStore.configGrupos[groupJid] = { antiDelete: false };
      this.updateGroupConfig(groupJid, {});
    }
    return this.memoryStore.group_configs[groupJid];
  }

  updateGroupConfig(groupJid, updates) {
    const config = this.getGroupConfig(groupJid);
    Object.assign(config, updates);

    const antiDel = this.memoryStore.configGrupos[groupJid]?.antiDelete ? 1 : 0;

    if (this.isPg) {
      this.pgClient.query(
        'INSERT INTO group_configs (group_jid, antilink, antispam, welcome, rules, anti_delete) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (group_jid) DO UPDATE SET antilink = $2, antispam = $3, welcome = $4, rules = $5, anti_delete = $6',
        [groupJid, config.antilink || 0, config.antispam || 0, config.welcome || 0, config.rules || '', antiDel]
      );
    } else if (this.dbInstance) {
      this.dbInstance.run(
        'INSERT OR REPLACE INTO group_configs (group_jid, antilink, antispam, welcome, rules, anti_delete) VALUES (?, ?, ?, ?, ?, ?)',
        [groupJid, config.antilink || 0, config.antispam || 0, config.welcome || 0, config.rules || '', antiDel]
      );
      this.persistSqliteFile();
    }
  }

  // --- LEMBRETES ---
  addReminder(userJid, chatJid, targetTime, message) {
    const reminder = {
      id: Date.now(),
      user_jid: userJid,
      chat_jid: chatJid,
      target_time: targetTime,
      message
    };
    this.memoryStore.reminders.push(reminder);

    if (this.isPg) {
      this.pgClient.query(
        'INSERT INTO reminders (id, user_jid, chat_jid, target_time, message) VALUES ($1, $2, $3, $4, $5)',
        [reminder.id, userJid, chatJid, targetTime, message]
      );
    } else if (this.dbInstance) {
      this.dbInstance.run(
        'INSERT INTO reminders (id, user_jid, chat_jid, target_time, message) VALUES (?, ?, ?, ?, ?)',
        [reminder.id, userJid, chatJid, targetTime, message]
      );
      this.persistSqliteFile();
    }

    return reminder;
  }

  getPendingReminders() {
    const now = Date.now();
    return this.memoryStore.reminders.filter(r => r.target_time <= now);
  }

  deleteReminder(id) {
    this.memoryStore.reminders = this.memoryStore.reminders.filter(r => r.id !== id);

    if (this.isPg) {
      this.pgClient.query('DELETE FROM reminders WHERE id = $1', [id]);
    } else if (this.dbInstance) {
      this.dbInstance.run('DELETE FROM reminders WHERE id = ?', [id]);
      this.persistSqliteFile();
    }
  }

  // --- BANCO COMPATÍVEL / GETTER DA INSTÂNCIA ---
  getDatabase() {
    return this.memoryStore;
  }
}

export const databaseManager = new DatabaseManager();
export default databaseManager;
