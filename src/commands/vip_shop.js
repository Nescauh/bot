import { getUser, updateUser } from '../database/sqlite.js';

export const VIP_ITEMS = {
  cargo_vip: { name: '👑 Cargo VIP Dourado', price: 25000, type: 'cargo' },
  emoji_fogo: { name: '🔥 Emoji de Perfil Fogo', price: 10000, type: 'emoji' },
  moldura_neon: { name: '🌈 Moldura Neon RPG', price: 15000, type: 'moldura' },
  efeito_brilho: { name: '✨ Efeito Estelar nos Resultados', price: 20000, type: 'efeito' }
};

export async function handleVipShopCommands(sock, msg, command, args, sender) {
  const from = msg.key.remoteJid;
  const reply = async (text) => {
    await sock.sendMessage(from, { text }, { quoted: msg });
  };

  const user = getUser(sender);
  let extraData = {};
  try {
    extraData = typeof user.extra_data === 'string' ? JSON.parse(user.extra_data || '{}') : (user.extra_data || {});
  } catch (_) {}

  const sub = args[0]?.toLowerCase();

  if (sub === 'comprar') {
    const itemKey = args[1]?.toLowerCase();
    if (!itemKey || !VIP_ITEMS[itemKey]) {
      return reply('⚠️ Escolha um item VIP válido para comprar: `cargo_vip`, `emoji_fogo`, `moldura_neon` ou `efeito_brilho`.\nExemplo: `/lojavip comprar cargo_vip`');
    }

    const item = VIP_ITEMS[itemKey];
    if (user.wallet < item.price) {
      return reply(`⚠️ Você precisa de **$${item.price.toLocaleString('pt-BR')}** na carteira para adquirir ${item.name}.`);
    }

    if (!extraData.vip_items) extraData.vip_items = [];
    if (extraData.vip_items.includes(itemKey)) {
      return reply(`⚠️ Você já possui o item **${item.name}**!`);
    }

    extraData.vip_items.push(itemKey);
    const newWallet = user.wallet - item.price;
    updateUser(sender, { wallet: newWallet, extra_data: JSON.stringify(extraData) });

    return reply(`🌟 *COMPRA VIP CONCLUÍDA!* 🌟\n\nVocê adquiriu **${item.name}** por *$${item.price.toLocaleString('pt-BR')}*!\nEle já foi equipado em seu perfil!`);
  }

  let catalog = Object.keys(VIP_ITEMS).map(k => {
    const item = VIP_ITEMS[k];
    const owned = extraData.vip_items?.includes(k) ? ' (✅ Adquirido)' : '';
    return `• *${item.name}* ${owned}\n  💰 Preço: $${item.price.toLocaleString('pt-BR')}\n  👉 Compre com: \`/lojavip comprar ${k}\``;
  }).join('\n\n');

  return reply(`📦 *LOJA VIP & EXCLUSIVIDADES* 📦\n\n${catalog}`);
}
