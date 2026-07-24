import { getUser, updateUser } from '../../database/sqlite.js';

export async function handleDailyCommand(sock, msg, sender) {
  const from = msg.key.remoteJid;
  const user = getUser(sender);
  const now = Date.now();
  const COOLDOWN = 24 * 60 * 60 * 1000; // 24 horas

  if (now - user.last_daily < COOLDOWN) {
    const remaining = COOLDOWN - (now - user.last_daily);
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    return sock.sendMessage(from, { text: `⏳ Você já resgatou sua recompensa diária hoje! Tente novamente em *${hours}h ${minutes}m*.` }, { quoted: msg });
  }

  const reward = Math.floor(Math.random() * 500) + 500; // 500 a 1000 moedas
  const newWallet = user.wallet + reward;

  updateUser(sender, {
    wallet: newWallet,
    last_daily: now
  });

  return sock.sendMessage(from, { text: `🎁 *RECOMPENSA DIÁRIA RESGATADA!*\n\n💰 Você recebeu *$${reward}* moedas!\n💵 *Novo Saldo:* *$${newWallet}*` }, { quoted: msg });
}
