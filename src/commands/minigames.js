import { getUser, updateUser } from '../database/sqlite.js';
import { askAi } from '../utils/aiService.js';

async function getAiCommentary(prompt, sysInstruction) {
  try {
    const res = await askAi(prompt, sysInstruction);
    if (res) return res.trim().replace(/^["']|["']$/g, '');
  } catch (_) {}
  return null;
}

export async function handleMinigamesCommands(sock, msg, command, args, sender, mentioned) {
  const from = msg.key.remoteJid;
  const reply = async (text, mentions = []) => {
    await sock.sendMessage(from, { text, mentions }, { quoted: msg });
  };

  const user = getUser(sender);
  const bet = parseInt(args[0], 10) || 500;

  switch (command) {
    case 'blackjack':
    case '21': {
      if (bet <= 0) return reply('⚠️ Informe uma aposta válida maior que zero.\nExemplo: `/blackjack 1000`');
      if (user.wallet < bet) return reply(`⚠️ Você não possui **$${bet.toLocaleString('pt-BR')}** na carteira para apostar.`);

      const pCard1 = Math.floor(Math.random() * 10) + 1;
      const pCard2 = Math.floor(Math.random() * 10) + 1;
      const dCard1 = Math.floor(Math.random() * 10) + 1;
      const dCard2 = Math.floor(Math.random() * 10) + 1;

      const playerTotal = pCard1 + pCard2;
      const dealerTotal = dCard1 + dCard2;

      let won = false;
      let draw = false;

      if (playerTotal > 21) {
        won = false;
      } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
        won = true;
      } else if (playerTotal === dealerTotal) {
        draw = true;
      }

      let netProfit = 0;
      if (won) {
        netProfit = bet;
        updateUser(sender, { wallet: user.wallet + netProfit });
      } else if (!draw) {
        netProfit = -bet;
        updateUser(sender, { wallet: Math.max(0, user.wallet - bet) });
      }

      const sys = 'Você é um crupiê elegante e sarcástico de cassino em Las Vegas num bot de WhatsApp. Escreva 1 comentário narrativo dinâmico de 15 palavras sobre o resultado da rodada de Blackjack. Sem aspas.';
      const prompt = `O jogador tirou ${pCard1} e ${pCard2} (total ${playerTotal}). O crupiê tirou ${dCard1} e ${dCard2} (total ${dealerTotal}). Resultado: ${won ? 'Jogador Venceu' : draw ? 'Empate' : 'Jogador Perdeu'}.`;
      const aiStory = await getAiCommentary(prompt, sys) || (won ? 'As cartas sorriram para você na mesa!' : 'A casa sempre vence!');

      const text = `🃏 *BLACKJACK (21) CASSINO IA* 🃏\n\n` +
                   `🎴 *Suas Cartas:* [${pCard1}] [${pCard2}] ➔ *Total: ${playerTotal}*\n` +
                   `🎰 *Mesa do Crupiê:* [${dCard1}] [${dCard2}] ➔ *Total: ${dealerTotal}*\n\n` +
                   `${won ? `🎉 *VOCÊ VENCEU!* (+$${bet.toLocaleString('pt-BR')})` : draw ? '⚖️ *EMPATE!* Sua aposta foi devolvida.' : `💥 *VOCÊ PERDEU!* (-$${bet.toLocaleString('pt-BR')})`}\n\n` +
                   `💬 *Comentário do Crupiê (IA):*\n_"${aiStory}"_`;

      return reply(text);
    }

    case 'poker': {
      if (bet <= 0) return reply('⚠️ Informe uma aposta válida maior que zero.\nExemplo: `/poker 1000`');
      if (user.wallet < bet) return reply(`⚠️ Você precisa de **$${bet.toLocaleString('pt-BR')}** para jogar Poker.`);

      const hands = ['Mão Alta', 'Um Par', 'Dois Pares', 'Trinca', 'Sequência', 'Flush', 'Full House', 'Quadra', 'Royal Flush'];
      const playerHandIdx = Math.floor(Math.random() * hands.length);
      const botHandIdx = Math.floor(Math.random() * hands.length);

      const won = playerHandIdx > botHandIdx;
      const draw = playerHandIdx === botHandIdx;

      let gain = 0;
      if (won) {
        gain = Math.floor(bet * (1.5 + (playerHandIdx * 0.3)));
        updateUser(sender, { wallet: user.wallet + gain });
      } else if (!draw) {
        updateUser(sender, { wallet: Math.max(0, user.wallet - bet) });
      }

      const sys = 'Você é um narrador profissional do World Series of Poker no WhatsApp. Escreva 1 comentário dinâmico e empolgante de 15 palavras sobre o showdown final. Sem aspas.';
      const prompt = `Showdown! Jogador revelou ${hands[playerHandIdx]} contra a mesa com ${hands[botHandIdx]}. Resultado: ${won ? 'Vitória' : draw ? 'Empate' : 'Derrota'}.`;
      const aiStory = await getAiCommentary(prompt, sys) || (won ? 'Que jogada espetacular na mesa de apostas!' : 'Seu blefe não funcionou desta vez.');

      const text = `♠️ *MESA DE POKER HIGH ROLLER IA* ♠️\n\n` +
                   `🎴 *Sua Mão:* **${hands[playerHandIdx]}**\n` +
                   `🤖 *Mão da Banca:* **${hands[botHandIdx]}**\n\n` +
                   `${won ? `🏆 *VITÓRIA NO POKER!* (+$${gain.toLocaleString('pt-BR')})` : draw ? '⚖️ *EMPATE!* Aposta devolvida.' : `💸 *PERDEU A MÃO!* (-$${bet.toLocaleString('pt-BR')})`}\n\n` +
                   `🎙️ *Narrador de Poker (IA):*\n_"${aiStory}"_`;

      return reply(text);
    }

    case 'cacaniquel':
    case 'slots': {
      if (bet <= 0) return reply('⚠️ Informe uma aposta válida maior que zero.\nExemplo: `/slots 500`');
      if (user.wallet < bet) return reply(`⚠️ Saldo insuficiente na carteira para o Caça-Níquel.`);

      const symbols = ['💎', '7️⃣', '🔔', '🍋', '🍒', '🌟'];
      const s1 = symbols[Math.floor(Math.random() * symbols.length)];
      const s2 = symbols[Math.floor(Math.random() * symbols.length)];
      const s3 = symbols[Math.floor(Math.random() * symbols.length)];

      let multiplier = 0;
      if (s1 === s2 && s2 === s3) {
        multiplier = s1 === '7️⃣' ? 10 : s1 === '💎' ? 7 : 5;
      } else if (s1 === s2 || s2 === s3 || s1 === s3) {
        multiplier = 2;
      }

      const profit = bet * multiplier;
      if (multiplier > 0) {
        updateUser(sender, { wallet: user.wallet + profit });
      } else {
        updateUser(sender, { wallet: Math.max(0, user.wallet - bet) });
      }

      const sys = 'Você é uma maquina Caça-Níquel animada e misteriosa de Las Vegas. Escreva 1 frase mágica ou sarcástica de 12 palavras sobre o giro das roletas. Sem aspas.';
      const prompt = `Resultado das roletas: [${s1}] [${s2}] [${s3}]. Multiplicador: ${multiplier}x.`;
      const aiStory = await getAiCommentary(prompt, sys) || 'A roleta girou e o destino foi selado!';

      const text = `🎰 *CAÇA-NÍQUEL CASSINO IA* 🎰\n\n` +
                   `╔═════════════╗\n` +
                   `  [ ${s1} | ${s2} | ${s3} ]  \n` +
                   `╚═════════════╝\n\n` +
                   `${multiplier > 0 ? `🎉 *JACKPOT!* Ganhou **${multiplier}x** (+$${profit.toLocaleString('pt-BR')})` : `💔 *NÃO FOI DESSA VEZ!* (-$${bet.toLocaleString('pt-BR')})`}\n\n` +
                   `✨ *Voz da Roleta (IA):*\n_"${aiStory}"_`;

      return reply(text);
    }

    case 'pescar':
    case 'pesca': {
      const catches = [
        { name: '🐟 Tainha Fresca', val: 300 },
        { name: '🐠 Peixe Palhaço', val: 600 },
        { name: '🐙 Polvo Gigante', val: 1500 },
        { name: '🦈 Tubarão Martelo', val: 4000 },
        { name: '👑 Peixe Dourado Místico', val: 10000 },
        { name: '👟 Bota Velha Furada', val: 10 }
      ];

      const item = catches[Math.floor(Math.random() * catches.length)];
      const newWallet = user.wallet + item.val;
      updateUser(sender, { wallet: newWallet });

      const sys = 'Você é um velho pescador lendário e contador de histórias à beira do rio. Escreva 1 frase pitoresca de 15 palavras sobre o momento da fisgada. Sem aspas.';
      const prompt = `O pescador jogou a linha e fisgou um(a): ${item.name} valendo ${item.val} moedas.`;
      const aiStory = await getAiCommentary(prompt, sys) || 'A vara curvou forte e a água espumou!';

      const text = `🎣 *EXPEDIÇÃO DE PESCA IA* 🎣\n\n` +
                   `🌊 Você jogou a anzol no lago e fisgou:\n` +
                   `👉 **${item.name}**!\n` +
                   `💰 *Valor de Venda:* +$${item.val.toLocaleString('pt-BR')}\n\n` +
                   `📜 *Relato do Velho Pescador (IA):*\n_"${aiStory}"_`;

      return reply(text);
    }

    case 'roubar': {
      const target = mentioned[0] || msg.message?.extendedTextMessage?.contextInfo?.participant;
      if (!target || target === sender) {
        return reply('⚠️ Marque quem deseja assaltar!\nExemplo: `/roubar @usuario`');
      }

      const targetUser = getUser(target);
      if (targetUser.wallet < 200) {
        return reply(`⚠️ @${target.split('@')[0]} é muito pobre e não tem nem $200 na carteira!`, [target]);
      }

      const success = Math.random() < 0.45; // 45% de chance de sucesso

      let text = '';
      let mentions = [sender, target];

      if (success) {
        const amountStolen = Math.floor(targetUser.wallet * (Math.random() * 0.3 + 0.1)); // 10% a 40% da carteira
        updateUser(target, { wallet: Math.max(0, targetUser.wallet - amountStolen) });
        updateUser(sender, { wallet: user.wallet + amountStolen });

        const sys = 'Você é um narrador de filmes de assalto à banco e ação policial. Escreva 1 relato engraçado e ágil de 18 palavras sobre um roubo bem sucedido. Sem aspas.';
        const prompt = `O assaltante @${sender.split('@')[0]} roubou $${amountStolen} da carteira de @${target.split('@')[0]} e escapou num carro rápido.`;
        const aiStory = await getAiCommentary(prompt, sys) || 'Fuga perfeita em alta velocidade!';

        text = `🥷 *ASSALTO BEM SUCEDIDO!* 🥷\n\n` +
               `💰 @${sender.split('@')[0]} passou a perna e roubou **$${amountStolen.toLocaleString('pt-BR')}** de @${target.split('@')[0]}!\n\n` +
               `🚨 *Relato do Assalto (IA):*\n_"${aiStory}"_`;
      } else {
        const fine = Math.floor(user.wallet * 0.2) + 500;
        updateUser(sender, { wallet: Math.max(0, user.wallet - fine) });

        const sys = 'Você é um narrador de polícia e sirenes de TV. Escreva 1 relato hilário de 18 palavras sobre um assaltante atrapalhado que foi pego e multado pela polícia. Sem aspas.';
        const prompt = `O assaltante @${sender.split('@')[0]} tentou roubar @${target.split('@')[0]}, tropeçou no cadarço e foi preso levando multa de $${fine}.`;
        const aiStory = await getAiCommentary(prompt, sys) || 'A polícia chegou na hora e o larápio se deu mal!';

        text = `🚔 *DEU RUIM! POLÍCIA EM AÇÃO!* 🚔\n\n` +
               `🚨 @${sender.split('@')[0]} tentou roubar @${target.split('@')[0]} mas foi pego em flagrante!\n` +
               `💸 *Multa da Polícia:* -$${fine.toLocaleString('pt-BR')}\n\n` +
               `📺 *Boletim Policial (IA):*\n_"${aiStory}"_`;
      }

      return reply(text, mentions);
    }
  }
}
