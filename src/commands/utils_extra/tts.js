import axios from 'axios';

export async function handleTtsCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  const text = args.join(' ');

  if (!text) {
    return sock.sendMessage(from, { text: '⚠️ Por favor, informe o texto a ser falado. Ex: `/tts Olá pessoal, tudo bem?`' }, { quoted: msg });
  }

  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=pt&client=tw-ob`;
    const res = await axios.get(url, { responseType: 'arraybuffer' });

    return sock.sendMessage(from, { 
      audio: Buffer.from(res.data), 
      mimetype: 'audio/mp4',
      ptt: true 
    }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /tts:', err.message);
    return sock.sendMessage(from, { text: '⚠️ Não foi possível converter o texto em áudio.' }, { quoted: msg });
  }
}
