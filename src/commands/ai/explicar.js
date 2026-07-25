import { askAi } from '../../utils/aiService.js';

export async function handleExplicarCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  const concept = args.join(' ');

  if (!concept) {
    return sock.sendMessage(from, { text: '⚠️ Por favor, informe o que deseja que eu explique. Ex: `/explicar O que é computação quântica?`' }, { quoted: msg });
  }

  await sock.sendMessage(from, { text: '💡 Preparando explicação...' }, { quoted: msg });

  const systemPrompt = 'Você é um professor didático e divertido. Explique o conceito solicitado de maneira simples, completa e fácil de entender no português do Brasil.';

  try {
    const explanation = await askAi(concept, systemPrompt);
    return sock.sendMessage(from, { text: `💡 *Explicação:*\n\n${explanation}` }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /explicar:', err.message);
    return sock.sendMessage(from, { text: '⚠️ Ocorreu um erro ao buscar a explicação.' }, { quoted: msg });
  }
}
