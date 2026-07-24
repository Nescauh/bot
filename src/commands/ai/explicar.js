import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export async function handleExplicarCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  const concept = args.join(' ');

  if (!concept) {
    return sock.sendMessage(from, { text: '⚠️ Por favor, informe o que deseja que eu explique. Ex: `/explicar O que é computação quântica?`' }, { quoted: msg });
  }

  await sock.sendMessage(from, { text: '💡 Preparando explicação...' }, { quoted: msg });

  const prompt = `Explique de maneira simples, didática e completa em português do Brasil o seguinte tema/conceito: ${concept}`;
  const apiKey = process.env.AI_API_KEY;

  try {
    const headers = apiKey ? {
      'Authorization': `Bearer ${apiKey}`,
      'x-api-key': apiKey
    } : {};

    const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai`, { headers });
    const explanation = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

    return sock.sendMessage(from, { text: `💡 *Explicação:*\n\n${explanation}` }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /explicar:', err.message);
    try {
      const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai`);
      const explanation = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      return sock.sendMessage(from, { text: `💡 *Explicação:*\n\n${explanation}` }, { quoted: msg });
    } catch (_) {
      return sock.sendMessage(from, { text: '⚠️ Ocorreu um erro ao buscar a explicação.' }, { quoted: msg });
    }
  }
}
