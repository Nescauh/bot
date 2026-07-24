export async function handlePingCommand(sock, msg) {
  const from = msg.key.remoteJid;
  const timestamp = msg.messageTimestamp;
  const latency = (Date.now() - (timestamp * 1000)) / 1000;
  const speed = latency < 0 ? '0.001' : latency.toFixed(3);

  return sock.sendMessage(from, { text: `🏓 *Pong!* Resposta em *${speed}* segundos.` }, { quoted: msg });
}
