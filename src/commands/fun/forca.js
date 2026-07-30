// Módulo de Jogo da Forca com Estado Interativo

const wordsWithHints = [
  { word: 'WHATSAPP', hint: 'Aplicativo de mensagens' },
  { word: 'TECNOLOGIA', hint: 'Ciência dos recursos computacionais' },
  { word: 'PROGRAMACAO', hint: 'Arte de escrever código' },
  { word: 'SUBARUBOT', hint: 'Nome do seu bot preferido' },
  { word: 'DESENVOLVIMENTO', hint: 'Processo de criação de software' },
  { word: 'BATERIA', hint: 'Fonte de energia do celular' },
  { word: 'ALGORITMO', hint: 'Sequência lógica de instruções' },
  { word: 'COMPUTADOR', hint: 'Máquina eletrônica de processamento de dados' },
  { word: 'INTERNET', hint: 'Rede mundial de computadores' },
  { word: 'BRASIL', hint: 'País do futebol e do samba' },
  { word: 'CHOCOLATE', hint: 'Doce feito a partir do cacau' },
  { word: 'FUTEBOL', hint: 'Esporte mais popular do mundo' },
  { word: 'PIZZA', hint: 'Prato tradicional italiano com queijo' },
  { word: 'CELULAR', hint: 'Dispositivo móvel usado no dia a dia' },
  { word: 'TELEVISAO', hint: 'Aparelho de transmissão de imagens e som' }
];

// Armazena os jogos ativos por chat: { [chatJid]: { word, hint, guessedLetters: [], wrongAttempts, maxAttempts } }
export const activeForcaGames = new Map();

