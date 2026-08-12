import { getUser, updateUser, getStore } from '../database/sqlite.js';
import { askAi } from '../utils/aiService.js';
import { HOUSES } from './bank_market.js';

// Estutura e inicialização padrão dos dados do reino
export function getKingdomData(user) {
  if (!user) return null;

  let extraData = {};
  try {
    extraData = typeof user.extra_data === 'string' ? JSON.parse(user.extra_data || '{}') : (user.extra_data || {});
  } catch (_) {
    extraData = {};
  }

  // Compatibilidade com sistema anterior de casas/monarquia
  const houses = extraData.houses || [];
  const royalProperties = houses.filter(h => ['vila', 'reinopequeno', 'imperio'].includes(h));
  const hasMonarchyHouse = royalProperties.length > 0;

  let kData = extraData.kingdom || null;

  // Migração/inicialização automática se o jogador já possuir casa real mas não tiver objeto de reino completo
  if (!kData && hasMonarchyHouse) {
    let initialName = 'Reino de Nobreza';
    if (houses.includes('imperio')) initialName = 'Império Soberano';
    else if (houses.includes('reinopequeno')) initialName = 'Reino de Eldoria';
    else if (houses.includes('vila')) initialName = 'Vila de Valoria';

    kData = createDefaultKingdom(initialName);
    extraData.kingdom = kData;
    updateUser(user.jid, { extra_data: JSON.stringify(extraData) });
  }

  if (kData) {
    // Garantir que todos os campos existam mesmo se criados em versões anteriores
    kData = sanitizeKingdomObject(kData);
  }

  const isMonarch = !!kData;

  return {
    extraData,
    kingdom: kData,
    isMonarch,
    houses,
    hasMonarchyHouse
  };
}

// Criação do objeto inicial do reino
function createDefaultKingdom(name) {
  return {
    name: name || 'Reino sem Nome',
    level: 1,
    xp: 0,
    specialization: null, // 'militar', 'comercial', 'agricola', 'defensiva', 'populacional'
    treasury: 50000,
    tax_rate: 10, // 10%
    satisfaction: 100, // 0-100%
    daily_withdrawal_today: 0,
    last_withdrawal_reset: Date.now(),
    population: 50,
    resources: {
      food: 500,
      wood: 300,
      stone: 200,
      iron: 100
    },
    buildings: {
      town_center: 1, // Centro do Reino
      houses: 1,      // Habitações
      farms: 1,       // Fazendas
      mines: 1,       // Minas & Serrarias
      markets: 1,     // Mercados
      barracks: 1,    // Quartéis
      walls: 1        // Muralhas & Torres
    },
    workers: {
      farmer: 10,
      lumberjack: 10,
      miner: 10,
      merchant: 10,
      soldier: 0
    },
    army: {
      soldiers: 10,
      equipment_level: 1,
      generals: []
    },
    alliance: null,
    marriage: null,
    last_collect: 0,
    last_war: 0,
    conquered_kingdoms: []
  };
}

// Sanitização de segurança dos dados do reino
function sanitizeKingdomObject(k) {
  if (!k.resources) k.resources = { food: 500, wood: 300, stone: 200, iron: 100 };
  if (!k.buildings) k.buildings = { town_center: 1, houses: 1, farms: 1, mines: 1, markets: 1, barracks: 1, walls: 1 };
  if (!k.workers) k.workers = { farmer: 10, lumberjack: 10, miner: 10, merchant: 10, soldier: 0 };
  if (!k.army) k.army = { soldiers: 10, equipment_level: 1, generals: [] };
  if (k.treasury === undefined) k.treasury = 50000;
  if (k.tax_rate === undefined) k.tax_rate = 10;
  if (k.satisfaction === undefined) k.satisfaction = 100;
  if (!k.conquered_kingdoms) k.conquered_kingdoms = [];
  if (k.daily_withdrawal_today === undefined) k.daily_withdrawal_today = 0;
  if (!k.last_withdrawal_reset) k.last_withdrawal_reset = Date.now();
  return k;
}

// Armazena propostas pendentes em memória
const allianceProposals = new Map();
const marriageProposals = new Map();

// --- CÁLCULOS DE LIMITES E PODER ---
export function calculateKingdomLimits(k) {
  const tc = k.buildings.town_center || 1;
  const h = k.buildings.houses || 1;
  const b = k.buildings.barracks || 1;
  const spec = k.specialization;

  const basePopMax = (tc * 100) + (h * 50);
  const maxPopulation = Math.round(basePopMax * (spec === 'populacional' ? 1.5 : 1.0));

  const baseArmyMax = (tc * 25) + (b * 25);
  const maxArmy = Math.round(baseArmyMax * (spec === 'militar' ? 1.25 : 1.0));

  const dailyWithdrawalLimit = 100000 + (tc * 50000);

  return { maxPopulation, maxArmy, dailyWithdrawalLimit };
}

export function calculateMilitaryPower(k, isAttacker = true, allyKingdom = null) {
  const army = k.army || { soldiers: 0, equipment_level: 1, generals: [] };
  const spec = k.specialization;
  const walls = k.buildings?.walls || 1;

  let basePower = army.soldiers * (15 + (army.equipment_level * 15));

  // Generais
  let generalBonus = 1.0;
  if (army.generals.includes('Valerio') && isAttacker) generalBonus += 0.25;
  if (army.generals.includes('Breno') && !isAttacker) generalBonus += 0.35;
  if (army.generals.includes('Aurelius')) generalBonus += 0.15;

  // Especialização
  let specBonus = 1.0;
  if (spec === 'militar' && isAttacker) specBonus += 0.35;
  if (spec === 'defensiva' && !isAttacker) specBonus += 0.50;

  let totalPower = Math.round(basePower * generalBonus * specBonus);

  // Se for defensor, soma poder das muralhas
  if (!isAttacker) {
    const wallPower = walls * 400;
    totalPower += wallPower;

    // Suporte do reino aliado
    if (allyKingdom) {
      const allyPower = calculateMilitaryPower(allyKingdom, false, null);
      totalPower += Math.round(allyPower * 0.25);
    }
  }

  return totalPower;
}

export function calculateKingdomReputation(k) {
  const pop = k.population || 0;
  const treasury = k.treasury || 0;
  const armyCount = k.army?.soldiers || 0;
  const bLvlSum = Object.values(k.buildings || {}).reduce((a, b) => a + b, 0);

  return Math.round((pop * 10) + (treasury / 1000) + (armyCount * 20) + (bLvlSum * 50));
}

// --- MAIN HANDLER DE COMANDOS DE REINO & GUERRA ---
export async function handleKingdomCommands(sock, msg, command, args, sender, mentioned = []) {
  const from = msg.key.remoteJid;
  const reply = async (text, mentions = []) => {
    await sock.sendMessage(from, { text, mentions }, { quoted: msg });
  };

  const user = getUser(sender);
  if (!user) return reply('⚠️ Usuário não encontrado no banco de dados.');

  const kd = getKingdomData(user);

  // Roteamento de comandos e subcomandos
  const subCommand = args[0]?.toLowerCase();

  // COMANDO: /reinorank ou /reino ranking
  if (command === 'reinorank' || command === 'rankingreino' || (command === 'reino' && (subCommand === 'ranking' || subCommand === 'rank'))) {
    return handleKingdomRanking(reply);
  }

  // COMANDO: /guerra
  if (command === 'guerra' || command === 'guerras') {
    return handleWarCommand(sock, msg, reply, user, kd, args, sender);
  }

  // COMANDO: /alianca
  if (command === 'alianca' || command === 'aliança') {
    return handleAllianceCommand(reply, sender, kd, args, msg);
  }

  // COMANDO: /casamentoreal
  if (command === 'casamentoreal' || (command === 'reino' && subCommand === 'casamento')) {
    return handleMarriageCommand(reply, sender, kd, args, msg);
  }

  // COMANDOS DE REINO PRINCIPAL (/reino)
  if (command === 'reino' || command === 'reinos' || command === 'lojareino' || command === 'reinoloja') {
    if (!subCommand || subCommand === 'painel' || subCommand === 'status') {
      return renderKingdomMainPanel(reply, sender, kd);
    }

    switch (subCommand) {
      case 'comprar':
      case 'criar':
      case 'fundar':
        return handleBuyKingdom(reply, sender, user, kd, args);

      case 'renomear':
        return handleRenameKingdom(reply, sender, user, kd, args);

      case 'construir':
      case 'evoluir':
      case 'loja':
        return handleBuildUpgrade(reply, sender, user, kd, args);

      case 'recrutar':
        return handleRecruitPopulation(reply, sender, user, kd, args);

      case 'trabalhadores':
      case 'trabalhar':
        return handleManageWorkers(reply, sender, user, kd, args);

      case 'coletar':
      case 'guilda':
      case 'recursos':
        return handleCollectResources(reply, sender, user, kd);

      case 'imposto':
      case 'impostos':
        return handleSetTax(reply, sender, user, kd, args);

      case 'sacar':
        return handleWithdrawTreasury(reply, sender, user, kd, args);

      case 'depositar':
        return handleDepositTreasury(reply, sender, user, kd, args);

      case 'especializar':
      case 'especializacao':
        return handleSpecialization(reply, sender, user, kd, args);

      case 'treinar':
      case 'exercito':
        return handleTrainArmy(reply, sender, user, kd, args);

      case 'equipamentos':
      case 'equip':
        return handleUpgradeEquipment(reply, sender, user, kd, args);

      case 'general':
      case 'generais':
        return handleGenerals(reply, sender, user, kd, args);

      case 'comercio':
      case 'vender':
      case 'comprarrecurso':
        return handleResourceMarket(reply, sender, user, kd, args);

      case 'conquistados':
        return handleListConqueredKingdoms(reply, sender, kd);

      case 'ajuda':
      case 'comandos':
      default:
        return renderKingdomHelp(reply);
    }
  }
}

