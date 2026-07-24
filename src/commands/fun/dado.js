export async function handleDadoCommand(sock, msg) {
  const from = msg.key.remoteJid;
  const result = Math.floor(Math.random() * 6) + 1;
  const diceEmojis = ['🎲 1', '🎲 2', '🎲 3', '🎲 4', '🎲 5', '🎲 6'];

  return sock.sendMessage(from, { text: `🎲 Você tirou o número *${result}*! (${diceEmojis[result - 1]})` }, { quoted: msg });
}
