import { getUser, updateUser } from '../../database/sqlite.js';
import { askAi } from '../../utils/aiService.js';
import { calculateBonusRewards } from '../../utils/bonusCalculator.js';

const fallbackFortunes = [
  'Quem manda figurinha no grupo sempre encontra paz interior.',
  'Evite discussões sobre futebol hoje, o resultado pode ser desastroso.',
  'Seu saldo no bot vai crescer se você continuar firme na rotina!',
  'Hoje é um dia excelente para enviar memes e fazer novas amizades.',
  'Cuidado com quem pede Pix emprestado sem explicação!',
  'Sua sorte está brilhando mais que a tela do celular de madrugada.'
];

export async function handleDailyCommand(sock, msg, sender) {
  const from = msg.key.remoteJid;
  const user = getUser(sender);
  const now = Date.now();
  const COOLDOWN = 24 * 60 * 60 * 1000; // 24 horas
  const STREAK_LIMIT = 48 * 60 * 60 * 1000; // 48 horas para não perder o combo

  if (now - user.last_daily < COOLDOWN) {
    const remaining = COOLDOWN - (now - user.last_daily);
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    return sock.sendMessage(from, { text: `⏳ *RECOMPENSA JÁ RESGATADA!*\n\nVolte em *${hours}h ${minutes}m* para resgatar o seu bônus diário.` }, { quoted: msg });
  }

  // Calcular Sequência (Streak)
  let streak = user.daily_streak || 0;
  if (now - user.last_daily <= STREAK_LIMIT) {
    streak += 1;
  } else {
    streak = 1;
  }

  // Bônus proporcional à sequência
  const baseReward = Math.floor(Math.random() * 400) + 600; // $600 a $1000
  const streakBonus = (streak - 1) * 150;
  const rawReward = baseReward + streakBonus;
  const rawXp = 50 + (streak * 10);

  const { finalCoins, finalXp, bonusCoinsApplied, bonusXpApplied } = calculateBonusRewards(user, rawReward, rawXp, 'daily');

  // Gerar conselho / Biscoito da sorte com IA
  let fortune = '';
  try {
    const systemInstruction = 'Você é um oráculo divertido e sarcástico em um bot de WhatsApp. Escreva 1 conselho curto do Biscoito da Sorte (máximo 15 palavras) para o dia do usuário. Não use aspas.';
    const prompt = 'Dê um conselho de biscoito da sorte divertido e engraçado para hoje.';
    const aiRes = await askAi(prompt, systemInstruction);
    if (aiRes) fortune = aiRes.trim().replace(/^["']|["']$/g, '');
  } catch (_) {}

  if (!fortune) {
    fortune = fallbackFortunes[Math.floor(Math.random() * fallbackFortunes.length)];
  }

  const newWallet = user.wallet + finalCoins;
  const newXp = user.xp + finalXp;

  updateUser(sender, {
    wallet: newWallet,
    xp: newXp,
    daily_streak: streak,
    last_daily: now
  });

  const streakBadge = streak > 1 ? `🔥 *Sequência Diária:* ${streak} dias (+$${streakBonus} combo)` : `🔥 *Sequência Diária:* 1º dia (Mantenha o ritmo!)`;
  const bonusCoinsStr = bonusCoinsApplied > 0 ? ` *(+$${bonusCoinsApplied.toLocaleString('pt-BR')} bônus)*` : '';
  const bonusXpStr = bonusXpApplied > 0 ? ` *(+${bonusXpApplied} XP bônus)*` : '';

  const text = `🎁 *RECOMPENSA DIÁRIA RESGATADA!* 🎁\n\n` +
               `${streakBadge}\n` +
               `💰 *Moedas Recebidas:* +$${finalCoins.toLocaleString('pt-BR')}${bonusCoinsStr}\n` +
               `✨ *XP Recebido:* +${finalXp} XP${bonusXpStr}\n` +
               `💵 *Novo Saldo:* *$${newWallet.toLocaleString('pt-BR')}*\n\n` +
               `🥠 *Biscoito da Sorte da IA:*\n` +
               `_"${fortune}"_`;

  return sock.sendMessage(from, { text }, { quoted: msg });
}
