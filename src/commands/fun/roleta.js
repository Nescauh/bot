const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function handleRoletaCommand(sock, msg, sender) {
  const from = msg.key.remoteJid;
  const username = `@${sender.split('@')[0]}`;

  const isDead = Math.floor(Math.random() * 6) === 0;

  // 1. Mensagem Inicial
  await sock.sendMessage(from, { 
    text: `🔫 *ROLETA RUSSA* 🔫\n\n${username} colocou uma bala no tambor e gira a câmara...`,
    mentions: [sender]
  }, { quoted: msg });

  await sleep(1200);

  // 2. Contagem 1
  await sock.sendMessage(from, { 
    text: `🔫 *1...* (Engatilhando o revólver...)`,
    mentions: [sender]
  });

  await sleep(1200);

  // 3. Contagem 2
  await sock.sendMessage(from, { 
    text: `🔫 *2...* (O coração dispara...)`,
    mentions: [sender]
  });

  await sleep(1200);

  // 4. Contagem 3
  await sock.sendMessage(from, { 
    text: `🔫 *3...* (Puxando o gatilho...)`,
    mentions: [sender]
  });

  await sleep(1200);

  // 5. Resultado Final
  if (isDead) {
    const deadText = `💥 *BANG! BANG!* ☠️\n\nA câmara continha a bala!\n\n⚰️ ${username} não teve sorte e *MORREU* na roleta russa!`;
    return sock.sendMessage(from, { text: deadText, mentions: [sender] });
  }

  const surviveText = `💨 *CLIQUE!* 😮‍💨\n\nA câmara estava vazia!\n\n🏆 ${username} deu sorte e *SOBREVIVEU* à roleta russa!`;
  return sock.sendMessage(from, { text: surviveText, mentions: [sender] });
}
