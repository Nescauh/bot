import { getUser } from '../../database/sqlite.js';

export async function handleRankCommand(sock, msg, sender, mentioned) {
  const from = msg.key.remoteJid;
  const target = mentioned[0] || msg.message?.extendedTextMessage?.contextInfo?.participant || sender;

  const user = getUser(target);

  const text = `📇 *CARD DE RANK E PERFIL DE XP*\n\n` +
               `👤 *Nome/JID:* @${target.split('@')[0]}\n` +
               `🌟 *Nível Atual:* ${user.level}\n` +
               `💎 *XP Total:* ${user.xp} XP\n` +
               `💰 *Economia Total:* $${user.wallet + user.bank}`;

  return sock.sendMessage(from, { text, mentions: [target] }, { quoted: msg });
}
