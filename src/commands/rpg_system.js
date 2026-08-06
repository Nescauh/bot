import { getUser, updateUser } from '../database/sqlite.js';
import { askAi } from '../utils/aiService.js';

export const RPG_CLASSES = {
  guerreiro: { name: '⚔️ Guerreiro de Aço', hp: 200, atk: 35, bonusMsg: 'Mais força em duelos e roubos!' },
  mago: { name: '🔮 Mago Arcano', hp: 130, atk: 55, bonusMsg: 'Mais inteligência e ganho de XP!' },
  arqueiro: { name: '🏹 Arqueiro Elfo', hp: 150, atk: 45, bonusMsg: 'Mais agilidade e sorte na pesca e minijogos!' }
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

  switch (command) {
    case 'guerreiro':
    case 'mago':
    case 'arqueiro':
    case 'classe': {
      let chosenClass = command === 'classe' ? args[0]?.toLowerCase() : command;
      if (!chosenClass || !RPG_CLASSES[chosenClass]) {
        let catalog = Object.keys(RPG_CLASSES).map(c => `• *${RPG_CLASSES[c].name}*\n  ⚔️ Ataque: ${RPG_CLASSES[c].atk} | ❤️ Vida: ${RPG_CLASSES[c].hp}\n  ✨ Bônus: ${RPG_CLASSES[c].bonusMsg}\n  👉 Escolha com: \`/classe ${c}\``).join('\n\n');
        return reply(`🛡️ *SISTEMA DE CLASSES RPG* 🛡️\n\nClasse atual: *${extraData.rpg_class ? RPG_CLASSES[extraData.rpg_class]?.name : 'Nenhuma'}*\n\nEscolha sua classe:\n\n${catalog}`);
      }

      extraData.rpg_class = chosenClass;
      updateUser(sender, { extra_data: JSON.stringify(extraData) });

      return reply(`🛡️ *CLASSE DEFINIDA COM SUCESSO!*\n\nVocê agora é um **${RPG_CLASSES[chosenClass].name}**!\n⚔️ *Ataque Base:* ${RPG_CLASSES[chosenClass].atk}\n❤️ *HP Base:* ${RPG_CLASSES[chosenClass].hp}\n✨ *Benefício:* ${RPG_CLASSES[chosenClass].bonusMsg}`);
    }

    case 'missao':
    case 'missoes': {
      const quests = [
        { title: '📜 Caça ao Dragão Vermelho', rewardMoney: 2500, rewardXp: 300 },
        { title: '📜 Resgate do Amuleto Sagrado', rewardMoney: 1800, rewardXp: 200 },
        { title: '📜 Defesa da Vila contra Goblins', rewardMoney: 1200, rewardXp: 150 },
        { title: '📜 Exploração da Caverna de Cristal', rewardMoney: 3000, rewardXp: 400 }
      ];

      const quest = quests[Math.floor(Math.random() * quests.length)];
      const userClass = RPG_CLASSES[extraData.rpg_class || 'guerreiro'];

      const newWallet = user.wallet + quest.rewardMoney;
      const newXp = user.xp + quest.rewardXp;
      updateUser(sender, { wallet: newWallet, xp: newXp });

      const sys = 'Você é um Mestre de Guilda RPG épico em um jogo de aventura medieval. Escreva 1 relato dinâmico de 20 palavras sobre o cumprimento da missão. Sem aspas.';
      const prompt = `O ${userClass.name} completou a missão "${quest.title}" usando suas habilidades.`;
      const aiStory = await getAiNarrative(prompt, sys) || 'Vitória épica conquistada nas profundezas da masmorra!';

      const text = `⚔️ *MISSÃO CUMPRIDA PELA GUILDA!* ⚔️\n\n` +
                   `📜 *Missão:* ${quest.title}\n` +
                   `💰 *Recompensa:* +$${quest.rewardMoney.toLocaleString('pt-BR')} moedas\n` +
                   `✨ *XP Adquirido:* +${quest.rewardXp} XP\n\n` +
                   `📖 *Relato do Mestre da Guilda (IA):*\n_"${aiStory}"_`;

      return reply(text);
    }

    case 'raid':
    case 'chefe': {
      let raid = activeGroupRaids.get(from);

      if (!raid) {
        // Criar uma nova Raid no grupo
        const bosses = [
          { name: '🐲 DRAGÃO ANCIÃO DO APOCALIPSE', hp: 1000, maxHp: 1000, rewardPool: 20000 },
          { name: '👹 REI DOS GOBLINS SOMBRIOS', hp: 600, maxHp: 600, rewardPool: 10000 },
          { name: 'COLOSSO DE PEDRA RUNICA', hp: 1500, maxHp: 1500, rewardPool: 35000 }
        ];
        const boss = bosses[Math.floor(Math.random() * bosses.length)];

        raid = {
          boss,
          participants: new Map() // sender -> damage
        };
        activeGroupRaids.set(from, raid);
      }

      const userClass = RPG_CLASSES[extraData.rpg_class || 'guerreiro'];
      const dmg = userClass.atk + Math.floor(Math.random() * 40) + 10;

      const currentDmg = raid.participants.get(sender) || 0;
      raid.participants.set(sender, currentDmg + dmg);
      raid.boss.hp -= dmg;

      if (raid.boss.hp <= 0) {
        // Chefe Derrotado! Divisão do Tesouro entre todos os combatentes
        const totalDamage = Array.from(raid.participants.values()).reduce((a, b) => a + b, 0);
        let rewardReport = '';
        const mentions = [];

        for (const [pSender, pDamage] of raid.participants.entries()) {
          const shareRatio = pDamage / totalDamage;
          const shareReward = Math.floor(raid.boss.rewardPool * shareRatio);
          const pUser = getUser(pSender);
          updateUser(pSender, { wallet: pUser.wallet + shareReward });

          rewardReport += `• @${pSender.split('@')[0]} ➔ ${pDamage} de dano (+$${shareReward.toLocaleString('pt-BR')})\n`;
          mentions.push(pSender);
        }

        activeGroupRaids.delete(from);

        const sys = 'Você é um narrador épico de batalhas de chefe em jogos MMORPG. Escreva 1 parágrafo vibrante de 20 palavras sobre o golpe final derrotando o monstro lendário. Sem aspas.';
        const prompt = `O chefe ${raid.boss.name} foi derrotado pela união do grupo de aventureiros!`;
        const aiStory = await getAiNarrative(prompt, sys) || 'Com um rugido estrondoso, o monstro lendário caiu derrotado!';

        const text = `🏆 *CHEFE DERROTADO PELO GRUPO!* 🏆\n\n` +
                     `👾 *Monstro:* ${raid.boss.name}\n\n` +
                     `📜 *Crônica da Batalha (IA):*\n_"${aiStory}"_\n\n` +
                     `💰 *DIVISÃO DO TESOURO:*\n${rewardReport}`;

        return reply(text, mentions);
      }

      const sys = 'Você é o narrador de um combate RPG em grupo. Escreva 1 frase ágil de 12 palavras sobre o ataque do jogador ao chefe. Sem aspas.';
      const prompt = `O jogador atacou o chefe ${raid.boss.name} causando ${dmg} de dano!`;
      const aiStory = await getAiNarrative(prompt, sys) || 'Um golpe certeiro atingiu a armadura do monstro!';

      const text = `⚔️ *BATALHA DE RAID EM GRUPO* ⚔️\n\n` +
                   `👾 *Chefe:* ${raid.boss.name}\n` +
                   `❤️ *Vida do Chefe:* ${raid.boss.hp}/${raid.boss.maxHp} HP\n\n` +
                   `💥 *Seu Ataque:* Você causou **${dmg}** de dano!\n\n` +
                   `🎙️ *Narrador da Arena (IA):*\n_"${aiStory}"_\n\n` +
                   `💡 _Outros membros do grupo podem usar /raid para atacar juntos!_`;

      return reply(text);
    }
  }
}
