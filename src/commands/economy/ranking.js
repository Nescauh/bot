import { getTopUsersByWallet } from '../../database/sqlite.js';

export async function handleRankingCommand(sock, msg) {
  const from = msg.key.remoteJid;
  const topUsers = getTopUsersByWallet(10);

  if (topUsers.length === 0) {
    return sock.sendMessage(from, { text: '🏆 Ainda não há registros no ranking de economia.' }, { quoted: msg });
  }

  let text = `🏆 *RANKING DOS MAIS RICOS (TOP 10)* 🏆\n\n`;
  const mentions = [];

  topUsers.forEach((user, index) => {
    const total = user.wallet + user.bank;
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👤';
    text += `${medal} *${index + 1}º* @${user.jid.split('@')[0]} — *$${total}*\n`;
    mentions.push(user.jid);
  });

  return sock.sendMessage(from, { text, mentions }, { quoted: msg });
}
