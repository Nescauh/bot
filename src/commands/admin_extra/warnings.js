import { getWarns } from '../../database/sqlite.js';

export async function handleWarningsCommand(sock, msg, args, sender, mentioned) {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) {
    return sock.sendMessage(from, { text: '⚠️ Este comando só pode ser utilizado em grupos.' }, { quoted: msg });
  }

  let target = mentioned[0] || msg.message?.extendedTextMessage?.contextInfo?.participant || sender;
  const count = getWarns(from, target);

  return sock.sendMessage(from, { 
    text: `📋 @${target.split('@')[0]} possui *${count}/3* advertências no grupo.`,
    mentions: [target]
  }, { quoted: msg });
}
