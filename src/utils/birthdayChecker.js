import { getAllBirthdays, updateNotificationYear } from '../database/BirthdayRepository.js';
import { getBrazilDate } from './birthdayService.js';
import { askAi } from './aiService.js';
import queueManager from '../queue/QueueManager.js';

export const MOTIVATIONAL_QUOTES = [
  'Aproveite a vida, ela é curta.',
  'Nem todo dia precisa ser perfeito para ser importante.',
  'Às vezes, continuar já é uma vitória.',
  'Você não precisa ter tudo resolvido hoje.',
  'Os pequenos momentos também viram grandes memórias.',
  'O tempo passa de qualquer forma. Faça algo que valha a pena lembrar.',
  'Não espere a vida começar. Ela já está acontecendo.',
  'Alguns dias são difíceis, mas eles também passam.',
  'Valorize quem está ao seu lado enquanto há tempo.',
  'Você nunca sabe qual momento simples vai se tornar uma lembrança inesquecível.'
];

export function getRandomMotivationalQuote() {
  const idx = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
  return MOTIVATIONAL_QUOTES[idx];
}

export async function checkBirthdays(sock) {
  if (!sock) return;

  const brNow = getBrazilDate();
  const currentYear = brNow.getFullYear();
  const currentMonth = brNow.getMonth() + 1; // 1-12
  const currentDay = brNow.getDate();

  const allBirthdays = getAllBirthdays();

  for (const b of allBirthdays) {
    if (!b || !b.user_jid) continue;

    const isBirthdayToday = Number(b.month) === currentMonth && Number(b.day) === currentDay;
    const notificationYear = Number(b.notification_year || 0);

    if (isBirthdayToday && notificationYear < currentYear) {
      const userMentionStr = `@${b.user_jid.split('@')[0]}`;
      const targetChat = b.chat_jid || b.user_jid;

      let aiMessage = '';
      try {
        const sysPrompt = 'Você é o assistente carinhoso do SUBARU BOT. Escreva uma mensagem de parabéns positiva, curta e inspiradora para WhatsApp (3 frases curtas). Sem exagerar em emojis e sem inventar dados pessoais.';
        const prompt = `Hoje é aniversário de ${userMentionStr}. Escreva uma parabenização bonita e acolhedora de feliz aniversário.`;
        aiMessage = await askAi(prompt, sysPrompt);
      } catch (err) {
        console.warn('[BIRTHDAY CHECKER] Erro ao gerar parabéns por IA, usando fallback:', err.message);
      }

      if (!aiMessage || aiMessage.length < 10) {
        aiMessage = `Hoje é um daqueles dias para lembrar o quanto a vida é valiosa!\nAproveite cada momento, celebre suas conquistas e continue construindo novas histórias.`;
      }

      const quote = getRandomMotivationalQuote();

      const fullText = `🎉 *FELIZ ANIVERSÁRIO, ${userMentionStr}!* 🎂\n\n` +
                       `${aiMessage.trim()}\n\n` +
                       `💡 _"${quote}"_\n\n` +
                       `🎂 *Que esse novo ciclo seja incrível para você!* 🎉`;

      try {
        const wrappedSock = queueManager.wrapSocket(sock);
        await wrappedSock.sendMessage(targetChat, {
          text: fullText,
          mentions: [b.user_jid]
        });

        await updateNotificationYear(b.user_jid, currentYear);
        console.log(`[BIRTHDAY CHECKER] Parabéns enviados para ${b.user_jid} (Ano: ${currentYear})`);
      } catch (sendErr) {
        console.error(`[BIRTHDAY CHECKER ERROR] Erro ao enviar parabéns para ${b.user_jid}:`, sendErr);
      }
    }
  }
}

export function startBirthdayChecker(sock, intervalMs = 5 * 60 * 1000) {
  // Executa uma verificação inicial logo no start
  checkBirthdays(sock).catch(err => console.error('[BIRTHDAY CHECKER INITIAL ERROR]', err));

  // Configura checagem periódica a cada 5 minutos
  const timer = setInterval(() => {
    checkBirthdays(sock).catch(err => console.error('[BIRTHDAY CHECKER LOOP ERROR]', err));
  }, intervalMs);

  return timer;
}
