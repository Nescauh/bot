import { getUser } from '../../database/sqlite.js';

export async function handleInventarioCommand(sock, msg, sender, mentioned) {
  const from = msg.key.remoteJid;
  const target = mentioned[0] || msg.message?.extendedTextMessage?.contextInfo?.participant || sender;

  const user = getUser(target);
  let inventory = [];
  try {
    inventory = JSON.parse(user.inventory || '[]');
  } catch (_) {}

  if (inventory.length === 0) {
    return sock.sendMessage(from, { text: `🎒 @${target.split('@')[0]} não possui nenhum item no inventário. Use \`/loja\`!`, mentions: [target] }, { quoted: msg });
  }

  const itemsFormatted = inventory.map((item, index) => `${index + 1}. ${item}`).join('\n');

  const text = `🎒 *INVENTÁRIO DE @${target.split('@')[0]}*\n\n${itemsFormatted}`;
  return sock.sendMessage(from, { text, mentions: [target] }, { quoted: msg });
}