// ==========================================
// SUB-HANDLERS DE FUNCIONALIDADES
// ==========================================

// 1. Painel Principal do Reino
function renderKingdomMainPanel(reply, sender, kd) {
  if (!kd.isMonarch) {
    return reply(`🏰 *SISTEMA COMPLETO DE REINOS & IMPÉRIOS* 👑\n\n` +
                 `Você ainda não possui um Reino sob sua coroa!\n\n` +
                 `💡 *Como fundar o seu reino:*\n` +
                 `Utilize o comando: \`/reino comprar <Nome do Seu Reino>\`\n` +
                 `• *Custo de Fundação:* **$200.000 moedas** (ou possuir um título em \`/casas\`)\n\n` +
                 `✨ *Monarcas desbloqueiam:*\n` +
                 `• 👥 Gestão de População & Recrutamento\n` +
                 `• 🌾 Produção de Comida, Madeira, Pedra e Ferro\n` +
                 `• 🪙 Tesouro do Reino & Cobrança de Impostos\n` +
                 `• ⚔️ Exército, Treinamento, Equipamentos & Generais\n` +
                 `• 🏰 Construções & Fortificação de Muralhas\n` +
                 `• 📜 Guerras de Conquista & Anexação de Territórios!`);
  }

  const k = kd.kingdom;
  const limits = calculateKingdomLimits(k);
  const rep = calculateKingdomReputation(k);
  const atkPower = calculateMilitaryPower(k, true);
  const defPower = calculateMilitaryPower(k, false);

  const specStr = k.specialization ? k.specialization.toUpperCase() : 'Nenhuma (Requer Nível 3)';
  const allyStr = k.alliance ? `@${k.alliance.split('@')[0]}` : 'Nenhuma';
  const marriageStr = k.marriage ? `@${k.marriage.split('@')[0]}` : 'Solteiro(a)';

  // Reset de limite diário de saque
  const now = Date.now();
  if (now - k.last_withdrawal_reset > 24 * 60 * 60 * 1000) {
    k.daily_withdrawal_today = 0;
    k.last_withdrawal_reset = now;
  }

  const availableWithdrawal = Math.max(0, limits.dailyWithdrawalLimit - k.daily_withdrawal_today);

  const text = `🏰 *PAINEL IMPERIAL DO REINO DE NOBREZA* 👑\n\n` +
               `👑 *Monarca Soberano:* @${sender.split('@')[0]}\n` +
               `🏰 *Nome do Reino:* **${k.name}**\n` +
               `🏆 *Nível do Reino:* Nível ${k.level} (${k.xp} XP) | *Reputação:* ⭐ ${rep}\n` +
               `📜 *Especialização:* **${specStr}**\n\n` +
               `👥 *POPULAÇÃO & SATISFAÇÃO:*\n` +
               `• 👨‍👩‍👧‍👦 *Habitantes:* ${k.population} / ${limits.maxPopulation} max\n` +
               `• 😊 *Satisfação Popular:* ${k.satisfaction}% | *Impostos:* ${k.tax_rate}%\n` +
               `• 🧑‍🌾 *Trabalhadores Alocados:* ${k.workers.farmer} Agr, ${k.workers.lumberjack} Lenh, ${k.workers.miner} Min, ${k.workers.merchant} Com\n\n` +
               `🌾 *ARMAZÉM DE RECURSOS:*\n` +
               `• 🍞 Comida: ${k.resources.food} | 🪵 Madeira: ${k.resources.wood}\n` +
               `• 🪨 Pedra: ${k.resources.stone} | ⚙️ Ferro: ${k.resources.iron}\n\n` +
               `💰 *TESOURO REAL DO REINO:*\n` +
               `• 🪙 *Cofre do Reino:* **$${k.treasury.toLocaleString('pt-BR')}**\n` +
               `• 💵 *Disponível p/ Saque Hoje:* $${availableWithdrawal.toLocaleString('pt-BR')} / $${limits.dailyWithdrawalLimit.toLocaleString('pt-BR')}\n\n` +
               `⚔️ *FORÇA MILITAR & DEFESA:*\n` +
               `• 🗡️ *Soldados:* ${k.army.soldiers} / ${limits.maxArmy} max (Equip Lvl ${k.army.equipment_level})\n` +
               `• ⚔️ *Poder de Ataque:* ${atkPower} | 🛡️ *Poder Defensivo:* ${defPower}\n` +
               `• 🪖 *Generais:* ${k.army.generals.length > 0 ? k.army.generals.join(', ') : 'Nenhum'}\n\n` +
               `🤝 *DIPLOMACIA:*\n` +
               `• 🕊️ *Aliança:* ${allyStr}\n` +
               `• 💍 *Casamento Real:* ${marriageStr}\n` +
               `• 🚩 *Reinos Conquistados:* ${k.conquered_kingdoms.length}\n\n` +
               `💡 *Principais Comandos:*\n` +
               `• \`/reino coletar\` ➔ Coletar recursos e ouro produzidos\n` +
               `• \`/reino construir\` ➔ Menu de evolução de estruturas\n` +
               `• \`/reino recrutar <qtd>\` ➔ Aumentar população\n` +
               `• \`/reino trabalhadores\` ➔ Alocar tarefas da população\n` +
               `• \`/reino treinar <qtd>\` ➔ Formar soldados\n` +
               `• \`/reino sacar <valor>\` ➔ Transferir ouro para carteira\n` +
               `• \`/guerra @rei\` ➔ Iniciar guerra de conquista`;

  const mentions = [sender];
  if (k.alliance) mentions.push(k.alliance);
  if (k.marriage) mentions.push(k.marriage);

  return reply(text, mentions);
}

// 2. Compra e Fundação de Reino
function handleBuyKingdom(reply, sender, user, kd, args) {
  if (kd.isMonarch) {
    return reply(`⚠️ Seu reino já está fundado com o nome **${kd.kingdom.name}**!\nPara alterar o nome use: \`/reino renomear <Novo Nome>\``);
  }

  const kingdomName = args.slice(1).join(' ').trim();
  if (!kingdomName || kingdomName.length < 3) {
    return reply('⚠️ Escolha um nome válido para seu reino com pelo menos 3 caracteres.\nExemplo: `/reino comprar Reino de Valorium`');
  }

  const PRICE = 200000;
  if (!kd.hasMonarchyHouse && user.wallet < PRICE) {
    return reply(`⚠️ Você precisa de **$${PRICE.toLocaleString('pt-BR')}** na carteira para fundar um novo Reino!`);
  }

  if (!kd.hasMonarchyHouse) {
    updateUser(sender, { wallet: user.wallet - PRICE });
  }

  const newKingdom = createDefaultKingdom(kingdomName);
  kd.extraData.kingdom = newKingdom;
  updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });

  return reply(`🎉 *REINO FUNDADO COM SUCESSO!* 👑\n\n` +
               `Vossa Majestade @${sender.split('@')[0]} declarou a fundação do **${kingdomName}**!\n\n` +
               `🏰 *Status Inicial:*\n` +
               `• 👥 População: 50 habitantes\n` +
               `• 🪙 Tesouro Inicial: $50.000 moedas\n` +
               `• 🌾 Armazém: 500 Comida, 300 Madeira, 200 Pedra, 100 Ferro\n` +
               `• ⚔️ Exército: 10 Soldados\n\n` +
               `💡 Use \`/reino\` para abrir o painel imperial do seu novo domínio!`, [sender]);
}

