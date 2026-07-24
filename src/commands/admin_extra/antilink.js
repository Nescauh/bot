import { checkIfOwner, isAdmin } from '../admin.js';
import { getGroupConfig, updateGroupConfig } from '../../database/sqlite.js';

export async function handleAntilinkCommand(sock, msg, args, sender) {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) {
    return sock.sendMessage(from, { text: '⚠️ Este comando só pode ser utilizado em grupos.' }, { quoted: msg });
  }

  const groupMetadata = await sock.groupMetadata(from);
  const participants = groupMetadata.participants;

  if (!isAdmin(participants, sender) && !checkIfOwner(sender)) {
    return sock.sendMessage(from, { text: '⚠️ Apenas administradores do grupo ou o dono do bot podem utilizar este comando.' }, { quoted: msg });
  }

  const param = args[0]?.toLowerCase();
  if (param !== 'on' && param !== 'off') {
    const cfg = getGroupConfig(from);
    return sock.sendMessage(from, { text: `⚠️ Uso: \`/antilink on\` ou \`/antilink off\`\n\nEstado atual: *${cfg.antilink ? 'ATIVADO' : 'DESATIVADO'}*` }, { quoted: msg });
  }

  const active = param === 'on' ? 1 : 0;
  updateGroupConfig(from, { antilink: active });

  return sock.sendMessage(from, { text: `🔗 Anti-link foi *${active ? 'ATIVADO' : 'DESATIVADO'}* para este grupo!` }, { quoted: msg });
}
