import { getStore, saveStore } from './database/sqlite.js';

// Carrega o banco de dados unificado
export function loadDatabase() {
  getStore();
}

// Salva o banco de dados unificado sem apagar os usuários
export function saveDatabase() {
  saveStore();
}

// Retorna a instância completa do banco de dados unificado
export function getDatabase() {
  return getStore();
}

// Atualiza o banco de dados de forma segura preservando todas as propriedades existentes
export function updateDatabase(fn) {
  const db = getStore();
  fn(db);
  saveStore();
}
