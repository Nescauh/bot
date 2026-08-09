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
    } else if (item.effect === 'shield') {
      extraData.shield_until = Date.now() + (2 * 60 * 60 * 1000);
      effectMsg = `\n🛡️ *ESCUDO ANTI-ROUBO ATIVADO:* Você está 100% protegido contra assaltos (/roubar) pelas próximas 2 horas!`;
    } else if (item.effect === 'pet_candy') {
      if (extraData.pet) {
        extraData.pet.level = Number(extraData.pet.level || 1) + 1;
        effectMsg = `\n🍬 *RARE CANDY ALIMENTADO:* Seu pet **${extraData.pet.name}** evoluiu para o *Nível ${extraData.pet.level}*! 🐾⚡`;
      } else {
        effectMsg = `\n🍬 *RARE CANDY GUARDADO:* Guardado no seu /inventario! Adote um pet com \`/pet\` para alimentá-lo com este doce.`;
      }
    }
  }

  // Recálculo do Nível do Jogador
  const calculatedLevel = Math.floor(Math.sqrt(newXp / 50)) + 1;
  const finalLevel = Math.max(Number(user.level || 1), calculatedLevel);

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
    level: finalLevel,
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
