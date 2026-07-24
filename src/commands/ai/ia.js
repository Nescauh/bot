import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export async function handleIaCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  const prompt = args.join(' ');
  if (!prompt) {
    return sock.sendMessage(from, { text: '⚠️ Por favor, informe uma pergunta ou frase para a IA. Ex: `/ia Qual a capital do Brasil?`' }, { quoted: msg });
  }

  await sock.sendMessage(from, { text: '🤖 Pensando...' }, { quoted: msg });

  const apiKey = process.env.AI_API_KEY;

  try {
    const headers = apiKey ? {
      'Authorization': `Bearer ${apiKey}`,
      'x-api-key': apiKey
    } : {};

    const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai`, { headers });
    const answer = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

    return sock.sendMessage(from, { text: `🤖 *Resposta da IA:*\n\n${answer}` }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /ia:', err.message);
    try {
      const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai`);
      const answer = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      return sock.sendMessage(from, { text: `🤖 *Resposta da IA:*\n\n${answer}` }, { quoted: msg });
    } catch (_) {
      return sock.sendMessage(from, { text: '⚠️ Ocorreu um erro ao consultar a Inteligência Artificial. Tente novamente mais tarde.' }, { quoted: msg });
    }
  }
}
