import { checkIfOwner, isAdmin } from '../admin.js';

export async function handleTagallCommand(sock, msg, args, sender) {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) {
    return sock.sendMessage(from, { text: '⚠️ Este comando só pode ser utilizado em grupos.' }, { quoted: msg });
  }

  const groupMetadata = await sock.groupMetadata(from);
  const participants = groupMetadata.participants;

  if (!isAdmin(participants, sender) && !checkIfOwner(sender)) {
    return sock.sendMessage(from, { text: '⚠️ Apenas administradores do grupo ou o dono do bot podem utilizar este comando.' }, { quoted: msg });
  }

  const messageText = args.join(' ') || 'Aviso geral para todos!';

  let text = `📢 *CHAMADA GERAL DO GRUPO*\n\n📝 *Mensagem:* ${messageText}\n\n`;
  const mentions = [];

  for (const p of participants) {
    text += `👉 @${p.id.split('@')[0]}\n`;
    mentions.push(p.id);
  }

  return sock.sendMessage(from, { text, mentions }, { quoted: msg });
}
