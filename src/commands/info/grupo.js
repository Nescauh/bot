export async function handleGrupoCommand(sock, msg) {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) {
    return sock.sendMessage(from, { text: '⚠️ Este comando só pode ser utilizado em grupos.' }, { quoted: msg });
  }

  try {
    const groupMetadata = await sock.groupMetadata(from);
    const participants = groupMetadata.participants;
    const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');

    const text = `👥 *INFORMAÇÕES DO GRUPO*\n\n` +
                 `📌 *Nome:* ${groupMetadata.subject}\n` +
                 `🆔 *ID:* ${groupMetadata.id}\n` +
                 `👤 *Criador:* @${(groupMetadata.owner || groupMetadata.subjectOwner || '').split('@')[0]}\n` +
                 `👥 *Total de Membros:* ${participants.length}\n` +
                 `👑 *Administradores:* ${admins.length}\n` +
                 `📝 *Descrição:* ${groupMetadata.desc || '(sem descrição)'}`;

    const mentions = [(groupMetadata.owner || groupMetadata.subjectOwner)].filter(Boolean);

    return sock.sendMessage(from, { text, mentions }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /grupo:', err);
    return sock.sendMessage(from, { text: '⚠️ Não foi possível obter as informações do grupo.' }, { quoted: msg });
  }
}
