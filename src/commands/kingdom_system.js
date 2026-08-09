import { getUser, updateUser } from '../database/sqlite.js';
import { getUserStats } from '../utils/bonusCalculator.js';
import { askAi } from '../utils/aiService.js';
import { HOUSES } from './bank_market.js';

// Utilitário para extrair e montar dados do reino do jogador
export function getKingdomData(user) {
  if (!user) return null;

  let extraData = {};
  try {
    extraData = typeof user.extra_data === 'string' ? JSON.parse(user.extra_data || '{}') : (user.extra_data || {});
  } catch (_) {
    extraData = {};
  }

  const houses = extraData.houses || [];
  const royalProperties = houses.filter(h => ['vila', 'reinopequeno', 'imperio'].includes(h));
  const isMonarch = royalProperties.length > 0;

  let highestProperty = null;
  if (houses.includes('imperio')) highestProperty = HOUSES.imperio;
  else if (houses.includes('reinopequeno')) highestProperty = HOUSES.reinopequeno;
  else if (houses.includes('vila')) highestProperty = HOUSES.vila;

  const monarchyTitle = extraData.monarchy_title || (highestProperty ? highestProperty.title : null);

  const kingdomUpgrades = extraData.kingdom_upgrades || {
    army: 1,      // Armamento do Exército (1-5)
    supplies: 1,  // Granjas & Suprimentos (1-5)
    walls: 1      // Muralhas do Castelo (1-5)
  };

  const alliance = extraData.kingdom_alliance || null; // JID do reino aliado
  const lastCollect = extraData.last_resource_collect || 0;
  const lastWar = extraData.last_kingdom_war || 0;

  return {
    extraData,
    houses,
    royalProperties,
    isMonarch,
    highestProperty,
    monarchyTitle,
    kingdomUpgrades,
    alliance,
    lastCollect,
    lastWar
  };
}

// Armazena propostas de aliança pendentes em memória (targetJid -> proposerJid)
const allianceProposals = new Map();

