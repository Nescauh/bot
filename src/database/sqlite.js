import databaseManager from './DatabaseManager.js';

export async function initSqlite() {
  await databaseManager.initialize();
}

export function getStore() {
  return databaseManager.getDatabase();
}

export function saveStore() {
  databaseManager.saveDatabase();
}

export function getUser(jid) {
  return databaseManager.getUser(jid);
}

export function updateUser(jid, updates) {
  return databaseManager.updateUser(jid, updates);
}

export function getTopUsersByWallet(limit = 10) {
  return databaseManager.getTopUsersByWallet(limit);
}

export function getTopUsersByXP(limit = 10) {
  return databaseManager.getTopUsersByXP(limit);
}

export function getWarns(groupJid, userJid) {
  return databaseManager.getWarns(groupJid, userJid);
}

export function addWarn(groupJid, userJid) {
  return databaseManager.addWarn(groupJid, userJid);
}

export function resetWarns(groupJid, userJid) {
  return databaseManager.resetWarns(groupJid, userJid);
}

export function getGroupConfig(groupJid) {
  return databaseManager.getGroupConfig(groupJid);
}

export function updateGroupConfig(groupJid, updates) {
  return databaseManager.updateGroupConfig(groupJid, updates);
}

export function addReminder(userJid, chatJid, targetTime, message) {
  return databaseManager.addReminder(userJid, chatJid, targetTime, message);
}

export function getPendingReminders() {
  return databaseManager.getPendingReminders();
}

export function deleteReminder(id) {
  return databaseManager.deleteReminder(id);
}

export default databaseManager;
