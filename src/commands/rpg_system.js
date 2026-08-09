import { getUser, updateUser } from '../database/sqlite.js';
import { askAi } from '../utils/aiService.js';
import { calculateBonusRewards, getUserStats } from '../utils/bonusCalculator.js';

export const RPG_CLASSES = {
  guerreiro: { name: '⚔️ Guerreiro de Aço', hp: 200, atk: 35, bonusMsg: 'Mais força (+25% moedas em combate, roubo, raid e missões)!' },
  mago: { name: '🔮 Mago Arcano', hp: 130, atk: 55, bonusMsg: 'Mais inteligência (+30% XP bônus em TODAS as atividades)!' },
  arqueiro: { name: '🏹 Arqueiro Elfo', hp: 150, atk: 45, bonusMsg: 'Mais agilidade (+25% moedas em pesca e minijogos)!' }
};

// Armazena o Chefe Ativo por chat (Group Raid)
export const activeGroupRaids = new Map();

async function getAiNarrative(prompt, sysInstruction) {
  try {
    const res = await askAi(prompt, sysInstruction);
    if (res) return res.trim().replace(/^["']|["']$/g, '');
  } catch (_) {}
  return null;
}

export async function handleRpgSystemCommands(sock, msg, command, args, sender) {
  const from = msg.key.remoteJid;
  const reply = async (text, mentions = []) => {
    await sock.sendMessage(from, { text, mentions }, { quoted: msg });
  };

  const user = getUser(sender);
  let extraData = {};
  try {
    extraData = typeof user.extra_data === 'string' ? JSON.parse(user.extra_data || '{}') : (user.extra_data || {});
  } catch (_) {
    extraData = {};
  }

  const userStats = getUserStats(user);

  switch (command) {
    case 'curar':
    case 'heal': {
      const now = Date.now();
      const HEAL_COOLDOWN = 15 * 60 * 1000; // 15 min de descanso
      const lastHeal = extraData.last_heal_time || 0;

      let inventory = [];
      try { inventory = JSON.parse(user.inventory || '[]'); } catch (_) {}
      const potionIdx = inventory.findIndex(i => i.includes('Poção de HP') || i.includes('Cura'));

      if (potionIdx !== -1) {
        inventory.splice(potionIdx, 1);
        extraData.current_hp = userStats.maxHp;
        extraData.last_heal_time = now;
        updateUser(sender, { inventory: JSON.stringify(inventory), extra_data: JSON.stringify(extraData) });
        return reply(`🧪 *POÇÃO DE CURA USADA!*\n\nSeu HP foi totalmente restaurado para **${userStats.maxHp}/${userStats.maxHp} HP**! ❤️`);
      }

      if (now - lastHeal < HEAL_COOLDOWN && userStats.isKnockedOut) {
        const remaining = HEAL_COOLDOWN - (now - lastHeal);
        const minutes = Math.floor(remaining / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
        return reply(`⏳ *DESCANSO EM ANDAMENTO!*\n\nVocê está nocauteado. Aguarde **${minutes}m ${seconds}s** de descanso ou compre uma \`Poção de HP\` na \`/loja\`!`);
      }

      extraData.current_hp = userStats.maxHp;
      extraData.last_heal_time = now;
      updateUser(sender, { extra_data: JSON.stringify(extraData) });

      return reply(`🩺 *REGENERAÇÃO CONCLUÍDA!*\n\nVocê descansou e recuperou seu vigor! ❤️ **HP:** ${userStats.maxHp}/${userStats.maxHp}`);
    }

    case 'guerreiro':
    case 'mago':
    case 'arqueiro':
    case 'classe': {
      let chosenClass = command === 'classe' ? args[0]?.toLowerCase() : command;
      if (!chosenClass || !RPG_CLASSES[chosenClass]) {
        let catalog = Object.keys(RPG_CLASSES).map(c => `• *${RPG_CLASSES[c].name}*\n  ⚔️ Ataque: ${userStats.classInfo.atk} | ❤️ Vida: ${userStats.classInfo.hp}\n  ✨ Tier Atual: ${userStats.classInfo.name}\n  👉 Escolha com: \`/classe ${c}\``).join('\n\n');
        return reply(`🛡️ *SISTEMA DE CLASSES RPG* 🛡️\n\nClasse atual: *${userStats.classInfo.name}* (Nível ${user.level})\n\nEscolha sua classe:\n\n${catalog}`);
      }

      extraData.rpg_class = chosenClass;
      updateUser(sender, { extra_data: JSON.stringify(extraData) });

      const newStats = getUserStats(getUser(sender));

      return reply(`🛡️ *CLASSE DEFINIDA COM SUCESSO!*\n\nVocê agora é um **${newStats.classInfo.name}**!\n⚔️ *Ataque Base:* ${newStats.classInfo.atk}\n❤️ *HP Máximo:* ${newStats.maxHp}\n✨ *Benefício:* Seus bônus de classe evoluem conforme seu Nível RPG!`);
    }

    case 'missao':
    case 'missoes': {
      if (userStats.isKnockedOut) {
        return reply(`💀 *VOCÊ ESTÁ NOCAUTEADO (K.O.)!*\n\nSeu HP é 0/${userStats.maxHp}. Use \`/curar\` para descansar ou tome uma \`Poção de HP\` da loja antes de ir a uma missão!`);
      }

      const quests = [
        { title: '📜 Caça ao Dragão Vermelho', rewardMoney: 2500, rewardXp: 300 },
        { title: '📜 Resgate do Amuleto Sagrado', rewardMoney: 1800, rewardXp: 200 },
        { title: '📜 Defesa da Vila contra Goblins', rewardMoney: 1200, rewardXp: 150 },
        { title: '📜 Exploração da Caverna de Cristal', rewardMoney: 3000, rewardXp: 400 }
      ];

      const quest = quests[Math.floor(Math.random() * quests.length)];

      const { finalCoins, finalXp, bonusCoinsApplied, bonusXpApplied } = calculateBonusRewards(user, quest.rewardMoney, quest.rewardXp, 'quest');

      const newWallet = user.wallet + finalCoins;
      const newXp = user.xp + finalXp;
      updateUser(sender, { wallet: newWallet, xp: newXp });

      const sys = 'Você é um Mestre de Guilda RPG épico em um jogo de aventura medieval. Escreva 1 relato dinâmico de 20 palavras sobre o cumprimento da missão. Sem aspas.';
      const prompt = `O guerreiro completou a missão "${quest.title}" usando suas habilidades.`;
      const aiStory = await getAiNarrative(prompt, sys) || 'Vitória épica conquistada nas profundezas da masmorra!';

      const bonusCoinsStr = bonusCoinsApplied > 0 ? ` *(+$${bonusCoinsApplied.toLocaleString('pt-BR')} bônus)*` : '';
      const bonusXpStr = bonusXpApplied > 0 ? ` *(+${bonusXpApplied} XP bônus)*` : '';

      const text = `⚔️ *MISSÃO CUMPRIDA PELA GUILDA!* ⚔️\n\n` +
                   `📜 *Missão:* ${quest.title}\n` +
                   `💰 *Recompensa:* +$${finalCoins.toLocaleString('pt-BR')} moedas${bonusCoinsStr}\n` +
                   `✨ *XP Adquirido:* +${finalXp} XP${bonusXpStr}\n\n` +
                   `📖 *Relato do Mestre da Guilda (IA):*\n_"${aiStory}"_`;

      return reply(text);
    }

    case 'raid':
    case 'chefe': {
      const now = Date.now();
      const RAID_SESSION_COOLDOWN = 12 * 60 * 60 * 1000; // 12 horas entre Raids
      const TURN_COOLDOWN = 30 * 1000; // 30 segundos entre golpes na mesma Raid

      if (userStats.isKnockedOut) {
        return reply(`💀 *VOCÊ ESTÁ NOCAUTEADO (0/${userStats.maxHp} HP)!*\n\nVocê não pode atacar o chefe da Raid desacordado! Use \`/curar\` para recuperar suas forças.`);
      }

      let raid = activeGroupRaids.get(from);

      // Se não há Raid ativa no grupo, verifica o tempo para iniciar uma nova Raid inteira
      if (!raid) {
        const lastRaidSession = extraData.last_raid_session_time || 0;
        if (now - lastRaidSession < RAID_SESSION_COOLDOWN) {
          const remaining = RAID_SESSION_COOLDOWN - (now - lastRaidSession);
          const hours = Math.floor(remaining / (1000 * 60 * 60));
          const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
          return reply(`⏳ *PRÓXIMA RAID EM PREPARAÇÃO!* 🏰\n\nA guilda está mapeando a localização do próximo monstro supremo.\n⏱️ *Tempo para a próxima Raid inteira:* *${hours}h ${minutes}m*`);
        }

        // Criar uma nova Raid inteira de grupo!
        const bosses = [
          { name: '🐲 DRAGÃO ANCIÃO DO APOCALIPSE', hp: 3000, maxHp: 3000, rewardPool: 75000 },
          { name: '👹 REI DOS GOBLINS SOMBRIOS', hp: 2000, maxHp: 2000, rewardPool: 45000 },
          { name: '🗿 COLOSSO DE PEDRA RÚNICA', hp: 4500, maxHp: 4500, rewardPool: 120000 },
          { name: '⚡ LORDE DOS TIÇÕES INFERNAIS', hp: 6000, maxHp: 6000, rewardPool: 180000 }
        ];
        const boss = bosses[Math.floor(Math.random() * bosses.length)];

        raid = {
          boss,
          startTime: now,
          participants: new Map() // sender -> damage
        };
        activeGroupRaids.set(from, raid);
      }

      // Verificação do turno de ataque (30s) na Raid inteira em andamento
      const lastAttack = extraData.last_raid_attack_time || 0;
      if (now - lastAttack < TURN_COOLDOWN) {
        const remainingSec = Math.ceil((TURN_COOLDOWN - (now - lastAttack)) / 1000);
        return reply(`⏳ *RECUPERANDO FÔLEGO!*\n\nAguarde *${remainingSec}s* para desferir o seu próximo golpe contra o chefe da Raid!`);
      }

      // Dano do jogador
      const dmg = userStats.totalAtk + Math.floor(Math.random() * 40) + 15;
      const currentDmg = raid.participants.get(sender) || 0;
      raid.participants.set(sender, currentDmg + dmg);
      raid.boss.hp -= dmg;

      // Contra-ataque do chefe
      const bossCounterAtk = Math.max(20, Math.floor(Math.random() * 50) + 25);
      let newPlayerHp = Math.max(0, userStats.currentHp - bossCounterAtk);
      let reviveText = '';

      // Habilidade da Fênix Imortal (Auto-reviver 1x)
      if (newPlayerHp <= 0 && userStats.petInfo && userStats.petInfo.id === 'fenix') {
        newPlayerHp = userStats.maxHp;
        reviveText = '\n🦅 *SUA FÊNIX IMORTAL RENASCEU VOCÊ DAS CINZAS!* (HP 100% restaurado!)';
      }

      extraData.current_hp = newPlayerHp;
      extraData.last_raid_attack_time = now;
      extraData.last_raid_session_time = raid.startTime;
      updateUser(sender, { extra_data: JSON.stringify(extraData) });

      if (raid.boss.hp <= 0) {
        // Chefe Derrotado! Divisão do Tesouro entre todos os participantes da Raid
        const totalDamage = Array.from(raid.participants.values()).reduce((a, b) => a + b, 0);
        let rewardReport = '';
        const mentions = [];

        for (const [pSender, pDamage] of raid.participants.entries()) {
          const shareRatio = pDamage / totalDamage;
          const rawReward = Math.floor(raid.boss.rewardPool * shareRatio);
          const pUser = getUser(pSender);
          const { finalCoins, finalXp } = calculateBonusRewards(pUser, rawReward, 500, 'raid');

          updateUser(pSender, { wallet: pUser.wallet + finalCoins, xp: pUser.xp + finalXp });

          rewardReport += `• @${pSender.split('@')[0]} ➔ ${pDamage} dano (+$${finalCoins.toLocaleString('pt-BR')} moedas e +${finalXp} XP)\n`;
          mentions.push(pSender);
        }

        activeGroupRaids.delete(from);

        const sys = 'Você é um narrador épico de batalhas de chefe em jogos MMORPG. Escreva 1 parágrafo vibrante de 20 palavras sobre o golpe final derrotando o monstro lendário. Sem aspas.';
        const prompt = `O chefe ${raid.boss.name} foi derrotado pela união do grupo de aventureiros!`;
        const aiStory = await getAiNarrative(prompt, sys) || 'Com um rugido estrondoso, o monstro lendário caiu derrotado!';

        const text = `🏆 *RAID CONCLUÍDA — CHEFE DERROTADO!* 🏆\n\n` +
                     `👾 *Monstro Lendário:* ${raid.boss.name}\n\n` +
                     `📜 *Crônica da Batalha (IA):*\n_"${aiStory}"_\n\n` +
                     `💰 *DIVISÃO DO TESOURO DA RAID:*\n${rewardReport}\n` +
                     `⏱️ *Próxima Raid do grupo disponível em:* 12 horas!`;

        return reply(text, mentions);
      }

      const sys = 'Você é o narrador de um combate RPG em grupo. Escreva 1 frase ágil de 12 palavras sobre o ataque do jogador ao chefe. Sem aspas.';
      const prompt = `O jogador atacou o chefe ${raid.boss.name} causando ${dmg} de dano!`;
      const aiStory = await getAiNarrative(prompt, sys) || 'Um golpe certeiro atingiu o monstro!';

      const koStatusText = newPlayerHp <= 0 ? '💀 *VOCÊ FOI NOCAUTEADO (K.O.)!* Use `/curar`' : `❤️ *Seu HP:* ${newPlayerHp}/${userStats.maxHp}`;

      const text = `⚔️ *BATALHA DE RAID EM GRUPO (SESSÃO ATIVA)* ⚔️\n\n` +
                   `👾 *Chefe:* ${raid.boss.name}\n` +
                   `❤️ *Vida Restante:* ${Math.max(0, raid.boss.hp)}/${raid.boss.maxHp} HP\n\n` +
                   `💥 *Seu Golpe:* +${dmg} de Dano!\n` +
                   `🛡️ *Contra-ataque do Chefe:* -${bossCounterAtk} de HP recebido!\n` +
                   `${koStatusText}${reviveText}\n\n` +
                   `📖 *Narrativa da Rodada (IA):*\n_"${aiStory}"_\n\n` +
                   `💡 _Continue atacando a cada 30 segundos com \`/raid\` junto com seu grupo até derrotá-lo!_`;

      return reply(text);
    }
  }
}
