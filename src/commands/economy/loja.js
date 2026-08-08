export const shopItems = [
  { id: 1, name: '🍕 Pizza Infinita', price: 300, desc: 'Lanche lendário que nunca acaba nos papos' },
  { id: 2, name: '☕ Café de Nível Supremo', price: 600, desc: 'Aumenta sua energia e garante bons papos' },
  { id: 3, name: '🧪 Poção de HP / Cura', price: 500, type: 'consumable', effect: 'heal', desc: 'Restaura 100% de HP no nocaute (usado com /curar)' },
  { id: 4, name: '⚡ Elixir de Experiência', price: 2000, type: 'consumable', effect: 'xp', value: 500, desc: 'Garante +500 XP instantâneo na compra' },
  { id: 5, name: '💎 Pedra de Aura Concentrada', price: 10000, type: 'consumable', effect: 'aura', value: 1000, desc: 'Garante +1.000 pontos de Aura instantâneos' },
  { id: 6, name: '📱 Smartphone Dobrável 5G', price: 1800, desc: 'Ideal para mandar trava-zap em alta velocidade' },
  { id: 7, name: '🔮 Amuleto da Sorte Místico', price: 3500, desc: 'Eleva sua aura de sorte e proteção no grupo' },
  { id: 8, name: '💍 Anel de Diamante Puro', price: 5000, desc: 'Anel luxuoso de 24k perfeito para o comando /casar' },
  { id: 9, name: '🏎️ Lamborghini de Plástico', price: 12000, desc: 'Máxima ostentação para exibir na garagem do bot' },
  { id: 10, name: '🏰 Mansão no Metaverso', price: 30000, desc: 'Residência oficial de altíssimo padrão' },
  { id: 11, name: '👑 Coroa de Ouro Imperial', price: 100000, desc: 'Relíquia lendária para os verdadeiros reis da economia' }
];

export const rpgShopItems = [
  // Armas
  { id: 101, category: 'weapon', name: '🗡️ Adaga de Aço', price: 3000, atk: 20, desc: '+20 Dano de Ataque' },
  { id: 102, category: 'weapon', name: '⚔️ Espada Longa Rúnica', price: 10000, atk: 50, desc: '+50 Dano de Ataque' },
  { id: 103, category: 'weapon', name: '🪓 Machado do Caos', price: 25000, atk: 100, desc: '+100 Dano de Ataque' },
  { id: 104, category: 'weapon', name: '🔮 Cajado do Arquimago', price: 60000, atk: 220, desc: '+220 Dano de Ataque' },

  // Armaduras
  { id: 201, category: 'armor', name: '🛡️ Cota de Malha', price: 2500, hp: 50, desc: '+50 HP Máximo' },
  { id: 202, category: 'armor', name: '🛡️ Armadura Placa de Titânio', price: 8000, hp: 150, desc: '+150 HP Máximo' },
  { id: 203, category: 'armor', name: '🛡️ Manto Arcano Sagrado', price: 20000, hp: 350, desc: '+350 HP Máximo' },
  { id: 204, category: 'armor', name: '🛡️ Armadura Dragão Ancião', price: 50000, hp: 750, desc: '+750 HP Máximo' }
];

export async function handleLojaCommand(sock, msg) {
  const from = msg.key.remoteJid;

  let text = `🏪 *LOJA DE ITENS & CONSUMÍVEIS* 🏪\n\n` +
             `Adquira itens usando \`/comprar <código>\`:\n\n`;

  for (const item of shopItems) {
    text += `*${item.id}. ${item.name}*\n` +
            `💵 *Preço:* $${item.price.toLocaleString('pt-BR')} moedas\n` +
            `📝 *Descrição:* ${item.desc}\n\n`;
  }

  text += `⚔️ Para equipamentos de combate (Armas/Armaduras), use \`/lojarpg\`!\n` +
          `🎒 Use \`/inventario\` para ver seus itens.`;

  return sock.sendMessage(from, { text }, { quoted: msg });
}

export async function handleLojaRpgCommand(sock, msg) {
  const from = msg.key.remoteJid;

  let text = `⚔️ *LOJA DE EQUIPAMENTOS RPG* 🛡️\n\n` +
             `Compre armas e armaduras usando \`/comprar <código>\`:\n\n` +
             `🗡️ *ARMAS (Aumento de Dano ATK):*\n`;

  const weapons = rpgShopItems.filter(i => i.category === 'weapon');
  for (const w of weapons) {
    text += `*${w.id}. ${w.name}*\n` +
            `💵 *Preço:* $${w.price.toLocaleString('pt-BR')} moedas | ⚔️ *ATK:* +${w.atk}\n\n`;
  }

  text += `🛡️ *ARMADURAS (Aumento de HP Máximo):*\n`;
  const armors = rpgShopItems.filter(i => i.category === 'armor');
  for (const a of armors) {
    text += `*${a.id}. ${a.name}*\n` +
            `💵 *Preço:* $${a.price.toLocaleString('pt-BR')} moedas | ❤️ *HP:* +${a.hp}\n\n`;
  }

  text += `💡 _Ao comprar uma arma ou armadura, ela será equipada automaticamente no seu personagem!_`;

  return sock.sendMessage(from, { text }, { quoted: msg });
}
