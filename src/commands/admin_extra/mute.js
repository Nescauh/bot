import { checkIfOwner, isAdmin } from '../admin.js';

export async function handleMuteCommand(sock, msg, args, sender) {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) {
    return sock.sendMessage(from, { text: '⚠️ Este comando só pode ser utilizado em grupos.' }, { quoted: msg });
  }

  const groupMetadata = await sock.groupMetadata(from);
  const participants = groupMetadata.participants;

  if (!isAdmin(participants, sender) && !checkIfOwner(sender)) {
    return sock.sendMessage(from, { text: '⚠️ Apenas administradores do grupo podem utilizar este comando.' }, { quoted: msg });
  }

  try {
    await sock.groupSettingUpdate(from, 'announcement');
    return sock.sendMessage(from, { text: '🔒 *Grupo Fechado!* Apenas administradores podem enviar mensagens agora.' }, { quoted: msg });
  } catch (err) {
    return sock.sendMessage(from, { text: '⚠️ Não foi possível fechar o grupo. Verifique se o bot é administrador.' }, { quoted: msg });
  }
}
