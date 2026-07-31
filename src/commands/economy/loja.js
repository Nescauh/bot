export const shopItems = [
  { id: 1, name: '🍕 Pizza Infinita', price: 300, desc: 'Lanche lendário que nunca acaba nos papos' },
  { id: 2, name: '☕ Café de Nível Supremo', price: 600, desc: 'Aumenta sua energia e garante bons papos' },
  { id: 3, name: '📱 Smartphone Dobrável 5G', price: 1800, desc: 'Ideal para mandar trava-zap em alta velocidade' },
  { id: 4, name: '🔮 Amuleto da Sorte Místico', price: 3500, desc: 'Eleva sua aura de sorte e proteção no grupo' },
  { id: 5, name: '💍 Anel de Diamante Puro', price: 5000, desc: 'Anel luxuoso de 24k perfeito para o comando /casar' },
  { id: 6, name: '🏎️ Lamborghini de Plástico', price: 12000, desc: 'Máxima ostentação para exibir na garagem do bot' },
  { id: 7, name: '🏰 Mansão no Metaverso', price: 30000, desc: 'Residência oficial de altíssimo padrão' },
  { id: 8, name: '👑 Coroa de Ouro Imperial', price: 100000, desc: 'Relíquia lendária para os verdadeiros reis da economia' }
];

export async function handleLojaCommand(sock, msg) {
  const from = msg.key.remoteJid;

  let text = `🏪 *LOJA DE ITENS & OSTENTAÇÃO* 🏪\n\n` +
             `Adquira itens usando \`/comprar <número do item>\`:\n\n`;

  for (const item of shopItems) {
    text += `*${item.id}. ${item.name}*\n` +
            `💵 *Preço:* $${item.price.toLocaleString('pt-BR')} moedas\n` +
            `📝 *Efeito/Descrição:* ${item.desc}\n\n`;
  }

  text += `🎒 Use \`/inventario\` para visualizar sua coleção de itens!`;

  return sock.sendMessage(from, { text }, { quoted: msg });
}
