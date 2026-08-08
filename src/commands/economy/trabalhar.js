import { getUser, updateUser } from '../../database/sqlite.js';
import { askAi } from '../../utils/aiService.js';
import { calculateBonusRewards } from '../../utils/bonusCalculator.js';

const fallbackJobs = [
  'desenvolveu um bot secreto para o WhatsApp de uma grande empresa',
  'entregou pizzas voadoras de moto no trânsito caótico da cidade',
  'formatou o computador do vizinho e apagou os vírus acidentalmente',
  'vendeu pães de queijo gourmet na feira livre e o estoque esgotou',
  'trabalhou como motorista de aplicativo e levou um famoso no carro',
  'prestou consultoria de TI e resolveu o problema tirando o cabo da tomada',
  'treinou uma capivara para fazer entregas de iFood no centro',
  'venceu um campeonato de e-sports de jogo da velha'
];

export async function handleTrabalharCommand(sock, msg, sender) {
  const from = msg.key.remoteJid;
  const user = getUser(sender);
  const now = Date.now();
  const COOLDOWN = 30 * 60 * 1000; // Cooldown reduzido para 30 minutos!

  if (now - user.last_work < COOLDOWN) {
    const remaining = COOLDOWN - (now - user.last_work);
    const minutes = Math.floor(remaining / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    return sock.sendMessage(from, { text: `⏳ *VOCÊ ESTÁ CANSADO!*\n\nSeus músculos precisam de descanso! Aguarde *${minutes}m ${seconds}s* para pegar outro turno de trabalho.` }, { quoted: msg });
  }

  const baseCoins = Math.floor(Math.random() * 350) + 150; // $150 a $500
  const baseXp = Math.floor(Math.random() * 30) + 20; // 20 a 50 XP
  const { finalCoins, finalXp, bonusCoinsApplied, bonusXpApplied } = calculateBonusRewards(user, baseCoins, baseXp, 'work');

  let jobStory = '';
  try {
    const systemInstruction = 'Você é um gerador de relatos de trabalho engraçados para um bot de WhatsApp. Crie 1 frase curta (máximo 15 palavras) bem humorada e inusitada sobre um trabalho que o usuário acabou de realizar no Brasil. Não use aspas.';
    const prompt = 'Gere 1 história curta e hilária de trabalho inusitado que deu super certo.';
    const aiRes = await askAi(prompt, systemInstruction);
    if (aiRes) jobStory = aiRes.trim().replace(/^["']|["']$/g, '');
  } catch (_) {}

  if (!jobStory) {
    jobStory = fallbackJobs[Math.floor(Math.random() * fallbackJobs.length)];
  }

  const newWallet = user.wallet + finalCoins;
  const newXp = user.xp + finalXp;
  const nextLevelXp = Math.pow(user.level, 2) * 50;
  let newLevel = user.level;
  let levelUpMsg = '';

  if (newXp >= nextLevelXp) {
    newLevel += 1;
    levelUpMsg = `\n🎉 *LEVEL UP!* Você subiu para o *Nível ${newLevel}*! 🏆`;
  }

  updateUser(sender, {
    wallet: newWallet,
    xp: newXp,
    level: newLevel,
    last_work: now
  });

  const bonusCoinsStr = bonusCoinsApplied > 0 ? ` *(+$${bonusCoinsApplied.toLocaleString('pt-BR')} bônus)*` : '';
  const bonusXpStr = bonusXpApplied > 0 ? ` *(+${bonusXpApplied} XP bônus)*` : '';

  const text = `💼 *RELATÓRIO DE TRABALHO (IA)* 💼\n\n` +
               `📖 *O que aconteceu:* Você ${jobStory}!\n\n` +
               `💰 *Salário:* +$${finalCoins.toLocaleString('pt-BR')} moedas${bonusCoinsStr}\n` +
               `✨ *Experiência:* +${finalXp} XP${bonusXpStr}\n` +
               `💵 *Carteira Atual:* *$${newWallet.toLocaleString('pt-BR')}*${levelUpMsg}`;

  return sock.sendMessage(from, { text }, { quoted: msg });
}
