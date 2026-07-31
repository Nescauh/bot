import { getUser } from '../../database/sqlite.js';
import { askAi } from '../../utils/aiService.js';
import { shopItems } from './loja.js';

export async function handleInventarioCommand(sock, msg, sender, mentioned) {
  const from = msg.key.remoteJid;
  const target = mentioned[0] || msg.message?.extendedTextMessage?.contextInfo?.participant || sender;

  const user = getUser(target);
  let inventory = [];
  try {
    inventory = JSON.parse(user.inventory || '[]');
  } catch (_) {}

  if (inventory.length === 0) {
    return sock.sendMessage(from, { 
      text: `🎒 *INVENTÁRIO VAZIO*\n\n@${target.split('@')[0]} ainda não comprou nenhum item. Visite a \`/loja\` para ostentar!`, 
      mentions: [target] 
    }, { quoted: msg });
  }

  // Agrupar itens repetidos por quantidade
  const counts = {};
  for (const item of inventory) {
    counts[item] = (counts[item] || 0) + 1;
  }

  // Calcular valor total estimado dos itens
  let totalValue = 0;
  const itemsFormatted = Object.entries(counts).map(([name, qty], index) => {
    const shopItem = shopItems.find(i => i.name === name);
    const itemPrice = shopItem ? shopItem.price : 100;
    totalValue += itemPrice * qty;
    return `${index + 1}. *${name}* ${qty > 1 ? `(x${qty})` : ''}`;
  }).join('\n');

  // Gerar avaliação bem-humorada de colecionador da IA
  let aiAppraisal = '';
  try {
    const systemInstruction = 'Você é um especialista e avaliador de coleções luxuosas em um bot do WhatsApp. Dê 1 opinião sarcástica e divertida (máximo 15 palavras) sobre o inventário do usuário. Não use aspas.';
    const prompt = `Avalie este inventário de usuário: ${Object.keys(counts).join(', ')}.`;
    const res = await askAi(prompt, systemInstruction);
    if (res) aiAppraisal = res.trim().replace(/^["']|["']$/g, '');
  } catch (_) {}

  if (!aiAppraisal) {
    aiAppraisal = 'Uma coleção invejável que causaria inveja em qualquer membro do grupo!';
  }

  const text = `🎒 *INVENTÁRIO & COLEÇÃO* 🎒\n\n` +
               `👤 *Dono:* @${target.split('@')[0]}\n` +
               `📦 *Total de Itens:* ${inventory.length}\n` +
               `💎 *Valor Estimado:* *$${totalValue.toLocaleString('pt-BR')}* moedas\n\n` +
               `📜 *Itens Adquiridos:*\n${itemsFormatted}\n\n` +
               `🔎 *Avaliação do Colecionador (IA):*\n` +
               `_"${aiAppraisal}"_`;

  return sock.sendMessage(from, { text, mentions: [target] }, { quoted: msg });
}
