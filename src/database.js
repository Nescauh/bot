import databaseManager from './database/DatabaseManager.js';

// Carrega o banco de dados unificado
export async function loadDatabase() {
  await databaseManager.initialize();
}

// Salva o banco de dados unificado sem apagar os usuários
export async function saveDatabase() {
  await databaseManager.saveDatabase();
}

// Retorna a instância completa do banco de dados unificado
export function getDatabase() {
  return databaseManager.getDatabase();
}

// Atualiza o banco de dados de forma segura preservando todas as propriedades existentes
export async function updateDatabase(fn) {
  const db = databaseManager.getDatabase();
  await fn(db);
  await databaseManager.saveDatabase();
}

export function getUser(jid) {
  return databaseManager.getUser(jid);
}

export function updateUser(jid, updates) {
  return databaseManager.updateUser(jid, updates);
}

export default databaseManager;