// 3. Renomear Reino
function handleRenameKingdom(reply, sender, user, kd, args) {
  if (!kd.isMonarch) return reply('⚠️ Você precisa ter um reino para renomeá-lo.');

  const newName = args.slice(1).join(' ').trim();
  if (!newName || newName.length < 3) {
    return reply('⚠️ Digite o novo nome do reino.\nExemplo: `/reino renomear Império das Sombras`');
  }

  const RENAME_COST = 25000;
  if (kd.kingdom.treasury < RENAME_COST) {
    return reply(`⚠️ Você precisa de **$${RENAME_COST.toLocaleString('pt-BR')}** no **Tesouro do Reino** para alterar seu nome.`);
  }

  kd.kingdom.treasury -= RENAME_COST;
  kd.kingdom.name = newName;
  updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });

  return reply(`👑 *REINO RENOMEADO!*\n\nSeu reino agora é oficialmente reconhecido como **${newName}**!`);
}

// 4. Construções e Evolução
function handleBuildUpgrade(reply, sender, user, kd, args) {
  if (!kd.isMonarch) return reply('⚠️ Você precisa possuir um reino para gerenciar construções.');

  const k = kd.kingdom;
  const buildingKey = args[1]?.toLowerCase();

  const BUILDINGS = {
    centro: { name: '🏰 Centro do Reino', key: 'town_center', baseMoney: 50000, wood: 200, stone: 200, iron: 50 },
    casas: { name: '🏠 Habitações & Casas', key: 'houses', baseMoney: 15000, wood: 100, stone: 50, iron: 0 },
    fazendas: { name: '🌾 Fazendas & Agronomia', key: 'farms', baseMoney: 15000, wood: 80, stone: 30, iron: 0 },
    minas: { name: '⛏️ Minas & Serrarias', key: 'mines', baseMoney: 20000, wood: 50, stone: 100, iron: 30 },
    mercados: { name: '🪙 Mercados de Ouro', key: 'markets', baseMoney: 25000, wood: 100, stone: 50, iron: 10 },
    quarteis: { name: '⚔️ Quartéis Militares', key: 'barracks', baseMoney: 30000, wood: 100, stone: 150, iron: 50 },
    muralhas: { name: '🏰 Muralhas & Torres', key: 'walls', baseMoney: 40000, wood: 100, stone: 250, iron: 100 }
  };

  if (!buildingKey || !BUILDINGS[buildingKey]) {
    const text = `🏗️ *CONSTRUÇÕES E ESTRUTURAS DO REINO* 🏰\n\n` +
                 `Evolua suas estruturas usando \`/reino construir <opçao>\`:\n\n` +
                 `• 🏰 *centro* (Nível ${k.buildings.town_center}) ➔ Aumenta limite de nível de todas as construções, exército e saque diário\n` +
                 `• 🏠 *casas* (Nível ${k.buildings.houses}) ➔ +50 vagas de população por nível\n` +
                 `• 🌾 *fazendas* (Nível ${k.buildings.farms}) ➔ +20% na produção de comida\n` +
                 `• ⛏️ *minas* (Nível ${k.buildings.mines}) ➔ +20% na produção de madeira, pedra e ferro\n` +
                 `• 🪙 *mercados* (Nível ${k.buildings.markets}) ➔ +25% na renda de ouro dos comerciantes\n` +
                 `• ⚔️ *quarteis* (Nível ${k.buildings.barracks}) ➔ +25 vagas de soldados no exército\n` +
                 `• 🏰 *muralhas* (Nível ${k.buildings.walls}) ➔ +400 HP de Defesa contra invasões e guerras\n\n` +
                 `💡 Exemplo: \`/reino construir fazendas\``;
    return reply(text);
  }

  const bConfig = BUILDINGS[buildingKey];
  const currentLvl = k.buildings[bConfig.key] || 1;

  // Centro do Reino limita nível das outras construções
  if (bConfig.key !== 'town_center' && currentLvl >= k.buildings.town_center) {
    return reply(`⚠️ Para evoluir **${bConfig.name}** para o Nível ${currentLvl + 1}, você precisa primeiro evoluir o **Centro do Reino** para o Nível ${currentLvl + 1}!`);
  }

  const moneyCost = bConfig.baseMoney * currentLvl;
  const woodCost = bConfig.wood * currentLvl;
  const stoneCost = bConfig.stone * currentLvl;
  const ironCost = bConfig.iron * currentLvl;

  if (k.treasury < moneyCost) {
    return reply(`⚠️ O tesouro precisa de **$${moneyCost.toLocaleString('pt-BR')}** para esta construção.`);
  }
  if (k.resources.wood < woodCost || k.resources.stone < stoneCost || k.resources.iron < ironCost) {
    return reply(`⚠️ Recursos insuficientes!\nNecessário: 🪵 ${woodCost} Madeira, 🪨 ${stoneCost} Pedra, ⚙️ ${ironCost} Ferro.`);
  }

  // Paga custo
  k.treasury -= moneyCost;
  k.resources.wood -= woodCost;
  k.resources.stone -= stoneCost;
  k.resources.iron -= ironCost;

  k.buildings[bConfig.key] = currentLvl + 1;
  k.xp += 150 * (currentLvl + 1);

  // Recalcular Nível do Reino
  if (k.xp >= k.level * 1000) {
    k.level += 1;
  }

  updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });

  return reply(`🏗️ *CONSTRUÇÃO CONCLUÍDA!* 👑\n\n` +
               `**${bConfig.name}** foi evoluído para o **Nível ${currentLvl + 1}**!\n` +
               `✨ *Ganho de XP:* +${150 * (currentLvl + 1)} XP`);
}

// 5. Recrutamento da População
function handleRecruitPopulation(reply, sender, user, kd, args) {
  if (!kd.isMonarch) return reply('⚠️ Apenas monarcas podem recrutar população.');

  const k = kd.kingdom;
  const limits = calculateKingdomLimits(k);
  const amount = parseInt(args[1]);

  if (isNaN(amount) || amount <= 0) {
    return reply('⚠️ Digite a quantidade de pessoas que deseja recrutar.\nExemplo: `/reino recrutar 10`');
  }

  if (k.population + amount > limits.maxPopulation) {
    const space = limits.maxPopulation - k.population;
    return reply(`⚠️ Seu reino tem espaço para apenas **+${space}** novos habitantes!\nEvolua as **Casas** ou o **Centro do Reino** para aumentar a capacidade.`);
  }

  let costPerPersonMoney = 50;
  let costPerPersonFood = 10;

  if (k.specialization === 'militar' || k.specialization === 'populacional') {
    costPerPersonMoney = 40;
    costPerPersonFood = 8;
  }

  const totalMoney = amount * costPerPersonMoney;
  const totalFood = amount * costPerPersonFood;

  if (k.treasury < totalMoney) {
    return reply(`⚠️ O tesouro precisa de **$${totalMoney.toLocaleString('pt-BR')}** para recrutar ${amount} pessoas.`);
  }
  if (k.resources.food < totalFood) {
    return reply(`⚠️ Seu armazém precisa de **${totalFood} Comida** para alimentar os novos cidadãos.`);
  }

  k.treasury -= totalMoney;
  k.resources.food -= totalFood;
  k.population += amount;
  k.workers.farmer += Math.floor(amount / 2); // Aloca metade como agricultores automaticamente
  k.workers.lumberjack += Math.ceil(amount / 2);

  updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });

  return reply(`👨‍👩‍👧‍👦 *RECRUTAMENTO REALIZADO!* 👑\n\n` +
               `Você recrutou **+${amount} habitantes** para o reino!\n` +
               `👥 *População Total:* ${k.population} / ${limits.maxPopulation}\n` +
               `💸 *Custo:* $${totalMoney.toLocaleString('pt-BR')} Ouro e 🍞 ${totalFood} Comida.`);
}

