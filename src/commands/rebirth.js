import { checkRebirthEligibility, performRebirthTransaction, getTopRebirthUsers } from '../database/RebirthRepository.js';
import { MOTIVATIONAL_REBIRTH_QUOTES } from '../config/rebirthConfig.js';

export async function handleRebirthCommand(sock, msg, command, args, sender) {
  const from = msg.key.remoteJid;
  const reply = async (text, mentions = []) => {
    await sock.sendMessage(from, { text, mentions: mentions.length > 0 ? mentions : undefined }, { quoted: msg });
  };

  const sub = (args[0] || '').toLowerCase().trim();

  if (sub === 'confirmar' || sub === 'confirm') {
    try {
      const res = await performRebirthTransaction(sender);
      const { targetLevel, req } = res;

      const successText = `🎉 *REBIRTH REALIZADO COM SUCESSO!* ♻️\n\n` +
                          `Você renasceu e transcendeu seus limites mortais!\n\n` +
                          `♻️ *Novo Status:* ${req.name} (${req.rarity})\n` +
                          `🏆 *Conquista Unlock:* ${req.achievement}\n` +
                          `🎖️ *Título Supremo:* ${req.title}\n` +
                          `✨ *Bônus Permanente:* +${Math.round(req.coinBonus * 100)}% Moedas | +${Math.round(req.xpBonus * 100)}% XP em todas as atividades!\n\n` +
                          `📜 *Seus picos históricos foram gravados com honra no seu perfil!*`;

      return reply(successText);
    } catch (err) {
      return reply(`❌ *REBIRTH FALHOU:* ${err.message}`);
    }
  }

  // Visualizar status e requisitos
  const eligibility = await checkRebirthEligibility(sender);
  const { req, currentStats, missing, eligible, targetLevel } = eligibility;

  const quote = MOTIVATIONAL_REBIRTH_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_REBIRTH_QUOTES.length)];

  if (!eligible) {
    const text = `❌ *REBIRTH INDISPONÍVEL*\n\n` +
                 `Você ainda não está preparado para realizar o **${req.name}** (${req.rarity}).\n\n` +
                 `📜 *REQUISITOS DO ${req.name.toUpperCase()}:*\n` +
                 `• 💰 *Patrimônio:* $${currentStats.totalMoney.toLocaleString('pt-BR')} / $${req.moneyReq.toLocaleString('pt-BR')}\n` +
                 `• ⭐ *XP Total:* ${currentStats.xp.toLocaleString('pt-BR')} / ${req.xpReq.toLocaleString('pt-BR')}\n` +
                 `• ✨ *Aura:* ${currentStats.aura.toLocaleString('pt-BR')} / ${req.auraReq.toLocaleString('pt-BR')}\n` +
                 `• 🎖️ *Nível RPG:* Nível ${currentStats.level} / ${req.levelReq}\n\n` +
                 `⏳ *FALTAM PARA O REBIRTH:*\n` +
                 (missing.money > 0 ? `• 💰 *$${missing.money.toLocaleString('pt-BR')}*\n` : '') +
                 (missing.xp > 0 ? `• ⭐ *${missing.xp.toLocaleString('pt-BR')} XP*\n` : '') +
                 (missing.aura > 0 ? `• ✨ *${missing.aura.toLocaleString('pt-BR')} pts de Aura*\n` : '') +
                 (missing.level > 0 ? `• 🎖️ *${missing.level} níveis*\n` : '') +
                 `\n💡 _"${quote}"_`;

    return reply(text);
  }

  // Elegível: Mostra confirmação
  const text = `⚠️ *CONFIRMAÇÃO DE REBIRTH* ⚠️\n\n` +
               `Você atingiu os requisitos supremos para realizar o **${req.name}** (${req.rarity})!\n\n` +
               `📉 *PROGRESSÃO QUE SERÁ SACRIFICADA:* \n` +
               `• 💸 *Carteira:* -$${currentStats.wallet.toLocaleString('pt-BR')}\n` +
               `• 🏦 *Banco:* -$${currentStats.bank.toLocaleString('pt-BR')}\n` +
               `• ⭐ *XP Acumulado:* -${currentStats.xp.toLocaleString('pt-BR')} XP\n` +
               `• ✨ *Aura Acumulada:* -${currentStats.aura.toLocaleString('pt-BR')} pts\n` +
               `• 🎖️ *Nível RPG:* Nível ${currentStats.level} → Nível 1\n\n` +
               `🎁 *RECOMPENSAS E BÔNUS PERMANENTES:*\n` +
               `• ♻️ *Novo Nível Rebirth:* ${req.name}\n` +
               `• 🏆 *Conquista:* ${req.achievement}\n` +
               `• ✨ *Bônus Permanente:* +${Math.round(req.coinBonus * 100)}% Moedas & +${Math.round(req.xpBonus * 100)}% XP\n` +
               `• 🎖️ *Título Especial:* ${req.title}\n\n` +
               `⚠️ *ATENÇÃO: Esta ação é IRREVERSÍVEL! Sua carteira, banco, XP, level e aura serão resetados.* \n` +
               `_(Seu histórico de picos, conquistas e itens permanecem salvos)._\n\n` +
               `Para confirmar, digite:\n\`/rebirth confirmar\``;

  return reply(text);
}

export async function handleTopRebirthCommand(sock, msg) {
  const from = msg.key.remoteJid;
  const reply = async (text, mentions = []) => {
    await sock.sendMessage(from, { text, mentions: mentions.length > 0 ? mentions : undefined }, { quoted: msg });
  };

  const topUsers = getTopRebirthUsers(10);
  if (topUsers.length === 0) {
    return reply('♻️ Nenhum jogador realizou Rebirth ainda no bot!');
  }

  const MEDALS = ['🥇', '🥈', '🥉'];
  const lines = [`♻️ *HALL DA FAMA — TOP REBIRTHS* ♻️\n`];
  const mentions = [];

  topUsers.forEach((u, idx) => {
    const medal = MEDALS[idx] || '🎈';
    const rebirths = Number(u.rebirths || 0);
    const title = u.title ? ` ${u.title}` : '';
    lines.push(`${medal} @${u.jid.split('@')[0]} — Rebirth ${rebirths}${title}`);
    mentions.push(u.jid);
  });

  return reply(lines.join('\n'), mentions);
}
