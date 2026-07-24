import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { downloadWhatsAppMedia } from '../../utils/helpers.js';

export async function handleOcrCommand(sock, msg) {
  const from = msg.key.remoteJid;
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

  const targetMsg = quoted ? { message: quoted } : msg;
  const imageMsg = targetMsg.message?.imageMessage;

  if (!imageMsg) {
    return sock.sendMessage(from, { text: '⚠️ Por favor, envie ou responda a uma imagem com o comando `/ocr`.' }, { quoted: msg });
  }

  await sock.sendMessage(from, { text: '🔍 Extraindo texto da imagem...' }, { quoted: msg });

  try {
    const tmpFile = await downloadWhatsAppMedia(targetMsg, 'image');

    const formData = new FormData();
    formData.append('file', fs.createReadStream(tmpFile));
    formData.append('apikey', 'helloworld'); // Public test key for OCR.space
    formData.append('language', 'por');

    const res = await axios.post('https://api.ocr.space/parse/image', formData, {
      headers: formData.getHeaders()
    });

    fs.unlinkSync(tmpFile);

    const parsedText = res.data?.ParsedResults?.[0]?.ParsedText;

    if (!parsedText || !parsedText.trim()) {
      return sock.sendMessage(from, { text: '⚠️ Nenhum texto legível foi encontrado na imagem.' }, { quoted: msg });
    }

    return sock.sendMessage(from, { text: `📝 *TEXTO EXTRAÍDO DA IMAGEM (OCR):*\n\n${parsedText.trim()}` }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /ocr:', err.message);
    return sock.sendMessage(from, { text: '⚠️ Erro ao tentar processar o OCR da imagem.' }, { quoted: msg });
  }
}
