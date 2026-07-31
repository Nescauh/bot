import { getUser, updateUser } from '../../database/sqlite.js';
import { shopItems } from './loja.js';

export async function handleComprarCommand(sock, msg, args, sender) {
  const from = msg.key.remoteJid;
  const itemId = parseInt(args[0]);

  const item = shopItems.find(i => i.id === itemId);
  if (!item) {
    return sock.sendMessage(from, { text: '⚠️ *ITEM INVÁLIDO!*\n\nDigite `/loja` para visualizar a lista e os códigos dos itens disponíveis.' }, { quoted: msg });
  }

  const user = getUser(sender);
  if (user.wallet < item.price) {
    const missing = item.price - user.wallet;
    return sock.sendMessage(from, { text: `⚠️ *MOEDAS INSUFICIENTES!*\n\nVocê precisa de mais *$${missing}* moedas na carteira para comprar *${item.name}*.\n💰 *Preço:* $${item.price}\n💵 *Seu Saldo:* $${user.wallet}` }, { quoted: msg });
  }

  let inventory = [];
  try {
    inventory = JSON.parse(user.inventory || '[]');
  } catch (_) {}

  inventory.push(item.name);

  updateUser(sender, {
    wallet: user.wallet - item.price,
    inventory: JSON.stringify(inventory)
  });

  const text = `🛒 *COMPRA REALIZADA COM SUCESSO!* 🛒\n\n` +
               `🎉 Você adquiriu: *${item.name}*\n` +
               `💰 *Valor Pago:* $${item.price} moedas\n` +
               `💵 *Saldo Restante na Carteira:* $${user.wallet - item.price}\n\n` +
               `🎒 O item foi adicionado ao seu \`/inventario\`!`;

  return sock.sendMessage(from, { text }, { quoted: msg });
}
