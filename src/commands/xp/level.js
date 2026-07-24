import { getUser } from '../../database/sqlite.js';

export async function handleLevelCommand(sock, msg, sender, mentioned) {
  const from = msg.key.remoteJid;
  const target = mentioned[0] || msg.message?.extendedTextMessage?.contextInfo?.participant || sender;

  const user = getUser(target);
  const xpForNextLevel = Math.pow(user.level, 2) * 50;
  const progress = Math.min(100, Math.floor((user.xp / xpForNextLevel) * 100));

  const bar = '🟦'.repeat(Math.floor(progress / 10)) + '⬜'.repeat(10 - Math.floor(progress / 10));

  const text = `⭐ *NÍVEL E XP*\n\n` +
               `👤 *Usuário:* @${target.split('@')[0]}\n` +
               `🎖️ *Nível:* ${user.level}\n` +
               `✨ *XP:* ${user.xp} / ${xpForNextLevel}\n` +
               `📊 *Progresso:* ${progress}%\n` +
               `[${bar}]`;

  return sock.sendMessage(from, { text, mentions: [target] }, { quoted: msg });
}
