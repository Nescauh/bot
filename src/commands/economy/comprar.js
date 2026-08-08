import { getUser, updateUser } from '../../database/sqlite.js';
import { shopItems, rpgShopItems } from './loja.js';

export async function handleComprarCommand(sock, msg, args, sender) {
  const from = msg.key.remoteJid;
  const itemId = parseInt(args[0], 10);

  const allItems = [...shopItems, ...rpgShopItems];
  const item = allItems.find(i => i.id === itemId);

  if (!item) {
    return sock.sendMessage(from, { 
      text: '⚠️ *CÓDIGO DE ITEM INVÁLIDO!*\n\nDigite `/loja` para itens gerais/consumíveis ou `/lojarpg` para armas e armaduras.' 
    }, { quoted: msg });
  }

  const user = getUser(sender);
  if (user.wallet < item.price) {
    const missing = item.price - user.wallet;
    return sock.sendMessage(from, { 
      text: `⚠️ *MOEDAS INSUFICIENTES!*\n\nVocê precisa de mais *$${missing.toLocaleString('pt-BR')}* moedas na carteira para comprar *${item.name}*.\n💰 *Preço:* $${item.price.toLocaleString('pt-BR')}\n💵 *Seu Saldo:* $${user.wallet.toLocaleString('pt-BR')}` 
    }, { quoted: msg });
  }

  let extraData = {};
  try {
    extraData = typeof user.extra_data === 'string' ? JSON.parse(user.extra_data || '{}') : (user.extra_data || {});
  } catch (_) {
    extraData = {};
  }

  let inventory = [];
  try {
    inventory = JSON.parse(user.inventory || '[]');
  } catch (_) {}

  inventory.push(item.name);

  let newWallet = user.wallet - item.price;
  let newXp = user.xp;
  let newAura = user.aura || 0;
  let effectMsg = '';

  // Processa consumíveis de efeito imediato
  if (item.type === 'consumable') {
    if (item.effect === 'xp') {
      newXp += item.value;
      effectMsg = `\n⚡ *BÔNUS APLICADO:* +${item.value} XP adicionados instantaneamente!`;
    } else if (item.effect === 'aura') {
      newAura += item.value;
      effectMsg = `\n💎 *BÔNUS APLICADO:* +${item.value.toLocaleString()} pts de Aura adicionados!`;
    }
  }

  // Equipamentos RPG (Equipam automaticamente)
  if (item.category === 'weapon') {
    extraData.equipped_weapon = { id: item.id, name: item.name, atk: item.atk };
    effectMsg = `\n🗡️ *EQUIPADO:* Sua arma principal agora é *${item.name}* (+${item.atk} ATK)!`;
  } else if (item.category === 'armor') {
    extraData.equipped_armor = { id: item.id, name: item.name, hp: item.hp };
    effectMsg = `\n🛡️ *EQUIPADO:* Sua armadura ativa agora é *${item.name}* (+${item.hp} HP Máximo)!`;
  }

  updateUser(sender, {
    wallet: newWallet,
    xp: newXp,
    aura: newAura,
    inventory: JSON.stringify(inventory),
    extra_data: JSON.stringify(extraData)
  });

  const text = `🛒 *COMPRA REALIZADA COM SUCESSO!* 🛒\n\n` +
               `🎉 Você adquiriu: *${item.name}*\n` +
               `💰 *Valor Pago:* $${item.price.toLocaleString('pt-BR')} moedas\n` +
               `💵 *Saldo Restante na Carteira:* $${newWallet.toLocaleString('pt-BR')}${effectMsg}\n\n` +
               `🎒 O item foi guardado no seu \`/inventario\`!`;

  return sock.sendMessage(from, { text }, { quoted: msg });
}
