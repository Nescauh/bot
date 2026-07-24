import { formatUptime } from '../../utils/helpers.js';

export async function handleUptimeCommand(sock, msg) {
  const from = msg.key.remoteJid;
  const uptimeSeconds = (Date.now() - (global.botStartTime || Date.now())) / 1000;
  const uptimeStr = formatUptime(uptimeSeconds);

  return sock.sendMessage(from, { text: `🌙 *Bot Ativo Há:* ${uptimeStr}` }, { quoted: msg });
}