export async function handleKingdomCommands(sock, msg, command, args, sender) {
  const from = msg.key.remoteJid;
  const reply = async (text, mentions = []) => {
    await sock.sendMessage(from, { text, mentions }, { quoted: msg });
  };

  const user = getUser(sender);
  const kd = getKingdomData(user);

  switch (command) {
    case 'reino':
    case 'reinos': {
      const sub = args[0]?.toLowerCase();

      // Subcomando: /reino guilda ou /reino coletar
      if (sub === 'guilda' || sub === 'coletar' || sub === 'recursos') {
        if (!kd.isMonarch) {
          return reply('🏰 *APENAS MONARCAS!*\n\nVocê precisa possuir ao menos uma **Vila Pequena**, **Pequeno Reino** ou **Império Soberano** em `/casas` para liderar a Guilda de Recursos do Reino.');
        }

        const now = Date.now();
        const COLLECT_COOLDOWN = 4 * 60 * 60 * 1000; // 4 horas

        if (now - kd.lastCollect < COLLECT_COOLDOWN) {
          const remaining = COLLECT_COOLDOWN - (now - kd.lastCollect);
          const hours = Math.floor(remaining / (1000 * 60 * 60));
          const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
          return reply(`⏳ *SUAS MINAS E EXPEDIÇÕES ESTÃO EM RECOMPOSIÇÃO!*\n\nSua guilda de artesãos e camponeses está processando a colheita anterior.\n⏱️ *Próxima coleta em:* *${hours}h ${minutes}m*`);
        }

        // Cálculo de recursos baseado no reino e upgrades de suprimentos
        const baseResourceMoney = kd.highestProperty.dailyBonus * 0.75;
        const suppliesBonusPct = (kd.kingdomUpgrades.supplies - 1) * 0.20; // +20% por nível
        const allianceBonusPct = kd.alliance ? 0.15 : 0.0; // +15% com aliança ativa

        const totalEarned = Math.round(baseResourceMoney * (1 + suppliesBonusPct + allianceBonusPct));
        const newWallet = user.wallet + totalEarned;

        kd.extraData.last_resource_collect = now;
        updateUser(sender, {
          wallet: newWallet,
          extra_data: JSON.stringify(kd.extraData)
        });

        const allianceStr = kd.alliance ? '\n🤝 *Bônus de Aliança Diplomática:* +15%' : '';

        return reply(`🌾 *EXPEDIÇÃO DA GUILDA DO REINO CONCLUÍDA!* 🏰\n\n` +
                     `👑 *Monarca:* @${sender.split('@')[0]} (${kd.monarchyTitle})\n` +
                     `💰 *Recursos Colhidos (Impostos & Ouro):* **+$${totalEarned.toLocaleString('pt-BR')}** moedas!\n` +
                     `📊 *Nível de Suprimentos do Povo:* Nível ${kd.kingdomUpgrades.supplies} (+${Math.round(suppliesBonusPct * 100)}% bônus)${allianceStr}\n\n` +
                     `💵 *Saldo Atualizado:* $${newWallet.toLocaleString('pt-BR')}\n` +
                     `⏱️ *Próxima expedição em:* 4 horas.`, [sender]);
      }

      // Subcomando: /reino alianca
      if (sub === 'alianca' || sub === 'aliança') {
        if (!kd.isMonarch) {
          return reply('🏰 *APENAS MONARCAS!*\n\nVocê precisa possuir um reino em `/casas` para firmar pactos diplomáticos.');
        }

        const action = args[1]?.toLowerCase();

        if (action === 'aceitar') {
          const proposerJid = allianceProposals.get(sender);
          if (!proposerJid) {
            return reply('⚠️ Você não possui nenhuma proposta de aliança diplomática pendente.');
          }

          const proposerUser = getUser(proposerJid);
          const proposerKd = getKingdomData(proposerUser);

          kd.extraData.kingdom_alliance = proposerJid;
          proposerKd.extraData.kingdom_alliance = sender;

          updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });
          updateUser(proposerJid, { extra_data: JSON.stringify(proposerKd.extraData) });

          allianceProposals.delete(sender);

          return reply(`🤝 *PACTO DIPLOMÁTICO SELADO COM SUCESSO!* 👑\n\n` +
                       `Os reinos de @${sender.split('@')[0]} (*${kd.monarchyTitle}*) e @${proposerJid.split('@')[0]} (*${proposerKd.monarchyTitle}*) agora são **REINOS ALIANÇADOS**!\n\n` +
                       `✨ *BENEFÍCIOS DA ALIANÇA:*\n` +
                       `• 🕊️ Pacto de Não-Agressão (Impossível declarar guerra entre si)\n` +
                       `• 🌾 +15% Bônus em expedições de recursos da guilda\n` +
                       `• 🛡️ +25% Suporte defensivo em guerras contra reinos rivais!`, [sender, proposerJid]);
        }

        if (action === 'desfazer' || action === 'cancelar') {
          if (!kd.alliance) return reply('⚠️ Seu reino não possui nenhuma aliança ativa.');

          const allyJid = kd.alliance;
          const allyUser = getUser(allyJid);
          const allyKd = getKingdomData(allyUser);

          delete kd.extraData.kingdom_alliance;
          if (allyKd) {
            delete allyKd.extraData.kingdom_alliance;
            updateUser(allyJid, { extra_data: JSON.stringify(allyKd.extraData) });
          }

          updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });

          return reply(`💔 *PACTO DIPLOMÁTICO ROMPIDO!*\n\nA aliança diplomática entre os reinos de @${sender.split('@')[0]} e @${allyJid.split('@')[0]} foi encerrada.`, [sender, allyJid]);
        }

        // Propor aliança marcando outro rei
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const targetJid = mentioned[0];

        if (!targetJid) {
          if (kd.alliance) {
            return reply(`🤝 *STATUS DA SUA ALIANÇA REAL*\n\nSeu reino é atualmente aliado do reino de @${kd.alliance.split('@')[0]}!\n\n💡 Use \`/reino alianca desfazer\` para romper o tratado.`, [kd.alliance]);
          }
          return reply('⚠️ Marque outro monarca para propor uma aliança diplomática!\nExemplo: `/reino alianca @marcarRei`');
        }

        if (targetJid === sender) return reply('⚠️ Você não pode criar uma aliança com o seu próprio reino!');

        const targetUser = getUser(targetJid);
        const targetKd = getKingdomData(targetUser);

        if (!targetKd.isMonarch) {
          return reply(`⚠️ @${targetJid.split('@')[0]} não possui um reino para aceitar uma aliança!`, [targetJid]);
        }

        allianceProposals.set(targetJid, sender);

        return reply(`📜 *PROPOSTA DE ALIANÇA DIPLOMÁTICA!* 🤝\n\n` +
                     `@${sender.split('@')[0]} (*${kd.monarchyTitle}*) enviou uma proposta de tratado de aliança para @${targetJid.split('@')[0]} (*${targetKd.monarchyTitle}*)!\n\n` +
                     `👉 Para aceitar a união dos reinos, @${targetJid.split('@')[0]} deve digitar: \`/reino alianca aceitar\``, [sender, targetJid]);
      }

      // Card Principal de Status do Reino
      if (!kd.isMonarch) {
        return reply(`🏰 *SISTEMA DE MONARQUIA & REINOS* 🏰\n\n` +
                     `Você ainda não possui um título de nobreza!\n` +
                     `Compre um dos seguintes domínios em \`/casas\` para se tornar um monarca:\n\n` +
                     `• 🏕️ *Vila Pequena* ($500.000) ➔ Título: Lorde / Lady\n` +
                     `• 🏰 *Pequeno Reino* ($1.500.000) ➔ Título: Rei / Rainha\n` +
                     `• 👑 *Império Soberano* ($5.000.000) ➔ Título: Imperador / Imperatriz\n\n` +
                     `✨ Monarcas desbloqueiam: *Guerra de Reinos (PVP)*, *Guilda de Recursos*, *Loja Real* e *Alianças Diplomáticas*!`);
      }

      const userStats = getUserStats(user);
      const armyAtk = userStats.totalAtk + ((kd.kingdomUpgrades.army - 1) * 50);
      const wallHp = userStats.maxHp + ((kd.kingdomUpgrades.walls - 1) * 300);
      const allyStr = kd.alliance ? `@${kd.alliance.split('@')[0]} (Pacto Ativo)` : 'Nenhuma aliança diplomática';
      const mentions = [sender];
      if (kd.alliance) mentions.push(kd.alliance);

      const text = `🏰 *PAINEL REAL DO REINO DE NOBREZA* 👑\n\n` +
                   `👤 *Monarca Soberano:* @${sender.split('@')[0]}\n` +
                   `🎖️ *Título Nobre:* **${kd.monarchyTitle}**\n` +
                   `🏰 *Domínio Principal:* ${kd.highestProperty.name}\n\n` +
                   `⚔️ *EXÉRCITO & PODER DE GUERRA:*\n` +
                   `• ⚔️ *Nível de Armamento:* Nível ${kd.kingdomUpgrades.army} (+${(kd.kingdomUpgrades.army - 1) * 50} ATK)\n` +
                   `• 🏰 *Fortificação de Muralhas:* Nível ${kd.kingdomUpgrades.walls} (+${(kd.kingdomUpgrades.walls - 1) * 300} HP Defensivo)\n` +
                   `• 🌾 *Suprimentos do Povo:* Nível ${kd.kingdomUpgrades.supplies} (+${(kd.kingdomUpgrades.supplies - 1) * 20}% Impostos)\n\n` +
                   `🤝 *Aliança Diplomática:* ${allyStr}\n\n` +
                   `💡 *Comandos do Reino:*\n` +
                   `• \`/reino guilda\` ➔ Coletar impostos e recursos (cooldown 4h)\n` +
                   `• \`/lojareino\` ➔ Evoluir exército, suprimentos e fortificações\n` +
                   `• \`/guerra @reiInimigo\` ➔ Declarar guerra contra outro reino rival\n` +
                   `• \`/reino alianca @rei\` ➔ Propor pacto diplomático`;

      return reply(text, mentions);
    }

    case 'lojareino':
    case 'reinoloja': {
      if (!kd.isMonarch) {
        return reply('🏰 *APENAS MONARCAS!*\n\nCompre uma Vila, Reino ou Império em `/casas` para acessar a Loja de Evolução Real.');
      }

      const sub = args[0]?.toLowerCase();

      if (sub === 'comprar') {
        const upgradeKey = args[1]?.toLowerCase();

        if (upgradeKey === 'exercito') {
          const currentLvl = kd.kingdomUpgrades.army || 1;
          if (currentLvl >= 5) return reply('⚠️ Seu exército já atingiu o **Nível Máximo 5**!');
          const price = 50000 + (currentLvl * 50000);
          if (user.wallet < price) return reply(`⚠️ Você precisa de **$${price.toLocaleString('pt-BR')}** na carteira para evoluir o exército.`);

          if (!kd.extraData.kingdom_upgrades) kd.extraData.kingdom_upgrades = { army: 1, supplies: 1, walls: 1 };
          kd.extraData.kingdom_upgrades.army = currentLvl + 1;
          const newWallet = user.wallet - price;
          updateUser(sender, { wallet: newWallet, extra_data: JSON.stringify(kd.extraData) });
          return reply(`⚔️ *ARMAMENTO DO EXÉRCITO EVOLUÍDO!*\n\nSeu exército avançou para o **Nível ${currentLvl + 1}**! (+50 ATK em guerras!)`);
        }

        if (upgradeKey === 'suprimentos') {
          const currentLvl = kd.kingdomUpgrades.supplies || 1;
          if (currentLvl >= 5) return reply('⚠️ Granjas e suprimentos já atingiram o **Nível Máximo 5**!');
          const price = 40000 + (currentLvl * 40000);
          if (user.wallet < price) return reply(`⚠️ Você precisa de **$${price.toLocaleString('pt-BR')}** na carteira para expandir as granjas.`);

          if (!kd.extraData.kingdom_upgrades) kd.extraData.kingdom_upgrades = { army: 1, supplies: 1, walls: 1 };
          kd.extraData.kingdom_upgrades.supplies = currentLvl + 1;
          const newWallet = user.wallet - price;
          updateUser(sender, { wallet: newWallet, extra_data: JSON.stringify(kd.extraData) });
          return reply(`🌾 *GRANJAS & SUPRIMENTOS EXPANDIDOS!*\n\nSuprimentos avançaram para o **Nível ${currentLvl + 1}**! (+20% em impostos do daily/guilda!)`);
        }

        if (upgradeKey === 'muralha') {
          const currentLvl = kd.kingdomUpgrades.walls || 1;
          if (currentLvl >= 5) return reply('⚠️ Suas fortificações de castelo já atingiram o **Nível Máximo 5**!');
          const price = 60000 + (currentLvl * 60000);
          if (user.wallet < price) return reply(`⚠️ Você precisa de **$${price.toLocaleString('pt-BR')}** na carteira para reforçar as muralhas.`);

          if (!kd.extraData.kingdom_upgrades) kd.extraData.kingdom_upgrades = { army: 1, supplies: 1, walls: 1 };
          kd.extraData.kingdom_upgrades.walls = currentLvl + 1;
          const newWallet = user.wallet - price;
          updateUser(sender, { wallet: newWallet, extra_data: JSON.stringify(kd.extraData) });
          return reply(`🏰 *MURALHAS DO CASTELO REFORÇADAS!*\n\nFortificações avançaram para o **Nível ${currentLvl + 1}**! (+300 HP Defensivo contra invasões!)`);
        }

        return reply('⚠️ Escolha uma melhoria válida: `exercito`, `suprimentos` ou `muralha`.\nExemplo: `/lojareino comprar exercito`');
      }

      const armyLvl = kd.kingdomUpgrades.army;
      const suppliesLvl = kd.kingdomUpgrades.supplies;
      const wallLvl = kd.kingdomUpgrades.walls;

      const armyPrice = armyLvl < 5 ? (50000 + (armyLvl * 50000)).toLocaleString('pt-BR') : 'MÁXIMO';
      const suppliesPrice = suppliesLvl < 5 ? (40000 + (suppliesLvl * 40000)).toLocaleString('pt-BR') : 'MÁXIMO';
      const wallPrice = wallLvl < 5 ? (60000 + (wallLvl * 60000)).toLocaleString('pt-BR') : 'MÁXIMO';

      const text = `🏪 *LOJA DE MELHORIAS DO REINO* 👑\n\n` +
                   `Adquira evoluções usando \`/lojareino comprar <opçao>\`:\n\n` +
                   `⚔️ *1. Armamento do Exército (Nível Atual: ${armyLvl}/5)*\n` +
                   `  • *Efeito:* +50 ATK por nível nas guerras de reinos\n` +
                   `  • *Preço:* $${armyPrice} moedas ➔ \`/lojareino comprar exercito\`\n\n` +
                   `🌾 *2. Granjas & Suprimentos (Nível Atual: ${suppliesLvl}/5)*\n` +
                   `  • *Efeito:* +20% no rendimento diário de impostos da guilda/daily\n` +
                   `  • *Preço:* $${suppliesPrice} moedas ➔ \`/lojareino comprar suprimentos\`\n\n` +
                   `🏰 *3. Fortificação de Muralhas (Nível Atual: ${wallLvl}/5)*\n` +
                   `  • *Efeito:* +300 HP/Defesa do Castelo contra invasores\n` +
                   `  • *Preço:* $${wallPrice} moedas ➔ \`/lojareino comprar muralha\``;

      return reply(text);
    }

    case 'guerra':
    case 'guerras': {
      if (!kd.isMonarch) {
        return reply('🏰 *APENAS MONARCAS!*\n\nVocê precisa possuir um reino em `/casas` para declarar guerra a reinos rivais.');
      }

      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const targetJid = mentioned[0];

      if (!targetJid) {
        return reply('⚠️ Marque o monarca rival contra quem deseja declarar guerra!\nExemplo: `/guerra @marcarRei`');
      }

      if (targetJid === sender) {
        return reply('⚠️ Você não pode declarar guerra contra o seu próprio reino!');
      }

      // Impedir guerra se forem aliados
      if (kd.alliance === targetJid) {
        return reply(`🤝 *PACTO DIPLOMÁTICO ATIVO!*\n\nSeu reino possui uma aliança diplomática com o reino de @${targetJid.split('@')[0]}. Rompa o tratado com \`/reino alianca desfazer\` para declarar guerra.`, [targetJid]);
      }

      const targetUser = getUser(targetJid);
      const targetKd = getKingdomData(targetUser);

      if (!targetKd.isMonarch) {
        return reply(`⚠️ @${targetJid.split('@')[0]} não possui um reino/território para batalhar!`, [targetJid]);
      }

      const now = Date.now();
      const WAR_COOLDOWN = 2 * 60 * 60 * 1000; // Cooldown de 2 horas entre guerras
      if (now - kd.lastWar < WAR_COOLDOWN) {
        const remaining = WAR_COOLDOWN - (now - kd.lastWar);
        const minutes = Math.floor(remaining / (1000 * 60));
        return reply(`⏳ *SEUS EXÉRCITOS ESTÃO REAGRUPANDO!*\n\nAguarde *${minutes} minutos* antes de declarar outra grande guerra de reinos.`);
      }

      // Cálculo de Poder de Guerra
      const attackerStats = getUserStats(user);
      const defenderStats = getUserStats(targetUser);

      let attackerPower = (attackerStats.totalAtk * 2) + ((kd.kingdomUpgrades.army - 1) * 100) + Math.floor(Math.random() * 200) + 100;
      let defenderPower = (defenderStats.maxHp) + ((targetKd.kingdomUpgrades.walls - 1) * 300) + Math.floor(Math.random() * 200) + 100;

      // Suporte de Aliança no Defensor (+25% se o defensor tiver aliado)
      if (targetKd.alliance) {
        defenderPower = Math.round(defenderPower * 1.25);
      }

      kd.extraData.last_kingdom_war = now;
      updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });

      const attackerWon = attackerPower >= defenderPower;
      const mentions = [sender, targetJid];

      if (attackerWon) {
        const lootPct = 0.20; // 20% do saldo na carteira
        const stolenMoney = Math.floor(targetUser.wallet * lootPct);

        updateUser(targetJid, { wallet: Math.max(0, targetUser.wallet - stolenMoney) });
        updateUser(sender, { wallet: user.wallet + stolenMoney });

        const sys = 'Você é um cronista épico de guerras medievais e batalhas de impérios. Escreva 1 relato vibrante de 20 palavras sobre o exército conquistando a fortaleza inimiga e erguendo a bandeira real. Sem aspas.';
        const prompt = `O rei @${sender.split('@')[0]} venceu a guerra contra o reino de @${targetJid.split('@')[0]} e saqueou $${stolenMoney}.`;
        const aiStory = await askAi(prompt, sys) || 'As catapultas derrubaram as muralhas inimigas e o exército marchou vitorioso!';

        const text = `⚔️ *GUERRA DE REINOS — VITÓRIA IMPERIAL!* 🏆\n\n` +
                     `🚩 *Atacante:* @${sender.split('@')[0]} (*Poder:* ${attackerPower})\n` +
                     `🛡️ *Defensor:* @${targetJid.split('@')[0]} (*Poder:* ${defenderPower})\n\n` +
                     `💰 *SAQUE DE GUERRA:* O exército vitorioso pilhou **$${stolenMoney.toLocaleString('pt-BR')}** do tesouro inimigo!\n\n` +
                     `📜 *Crônica da Guerra (IA):*\n_"${aiStory}"_\n\n` +
                     `⏱️ *Próxima guerra disponível em:* 2 horas.`;

        return reply(text, mentions);
      } else {
        const fine = Math.floor(user.wallet * 0.15) + 2000;
        updateUser(sender, { wallet: Math.max(0, user.wallet - fine) });
        updateUser(targetJid, { wallet: targetUser.wallet + fine });

        const sys = 'Você é um cronista de guerras medievais. Escreva 1 relato ágil de 20 palavras sobre as defesas inabaláveis do castelo repelindo o exército invasor. Sem aspas.';
        const prompt = `O exército de @${sender.split('@')[0]} foi derrotado pelas muralhas imponentes de @${targetJid.split('@')[0]}.`;
        const aiStory = await askAi(prompt, sys) || 'As muralhas do castelo resistiram bravamente e os invasores recuaram!';

        const text = `🛡️ *GUERRA DE REINOS — DEFESA INABALÁVEL!* 🏰\n\n` +
                     `🚩 *Invasor:* @${sender.split('@')[0]} (*Poder:* ${attackerPower})\n` +
                     `🛡️ *Defensor:* @${targetJid.split('@')[0]} (*Poder:* ${defenderPower})\n\n` +
                     `💸 *DERROTA DO INVASOR:* As forças invasoras recuaram e pagaram **$${fine.toLocaleString('pt-BR')}** em reparações de guerra!\n\n` +
                     `📜 *Crônica da Guerra (IA):*\n_"${aiStory}"_`;

        return reply(text, mentions);
      }
    }
  }
}
