import { getTopUsersByXP } from '../../database/sqlite.js';

function getRpgBadge(level) {
  if (level <= 5) return '🐣';
  if (level <= 15) return '⚔️';
  if (level <= 30) return '🛡️';
  if (level <= 50) return '🔮';
  if (level <= 80) return '👑';
  return '🌌';
}

export async function handleTopCommand(sock, msg) {
  const from = msg.key.remoteJid;
  const topUsers = getTopUsersByXP(10);

  if (topUsers.length === 0) {
    return sock.sendMessage(from, { text: '⭐ Ainda não há registros no ranking de XP.' }, { quoted: msg });
  }

  let text = `🌟 *TOP 10 MAIORES LENDAS DO CHAT (XP & LEVEL)* 🌟\n\n`;
  const mentions = [];

  topUsers.forEach((user, index) => {
    const medal = index === 0 ? '👑 🥇' : index === 1 ? '💎 🥈' : index === 2 ? '✨ 🥉' : '⭐';
    const rpgBadge = getRpgBadge(user.level);
    text += `${medal} *${index + 1}º* @${user.jid.split('@')[0]}\n` +
            `└ ${rpgBadge} *Nível ${user.level}* — ${user.xp.toLocaleString('pt-BR')} XP total\n\n`;
    mentions.push(user.jid);
  });

  text += `💬 _Participe ativamente dos chats para subir no ranking de lendas!_`;

  return sock.sendMessage(from, { text, mentions }, { quoted: msg });
}
