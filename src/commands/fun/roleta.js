export async function handleRoletaCommand(sock, msg, sender) {
  const from = msg.key.remoteJid;
  const isDead = Math.floor(Math.random() * 6) === 0;

  if (isDead) {
    const text = `💥 *BANG!* A arma disparou e @${sender.split('@')[0]} levou o tiro da roleta russa! ☠️`;
    return sock.sendMessage(from, { text, mentions: [sender] }, { quoted: msg });
  }

  const text = `<u>*CLIQUE!*</u> A câmara estava vazia. @${sender.split('@')[0]} sobreviveu à roleta russa! 😮‍💨`;
  return sock.sendMessage(from, { text, mentions: [sender] }, { quoted: msg });
}