// 6. Alocação de Trabalhadores
function handleManageWorkers(reply, sender, user, kd, args) {
  if (!kd.isMonarch) return reply('⚠️ Apenas monarcas podem gerenciar trabalhadores.');

  const k = kd.kingdom;
  const job = args[1]?.toLowerCase();
  const count = parseInt(args[2]);

  const JOBS = {
    agricultor: 'farmer',
    fazendeiro: 'farmer',
    lenhador: 'lumberjack',
    minerador: 'miner',
    comerciante: 'merchant'
  };

  if (!job || !JOBS[job] || isNaN(count) || count < 0) {
    const w = k.workers;
    const totalWorkers = (w.farmer || 0) + (w.lumberjack || 0) + (w.miner || 0) + (w.merchant || 0);

    const text = `🧑‍🌾 *GESTÃO DE TRABALHADORES DO REINO* 👑\n\n` +
                 `• 👥 *População Total:* ${k.population}\n` +
                 `• 🧑‍🌾 *Trabalhadores Alocados:* ${totalWorkers} / ${k.population}\n\n` +
                 `📊 *Distribuição Atual:*\n` +
                 `• 🍞 *Agricultores:* ${w.farmer} ➔ Produzem Comida\n` +
                 `• 🪵 *Lenhadores:* ${w.lumberjack} ➔ Produzem Madeira\n` +
                 `• 🪨 *Mineradores:* ${w.miner} ➔ Produzem Pedra e Ferro\n` +
                 `• 🪙 *Comerciantes:* ${w.merchant} ➔ Geram Ouro no Tesouro\n\n` +
                 `💡 *Como definir:* \`/reino trabalhadores <profissao> <quantidade>\`\n` +
                 `Exemplo: \`/reino trabalhadores agricultor 20\``;
    return reply(text);
  }

  const jobKey = JOBS[job];
  const otherWorkersCount = Object.keys(k.workers)
    .filter(k => k !== jobKey && k !== 'soldier')
    .reduce((sum, key) => sum + (k.workers[key] || 0), 0);

  if (otherWorkersCount + count > k.population) {
    return reply(`⚠️ A quantidade total de trabalhadores não pode ultrapassar a população atual (${k.population} habitantes)!`);
  }

  k.workers[jobKey] = count;
  updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });

  return reply(`✅ *TRABALHADORES REORGANIZADOS!*\n\nVocê definiu a profissão de **${job.toUpperCase()}** para **${count} habitantes**!`);
}

// 7. Coleta de Recursos, Impostos & Farm Passivo
async function handleCollectResources(reply, sender, user, kd) {
  if (!kd.isMonarch) return reply('⚠️ Apenas monarcas podem coletar a colheita do reino.');

  const k = kd.kingdom;
  const now = Date.now();
  const COOLDOWN = 2 * 60 * 60 * 1000; // 2 horas de cooldown

  if (now - k.last_collect < COOLDOWN) {
    const remaining = COOLDOWN - (now - k.last_collect);
    const minutes = Math.floor(remaining / (1000 * 60));
    return reply(`⏳ *OS ARMAZÉNS ESTÃO PROCESSANDO A PRODUÇÃO!*\n\nSua população está colhendo e minerando.\n⏱️ *Próxima coleta disponível em:* *${minutes} minutos*`);
  }

  const hoursPassed = Math.min(8, Math.max(0.5, (now - (k.last_collect || (now - COOLDOWN))) / (1000 * 60 * 60)));

  // Bônus de satisfação
  let satMult = 1.0;
  let satMsg = '';
  if (k.satisfaction >= 80) {
    satMult = 1.25;
    satMsg = '\n😊 *Bônus de Satisfação Alta:* +25% produçao!';
  } else if (k.satisfaction < 30) {
    satMult = 0.6;
    satMsg = '\n⚠️ *Penalidade por Insatisfação:* -40% produção!';
  }

  // Cálculo de produção
  const spec = k.specialization;
  const agMult = spec === 'agricola' ? 1.5 : 1.0;
  const comMult = spec === 'comercial' ? 1.35 : 1.0;

  const foodEarned = Math.round((k.workers.farmer * 15 * hoursPassed * (1 + k.buildings.farms * 0.2) * agMult) * satMult);
  const woodEarned = Math.round((k.workers.lumberjack * 10 * hoursPassed * (1 + k.buildings.mines * 0.2) * agMult) * satMult);
  const stoneEarned = Math.round((k.workers.miner * 8 * hoursPassed * (1 + k.buildings.mines * 0.2)) * satMult);
  const ironEarned = Math.round((k.workers.miner * 4 * hoursPassed * (1 + k.buildings.mines * 0.2)) * satMult);

  const merchantGold = Math.round((k.workers.merchant * 500 * hoursPassed * (1 + k.buildings.markets * 0.25) * comMult) * satMult);
  const taxGold = Math.round((k.population * k.tax_rate * 15 * hoursPassed * (k.satisfaction / 100)));
  const totalGold = merchantGold + taxGold;

  // Atualiza recursos e tesouro
  k.resources.food += foodEarned;
  k.resources.wood += woodEarned;
  k.resources.stone += stoneEarned;
  k.resources.iron += ironEarned;
  k.treasury += totalGold;

  k.last_collect = now;

  // Eventos Aleatórios (20% de chance)
  let randomEventStr = '';
  if (Math.random() < 0.20) {
    const events = [
      { text: '🌾 *Colheita Abundante:* O clima propício gerou +300 Comida extra!', run: () => k.resources.food += 300 },
      { text: '💎 *Mina de Ouro Descoberta:* Seus mineradores encontraram um veio valioso! +$25.000 Ouro no Tesouro!', run: () => k.treasury += 25000 },
      { text: '🐫 *Caravana de Mercadores:* Mercadores itinerantes pagaram impostos alfandegários de +$15.000 Ouro!', run: () => k.treasury += 15000 },
      { text: '👑 *Festival Real:* A população comemorou o festival e a Satisfação subiu para 100%!', run: () => k.satisfaction = 100 }
    ];
    const ev = events[Math.floor(Math.random() * events.length)];
    ev.run();
    randomEventStr = `\n\n🎲 *EVENTO ALEATÓRIO:* ${ev.text}`;
  }

  updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });

  const text = `🌾 *COLHEITA & RECOLHIMENTO IMPERIAL* 🏰\n\n` +
               `👑 *Monarca:* @${sender.split('@')[0]}\n` +
               `⏱️ *Tempo de Produção:* ${hoursPassed.toFixed(1)} horas${satMsg}\n\n` +
               `📦 *RECURSOS OBTIDOS:*\n` +
               `• 🍞 +${foodEarned} Comida\n` +
               `• 🪵 +${woodEarned} Madeira\n` +
               `• 🪨 +${stoneEarned} Pedra\n` +
               `• ⚙️ +${ironEarned} Ferro\n\n` +
               `💰 *RENDA DE OURO (TESOURO):*\n` +
               `• 🪙 Renda de Comerciantes: +$${merchantGold.toLocaleString('pt-BR')}\n` +
               `• 📜 Impostos Recolhidos: +$${taxGold.toLocaleString('pt-BR')}\n` +
               `• 💰 *Total Adicionado ao Tesouro:* **+$${totalGold.toLocaleString('pt-BR')}** moedas!${randomEventStr}\n\n` +
               `⏱️ *Próxima colheita em:* 2 horas.`;

  return reply(text, [sender]);
}

// 8. Definir Impostos
function handleSetTax(reply, sender, user, kd, args) {
  if (!kd.isMonarch) return reply('⚠️ Apenas monarcas podem ajustar impostos.');

  const k = kd.kingdom;
  const rate = parseInt(args[1]);

  if (isNaN(rate) || rate < 0 || rate > 100) {
    return reply('⚠️ Informe uma taxa de imposto válida entre 0% e 100%.\nExemplo: `/reino imposto 15`');
  }

  k.tax_rate = rate;

  // Ajusta satisfação dinamicamente
  if (rate > 40) k.satisfaction = Math.max(10, k.satisfaction - 25);
  else if (rate > 20) k.satisfaction = Math.max(30, k.satisfaction - 10);
  else if (rate <= 10) k.satisfaction = Math.min(100, k.satisfaction + 15);

  updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });

  return reply(`📜 *TAXA DE IMPOSTO REAJUSTADA!*\n\nA taxa de imposto do reino foi definida em **${rate}%**.\n😊 *Satisfação Popular:* ${k.satisfaction}%`);
}

