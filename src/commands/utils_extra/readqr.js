import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { downloadWhatsAppMedia } from '../../utils/helpers.js';

export async function handleReadqrCommand(sock, msg) {
  const from = msg.key.remoteJid;
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  
  const targetMsg = quoted ? { message: quoted } : msg;
  const imageMsg = targetMsg.message?.imageMessage;

  if (!imageMsg) {
    return sock.sendMessage(from, { text: '⚠️ Por favor, envie ou responda a uma imagem de QR Code com o comando `/readqr`.' }, { quoted: msg });
  }

  try {
    const tmpFile = await downloadWhatsAppMedia(targetMsg, 'image');
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(tmpFile));

    const res = await axios.post('https://api.qrserver.com/v1/read-qr-code/', formData, {
      headers: formData.getHeaders()
    });

    fs.unlinkSync(tmpFile);

    const symbol = res.data[0]?.symbol[0];
    if (!symbol || symbol.error || !symbol.data) {
      return sock.sendMessage(from, { text: '⚠️ Não foi possível ler nenhum QR Code na imagem fornecida.' }, { quoted: msg });
    }

    return sock.sendMessage(from, { text: `🔍 *QR Code Lido com Sucesso:*\n\n\`\`\`${symbol.data}\`\`\`` }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /readqr:', err.message);
    return sock.sendMessage(from, { text: '⚠️ Erro ao tentar ler a imagem do QR Code.' }, { quoted: msg });
  }
}
