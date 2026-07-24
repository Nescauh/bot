import { checkIfOwner, isAdmin } from '../admin.js';
import { getGroupConfig, updateGroupConfig } from '../../database/sqlite.js';

export async function handleRegrasCommand(sock, msg, args, sender) {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) {
    return sock.sendMessage(from, { text: '⚠️ Este comando só pode ser utilizado em grupos.' }, { quoted: msg });
  }

  const groupConfig = getGroupConfig(from);

  // Se passou texto e for admin, atualiza as regras
  if (args.length > 0) {
    const groupMetadata = await sock.groupMetadata(from);
    const participants = groupMetadata.participants;

    if (!isAdmin(participants, sender) && !checkIfOwner(sender)) {
      return sock.sendMessage(from, { text: '⚠️ Apenas administradores podem definir as regras do grupo.' }, { quoted: msg });
    }

    const newRules = args.join(' ');
    updateGroupConfig(from, { rules: newRules });
    return sock.sendMessage(from, { text: '📜 *Regras do grupo atualizadas com sucesso!*' }, { quoted: msg });
  }

  // Caso contrário, exibe as regras
  const rules = groupConfig.rules || 'Nenhuma regra foi definida para este grupo ainda. (Admins usam: `/regras <texto>` para definir)';
  return sock.sendMessage(from, { text: `📜 *REGRAS DO GRUPO:*\n\n${rules}` }, { quoted: msg });
}
