import { getUser, updateUser } from '../../database/sqlite.js';
import { shopItems } from './loja.js';

export async function handleComprarCommand(sock, msg, args, sender) {
  const from = msg.key.remoteJid;
  const itemId = parseInt(args[0]);

  const item = shopItems.find(i => i.id === itemId);
  if (!item) {
    return sock.sendMessage(from, { text: '⚠️ Item inválido! Use `/loja` para ver o código dos itens.' }, { quoted: msg });
  }

  const user = getUser(sender);
  if (user.wallet < item.price) {
    return sock.sendMessage(from, { text: `⚠️ Você não tem moedas suficientes na carteira. Preço: *$${item.price}*. Seu saldo: *$${user.wallet}*.` }, { quoted: msg });
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

  return sock.sendMessage(from, { text: `🛒 Parabéns! Você comprou *${item.name}* por *$${item.price}* moedas!` }, { quoted: msg });
}
