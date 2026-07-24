import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export async function handleResumirCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  
  let textToSummarize = args.join(' ');
  
  const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!textToSummarize && quotedMsg) {
    textToSummarize = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '';
  }

  if (!textToSummarize) {
    return sock.sendMessage(from, { text: '⚠️ Por favor, informe ou responda a um texto para resumir. Ex: `/resumir <texto>`' }, { quoted: msg });
  }

  await sock.sendMessage(from, { text: '📝 Gerando resumo...' }, { quoted: msg });

  const prompt = `Resuma o seguinte texto de forma clara, concisa e direta em tópicos no português do Brasil:\n\n${textToSummarize}`;
  const apiKey = process.env.AI_API_KEY;

  try {
    const headers = apiKey ? {
      'Authorization': `Bearer ${apiKey}`,
      'x-api-key': apiKey
    } : {};

    const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai`, { headers });
    const summary = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

    return sock.sendMessage(from, { text: `📋 *Resumo do Texto:*\n\n${summary}` }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /resumir:', err.message);
    try {
      const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai`);
      const summary = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      return sock.sendMessage(from, { text: `📋 *Resumo do Texto:*\n\n${summary}` }, { quoted: msg });
    } catch (_) {
      return sock.sendMessage(from, { text: '⚠️ Erro ao tentar resumir o texto.' }, { quoted: msg });
    }
  }
}
