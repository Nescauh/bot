import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve('database.json');

let db = {
  casamentos: {},
  pedidosCasamento: {},
  autorizadosVer: [],
  configGrupos: {}
};

// Carrega o banco de dados
export function loadDatabase() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      db = JSON.parse(data);
      
      // Garantir que a estrutura básica exista
      db.casamentos = db.casamentos || {};
      db.pedidosCasamento = db.pedidosCasamento || {};
      db.autorizadosVer = db.autorizadosVer || [];
      db.configGrupos = db.configGrupos || {};
    } else {
      saveDatabase();
    }
  } catch (error) {
    console.error('Erro ao carregar o banco de dados:', error);
  }
}

// Salva o banco de dados
export function saveDatabase() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  } catch (error) {
    console.error('Erro ao salvar o banco de dados:', error);
  }
}

// Retorna a instância do banco de dados
export function getDatabase() {
  return db;
}

// Atualiza o banco de dados de forma segura
export function updateDatabase(fn) {
  fn(db);
  saveDatabase();
}
