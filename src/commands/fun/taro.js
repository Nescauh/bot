import { askAi } from '../../utils/aiService.js';

const TAROT_CARDS = [
  'O Louco (0)', 'O Mago (I)', 'A Sacerdotisa (II)', 'A Imperatriz (III)', 'O Imperador (IV)',
  'O Papa (V)', 'Os Enamorados (VI)', 'O Carro (VII)', 'A Força (VIII)', 'O Eremita (IX)',
  'A Roda da Fortuna (X)', 'A Justiça (XI)', 'O Enforcado (XII)', 'A Morte (XIII)',
  'A Temperança (XIV)', 'O Diabo (XV)', 'A Torre (XVI)', 'A Estrela (XVII)', 'A Lua (XVIII)',
  'O Sol (XIX)', 'O Julgamento (XX)', 'O Mundo (XXI)'
];

function draw3Cards() {
  const shuffled = [...TAROT_CARDS].sort(() => 0.5 - Math.random());
  return {
    passado: shuffled[0],
    presente: shuffled[1],
    futuro: shuffled[2]
  };
}

export async function handleTaroCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  const question = args.join(' ').trim();

  await sock.sendMessage(from, { text: '🃏 *Embaralhando o Baralho Cóptero de Tarô...*' }, { quoted: msg });

  const cards = draw3Cards();

  const systemInstruction = 'Você é um tarólogo místico, sábio e misterioso no WhatsApp. Sua tarefa é fazer uma leitura intuitiva e profunda de Tarô baseada nas 3 cartas tiradas (Passado, Presente e Futuro). Relacione o significado das cartas com a pergunta ou momento do usuário. Escreva uma resposta envolvente, poética e inspiradora com formatação em tópicos curtos e emojis místicos.';
  
  const prompt = `Cartas Tiradas:\n1. Passado: ${cards.passado}\n2. Presente: ${cards.presente}\n3. Futuro: ${cards.futuro}\n\nPergunta/Intenção do usuário: "${question || 'Consulta geral sobre os rumos da vida'}"`;

  try {
    const reading = await askAi(prompt, systemInstruction);

    const resultText = `🔮 *LEITURA DE TARÔ MÍSTICO DA IA* 🔮\n\n` +
                       `🃏 *Cartas Sorteadas:*\n` +
                       `1️⃣ *Passado:* ${cards.passado}\n` +
                       `2️⃣ *Presente:* ${cards.presente}\n` +
                       `3️⃣ *Futuro:* ${cards.futuro}\n\n` +
                       `❓ *Consulta:* ${question ? `"${question}"` : '_Visão geral da vida_'}\n\n` +
                       `✨ *Interpretação Oracular:*\n\n${reading}`;

    return sock.sendMessage(from, { text: resultText }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /taro:', err.message);
    const fallbackText = `🔮 *LEITURA DE TARÔ MÍSTICO* 🔮\n\n` +
                         `🃏 *Cartas Sorteadas:*\n` +
                         `1️⃣ *Passado:* ${cards.passado}\n` +
                         `2️⃣ *Presente:* ${cards.presente}\n` +
                         `3️⃣ *Futuro:* ${cards.futuro}\n\n` +
                         `✨ *Visão:* O passado trouxe aprendizados com ${cards.passado}. O presente exige atenção com ${cards.presente}, e o futuro promete caminhos com ${cards.futuro}!`;
    return sock.sendMessage(from, { text: fallbackText }, { quoted: msg });
  }
}
