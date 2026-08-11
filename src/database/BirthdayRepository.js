import databaseManager from './DatabaseManager.js';

export async function saveBirthday(userJid, day, month, year, birthdayDateStr, chatJid = '') {
  if (!userJid) return null;

  const birthdayObj = {
    user_jid: userJid,
    birthday_date: birthdayDateStr,
    day: Number(day),
    month: Number(month),
    year: Number(year),
    notification_year: 0,
    chat_jid: chatJid || '',
    updated_at: new Date().toISOString()
  };

  databaseManager.memoryStore.birthdays[userJid] = birthdayObj;
  await databaseManager.persistBirthday(birthdayObj);
  return birthdayObj;
}

export function getBirthday(userJid) {
  if (!userJid) return null;
  return databaseManager.memoryStore.birthdays[userJid] || null;
}

export async function removeBirthday(userJid) {
  if (!userJid) return false;
  if (!databaseManager.memoryStore.birthdays[userJid]) return false;

  delete databaseManager.memoryStore.birthdays[userJid];

  if (databaseManager.isPg) {
    try {
      await databaseManager.pgClient.query('DELETE FROM birthdays WHERE user_jid = $1', [userJid]);
    } catch (err) {
      databaseManager.logErr(`Erro ao deletar aniversário de ${userJid} no PG:`, err);
    }
  } else if (databaseManager.dbInstance) {
    try {
      databaseManager.dbInstance.run('DELETE FROM birthdays WHERE user_jid = ?', [userJid]);
      databaseManager.persistSqliteFile();
    } catch (err) {
      databaseManager.logErr(`Erro ao deletar aniversário de ${userJid} no SQLite:`, err);
    }
  }

  return true;
}

export function getAllBirthdays() {
  return Object.values(databaseManager.memoryStore.birthdays || {});
}

export async function updateNotificationYear(userJid, notificationYear) {
  const bday = databaseManager.memoryStore.birthdays[userJid];
  if (!bday) return false;

  bday.notification_year = Number(notificationYear);
  await databaseManager.persistBirthday(bday);
  return true;
}
