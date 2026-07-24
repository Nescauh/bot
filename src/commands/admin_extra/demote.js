import { checkIfOwner, isAdmin } from '../admin.js';

export async function handleDemoteCommand(sock, msg, args, sender, mentioned) {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) {
    return sock.sendMessage(from, { text: '⚠️ Este comando só pode ser utilizado em grupos.' }, { quoted: msg });
  }

  const groupMetadata = await sock.groupMetadata(from);
  const participants = groupMetadata.participants;

  if (!isAdmin(participants, sender) && !checkIfOwner(sender)) {
    return sock.sendMessage(from, { text: '⚠️ Apenas administradores do grupo ou o dono do bot podem utilizar este comando.' }, { quoted: msg });
  }

  const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
  if (!isAdmin(participants, botJid)) {
    return sock.sendMessage(from, { text: '⚠️ Eu preciso ser administrador do grupo para rebaixar membros.' }, { quoted: msg });
  }

  let target = mentioned[0] || msg.message?.extendedTextMessage?.contextInfo?.participant;
  if (!target) {
    return sock.sendMessage(from, { text: '⚠️ Marque alguém ou responda à mensagem da pessoa para rebaixar.' }, { quoted: msg });
  }

  try {
    await sock.groupParticipantsUpdate(from, [target], 'demote');
    return sock.sendMessage(from, { text: `🛡️ @${target.split('@')[0]} teve seu cargo de Administrador removido.`, mentions: [target] }, { quoted: msg });
  } catch (err) {
    return sock.sendMessage(from, { text: '⚠️ Erro ao tentar rebaixar o participante.' }, { quoted: msg });
  }
}
