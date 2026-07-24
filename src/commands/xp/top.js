import { getTopUsersByXP } from '../../database/sqlite.js';

export async function handleTopCommand(sock, msg) {
  const from = msg.key.remoteJid;
  const topUsers = getTopUsersByXP(10);

  if (topUsers.length === 0) {
    return sock.sendMessage(from, { text: '⭐ Ainda não há registros no ranking de XP.' }, { quoted: msg });
  }

  let text = `🌟 *TOP 10 MAIORES NÍVEIS (XP)* 🌟\n\n`;
  const mentions = [];

  topUsers.forEach((user, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '⭐';
    text += `${medal} *${index + 1}º* @${user.jid.split('@')[0]} — Nível ${user.level} (${user.xp} XP)\n`;
    mentions.push(user.jid);
  });

  return sock.sendMessage(from, { text, mentions }, { quoted: msg });
}
