import { getUser, getDatabase } from '../../database/sqlite.js';
import { askAi } from '../../utils/aiService.js';
import { getUserStats, getAuraBuffs } from '../../utils/bonusCalculator.js';
import { formatDuration } from '../../utils/helpers.js';
import { getRebirthRequirements } from '../../config/rebirthConfig.js';

export async function handleRankCommand(sock, msg, sender, mentioned) {
  const from = msg.key.remoteJid;
  const target = mentioned[0] || msg.message?.extendedTextMessage?.contextInfo?.participant || sender;

  const user = getUser(target);
  const db = getDatabase();
  const userStats = getUserStats(user);

  let extraData = {};
  try {
    extraData = typeof user.extra_data === 'string' ? JSON.parse(user.extra_data || '{}') : (user.extra_data || {});
  } catch (_) {
    extraData = {};
  }

  // Casamento
  const infoCasamento = db.casamentos?.[target];
  let statusCivil = 'Solteiro(a) 🍃';
  const mentions = [target];

  if (infoCasamento) {
    const parceiro = infoCasamento.parceiro;
    const tempo = formatDuration(Date.now() - infoCasamento.since);
    statusCivil = `Casado(a) com @${parceiro.split('@')[0]} há ${tempo} 💍`;
    mentions.push(parceiro);
  }

  // XP & Progresso
  const xpForNextLevel = Math.pow(user.level, 2) * 50;
  const progress = Math.min(100, Math.floor((user.xp / xpForNextLevel) * 100));
  const totalMoney = user.wallet + user.bank;
  const prestige = extraData.prestige || 0;
  const prestigeStr = prestige > 0 ? `⭐ Prestígio ${'I'.repeat(prestige)} (+${prestige * 10}% bônus)` : 'Nenhum (0)';

  const rebirths = Number(user.rebirths || 0);
  const rebirthReq = rebirths > 0 ? getRebirthRequirements(rebirths) : null;
  const rebirthStr = rebirths > 0 ? `♻️ Rebirth ${rebirths} (${rebirthReq.rarity})` : 'Nenhum (0)';
  const titleStr = user.title ? ` ${user.title}` : '';
  const highestLevel = Math.max(Number(user.highest_level || 1), user.level);
  const highestMoney = Math.max(Number(user.highest_wallet || 0) + Number(user.highest_bank || 0), totalMoney);
  const highestAura = Math.max(Number(user.highest_aura || 0), user.aura || 0);

  // Aura
  const auraPoints = user.aura || 0;
  const auraBuff = getAuraBuffs(auraPoints);

  // Pet
  const pet = userStats.petInfo;
  const petStr = pet ? `${pet.name} (${pet.desc})` : 'Nenhum pet adotado (Use `/pet`)';

  // HP Status
  const hpStatusStr = userStats.isKnockedOut 
    ? '💀 *NOCAUTEADO (K.O.)* - Use `/curar`' 
    : `❤️ ${userStats.currentHp}/${userStats.maxHp} HP (Saudável)`;

  let heroMotto = '';
  try {
    const systemInstruction = 'Você é um narrador de jogos RPG épico e bem-humorado em um bot de WhatsApp. Escreva 1 lema curto e épico (máximo 12 palavras) de perfil do guerreiro. Não use aspas.';
    const prompt = `Crie 1 lema ou frase épica para um jogador ${userStats.classInfo.name} no nível ${user.level}.`;
    const res = await askAi(prompt, systemInstruction);
    if (res) heroMotto = res.trim().replace(/^["']|["']$/g, '');
  } catch (_) {}

  if (!heroMotto) {
    heroMotto = 'Na batalha diária de conversas do grupo, minha lâmina e minha palavra são lei!';
  }

  let inventoryCount = 0;
  try { inventoryCount = JSON.parse(user.inventory || '[]').length; } catch (_) {}

  const text = `╔═════════════════════════╗\n` +
               ` 📇 *FICHA ÚNICA DO GUERREIRO RPG* 📇 \n` +
               `╚═════════════════════════╝\n\n` +
               `👤 *Guerreiro:* @${target.split('@')[0]}${titleStr}\n` +
               `💍 *Status Civil:* ${statusCivil}\n` +
               `♻️ *Rebirth Endgame:* ${rebirthStr}\n\n` +
               `🎖️ *CLASSE & PROGRESSÃO:*\n` +
               `• *Classe:* ${userStats.classInfo.name} (Tier ${userStats.classInfo.tier})\n` +
               `• *Nível RPG:* Nível ${user.level} (${progress}% pro próx. nível)\n` +
               `• *XP Total:* ${user.xp.toLocaleString('pt-BR')} XP\n` +
               `• *Prestígio Supremo:* ${prestigeStr}\n\n` +
               `❤️ *STATUS DE COMBATE:*\n` +
               `• *HP do Jogador:* ${hpStatusStr}\n` +
               `• *Ataque Total:* ⚔️ ${userStats.totalAtk} Dano ATK\n` +
               `• *Arma Equipada:* ${userStats.equippedWeapon.name} (+${userStats.equippedWeapon.atk} ATK)\n` +
               `• *Armadura Equipada:* ${userStats.equippedArmor.name} (+${userStats.equippedArmor.hp} HP)\n\n` +
               `🌀 *ENERGIA ESPIRITUAL (AURA):*\n` +
               `• *Aura Acumulada:* ${auraPoints.toLocaleString('pt-BR')} pts (${auraBuff.title})\n` +
               `• *Buffs Ativos:* +${Math.round(auraBuff.xpCoinBonus * 100)}% Moedas/XP | +${auraBuff.bonusHp} HP | +${auraBuff.bonusAtk} ATK\n\n` +
               `🐾 *COMPANHEIRO PET:*\n` +
               `• ${petStr}\n\n` +
               `💰 *ECONOMIA & INVENTÁRIO:*\n` +
               `• 💵 *Carteira:* $${user.wallet.toLocaleString('pt-BR')}\n` +
               `• 🏦 *Banco:* $${user.bank.toLocaleString('pt-BR')}\n` +
               `• 💎 *Patrimônio Total:* $${totalMoney.toLocaleString('pt-BR')}\n` +
               `• 🎒 *Itens no Inventário:* ${inventoryCount} itens\n\n` +
               `🏆 *PICOS HISTÓRICOS (GLÓRIA PERMANENTE):*\n` +
               `• ⭐ *Maior Nível Atingido:* Nível ${highestLevel}\n` +
               `• 💰 *Maior Patrimônio:* $${highestMoney.toLocaleString('pt-BR')}\n` +
               `• ✨ *Maior Aura:* ${highestAura.toLocaleString('pt-BR')} pts\n\n` +
               `⚔️ *Lema do Guerreiro (IA):*\n` +
               `_"${heroMotto}"_`;

  return sock.sendMessage(from, { text, mentions }, { quoted: msg });
}
