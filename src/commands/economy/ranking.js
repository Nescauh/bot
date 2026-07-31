import { getTopUsersByWallet } from '../../database/sqlite.js';

function getRankBadge(index) {
  if (index === 0) return '👑 🥇 *1º LUGAR*';
  if (index === 1) return '💎 🥈 *2º LUGAR*';
  if (index === 2) return '✨ 🥉 *3º LUGAR*';
  return `👤 *${index + 1}º LUGAR*`;
}

export async function handleRankingCommand(sock, msg) {
  const from = msg.key.remoteJid;
  const topUsers = getTopUsersByWallet(10);

  if (topUsers.length === 0) {
    return sock.sendMessage(from, { text: '🏆 Ainda não há registros no ranking de economia.' }, { quoted: msg });
  }

  let text = `🏆 *RANKING DOS MAIS RICOS (FORBES BOT)* 🏆\n\n`;
  const mentions = [];

  topUsers.forEach((user, index) => {
    const total = user.wallet + user.bank;
    const badge = getRankBadge(index);
    text += `${badge} — @${user.jid.split('@')[0]}\n` +
            `💰 *Patrimônio Total:* *$${total.toLocaleString('pt-BR')}* (Carteira: $${user.wallet} | Banco: $${user.bank})\n\n`;
    mentions.push(user.jid);
  });

  text += `💡 _Trabalhe diariamente com /trabalhar e resgate seu /daily para subir no topo do ranking!_`;

  return sock.sendMessage(from, { text, mentions }, { quoted: msg });
}
