export async function handleCaraOuCoroaCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  const choice = args[0]?.toLowerCase();
  const options = ['cara', 'coroa'];
  const result = options[Math.floor(Math.random() * options.length)];

  let text = `🪙 A moeda foi lançada e deu... *${result.toUpperCase()}*!`;

  if (choice && options.includes(choice)) {
    if (choice === result) {
      text += `\n🎉 Parabéns! Você apostou em *${choice.toUpperCase()}* e acertou!`;
    } else {
      text += `\n❌ Que pena! Você apostou em *${choice.toUpperCase()}* e errou.`;
    }
  }

  return sock.sendMessage(from, { text }, { quoted: msg });
}