// 9. Saque Diário do Tesouro para Carteira
function handleWithdrawTreasury(reply, sender, user, kd, args) {
  if (!kd.isMonarch) return reply('⚠️ Apenas monarcas podem retirar ouro do tesouro.');

  const k = kd.kingdom;
  const limits = calculateKingdomLimits(k);
  const valStr = args[1]?.toLowerCase();

  const now = Date.now();
  if (now - k.last_withdrawal_reset > 24 * 60 * 60 * 1000) {
    k.daily_withdrawal_today = 0;
    k.last_withdrawal_reset = now;
  }

  const maxAllowedToday = Math.max(0, limits.dailyWithdrawalLimit - k.daily_withdrawal_today);

  if (!valStr) {
    return reply(`⚠️ Informe o valor que deseja sacar do tesouro para sua carteira pessoal.\nExemplo: \`/reino sacar 50000\`\n💰 *Disponível para saque hoje:* $${maxAllowedToday.toLocaleString('pt-BR')}`);
  }

  let amount = 0;
  if (valStr === 'tudo' || valStr === 'all') {
    amount = Math.min(k.treasury, maxAllowedToday);
  } else {
    amount = parseInt(valStr);
  }

  if (isNaN(amount) || amount <= 0) return reply('⚠️ Valor numérico inválido para saque.');

  if (amount > k.treasury) {
    return reply(`⚠️ O Tesouro do Reino possui apenas **$${k.treasury.toLocaleString('pt-BR')}** em cofre.`);
  }

  if (amount > maxAllowedToday) {
    return reply(`⚠️ Seu limite diário de saque restante hoje é de **$${maxAllowedToday.toLocaleString('pt-BR')}**!\nEvolua o **Centro do Reino** para expandir o limite diário.`);
  }

  k.treasury -= amount;
  k.daily_withdrawal_today += amount;
  const newWallet = user.wallet + amount;

  updateUser(sender, { wallet: newWallet, extra_data: JSON.stringify(kd.extraData) });

  return reply(`💵 *SAQUE DIÁRIO REALIZADO COM SUCESSO!* 👑\n\n` +
               `Você retirou **$${amount.toLocaleString('pt-BR')}** do Tesouro do Reino para sua carteira pessoal!\n` +
               `🏛️ *Novo Saldo do Tesouro:* $${k.treasury.toLocaleString('pt-BR')}\n` +
               `👛 *Seu Saldo Pessoal:* $${newWallet.toLocaleString('pt-BR')}`);
}

// 10. Depósito da Carteira no Tesouro
function handleDepositTreasury(reply, sender, user, kd, args) {
  if (!kd.isMonarch) return reply('⚠️ Apenas monarcas podem injetar verba no tesouro.');

  const k = kd.kingdom;
  const valStr = args[1]?.toLowerCase();

  if (!valStr) return reply('⚠️ Informe o valor que deseja depositar no tesouro.\nExemplo: `/reino depositar 50000`');

  let amount = 0;
  if (valStr === 'tudo' || valStr === 'all') amount = user.wallet;
  else amount = parseInt(valStr);

  if (isNaN(amount) || amount <= 0) return reply('⚠️ Valor inválido.');
  if (user.wallet < amount) return reply('⚠️ Saldo insuficiente na carteira pessoal.');

  const newWallet = user.wallet - amount;
  k.treasury += amount;

  updateUser(sender, { wallet: newWallet, extra_data: JSON.stringify(kd.extraData) });

  return reply(`🪙 *DEPÓSITO NO TESOURO REALIZADO!*\n\nVocê transferiu **$${amount.toLocaleString('pt-BR')}** da sua carteira para o cofre do reino!\n💰 *Novo Tesouro:* $${k.treasury.toLocaleString('pt-BR')}`);
}

// 11. Escolha de Especialização
function handleSpecialization(reply, sender, user, kd, args) {
  if (!kd.isMonarch) return reply('⚠️ Apenas monarcas podem escolher especializações.');

  const k = kd.kingdom;
  if (k.buildings.town_center < 3) {
    return reply('⚠️ Seu reino precisa ter o **Centro do Reino no Nível 3** para desbloquear Especializações!');
  }

  const specType = args[1]?.toLowerCase();

  const SPECS = {
    militar: '⚔️ Militar (+35% Poder de Ataque & -20% custo de soldados)',
    comercial: '🪙 Comercial (+35% Ouro dos Comerciantes & Isenção de Taxas)',
    agricola: '🌾 Agrícola (+50% Produção de Comida e Madeira)',
    defensiva: '🛡️ Defensiva (+50% Resistência de Muralhas e Defesa)',
    populacional: '👥 Populacional (+50% Limite Máximo de População)'
  };

  if (!specType || !SPECS[specType]) {
    const text = `🎖️ *ESPECIALIZAÇÕES DO REINO* 👑\n\n` +
                 `Escolha a diretriz estratégica do seu império usando \`/reino especializar <tipo>\`:\n\n` +
                 `• ⚔️ *militar* ➔ +35% Poder de Ataque em Guerras e recrutamento mais barato\n` +
                 `• 🪙 *comercial* ➔ +35% na renda de ouro e isenção de taxas\n` +
                 `• 🌾 *agricola* ➔ +50% de rendimento de Comida e Madeira na coleta\n` +
                 `• 🛡️ *defensiva* ➔ +50% na defesa de Muralhas e suporte militar\n` +
                 `• 👥 *populacional* ➔ +50% no limite máximo de população\n\n` +
                 `💡 *Especialização Atual:* ${k.specialization ? k.specialization.toUpperCase() : 'Nenhuma'}`;
    return reply(text);
  }

  k.specialization = specType;
  updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });

  return reply(`👑 *ESPECIALIZAÇÃO DEFINIDA!*\n\nSeu reino agora é especializado na via **${SPECS[specType]}**!`);
}

// 12. Treinamento de Exército
function handleTrainArmy(reply, sender, user, kd, args) {
  if (!kd.isMonarch) return reply('⚠️ Apenas monarcas podem treinar soldados.');

  const k = kd.kingdom;
  const limits = calculateKingdomLimits(k);
  const amount = parseInt(args[1]);

  if (isNaN(amount) || amount <= 0) {
    return reply('⚠️ Informe a quantidade de soldados que deseja treinar.\nExemplo: `/reino treinar 10`');
  }

  if (k.army.soldiers + amount > limits.maxArmy) {
    const space = limits.maxArmy - k.army.soldiers;
    return reply(`⚠️ Seu exército suporta apenas mais **+${space} soldados**!\nEvolua os **Quartéis** para expandir o exército.`);
  }

  const costMoney = amount * 200;
  const costIron = amount * 10;
  const costFood = amount * 15;

  if (k.treasury < costMoney) return reply(`⚠️ O Tesouro precisa de **$${costMoney.toLocaleString('pt-BR')}** para o treinamento.`);
  if (k.resources.iron < costIron || k.resources.food < costFood) {
    return reply(`⚠️ Recursos insuficientes!\nNecessário: ⚙️ ${costIron} Ferro e 🍞 ${costFood} Comida.`);
  }

  k.treasury -= costMoney;
  k.resources.iron -= costIron;
  k.resources.food -= costFood;
  k.army.soldiers += amount;

  updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });

  return reply(`⚔️ *TREINAMENTO CONCLUÍDO!* 🪖\n\n` +
               `Você treinou **+${amount} soldados** para o exército real!\n` +
               `🛡️ *Total de Soldados:* ${k.army.soldiers} / ${limits.maxArmy}\n` +
               `💸 *Custo:* $${costMoney.toLocaleString('pt-BR')} Ouro, ⚙️ ${costIron} Ferro, 🍞 ${costFood} Comida.`);
}

// 13. Evoluir Equipamentos Militares
function handleUpgradeEquipment(reply, sender, user, kd, args) {
  if (!kd.isMonarch) return reply('⚠️ Apenas monarcas podem evoluir armamentos.');

  const k = kd.kingdom;
  const currentLvl = k.army.equipment_level || 1;

  if (currentLvl >= 10) return reply('⚠️ Seus equipamentos militares já atingiram o **Nível Máximo 10**!');

  const moneyCost = 30000 * currentLvl;
  const ironCost = 100 * currentLvl;

  if (args[1]?.toLowerCase() === 'evoluir') {
    if (k.treasury < moneyCost) return reply(`⚠️ O tesouro precisa de **$${moneyCost.toLocaleString('pt-BR')}**.`);
    if (k.resources.iron < ironCost) return reply(`⚠️ Armazém precisa de **${ironCost} Ferro**.`);

    k.treasury -= moneyCost;
    k.resources.iron -= ironCost;
    k.army.equipment_level = currentLvl + 1;

    updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });

    return reply(`🗡️ *ARMAMENTOS E EQUIPAMENTOS EVOLUÍDOS!*\n\nSeu exército agora utiliza equipamentos de **Nível ${currentLvl + 1}**! (+15 ATK/DEF por soldado)`);
  }

  return reply(`🗡️ *EQUIPAMENTOS DO EXÉRCITO (Nível ${currentLvl}/10)*\n\n` +
               `• *Bônus Atual:* +${currentLvl * 15} Poder Militar por soldado\n` +
               `• *Custo p/ Nível ${currentLvl + 1}:* $${moneyCost.toLocaleString('pt-BR')} Ouro e ⚙️ ${ironCost} Ferro\n\n` +
               `👉 Digite \`/reino equipamentos evoluir\` para melhorar!`);
}