// Remove acentos para comparação
function normalizeString(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

// Gera barra visual de vidas
function renderHangingStatus(wrongAttempts, maxAttempts) {
  const remaining = maxAttempts - wrongAttempts;
  return '❤️'.repeat(remaining) + '🖤'.repeat(wrongAttempts);
}

// Formata o texto exibido da palavra
function renderMaskedWord(word, guessedLetters) {
  return word
    .split('')
    .map(letter => (guessedLetters.includes(letter) ? letter : '_'))
    .join(' ');
}

// Handler principal do comando /forca
export async function handleForcaCommand(sock, msg, args, sender) {
  const from = msg.key.remoteJid;
  const inputArg = args.join(' ').trim();
  const normalizedArg = normalizeString(inputArg);

  // Se passou 'reset' ou 'novo', encerra o jogo atual se houver
  if (['RESET', 'NOVO', 'REINICIAR', 'CANCELAR'].includes(normalizedArg)) {
    activeForcaGames.delete(from);
    return startNewForcaGame(sock, msg, from);
  }

  // Se já houver um jogo ativo
  let game = activeForcaGames.get(from);

  if (!game) {
    return startNewForcaGame(sock, msg, from);
  }

  // Se o usuário passou um palpite junto com o comando (ex: /forca A ou /forca TECNOLOGIA)
  if (normalizedArg.length > 0) {
    return processForcaGuess(sock, msg, from, normalizedArg, sender);
  }

  // Se não passou argumentos e já há jogo ativo, exibe o estado atual
  const masked = renderMaskedWord(game.word, game.guessedLetters);
  const lives = renderHangingStatus(game.wrongAttempts, game.maxAttempts);

  const text = `🎯 *JOGO DA FORCA EM ANDAMENTO*\n\n` +
               `💡 *Dica:* ${game.hint}\n` +
               `🔤 *Palavra:* \`${masked}\`\n\n` +
               `❤️ *Vidas:* ${lives} (${game.maxAttempts - game.wrongAttempts}/${game.maxAttempts})\n` +
               `📝 *Letras já tentadas:* ${game.guessedLetters.length > 0 ? game.guessedLetters.join(', ') : 'Nenhuma'}\n\n` +
               `👉 *Como jogar:* Envie uma letra ou a palavra inteira no chat (ex: \`A\` ou \`/forca A\`)!`;

  return sock.sendMessage(from, { text }, { quoted: msg });
}

// Inicia um novo jogo
function startNewForcaGame(sock, msg, from) {
  const randomObj = wordsWithHints[Math.floor(Math.random() * wordsWithHints.length)];
  const normalizedWord = normalizeString(randomObj.word);

  const game = {
    word: normalizedWord,
    hint: randomObj.hint,
    guessedLetters: [],
    wrongAttempts: 0,
    maxAttempts: 6
  };

  activeForcaGames.set(from, game);

  const masked = renderMaskedWord(game.word, game.guessedLetters);
  const lives = renderHangingStatus(0, game.maxAttempts);

  const text = `🎯 *NOVO JOGO DA FORCA INICIADO!*\n\n` +
               `💡 *Dica:* ${game.hint}\n` +
               `🔤 *Palavra:* \`${masked}\` (${normalizedWord.length} letras)\n\n` +
               `❤️ *Vidas:* ${lives}\n\n` +
               `💬 *Como jogar:* Envie qualquer letra ou palpite no chat!`;

  return sock.sendMessage(from, { text }, { quoted: msg });
}

// Processa o chute do usuário no chat
export async function processForcaGuess(sock, msg, from, guess, sender) {
  const game = activeForcaGames.get(from);
  if (!game) return false;

  const cleanGuess = normalizeString(guess);
  if (!cleanGuess || cleanGuess.startsWith('/')) return false;

  // Se for apenas uma letra
  if (cleanGuess.length === 1) {
    if (game.guessedLetters.includes(cleanGuess)) {
      await sock.sendMessage(from, { text: `⚠️ A letra *${cleanGuess}* já foi tentada anteriormente!` }, { quoted: msg });
      return true;
    }

    game.guessedLetters.push(cleanGuess);

    // Letra correta
    if (game.word.includes(cleanGuess)) {
      const masked = renderMaskedWord(game.word, game.guessedLetters);
      
      // Verificar vitória
      if (!masked.includes('_')) {
        activeForcaGames.delete(from);
        const text = `🎉 *PARABÉNS!* @${sender.split('@')[0]} acertou a última letra e venceu a Forca!\n\n` +
                     `🔤 *Palavra completa:* *${game.word}* 🏆`;
        await sock.sendMessage(from, { text, mentions: [sender] }, { quoted: msg });
        return true;
      }

      const lives = renderHangingStatus(game.wrongAttempts, game.maxAttempts);
      const text = `✅ Boa! A letra *${cleanGuess}* existe na palavra!\n\n` +
                   `🔤 *Palavra:* \`${masked}\`\n` +
                   `❤️ *Vidas:* ${lives}\n` +
                   `📝 *Tentativas:* ${game.guessedLetters.join(', ')}`;
      await sock.sendMessage(from, { text }, { quoted: msg });
      return true;
    } 
    // Letra incorreta
    else {
      game.wrongAttempts += 1;
      const lives = renderHangingStatus(game.wrongAttempts, game.maxAttempts);

      // Verificar derrota
      if (game.wrongAttempts >= game.maxAttempts) {
        activeForcaGames.delete(from);
        const text = `☠️ *GAME OVER!* As vidas acabaram e a forca foi armada!\n\n` +
                     `❌ *A palavra secreta era:* *${game.word}*`;
        await sock.sendMessage(from, { text }, { quoted: msg });
        return true;
      }

      const masked = renderMaskedWord(game.word, game.guessedLetters);
      const text = `❌ A letra *${cleanGuess}* NÃO existe na palavra!\n\n` +
                   `🔤 *Palavra:* \`${masked}\`\n` +
                   `❤️ *Vidas:* ${lives} (${game.maxAttempts - game.wrongAttempts}/${game.maxAttempts})\n` +
                   `📝 *Tentativas:* ${game.guessedLetters.join(', ')}`;
      await sock.sendMessage(from, { text }, { quoted: msg });
      return true;
    }
  } 
  // Se for tentativa de adivinhar a palavra inteira
  else {
    if (cleanGuess === game.word) {
      activeForcaGames.delete(from);
      const text = `🎉 *INCRÍVEL!* @${sender.split('@')[0]} adivinhou a palavra inteira e venceu a Forca!\n\n` +
                   `🔤 *Palavra:* *${game.word}* 🏆`;
      await sock.sendMessage(from, { text, mentions: [sender] }, { quoted: msg });
      return true;
    } else {
      game.wrongAttempts += 1;
      const lives = renderHangingStatus(game.wrongAttempts, game.maxAttempts);

      if (game.wrongAttempts >= game.maxAttempts) {
        activeForcaGames.delete(from);
        const text = `☠️ *GAME OVER!* A palavra *${cleanGuess}* estava errada e suas vidas acabaram!\n\n` +
                     `❌ *A palavra secreta era:* *${game.word}*`;
        await sock.sendMessage(from, { text }, { quoted: msg });
        return true;
      }

      const masked = renderMaskedWord(game.word, game.guessedLetters);
      const text = `❌ A palavra *${cleanGuess}* está errada!\n\n` +
                   `🔤 *Palavra:* \`${masked}\`\n` +
                   `❤️ *Vidas:* ${lives}`;
      await sock.sendMessage(from, { text }, { quoted: msg });
      return true;
    }
  }
}
