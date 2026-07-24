import axios from 'axios';

export async function handleIaCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  const prompt = args.join(' ');
  if (!prompt) {
    return sock.sendMessage(from, { text: '⚠️ Por favor, informe uma pergunta ou frase para a IA. Ex: `/ia Qual a capital do Brasil?`' }, { quoted: msg });
  }

  await sock.sendMessage(from, { text: '🤖 Pensando...' }, { quoted: msg });

  try {
    const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai`);
    const answer = res.data || 'Não consegui obter uma resposta no momento.';
    return sock.sendMessage(from, { text: `🤖 *Resposta da IA:*\n\n${answer}` }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /ia:', err.message);
    return sock.sendMessage(from, { text: '⚠️ Ocorreu um erro ao consultar a Inteligência Artificial. Tente novamente mais tarde.' }, { quoted: msg });
  }
}
