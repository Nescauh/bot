import axios from 'axios';

export async function handleResumirCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  
  let textToSummarize = args.join(' ');
  
  // Se for resposta a uma mensagem
  const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!textToSummarize && quotedMsg) {
    textToSummarize = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '';
  }

  if (!textToSummarize) {
    return sock.sendMessage(from, { text: '⚠️ Por favor, informe ou responda a um texto para resumir. Ex: `/resumir <texto>`' }, { quoted: msg });
  }

  await sock.sendMessage(from, { text: '📝 Gerando resumo...' }, { quoted: msg });

  try {
    const prompt = `Resuma o seguinte texto de forma clara, concisa e direta em tópicos no português do Brasil:\n\n${textToSummarize}`;
    const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai`);
    const summary = res.data || 'Não foi possível gerar um resumo.';

    return sock.sendMessage(from, { text: `📋 *Resumo do Texto:*\n\n${summary}` }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /resumir:', err.message);
    return sock.sendMessage(from, { text: '⚠️ Erro ao tentar resumir o texto.' }, { quoted: msg });
  }
}