// 14. Generais do Exército
function handleGenerals(reply, sender, user, kd, args) {
  if (!kd.isMonarch) return reply('⚠️ Apenas monarcas podem contratar generais.');

  const k = kd.kingdom;
  const sub = args[1]?.toLowerCase();

  const GENERALS = {
    valerio: { name: 'General Valério', title: '⚔️ Estrategista de Guerra', bonus: '+25% Poder de Ataque', price: 100000, key: 'Valerio' },
    breno: { name: 'General Dom Breno', title: '🛡️ Guardião das Muralhas', bonus: '+35% Defesa de Muralhas', price: 100000, key: 'Breno' },
    aurelius: { name: 'General Aurelius', title: '💰 Comandante Saqueador', bonus: '+25% Ouro Saqueado em Guerras', price: 100000, key: 'Aurelius' }
  };

  if (sub === 'contratar') {
    const genKey = args[2]?.toLowerCase();
    if (!genKey || !GENERALS[genKey]) {
      return reply('⚠️ Escolha um general válido: `valerio`, `breno` ou `aurelius`.\nExemplo: `/reino general contratar valerio`');
    }

    const gen = GENERALS[genKey];
    if (k.army.generals.includes(gen.key)) {
      return reply(`⚠️ Você já contratou o **${gen.name}**!`);
    }

    if (k.treasury < gen.price) {
      return reply(`⚠️ Você precisa de **$${gen.price.toLocaleString('pt-BR')}** no Tesouro para contratar o general.`);
    }

    k.treasury -= gen.price;
    k.army.generals.push(gen.key);

    updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });

    return reply(`🪖 *GENERAL CONTRATADO!* 🎖️\n\nO **${gen.name}** (*${gen.title}*) assumiu o comando do seu exército!\n✨ *Bônus:* ${gen.bonus}`);
  }

  const text = `🪖 *QUARTEL DE GENERAIS MILITARES* 👑\n\n` +
               `Contrate comandantes renomados para liderar suas tropas usando \`/reino general contratar <opção>\`:\n\n` +
               `• ⚔️ *valerio* (General Valério) ➔ +25% Poder de Ataque ($100.000)\n` +
               `• 🛡️ *breno* (General Dom Breno) ➔ +35% Defesa de Muralhas ($100.000)\n` +
               `• 💰 *aurelius* (General Aurelius) ➔ +25% Ouro Saqueado em Guerras ($100.000)\n\n` +
               `🎖️ *Generais Atuais:* ${k.army.generals.length > 0 ? k.army.generals.join(', ') : 'Nenhum'}`;

  return reply(text);
}

// 15. Mercado de Troca de Recursos
function handleResourceMarket(reply, sender, user, kd, args) {
  if (!kd.isMonarch) return reply('⚠️ Apenas monarcas podem operar no Mercado Real.');

  const k = kd.kingdom;
  const action = args[0]?.toLowerCase() === 'vender' ? 'vender' : args[1]?.toLowerCase();
  const resource = (args[0]?.toLowerCase() === 'vender' ? args[1] : args[2])?.toLowerCase();
  const amount = parseInt(args[0]?.toLowerCase() === 'vender' ? args[2] : args[3]);

  const PRICES = { food: 5, wood: 10, stone: 15, iron: 30 };

  if (action === 'vender') {
    if (!resource || !PRICES[resource] || isNaN(amount) || amount <= 0) {
      return reply('⚠️ Uso: `/reino vender <comida|madeira|pedra|ferro> <quantidade>`\nExemplo: `/reino vender madeira 100`');
    }

    if ((k.resources[resource] || 0) < amount) {
      return reply(`⚠️ Você não possui **${amount} de ${resource}** no armazém.`);
    }

    const goldEarned = amount * PRICES[resource];
    k.resources[resource] -= amount;
    k.treasury += goldEarned;

    updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });

    return reply(`🪙 *VENDA DE RECURSOS CONCLUÍDA!*\n\nVocê vendeu **${amount} ${resource}** no mercado e recebeu **+$${goldEarned.toLocaleString('pt-BR')}** no Tesouro!`);
  }

  const text = `🏪 *MERCADO REAL DE RECURSOS* 👑\n\n` +
               `Venda excesso de recursos do armazém por ouro usando \`/reino vender <recurso> <qtd>\`:\n\n` +
               `• 🍞 Comida: $5 por unidade\n` +
               `• 🪵 Madeira: $10 por unidade\n` +
               `• 🪨 Pedra: $15 por unidade\n` +
               `• ⚙️ Ferro: $30 por unidade\n\n` +
               `💡 Exemplo: \`/reino vender ferro 50\``;

  return reply(text);
}

// 16. Reinos Conquistados
function handleListConqueredKingdoms(reply, sender, kd) {
  if (!kd.isMonarch) return reply('⚠️ Apenas monarcas possuem domínios.');

  const conquered = kd.kingdom.conquered_kingdoms || [];
  if (conquered.length === 0) {
    return reply('🚩 *NENHUM REINO CONQUISTADO AINDA!*\n\nVença guerras de dominação contra outros monarcas para tomar a posse de seus reinos e anexá-los ao seu império!');
  }

  let text = `🚩 *IMPÉRIO — REINOS CONQUISTADOS (${conquered.length})* 👑\n\n`;
  conquered.forEach((c, idx) => {
    text += `*${idx + 1}. ${c.name}*\n` +
            `• 👑 Ex-Proprietário: @${c.originalOwner?.split('@')[0] || 'Desconhecido'}\n` +
            `• 👥 População Anexada: ${c.population}\n` +
            `• 🪙 Tesouro Capturado: $${(c.treasury || 0).toLocaleString('pt-BR')}\n\n`;
  });

  return reply(text, conquered.map(c => c.originalOwner).filter(Boolean));
}

