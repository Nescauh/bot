const words = ['WHATSAPP', 'TECNOLOGIA', 'PROGRAMACAO', 'SERIEBOT', 'DESENVOLVIMENTO', 'BATERIA'];

export async function handleForcaCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  const word = words[Math.floor(Math.random() * words.length)];
  const masked = word.split('').map(() => '_').join(' ');

  const text = `🎯 *JOGO DA FORCA*\n\n` +
               `🔤 *Palavra:* \`${masked}\`\n` +
               `💡 *Dica:* ${word.length} letras\n\n` +
               `Chute letras ou a palavra completa no chat!`;

  return sock.sendMessage(from, { text }, { quoted: msg });
}
