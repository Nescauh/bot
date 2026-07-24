import { addReminder } from '../../database/sqlite.js';

export async function handleLembreteCommand(sock, msg, args, sender) {
  const from = msg.key.remoteJid;
  const timeArg = args[0]; // ex: 10m, 1h, 30s
  const textArg = args.slice(1).join(' ');

  if (!timeArg || !textArg) {
    return sock.sendMessage(from, { text: '⚠️ Uso correto: `/lembrete <tempo: 10m, 1h, 30s> <mensagem>`\nEx: `/lembrete 5m Tomar remédio`' }, { quoted: msg });
  }

  const match = timeArg.match(/^(\d+)([smh])$/i);
  if (!match) {
    return sock.sendMessage(from, { text: '⚠️ Formato de tempo inválido! Use `s` para segundos, `m` para minutos ou `h` para horas.' }, { quoted: msg });
  }

  const val = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  let ms = 0;
  if (unit === 's') ms = val * 1000;
  else if (unit === 'm') ms = val * 60 * 1000;
  else if (unit === 'h') ms = val * 60 * 60 * 1000;

  const targetTime = Date.now() + ms;
  addReminder(sender, from, targetTime, textArg);

  // Agenda timeout local para enviar no chat
  setTimeout(async () => {
    try {
      await sock.sendMessage(from, { 
        text: `⏰ *LEMBRETE!*\n\n👤 @${sender.split('@')[0]}\n📝 *Mensagem:* ${textArg}`,
        mentions: [sender]
      });
    } catch (_) {}
  }, ms);

  return sock.sendMessage(from, { text: `⏰ Lembrete definido! Avisarei você em *${timeArg}*.` }, { quoted: msg });
}
