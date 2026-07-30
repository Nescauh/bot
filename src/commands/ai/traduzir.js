import axios from 'axios';

// Lista de idiomas suportados como parâmetro alvo
const TARGET_LANG_MAP = {
  'ingles': 'en', 'inglês': 'en', 'en': 'en',
  'espanhol': 'es', 'es': 'es',
  'portugues': 'pt', 'português': 'pt', 'pt': 'pt',
  'frances': 'fr', 'francês': 'fr', 'fr': 'fr',
  'alemao': 'de', 'alemão': 'de', 'de': 'de',
  'italiano': 'it', 'it': 'it',
  'japones': 'ja', 'japonês': 'ja', 'ja': 'ja',
  'russo': 'ru', 'ru': 'ru',
  'chines': 'zh', 'chinês': 'zh', 'zh': 'zh',
  'coreano': 'ko', 'ko': 'ko',
  'arabe': 'ar', 'árabe': 'ar',
  'turco': 'tr', 'tr': 'tr',
  'holandes': 'nl', 'holandês': 'nl',
  'polones': 'pl', 'polonês': 'pl'
};

export async function handleTraduzirCommand(sock, msg, args) {
  const from = msg.key.remoteJid;

  // Extrair texto citado se houver
  const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  let quotedText = '';
  if (quotedMsg) {
    quotedText = quotedMsg.conversation || 
                 quotedMsg.extendedTextMessage?.text || 
                 quotedMsg.imageMessage?.caption || 
                 quotedMsg.videoMessage?.caption || '';
  }

  let targetLang = 'pt';
  let textToTranslate = '';

  if (args.length > 0) {
    const firstArgLower = args[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Se o primeiro argumento for explicitamente um idioma configurado (ex: /traduzir en Olá mundo ou /traduzir ingles Olá)
    if (TARGET_LANG_MAP[firstArgLower] && (args.length > 1 || quotedText)) {
      targetLang = TARGET_LANG_MAP[firstArgLower];
      textToTranslate = args.slice(1).join(' ');
    } else {
      // Caso contrário, considera o texto completo como a frase a ser traduzida para Português (pt)
      targetLang = 'pt';
      textToTranslate = args.join(' ');
    }
  }

  // Se não passou texto nos argumentos, tenta usar o texto citado da mensagem respondida
  if (!textToTranslate && quotedText) {
    textToTranslate = quotedText;
  }

  if (!textToTranslate) {
    return sock.sendMessage(from, { 
      text: '🌐 *COMANDO TRADUZIR* 🌐\n\n' +
            '• \`/traduzir <texto>\` — traduz o texto para Português\n' +
            '• \`/traduzir <idioma> <texto>\` — traduz o texto para o idioma desejado (ex: en, es, fr, ja, de)\n' +
            '• Responda a uma mensagem com \`/traduzir\` ou \`/traduzir <idioma>\`\n\n' +
            '💡 *Exemplos:*\n' +
            '• \`/traduzir hi how are you\` ➔ "oi como você está"\n' +
            '• \`/traduzir en Bom dia a todos\` ➔ "Good morning everyone"' 
    }, { quoted: msg });
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(textToTranslate)}`;
    const res = await axios.get(url);
    
    // Une todas as partes da frase traduzida
    const translatedText = res.data[0]?.map(item => item[0]).filter(Boolean).join('') || textToTranslate;
    const detectedLang = (res.data[2] || 'auto').toUpperCase();

    return sock.sendMessage(from, { 
      text: `🌐 *Tradução (${detectedLang} ➔ ${targetLang.toUpperCase()}):*\n\n${translatedText}` 
    }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /traduzir:', err.message);
    return sock.sendMessage(from, { 
      text: '⚠️ Não foi possível traduzir o texto. Tente novamente em instantes.' 
    }, { quoted: msg });
  }
}
