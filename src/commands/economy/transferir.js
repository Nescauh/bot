import { getUser, transferMoney } from '../../database/sqlite.js';

export async function handleTransferirCommand(sock, msg, args, sender, mentioned) {
  const from = msg.key.remoteJid;
  
  let target = mentioned[0] || msg.message?.extendedTextMessage?.contextInfo?.participant;
  let amount = parseInt(args.find(arg => !isNaN(parseInt(arg)) && !arg.includes('@')));

  if (!target || isNaN(amount) || amount <= 0) {
    return sock.sendMessage(from, { text: '⚠️ *USO INCORRETO!*\n\nExemplo de uso: `/transferir @usuario 500`' }, { quoted: msg });
  }

  if (target === sender) {
    return sock.sendMessage(from, { text: '⚠️ Você não pode transferir dinheiro para você mesmo!' }, { quoted: msg });
  }

  const senderUser = getUser(sender);
  if (senderUser.wallet < amount) {
    return sock.sendMessage(from, { text: `⚠️ *SALDO INSUFICIENTE!*\n\nVocê não possui *$${amount}* moedas na carteira.\n💵 *Seu Saldo:* $${senderUser.wallet}` }, { quoted: msg });
  }

  try {
    await transferMoney(sender, target, amount);
  } catch (err) {
    return sock.sendMessage(from, { text: `⚠️ *ERRO NA TRANSAÇÃO!*\n\nNão foi possível concluir a transferência. Tente novamente mais tarde.` }, { quoted: msg });
  }

  const txId = Math.floor(Math.random() * 899999) + 100000;

  const text = `💸 *COMPROVANTE DE TRANSFERÊNCIA PIX* 💸\n\n` +
               `📤 *Remetente:* @${sender.split('@')[0]}\n` +
               `📥 *Destinatário:* @${target.split('@')[0]}\n` +
               `💰 *Valor Transferido:* *$${amount.toLocaleString('pt-BR')}* moedas\n` +
               `📑 *Taxa de Transação:* R$ 0,00 (Grátis)\n` +
               `🆔 *ID da Operação:* #${txId}\n\n` +
               `✅ *Transação concluída com sucesso!*`;

  return sock.sendMessage(from, { text, mentions: [sender, target] }, { quoted: msg });
}
