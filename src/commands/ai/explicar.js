import axios from 'axios';

export async function handleExplicarCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  const concept = args.join(' ');

  if (!concept) {
    return sock.sendMessage(from, { text: '⚠️ Por favor, informe o que deseja que eu explique. Ex: `/explicar O que é computação quântica?`' }, { quoted: msg });
  }

  await sock.sendMessage(from, { text: '💡 Preparando explicação...' }, { quoted: msg });

  try {
    const prompt = `Explique de maneira simples, didática e completa em português do Brasil o seguinte tema/conceito: ${concept}`;
    const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai`);
    const explanation = res.data || 'Não foi possível gerar a explicação.';

    return sock.sendMessage(from, { text: `💡 *Explicação:*\n\n${explanation}` }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /explicar:', err.message);
    return sock.sendMessage(from, { text: '⚠️ Ocorreu um erro ao buscar a explicação.' }, { quoted: msg });
  }
}
