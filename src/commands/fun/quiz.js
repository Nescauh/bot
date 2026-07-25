import { getUser, updateUser } from '../../database/sqlite.js';

const quizQuestions = [
  { question: 'Qual o maior planeta do Sistema Solar?', answer: 'júpiter', altAnswers: ['jupiter'], options: ['Terra', 'Júpiter', 'Saturno', 'Marte'] },
  { question: 'Qual elemento químico tem o símbolo Au?', answer: 'ouro', altAnswers: [], options: ['Prata', 'Cobre', 'Ouro', 'Alumínio'] },
  { question: 'Em que ano o homem pisou na Lua pela primeira vez?', answer: '1969', altAnswers: [], options: ['1965', '1969', '1972', '1959'] },
  { question: 'Qual a capital da França?', answer: 'paris', altAnswers: [], options: ['Londres', 'Madri', 'Roma', 'Paris'] },
  { question: 'Quantos lados tem um heptágono?', answer: '7', altAnswers: ['sete'], options: ['5', '6', '7', '8'] },
  { question: 'Qual é o maior oceano do mundo?', answer: 'pacífico', altAnswers: ['pacifico'], options: ['Atlântico', 'Índico', 'Pacífico', 'Ártico'] },
  { question: 'Qual o animal terrestre mais rápido do mundo?', answer: 'guepardo', altAnswers: ['cheetah'], options: ['Leão', 'Guepardo', 'Gázela', 'Cavalo'] },
  { question: 'Quem pintou a obra Monalisa?', answer: 'leonardo da vinci', altAnswers: ['da vinci', 'leonardo da vinci'], options: ['Picasso', 'Van Gogh', 'Da Vinci', 'Monet'] }
];

// Armazena quizzes ativos por chat: { [chatJid]: { question, answer, altAnswers, options } }
export const activeQuizGames = new Map();

function normalizeString(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export async function handleQuizCommand(sock, msg, args, sender) {
  const from = msg.key.remoteJid;
  const inputArg = args.join(' ').trim();

  if (['reset', 'novo', 'reiniciar', 'cancelar'].includes(inputArg.toLowerCase())) {
    activeQuizGames.delete(from);
    return startNewQuiz(sock, msg, from);
  }

  const activeQuiz = activeQuizGames.get(from);

  // Se o usuário tentou responder via comando (ex: /quiz jupiter)
  if (activeQuiz && inputArg.length > 0) {
    const answered = await processQuizAnswer(sock, msg, from, inputArg, sender);
    if (answered) return;
  }

  if (activeQuiz) {
    const text = `🧠 *QUIZ EM ANDAMENTO*\n\n` +
                 `❓ *Pergunta:* ${activeQuiz.question}\n\n` +
                 `💡 *Opções:* ${activeQuiz.options.join(', ')}\n\n` +
                 `👉 Digite a resposta correta no chat!`;
    return sock.sendMessage(from, { text }, { quoted: msg });
  }

  return startNewQuiz(sock, msg, from);
}

function startNewQuiz(sock, msg, from) {
  const q = quizQuestions[Math.floor(Math.random() * quizQuestions.length)];

  activeQuizGames.set(from, {
    question: q.question,
    answer: q.answer,
    altAnswers: q.altAnswers || [],
    options: q.options
  });

  const text = `🧠 *NOVO QUIZ RÁPIDO*\n\n` +
               `❓ *Pergunta:* ${q.question}\n\n` +
               `💡 *Opções:* ${q.options.join(', ')}\n\n` +
               `📌 *Responda diretamente no chat!* (+50 XP e +$200 de bônus!)`;

  return sock.sendMessage(from, { text }, { quoted: msg });
}

export async function processQuizAnswer(sock, msg, from, userResponse, sender) {
  const activeQuiz = activeQuizGames.get(from);
  if (!activeQuiz) return false;

  const cleanUser = normalizeString(userResponse);
  const cleanAnswer = normalizeString(activeQuiz.answer);
  const cleanAlt = activeQuiz.altAnswers.map(a => normalizeString(a));

  const isCorrect = cleanUser === cleanAnswer || cleanAlt.includes(cleanUser);

  if (isCorrect) {
    activeQuizGames.delete(from);

    // Recompensa o jogador com moedas e XP no SQLite
    const userObj = getUser(sender);
    const rewardCoins = 200;
    const rewardXp = 50;

    updateUser(sender, {
      wallet: userObj.wallet + rewardCoins,
      xp: userObj.xp + rewardXp
    });

    const text = `🎉 *RESPOSTA CORRETA!* @${sender.split('@')[0]} acertou em cheio!\n\n` +
                 `❓ *Pergunta:* ${activeQuiz.question}\n` +
                 `✅ *Resposta:* *${activeQuiz.answer.toUpperCase()}*\n\n` +
                 `🎁 *Prêmio:* +$${rewardCoins} moedas e +${rewardXp} XP! 🏆`;

    await sock.sendMessage(from, { text, mentions: [sender] }, { quoted: msg });
    return true;
  }

  return false;
}
