import { getUser, updateUser } from '../../database/sqlite.js';
import { askAi } from '../../utils/aiService.js';
import { calculateBonusRewards } from '../../utils/bonusCalculator.js';

const fallbackQuestions = [
  { question: 'Qual o maior planeta do Sistema Solar?', answer: 'júpiter', altAnswers: ['jupiter'], options: ['Terra', 'Júpiter', 'Saturno', 'Marte'] },
  { question: 'Qual elemento químico tem o símbolo Au?', answer: 'ouro', altAnswers: [], options: ['Prata', 'Cobre', 'Ouro', 'Alumínio'] },
  { question: 'Em que ano o homem pisou na Lua pela primeira vez?', answer: '1969', altAnswers: [], options: ['1965', '1969', '1972', '1959'] },
  { question: 'Qual a capital da França?', answer: 'paris', altAnswers: [], options: ['Londres', 'Madri', 'Roma', 'Paris'] },
  { question: 'Quantos lados tem um heptágono?', answer: '7', altAnswers: ['sete'], options: ['5', '6', '7', '8'] },
  { question: 'Qual é o maior oceano do mundo?', answer: 'pacífico', altAnswers: ['pacifico'], options: ['Atlântico', 'Índico', 'Pacífico', 'Ártico'] },
  { question: 'Qual o animal terrestre mais rápido do mundo?', answer: 'guepardo', altAnswers: ['cheetah'], options: ['Leão', 'Guepardo', 'Gázela', 'Cavalo'] },
  { question: 'Quem pintou a obra Monalisa?', answer: 'leonardo da vinci', altAnswers: ['da vinci'], options: ['Picasso', 'Van Gogh', 'Da Vinci', 'Monet'] }
];

// Armazena quizzes ativos por chat: { [chatJid]: { question, answer, altAnswers, options } }
export const activeQuizGames = new Map();

function normalizeString(str) {
  return str ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() : '';
}

export async function handleQuizCommand(sock, msg, args, sender) {
  const from = msg.key.remoteJid;
  const inputArg = args.join(' ').trim();

  if (['reset', 'novo', 'reiniciar', 'cancelar'].includes(inputArg.toLowerCase())) {
    activeQuizGames.delete(from);
    return startNewAiQuiz(sock, msg, from);
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
                 `👉 *Digite a resposta correta no chat!*`;
    return sock.sendMessage(from, { text }, { quoted: msg });
  }

  return startNewAiQuiz(sock, msg, from);
}

async function generateAiQuestion() {
  const systemInstruction = 'Você é um gerador de Quiz de conhecimentos gerais para um bot de WhatsApp. Sua tarefa é criar 1 pergunta inédita, curiosa e divertida com 4 opções de resposta (onde apenas 1 é a correta). Responda EXCLUSIVAMENTE em formato JSON estrito com as chaves: "pergunta" (string), "resposta" (string exata da opção correta), "opcoes" (array com exatamente 4 strings das alternativas). Não inclua crases de markdown nem qualquer outro texto além do JSON.';
  const prompt = 'Gere 1 nova pergunta de quiz surpreendente sobre ciência, história, cinema, jogos, geografia ou cultura pop.';

  try {
    const rawAnswer = await askAi(prompt, systemInstruction);
    const cleanJson = rawAnswer.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    if (parsed.pergunta && parsed.resposta && Array.isArray(parsed.opcoes) && parsed.opcoes.length >= 4) {
      return {
        question: parsed.pergunta,
        answer: parsed.resposta,
        altAnswers: [],
        options: parsed.opcoes.slice(0, 4)
      };
    }
  } catch (err) {
    console.warn('⚠️ Falha ao gerar pergunta do Quiz via IA, usando banco fallback:', err.message);
  }

  // Fallback se a IA falhar ou expirar
  return fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
}

async function startNewAiQuiz(sock, msg, from) {
  await sock.sendMessage(from, { text: '🧠 *Gerando pergunta inédita com IA, aguarde...*' }, { quoted: msg });

  const q = await generateAiQuestion();

  activeQuizGames.set(from, {
    question: q.question,
    answer: q.answer,
    altAnswers: q.altAnswers || [],
    options: q.options
  });

  const text = `🧠 *QUIZ DE IA INÉDITO*\n\n` +
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

  // Verifica se bate com a resposta inteira ou com uma das palavras-chave
  const isCorrect = cleanUser === cleanAnswer || 
                    cleanAlt.includes(cleanUser) || 
                    (cleanAnswer.length > 3 && cleanUser.includes(cleanAnswer)) ||
                    (cleanUser.length > 3 && cleanAnswer.includes(cleanUser));

  if (isCorrect) {
    activeQuizGames.delete(from);

    // Recompensa o jogador com moedas e XP no banco unificado com bônus aplicados
    const userObj = getUser(sender);
    const { finalCoins: rewardCoins, finalXp: rewardXp, bonusCoinsApplied, bonusXpApplied } = calculateBonusRewards(userObj, 200, 50, 'quiz');

    updateUser(sender, {
      wallet: userObj.wallet + rewardCoins,
      xp: userObj.xp + rewardXp
    });

    const bonusStr = (bonusCoinsApplied > 0 || bonusXpApplied > 0) ? ` *(com bônus de classe/evento!)*` : '';

    const text = `🎉 *RESPOSTA CORRETA!* @${sender.split('@')[0]} acertou em cheio!\n\n` +
                 `❓ *Pergunta:* ${activeQuiz.question}\n` +
                 `✅ *Resposta:* *${activeQuiz.answer.toUpperCase()}*\n\n` +
                 `🎁 *Prêmio:* +$${rewardCoins.toLocaleString('pt-BR')} moedas e +${rewardXp} XP!${bonusStr} 🏆`;

    await sock.sendMessage(from, { text, mentions: [sender] }, { quoted: msg });
    return true;
  }

  return false;
}
