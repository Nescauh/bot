export async function handleShipCommand(sock, msg, args, sender, mentioned) {
  const from = msg.key.remoteJid;
  
  let target1 = sender;
  let target2 = mentioned[0];

  if (mentioned.length >= 2) {
    target1 = mentioned[0];
    target2 = mentioned[1];
  } else if (!target2 && msg.message?.extendedTextMessage?.contextInfo?.participant) {
    target2 = msg.message.extendedTextMessage.contextInfo.participant;
  }

  if (!target2 || target1 === target2) {
    return sock.sendMessage(from, { text: '⚠️ Marque duas pessoas ou responda a alguém para calcular o ship!' }, { quoted: msg });
  }

  // Gera porcentagem baseada nos hashes dos dois JIDs para ser consistente no dia
  const combined = [target1, target2].sort().join('');
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  const percentage = Math.abs(hash % 101);

  let bar = '🟩'.repeat(Math.floor(percentage / 10)) + '⬜'.repeat(10 - Math.floor(percentage / 10));

  let status = '';
  if (percentage < 25) status = '💔 Pura ilusão... melhor serem só amigos!';
  else if (percentage < 50) status = '🤔 Pode dar certo com um pouco de esforço!';
  else if (percentage < 80) status = '💖 Que lindo casal! Tem grande potencial.';
  else status = '🔥 CASAL PERFEITO! Casamento à vista! 💍';

  const text = `👩‍❤️‍👨 *MEDIDOR DE CASAL (SHIP)* 👨‍❤️‍👨\n\n` +
               `👤 @${target1.split('@')[0]}\n` +
               `👤 @${target2.split('@')[0]}\n\n` +
               `📊 *Afinidade:* ${percentage}%\n` +
               `[${bar}]\n\n` +
               `💬 *Veredito:* ${status}`;

  return sock.sendMessage(from, { text, mentions: [target1, target2] }, { quoted: msg });
}