// 17. Sistema de Guerras Completo & Conquistas
async function handleWarCommand(sock, msg, reply, user, kd, args, sender) {
  if (!kd.isMonarch) {
    return reply('🏰 *APENAS MONARCAS!*\n\nVocê precisa fundar um reino com `/reino comprar <nome>` para declarar guerra a rivais.');
  }

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const targetJid = mentioned[0];

  if (!targetJid) {
    return reply('⚠️ Marque o monarca rival contra quem deseja declarar guerra!\nExemplo: `/guerra @marcarRei`');
  }

  if (targetJid === sender) return reply('⚠️ Você não pode declarar guerra contra o seu próprio reino!');

  if (kd.kingdom.alliance === targetJid) {
    return reply(`🤝 *PACTO DIPLOMÁTICO ATIVO!*\n\nSeu reino possui uma aliança com @${targetJid.split('@')[0]}. Rompa a aliança antes de declarar guerra.`, [targetJid]);
  }

  const targetUser = getUser(targetJid);
  const targetKd = getKingdomData(targetUser);

  if (!targetKd || !targetKd.isMonarch) {
    return reply(`⚠️ @${targetJid.split('@')[0]} não possui um reino fundado para batalhar!`, [targetJid]);
  }

  const now = Date.now();
  const WAR_COOLDOWN = 12 * 60 * 60 * 1000; // Cooldown de 12h
  if (now - kd.kingdom.last_war < WAR_COOLDOWN) {
    const remaining = WAR_COOLDOWN - (now - kd.kingdom.last_war);
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    return reply(`⏳ *SEUS EXÉRCITOS ESTÃO REAGRUPANDO!*\n\nAguarde *${hours}h ${minutes}m* antes de declarar outra grande guerra.`);
  }

  // Verifica se defensor possui aliado ativo
  let defenderAllyKd = null;
  if (targetKd.kingdom.alliance) {
    const allyUser = getUser(targetKd.kingdom.alliance);
    if (allyUser) defenderAllyKd = getKingdomData(allyUser)?.kingdom;
  }

  // Cálculo de Poder Militar
  let atkPower = calculateMilitaryPower(kd.kingdom, true);
  let defPower = calculateMilitaryPower(targetKd.kingdom, false, defenderAllyKd);

  // Fator Sorte da Batalha (0.85 a 1.15)
  const atkLuck = 0.85 + (Math.random() * 0.30);
  const defLuck = 0.85 + (Math.random() * 0.30);

  const finalAtkPower = Math.round(atkPower * atkLuck);
  const finalDefPower = Math.round(defPower * defLuck);

  kd.kingdom.last_war = now;

  const attackerWon = finalAtkPower >= finalDefPower;
  const mentions = [sender, targetJid];
  if (targetKd.kingdom.alliance) mentions.push(targetKd.kingdom.alliance);

  // Perdas de tropas
  const atkLosses = Math.min(kd.kingdom.army.soldiers, Math.floor(kd.kingdom.army.soldiers * (attackerWon ? 0.15 : 0.40)));
  const defLosses = Math.min(targetKd.kingdom.army.soldiers, Math.floor(targetKd.kingdom.army.soldiers * (attackerWon ? 0.45 : 0.20)));

  kd.kingdom.army.soldiers -= atkLosses;
  targetKd.kingdom.army.soldiers -= defLosses;

  // VERIFICAÇÃO DE CONQUISTA TOTAL DE REINO
  const isConquest = attackerWon && (finalAtkPower >= finalDefPower * 1.8) && (kd.kingdom.buildings.town_center >= targetKd.kingdom.buildings.town_center);

  if (isConquest) {
    // O Atacante Conquista o Reino do Defensor!
    const conqueredEntry = {
      originalOwner: targetJid,
      name: targetKd.kingdom.name,
      treasury: targetKd.kingdom.treasury,
      population: targetKd.kingdom.population,
      buildings: { ...targetKd.kingdom.buildings }
    };

    kd.kingdom.conquered_kingdoms.push(conqueredEntry);
    kd.kingdom.treasury += targetKd.kingdom.treasury;
    kd.kingdom.xp += 1000;

    // Defensor perde o reino (fica zerado para refundar)
    delete targetKd.extraData.kingdom;
    updateUser(targetJid, { extra_data: JSON.stringify(targetKd.extraData) });
    updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });

    const sys = 'Você é um narrador épico de guerras de impérios medievais. Escreva um relato de 25 palavras sobre a destruição total das muralhas inimigas e a conquista e anexação do reino derrotado.';
    const prompt = `O rei @${sender.split('@')[0]} conquistou totalmente o reino de @${targetJid.split('@')[0]}.`;
    const aiStory = await askAi(prompt, sys) || 'As bandeiras do conquistador foram erguidas sobre a torre mais alta do reino subjugado!';

    const text = `⚔️ *GUERRA DE CONQUISTA — VITÓRIA ESMAGADORA!* 👑🚩\n\n` +
                 `🚩 *Conquistador:* @${sender.split('@')[0]} (*Poder Final:* ${finalAtkPower})\n` +
                 `🛡️ *Reino Derrotado:* @${targetJid.split('@')[0]} (*Poder Final:* ${finalDefPower})\n\n` +
                 `🚩 *CONQUISTA DE REINO:* O império de @${sender.split('@')[0]} destruiu as fortificações e **TOMOU A PROPRIEDADE DO REINO** de @${targetJid.split('@')[0]}!\n\n` +
                 `📊 *RELATÓRIO DE BATALHA:*\n` +
                 `• 💀 Perdas Atacante: -${atkLosses} soldados\n` +
                 `• 💀 Perdas Defensor: -${defLosses} soldados\n` +
                 `• 💰 Ouro Anexado ao Tesouro: **+$${conqueredEntry.treasury.toLocaleString('pt-BR')}**\n\n` +
                 `📜 *Crônica da Conquista (IA):*\n_"${aiStory}"_\n\n` +
                 `⚠️ @${targetJid.split('@')[0]} perdeu o controle do seu reino derrotado e pode refundar com \`/reino comprar\`.`;

    return reply(text, mentions);
  }

  if (attackerWon) {
    const lootPct = 0.25; // 25% do tesouro
    const stolenGold = Math.floor(targetKd.kingdom.treasury * lootPct);

    targetKd.kingdom.treasury -= stolenGold;
    kd.kingdom.treasury += stolenGold;
    kd.kingdom.xp += 300;

    updateUser(targetJid, { extra_data: JSON.stringify(targetKd.extraData) });
    updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });

    const sys = 'Escreva 1 relato épico de 20 palavras sobre o exército vitorioso saqueando a fortaleza inimiga. Sem aspas.';
    const prompt = `@${sender.split('@')[0]} venceu a batalha contra @${targetJid.split('@')[0]} e saqueou $${stolenGold}.`;
    const aiStory = await askAi(prompt, sys) || 'Os portões caíram e as tropas saquearam os cofres reais!';

    const text = `⚔️ *GUERRA DE REINOS — VITÓRIA ATACANTE!* 🏆\n\n` +
                 `🚩 *Atacante:* @${sender.split('@')[0]} (*Poder:* ${finalAtkPower})\n` +
                 `🛡️ *Defensor:* @${targetJid.split('@')[0]} (*Poder:* ${finalDefPower})\n\n` +
                 `📊 *RELATÓRIO DE GUERRA:*\n` +
                 `• 💀 Tropas Atacante Perdidas: -${atkLosses} soldados\n` +
                 `• 💀 Tropas Defensor Perdidas: -${defLosses} soldados\n` +
                 `• 💰 Saque de Guerra: **+$${stolenGold.toLocaleString('pt-BR')}** moedas de ouro pilhadas!\n\n` +
                 `📜 *Crônica da Guerra (IA):*\n_"${aiStory}"_\n\n` +
                 `⏱️ *Próxima guerra disponível em:* 12 horas.`;

    return reply(text, mentions);
  } else {
    const reparations = Math.floor(kd.kingdom.treasury * 0.15);

    kd.kingdom.treasury -= reparations;
    targetKd.kingdom.treasury += reparations;

    updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });
    updateUser(targetJid, { extra_data: JSON.stringify(targetKd.extraData) });

    const sys = 'Escreva 1 relato de 20 palavras sobre as muralhas do castelo repelindo o ataque inimigo. Sem aspas.';
    const prompt = `O exército de @${sender.split('@')[0]} foi repelido pelas muralhas de @${targetJid.split('@')[0]}.`;
    const aiStory = await askAi(prompt, sys) || 'As muralhas imponentes resistiram ao cerco e o invasor recuou!';

    const text = `🛡️ *GUERRA DE REINOS — DEFESA INABALÁVEL!* 🏰\n\n` +
                 `🚩 *Invasor:* @${sender.split('@')[0]} (*Poder:* ${finalAtkPower})\n` +
                 `🛡️ *Defensor:* @${targetJid.split('@')[0]} (*Poder:* ${finalDefPower})\n\n` +
                 `📊 *RELATÓRIO DE BATALHA:*\n` +
                 `• 💀 Tropas Invasoras Perdidas: -${atkLosses} soldados\n` +
                 `• 💀 Tropas Defensoras Perdidas: -${defLosses} soldados\n` +
                 `• 💸 Reparações de Guerra Pagas: **$${reparations.toLocaleString('pt-BR')}** transferidos ao defensor!\n\n` +
                 `📜 *Crônica da Batalha (IA):*\n_"${aiStory}"_`;

    return reply(text, mentions);
  }
}

