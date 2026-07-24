import { formatUptime } from '../../utils/helpers.js';

export async function handleInfoCommand(sock, msg) {
  const from = msg.key.remoteJid;
  const uptimeSeconds = (Date.now() - (global.botStartTime || Date.now())) / 1000;
  const uptimeStr = formatUptime(uptimeSeconds);

  const text = `🤖 *SÉRIE BOT - INFORMAÇÕES*\n\n` +
               `📌 *Versão:* 1.0.0 (Multi-Funções)\n` +
               `⚡ *Engine:* @whiskeysockets/baileys (ESM)\n` +
               `🗄️ *Banco de Dados:* SQLite + JSON\n` +
               `⏱️ *Uptime:* ${uptimeStr}\n\n` +
               `Digite \`/menu\` para visualizar todos os comandos disponíveis!`;

  return sock.sendMessage(from, { text }, { quoted: msg });
}
