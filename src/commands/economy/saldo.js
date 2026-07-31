import { getUser } from '../../database/sqlite.js';

function getFinancialTitle(total) {
  if (total <= 500) return '🚮 *Falido(a) sem um tostão*';
  if (total <= 2000) return '🍞 *Sobrevivente do Miojo*';
  if (total <= 10000) return '💳 *Classe Média do Pix*';
  if (total <= 50000) return '🏎️ *Empresário(a) de Sucesso*';
  return '👑 *Magnata Supremo do WhatsApp*';
}

export async function handleSaldoCommand(sock, msg, sender, mentioned) {
  const from = msg.key.remoteJid;
  const target = mentioned[0] || msg.message?.extendedTextMessage?.contextInfo?.participant || sender;

  const user = getUser(target);
  const total = user.wallet + user.bank;
  const title = getFinancialTitle(total);

  const text = `💰 * EXTRATO BANCÁRIO & CARTEIRA* 💰\n\n` +
               `👤 *Usuário:* @${target.split('@')[0]}\n` +
               `🎖️ *Status Financeiro:* ${title}\n\n` +
               `💵 *Carteira:* $${user.wallet}\n` +
               `🏦 *Banco:* $${user.bank}\n` +
               `💎 *Patrimônio Líquido:* *$${total}*\n\n` +
               `💡 *Dica:* Trabalhe com \`/trabalhar\` ou resgate seu \`/daily\` para acumular riquezas!`;

  return sock.sendMessage(from, { text, mentions: [target] }, { quoted: msg });
}