// 18. Alianças Diplomáticas
function handleAllianceCommand(reply, sender, kd, args, msg) {
  if (!kd.isMonarch) return reply('⚠️ Apenas monarcas podem firmar pactos diplomáticos.');

  const action = args[1]?.toLowerCase();

  if (action === 'aceitar') {
    const proposerJid = allianceProposals.get(sender);
    if (!proposerJid) return reply('⚠️ Você não possui propostas de aliança pendentes.');

    const proposerUser = getUser(proposerJid);
    const proposerKd = getKingdomData(proposerUser);

    kd.kingdom.alliance = proposerJid;
    proposerKd.kingdom.alliance = sender;

    updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });
    updateUser(proposerJid, { extra_data: JSON.stringify(proposerKd.extraData) });

    allianceProposals.delete(sender);

    return reply(`🤝 *PACTO DIPLOMÁTICO SELADO!* 👑\n\n` +
                 `Os reinos de @${sender.split('@')[0]} (*${kd.kingdom.name}*) e @${proposerJid.split('@')[0]} (*${proposerKd.kingdom.name}*) agora são **REINOS ALIANÇADOS**!\n\n` +
                 `✨ *BENEFÍCIOS DA ALIANÇA:*\n` +
                 `• 🕊️ Pacto de Não-Agressão\n` +
                 `• 🌾 +15% bônus na coleta de recursos\n` +
                 `• 🛡️ +25% suporte defensivo militar em guerras!`, [sender, proposerJid]);
  }

  if (action === 'desfazer' || action === 'cancelar') {
    if (!kd.kingdom.alliance) return reply('⚠️ Seu reino não possui nenhuma aliança ativa.');

    const allyJid = kd.kingdom.alliance;
    const allyUser = getUser(allyJid);
    const allyKd = getKingdomData(allyUser);

    kd.kingdom.alliance = null;
    if (allyKd && allyKd.kingdom) {
      allyKd.kingdom.alliance = null;
      updateUser(allyJid, { extra_data: JSON.stringify(allyKd.extraData) });
    }

    updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });

    return reply(`💔 *PACTO DIPLOMÁTICO ROMPIDO!*\n\nA aliança diplomática com o reino de @${allyJid.split('@')[0]} foi encerrada.`, [sender, allyJid]);
  }

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const targetJid = mentioned[0];

  if (!targetJid) {
    if (kd.kingdom.alliance) {
      return reply(`🤝 *STATUS DA SUA ALIANÇA REAL*\n\nSeu reino é atualmente aliado de @${kd.kingdom.alliance.split('@')[0]}!\n\n💡 Use \`/alianca desfazer\` para romper a aliança.`, [kd.kingdom.alliance]);
    }
    return reply('⚠️ Marque outro monarca para propor uma aliança diplomática!\nExemplo: `/alianca @marcarRei`');
  }

  if (targetJid === sender) return reply('⚠️ Você não pode criar uma aliança com o próprio reino!');

  const targetUser = getUser(targetJid);
  const targetKd = getKingdomData(targetUser);

  if (!targetKd || !targetKd.isMonarch) {
    return reply(`⚠️ @${targetJid.split('@')[0]} não possui um reino para aceitar uma aliança!`, [targetJid]);
  }

  allianceProposals.set(targetJid, sender);

  return reply(`📜 *PROPOSTA DE ALIANÇA DIPLOMÁTICA!* 🤝\n\n` +
               `@${sender.split('@')[0]} (*${kd.kingdom.name}*) enviou uma proposta de tratado de aliança para @${targetJid.split('@')[0]} (*${targetKd.kingdom.name}*)!\n\n` +
               `👉 Para aceitar, @${targetJid.split('@')[0]} deve digitar: \`/alianca aceitar\``, [sender, targetJid]);
}

// 19. Casamento Real
function handleMarriageCommand(reply, sender, kd, args, msg) {
  if (!kd.isMonarch) return reply('⚠️ Apenas monarcas podem realizar casamentos reais.');

  const action = args[1]?.toLowerCase();

  if (action === 'aceitar') {
    const proposerJid = marriageProposals.get(sender);
    if (!proposerJid) return reply('⚠️ Você não possui propostas de casamento pendentes.');

    const proposerUser = getUser(proposerJid);
    const proposerKd = getKingdomData(proposerUser);

    kd.kingdom.marriage = proposerJid;
    proposerKd.kingdom.marriage = sender;

    updateUser(sender, { extra_data: JSON.stringify(kd.extraData) });
    updateUser(proposerJid, { extra_data: JSON.stringify(proposerKd.extraData) });

    marriageProposals.delete(sender);

    return reply(`💍 *CASAMENTO REAL REALIZADO COM SUCESSO!* 👑❤️\n\n` +
                 `Vossa Majestade @${sender.split('@')[0]} e Vossa Majestade @${proposerJid.split('@')[0]} uniram seus reinos através do matrimônio real!\n\n` +
                 `✨ *BENEFÍCIOS DA UNIÃO:* +20% bônus permanente na arrecadação de impostos para ambos os reinos!`, [sender, proposerJid]);
  }

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const targetJid = mentioned[0];

  if (!targetJid) {
    if (kd.kingdom.marriage) {
      return reply(`💍 *STATUS DO SEU MATRIMÔNIO REAL*\n\nSeu reino está unido ao monarca @${kd.kingdom.marriage.split('@')[0]}!`, [kd.kingdom.marriage]);
    }
    return reply('⚠️ Marque outro monarca para propor casamento real!\nExemplo: `/reino casamento @marcarRei`');
  }

  const targetUser = getUser(targetJid);
  const targetKd = getKingdomData(targetUser);

  if (!targetKd || !targetKd.isMonarch) return reply('⚠️ O usuário escolhido precisa ser um monarca!');

  marriageProposals.set(targetJid, sender);

  return reply(`💍 *PROPOSTA DE CASAMENTO REAL!* ❤️\n\n` +
               `@${sender.split('@')[0]} pediu a mão em casamento de @${targetJid.split('@')[0]}!\n\n` +
               `👉 Para aceitar, @${targetJid.split('@')[0]} deve digitar: \`/reino casamento aceitar\``, [sender, targetJid]);
}

// 20. Ranking Global de Reinos
function handleKingdomRanking(reply) {
  const store = getStore();
  const allUsers = Object.values(store.users || {});

  const kingdomsList = [];

  allUsers.forEach(u => {
    const kd = getKingdomData(u);
    if (kd && kd.isMonarch) {
      const rep = calculateKingdomReputation(kd.kingdom);
      kingdomsList.push({
        jid: u.jid,
        name: kd.kingdom.name,
        level: kd.kingdom.level,
        treasury: kd.kingdom.treasury,
        population: kd.kingdom.population,
        reputation: rep
      });
    }
  });

  if (kingdomsList.length === 0) {
    return reply('🏰 *RANKING GLOBAL DE REINOS*\n\nNenhum reino fundado ainda no servidor!');
  }

  kingdomsList.sort((a, b) => b.reputation - a.reputation);

  let text = `🏆 *RANKING GLOBAL DOS MAIORES REINOS & IMPÉRIOS* 👑\n\n`;
  const top10 = kingdomsList.slice(0, 10);
  const mentions = [];

  top10.forEach((k, idx) => {
    const medals = ['🥇', '🥈', '🥉'];
    const badge = idx < 3 ? medals[idx] : `*#${idx + 1}*`;
    text += `${badge} **${k.name}**\n` +
            `• 👑 Monarca: @${k.jid.split('@')[0]}\n` +
            `• 🏆 Nível ${k.level} | ⭐ Reputação: ${k.reputation}\n` +
            `• 👥 População: ${k.population} | 🪙 Tesouro: $${k.treasury.toLocaleString('pt-BR')}\n\n`;
    mentions.push(k.jid);
  });

  return reply(text, mentions);
}

// 21. Menu de Ajuda de Comandos do Reino
function renderKingdomHelp(reply) {
  const text = `📜 *MENU COMPLETO DE COMANDOS DE REINO* 👑\n\n` +
               `🏰 *FUNDAÇÃO & GESTÃO:*\n` +
               `• \`/reino comprar <nome>\` ➔ Fundar novo reino ($200.000)\n` +
               `• \`/reino renomear <nome>\` ➔ Alterar nome do reino\n` +
               `• \`/reino\` ➔ Painel imperial do reino\n` +
               `• \`/reino construir\` ➔ Menu de construção e expansão\n\n` +
               `👥 *POPULAÇÃO & ECONOMIA:*\n` +
               `• \`/reino recrutar <qtd>\` ➔ Recrutar novos habitantes\n` +
               `• \`/reino trabalhadores\` ➔ Alocar tarefas (Agr, Lenh, Min, Com)\n` +
               `• \`/reino coletar\` ➔ Coletar recursos e ouro produzidos\n` +
               `• \`/reino imposto <1-100>\` ➔ Definir taxa de impostos\n` +
               `• \`/reino sacar <valor>\` ➔ Sacar ouro do tesouro para carteira\n` +
               `• \`/reino depositar <valor>\` ➔ Depositar carteira no tesouro\n` +
               `• \`/reino vender\` ➔ Mercado de troca de recursos por ouro\n\n` +
               `⚔️ *EXÉRCITO & GUERRAS:*\n` +
               `• \`/reino especializar <tipo>\` ➔ Escolher via estratégica (Nível 3)\n` +
               `• \`/reino treinar <qtd>\` ➔ Treinar soldados\n` +
               `• \`/reino equipamentos\` ➔ Evoluir armamento militar\n` +
               `• \`/reino general\` ➔ Contratar generais com bônus\n` +
               `• \`/guerra @rei\` ➔ Iniciar guerra de conquista\n\n` +
               `🤝 *DIPLOMACIA & RANKING:*\n` +
               `• \`/alianca @rei\` ➔ Propor ou aceitar aliança real\n` +
               `• \`/reino casamento @rei\` ➔ Propor casamento real\n` +
               `• \`/reinorank\` ➔ Ranking dos maiores impérios`;

  return reply(text);
}
