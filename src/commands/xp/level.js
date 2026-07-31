import { getUser } from '../../database/sqlite.js';

function getRpgTitle(level) {
  if (level <= 5) return '🐣 *Novato do Chat*';
  if (level <= 15) return '⚔️ *Guerreiro das Mensagens*';
  if (level <= 30) return '🛡️ *Guardião do Grupo*';
  if (level <= 50) return '🔮 *Mago da Conversa*';
  if (level <= 80) return '👑 *Lorde do WhatsApp*';
  return '🌌 *Divindade Suprema do Bot*';
}

export async function handleLevelCommand(sock, msg, sender, mentioned) {
  const from = msg.key.remoteJid;
  const target = mentioned[0] || msg.message?.extendedTextMessage?.contextInfo?.participant || sender;

  const user = getUser(target);
  const xpForNextLevel = Math.pow(user.level, 2) * 50;
  const progress = Math.min(100, Math.floor((user.xp / xpForNextLevel) * 100));

  const filledBlocks = Math.floor(progress / 10);
  const emptyBlocks = 10 - filledBlocks;
  const progressBar = '🟩'.repeat(filledBlocks) + '⬜'.repeat(emptyBlocks);

  const title = getRpgTitle(user.level);

  const text = `⭐ *STATUS DE LEVEL & PATENTE RPG* ⭐\n\n` +
               `👤 *Usuário:* @${target.split('@')[0]}\n` +
               `🎖️ *Patente RPG:* ${title}\n` +
               `🏆 *Nível Atual:* ${user.level}\n` +
               `✨ *Experiência:* ${user.xp.toLocaleString('pt-BR')} / ${xpForNextLevel.toLocaleString('pt-BR')} XP\n\n` +
               `📊 *Progresso para o Nível ${user.level + 1}:* ${progress}%\n` +
               `[${progressBar}]\n\n` +
               `💬 _Envie mensagens no chat para acumular XP e subir de nível!_`;

  return sock.sendMessage(from, { text, mentions: [target] }, { quoted: msg });
}
