import { getUser } from '../../database/sqlite.js';
import { askAi } from '../../utils/aiService.js';

function getRpgTitle(level) {
  if (level <= 5) return '🐣 Novato do Chat';
  if (level <= 15) return '⚔️ Guerreiro das Mensagens';
  if (level <= 30) return '🛡️ Guardião do Grupo';
  if (level <= 50) return '🔮 Mago da Conversa';
  if (level <= 80) return '👑 Lorde do WhatsApp';
  return '🌌 Divindade Suprema do Bot';
}

export async function handleRankCommand(sock, msg, sender, mentioned) {
  const from = msg.key.remoteJid;
  const target = mentioned[0] || msg.message?.extendedTextMessage?.contextInfo?.participant || sender;

  const user = getUser(target);
  const xpForNextLevel = Math.pow(user.level, 2) * 50;
  const progress = Math.min(100, Math.floor((user.xp / xpForNextLevel) * 100));
  const totalMoney = user.wallet + user.bank;
  const title = getRpgTitle(user.level);

  let heroMotto = '';
  try {
    const systemInstruction = 'Você é um narrador de jogos RPG épico e bem-humorado em um bot de WhatsApp. Escreva 1 lema curto e épico (máximo 12 palavras) de perfil do guerreiro. Não use aspas.';
    const prompt = `Crie 1 lema ou frase épica para um jogador com o título "${title}" no nível ${user.level}.`;
    const res = await askAi(prompt, systemInstruction);
    if (res) heroMotto = res.trim().replace(/^["']|["']$/g, '');
  } catch (_) {}

  if (!heroMotto) {
    heroMotto = 'Na batalha diária de conversas e stickers do grupo, a minha palavra é lei!';
  }

  const text = `📇 *CARTÃO DE STATUS DO PERFIL* 📇\n\n` +
               `👤 *Guerreiro(a):* @${target.split('@')[0]}\n` +
               `🎖️ *Título RPG:* *${title}*\n` +
               `🌟 *Nível:* ${user.level}\n` +
               `✨ *XP Total:* ${user.xp.toLocaleString('pt-BR')} XP (${progress}% pro próx. nível)\n` +
               `💰 *Patrimônio Total:* $${totalMoney.toLocaleString('pt-BR')} moedas\n` +
               `🎒 *Itens no Inventário:* ${JSON.parse(user.inventory || '[]').length} itens\n\n` +
               `⚔️ *Lema do Guerreiro (IA):*\n` +
               `_"${heroMotto}"_`;

  return sock.sendMessage(from, { text, mentions: [target] }, { quoted: msg });
}
