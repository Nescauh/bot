import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function handleQrcodeCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  const text = args.join(' ');

  if (!text) {
    return sock.sendMessage(from, { text: '⚠️ Por favor, informe o texto ou link para gerar o QR Code. Ex: `/qrcode https://google.com`' }, { quoted: msg });
  }

  const tmpFile = path.join(os.tmpdir(), `qr-gen-${Date.now()}.png`);

  try {
    await QRCode.toFile(tmpFile, text, { width: 400 });
    await sock.sendMessage(from, { 
      image: fs.readFileSync(tmpFile),
      caption: `🏁 *QR Code Gerado!*\n\n📝 *Conteúdo:* ${text}`
    }, { quoted: msg });

    fs.unlinkSync(tmpFile);
  } catch (err) {
    console.error('Erro ao gerar QR code:', err);
    return sock.sendMessage(from, { text: '⚠️ Não foi possível gerar o QR Code.' }, { quoted: msg });
  }
}
