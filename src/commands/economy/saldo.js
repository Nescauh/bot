import { getUser } from '../../database/sqlite.js';

export async function handleSaldoCommand(sock, msg, sender, mentioned) {
  const from = msg.key.remoteJid;
  const target = mentioned[0] || msg.message?.extendedTextMessage?.contextInfo?.participant || sender;

  const user = getUser(target);
  const total = user.wallet + user.bank;

  const text = `💰 *CARTEIRA & BANCO*\n\n` +
               `👤 *Usuário:* @${target.split('@')[0]}\n` +
               `💵 *Carteira:* $${user.wallet}\n` +
               `🏦 *Banco:* $${user.bank}\n` +
               `💳 *Total:* $${total}`;

  return sock.sendMessage(from, { text, mentions: [target] }, { quoted: msg });
}
