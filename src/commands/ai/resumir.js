import { askAi } from '../../utils/aiService.js';

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

  const systemPrompt = 'Você é um assistente especialista em resumir textos. Faça um resumo claro, conciso e em tópicos legíveis no português do Brasil.';

  try {
    const summary = await askAi(textToSummarize, systemPrompt);
    return sock.sendMessage(from, { text: `📋 *Resumo do Texto:*\n\n${summary}` }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /resumir:', err.message);
    return sock.sendMessage(from, { text: '⚠️ Erro ao tentar resumir o texto.' }, { quoted: msg });
  }
}
