import databaseManager from './DatabaseManager.js';

export async function initSqlite() {
  await databaseManager.initialize();
}

export function getStore() {
  return databaseManager.getDatabase();
}

export async function saveStore() {
  await databaseManager.saveDatabase();
}

export function getUser(jid) {
  return databaseManager.getUser(jid);
}

export async function updateUser(jid, updates) {
  return await databaseManager.updateUser(jid, updates);
}

export function getTopUsersByWallet(limit = 10) {
  return databaseManager.getTopUsersByWallet(limit);
}

export function getTopUsersByXP(limit = 10) {
  return databaseManager.getTopUsersByXP(limit);
}

export function getTopUsersByAura(limit = 10) {
  const store = getStore();
  const list = Object.values(store.users || {});
  list.sort((a, b) => Number(b.aura || 0) - Number(a.aura || 0));
  return list.slice(0, limit);
}

export function getWarns(groupJid, userJid) {
  return databaseManager.getWarns(groupJid, userJid);
}

export async function addWarn(groupJid, userJid) {
  return await databaseManager.addWarn(groupJid, userJid);
}

export async function resetWarns(groupJid, userJid) {
  return await databaseManager.resetWarns(groupJid, userJid);
}

export function getGroupConfig(groupJid) {
  return databaseManager.getGroupConfig(groupJid);
}

export async function updateGroupConfig(groupJid, updates) {
  return await databaseManager.updateGroupConfig(groupJid, updates);
}

export async function addReminder(userJid, chatJid, targetTime, message) {
  return await databaseManager.addReminder(userJid, chatJid, targetTime, message);
}

export function getPendingReminders() {
  return databaseManager.getPendingReminders();
}

export async function deleteReminder(id) {
  return await databaseManager.deleteReminder(id);
}

export async function transferMoney(senderJid, targetJid, amount) {
  return await databaseManager.transferMoney(senderJid, targetJid, amount);
}

export default databaseManager;
