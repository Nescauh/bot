import databaseManager from './database/DatabaseManager.js';
import userRepository from './database/UserRepository.js';

// Carrega o banco de dados unificado (Supabase PostgreSQL)
export async function loadDatabase() {
  await databaseManager.initialize();
}

// Salva o banco de dados unificado
export async function saveDatabase() {
  await databaseManager.saveDatabase();
}

// Retorna a instância completa do banco de dados unificado em memória
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
  return userRepository.getUser(jid);
}

export async function createUser(jid, initialData = {}) {
  return await userRepository.createUser(jid, initialData);
}

export async function updateUser(jid, updates) {
  return await userRepository.updateUser(jid, updates);
}

export async function addXP(jid, amount) {
  return await userRepository.addXP(jid, amount);
}

export async function addBalance(jid, amount) {
  return await userRepository.addBalance(jid, amount);
}

export async function saveUser(user) {
  return await userRepository.saveUser(user);
}

export async function transferMoney(senderJid, targetJid, amount) {
  return await databaseManager.transferMoney(senderJid, targetJid, amount);
}

export { userRepository, databaseManager };
export default databaseManager;

