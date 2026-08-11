import { saveBirthday, getBirthday, removeBirthday, getAllBirthdays } from '../database/sqlite.js';
import { parseAndValidateDate, calculateBirthdayCountdown, formatDayMonthText } from '../utils/birthdayService.js';

export async function handleBirthdayCommands(sock, msg, command, args, sender) {
  const from = msg.key.remoteJid;
  const reply = async (text, mentions = []) => {
    await sock.sendMessage(from, { text, mentions: mentions.length > 0 ? mentions : undefined }, { quoted: msg });
  };

  const sub = (args[0] || '').toLowerCase().trim();

  // /aniversario remover
  if (sub === 'remover' || sub === 'delete' || sub === 'del') {
    const removed = await removeBirthday(sender);
    if (!removed) {
      return reply('⚠️ Você não possui um aniversário cadastrado para remover.');
    }
    return reply('🗑️ Seu aniversário foi removido.');
  }

  // /aniversario DD/MM/AAAA (Cadastrar ou Alterar)
  if (sub && sub.includes('/')) {
    const validation = parseAndValidateDate(sub);
    if (!validation.isValid) {
      return reply('❌ Data inválida.\n\nUse o formato:\nDD/MM/AAAA');
    }

    const { day, month, year, formattedDate } = validation;
    await saveBirthday(sender, day, month, year, formattedDate, from);

    const countdown = calculateBirthdayCountdown(day, month, year);
    const dayMonthStr = formatDayMonthText(day, month);

    const text = `🎂 *ANIVERSÁRIO REGISTRADO!*\n\n` +
                 `📅 *Data:* ${dayMonthStr}\n` +
                 `⏳ *Faltam:*\n${countdown.countdownText}\n\n` +
                 `Vou lembrar quando chegar o seu aniversário! 🎉`;

    return reply(text);
  }

  // /aniversario (Sem argumentos - Consultar o próprio)
  if (!sub || command === 'meuaniversario') {
    const bday = getBirthday(sender);
    if (!bday) {
      return reply(`⚠️ Você ainda não cadastrou seu aniversário!\n\nUse o comando:\n\`/aniversario DD/MM/AAAA\`\nExemplo: \`/aniversario 15/09/2008\``);
    }

    const countdown = calculateBirthdayCountdown(bday.day, bday.month, bday.year);
    const dayMonthStr = formatDayMonthText(bday.day, bday.month);

    const text = `🎂 *SEU ANIVERSÁRIO*\n\n` +
                 `📅 *Data:* ${dayMonthStr}\n\n` +
                 `⏳ *Próximo aniversário:*\nFaltam ${countdown.countdownText}\n\n` +
                 `🎉 Prepare-se!`;

    return reply(text);
  }

  // Tratamento para datas inválidas sem barra ou argumentos desconhecidos
  if (sub) {
    const validation = parseAndValidateDate(sub);
    if (!validation.isValid) {
      return reply('❌ Data inválida.\n\nUse o formato:\nDD/MM/AAAA');
    }
  }
}

export async function handleAniversariantesCommand(sock, msg) {
  const from = msg.key.remoteJid;
  const reply = async (text, mentions = []) => {
    await sock.sendMessage(from, { text, mentions: mentions.length > 0 ? mentions : undefined }, { quoted: msg });
  };

  const allBdays = getAllBirthdays();
  if (allBdays.length === 0) {
    return reply('🎂 Ninguém cadastrou aniversário ainda no bot!\nUse `/aniversario DD/MM/AAAA` para registrar o seu.');
  }

  const todayList = [];
  const upcomingList = [];

  for (const b of allBdays) {
    const countdown = calculateBirthdayCountdown(b.day, b.month, b.year);
    if (countdown.isToday) {
      todayList.push(b);
    } else {
      upcomingList.push({
        ...b,
        totalDaysRemaining: countdown.totalDaysRemaining,
        countdownText: countdown.countdownText
      });
    }
  }

  upcomingList.sort((a, b) => a.totalDaysRemaining - b.totalDaysRemaining);

  let messageParts = [];
  let mentions = [];

  if (todayList.length > 0) {
    messageParts.push(`🎉 *ANIVERSARIANTES DE HOJE* 🎉\n`);
    for (const b of todayList) {
      messageParts.push(`🎂 @${b.user_jid.split('@')[0]}`);
      mentions.push(b.user_jid);
    }
    messageParts.push(`\nDesejem feliz aniversário para eles! ❤️\n`);
  }

  if (upcomingList.length > 0) {
    messageParts.push(`🎂 *PRÓXIMOS ANIVERSÁRIOS*\n`);
    const MEDALS = ['🥇', '🥈', '🥉'];
    const topUpcoming = upcomingList.slice(0, 10);

    topUpcoming.forEach((b, idx) => {
      const medal = MEDALS[idx] || '🎈';
      const daysText = b.totalDaysRemaining === 1 ? '1 dia' : `${b.totalDaysRemaining} dias`;
      const dayMonthStr = formatDayMonthText(b.day, b.month);
      messageParts.push(`${medal} @${b.user_jid.split('@')[0]} — ${dayMonthStr} (${daysText})`);
      mentions.push(b.user_jid);
    });
  }

  if (messageParts.length === 0) {
    return reply('🎂 Nenhum aniversário encontrado.');
  }

  return reply(messageParts.join('\n'), mentions);
}
