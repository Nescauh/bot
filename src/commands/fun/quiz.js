const quizQuestions = [
  { question: 'Qual o maior planeta do Sistema Solar?', answer: 'júpiter', options: ['Terra', 'Júpiter', 'Saturno', 'Marte'] },
  { question: 'Qual elemento químico tem o símbolo Au?', answer: 'ouro', options: ['Prata', 'Cobre', 'Ouro', 'Alumínio'] },
  { question: 'Em que ano o homem pisou na Lua pela primeira vez?', answer: '1969', options: ['1965', '1969', '1972', '1959'] },
  { question: 'Qual a capital da França?', answer: 'paris', options: ['Londres', 'Madri', 'Roma', 'Paris'] },
  { question: 'Quantos lados tem um heptágono?', answer: '7', options: ['5', '6', '7', '8'] }
];

export async function handleQuizCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  const q = quizQuestions[Math.floor(Math.random() * quizQuestions.length)];

  const text = `🧠 *QUIZ RÁPIDO*\n\n❓ *Pergunta:* ${q.question}\n\n📌 Responda no chat!` +
               `\n💡 *Opções:* ${q.options.join(', ')}`;

  return sock.sendMessage(from, { text }, { quoted: msg });
}
