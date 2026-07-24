import { getUser, updateUser } from '../../database/sqlite.js';

export async function handleTransferirCommand(sock, msg, args, sender, mentioned) {
  const from = msg.key.remoteJid;
  
  let target = mentioned[0] || msg.message?.extendedTextMessage?.contextInfo?.participant;
  let amount = parseInt(args.find(arg => !isNaN(parseInt(arg)) && !arg.includes('@')));

  if (!target || isNaN(amount) || amount <= 0) {
    return sock.sendMessage(from, { text: '⚠️ Uso correto: `/transferir @usuario <valor>`' }, { quoted: msg });
  }

  if (target === sender) {
    return sock.sendMessage(from, { text: '⚠️ Você não pode transferir dinheiro para você mesmo!' }, { quoted: msg });
  }

  const senderUser = getUser(sender);
  if (senderUser.wallet < amount) {
    return sock.sendMessage(from, { text: `⚠️ Você não tem *$${amount}* na carteira. Saldo atual: *$${senderUser.wallet}*.` }, { quoted: msg });
  }

  const targetUser = getUser(target);

  updateUser(sender, { wallet: senderUser.wallet - amount });
  updateUser(target, { wallet: targetUser.wallet + amount });

  return sock.sendMessage(from, { 
    text: `💸 *TRANSFERÊNCIA REALIZADA!*\n\nVocê transferiu *$${amount}* moedas para @${target.split('@')[0]}.`,
    mentions: [target]
  }, { quoted: msg });
}
