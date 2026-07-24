import axios from 'axios';

export async function handleTraduzirCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  let targetLang = args[0];
  let textToTranslate = args.slice(1).join(' ');

  // Se o usuário não passou o idioma alvo ou passou apenas o texto
  if (!textToTranslate && args.length > 0) {
    textToTranslate = args.join(' ');
    targetLang = 'pt';
  }

  if (!textToTranslate) {
    return sock.sendMessage(from, { text: '⚠️ Uso: `/traduzir <idioma> <texto>` ou responda a uma mensagem com `/traduzir <idioma>`.\nEx: `/traduzir en Olá mundo`' }, { quoted: msg });
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(textToTranslate)}`;
    const res = await axios.get(url);
    const translatedText = res.data[0]?.map(item => item[0]).join('') || textToTranslate;
    const detectedLang = res.data[2] || 'auto';

    return sock.sendMessage(from, { 
      text: `🌐 *Tradução (${detectedLang} ➔ ${targetLang}):*\n\n${translatedText}` 
    }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /traduzir:', err.message);
    return sock.sendMessage(from, { text: '⚠️ Não foi possível traduzir o texto. Verifique o código do idioma (ex: en, es, fr, pt).' }, { quoted: msg });
  }
}
