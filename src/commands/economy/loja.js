export const shopItems = [
  { id: 1, name: '🏎️ Carro Esportivo', price: 5000, desc: 'Símbolo de status supremo' },
  { id: 2, name: '📱 Smartphone Pro', price: 1500, desc: 'Para mandar travazap no 5G' },
  { id: 3, name: '💍 Anel de Diamante', price: 3000, desc: 'Perfeito para o /casar' },
  { id: 4, name: '☕ Café Gourmet', price: 100, desc: 'Aumenta a energia do dia' }
];

export async function handleLojaCommand(sock, msg) {
  const from = msg.key.remoteJid;

  let text = `🏪 *LOJA DO BOT*\n\nCompre itens usando \`/comprar <número do item>\`:\n\n`;
  for (const item of shopItems) {
    text += `*${item.id}. ${item.name}*\n💵 *Preço:* $${item.price}\n📝 *Descrição:* ${item.desc}\n\n`;
  }

  return sock.sendMessage(from, { text }, { quoted: msg });
}
