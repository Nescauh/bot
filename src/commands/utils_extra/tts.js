import axios from 'axios';
import ffmpegPath from 'ffmpeg-static';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

function convertMp3ToOggOpus(buffer) {
  return new Promise((resolve, reject) => {
    const tmpInput = path.join(os.tmpdir(), `tts-in-${Date.now()}.mp3`);
    const tmpOutput = path.join(os.tmpdir(), `tts-out-${Date.now()}.ogg`);
    
    fs.writeFileSync(tmpInput, buffer);

    const args = [
      '-y',
      '-i', tmpInput,
      '-c:a', 'libopus',
      '-b:a', '64k',
      '-vbr', 'on',
      tmpOutput
    ];

    execFile(ffmpegPath, args, (err) => {
      if (err) {
        const fallbackArgs = ['-y', '-i', tmpInput, '-ac', '1', tmpOutput];
        execFile(ffmpegPath, fallbackArgs, (err2) => {
          try { fs.unlinkSync(tmpInput); } catch (_) {}
          if (err2) return reject(err2);
          try {
            const outBuffer = fs.readFileSync(tmpOutput);
            try { fs.unlinkSync(tmpOutput); } catch (_) {}
            resolve(outBuffer);
          } catch (e) {
            reject(e);
          }
        });
        return;
      }
      try { fs.unlinkSync(tmpInput); } catch (_) {}
      try {
        const outBuffer = fs.readFileSync(tmpOutput);
        try { fs.unlinkSync(tmpOutput); } catch (_) {}
        resolve(outBuffer);
      } catch (e) {
        reject(e);
      }
    });
  });
}

export async function handleTtsCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  const text = args.join(' ');

  if (!text) {
    return sock.sendMessage(from, { text: '⚠️ Por favor, informe o texto a ser falado. Ex: `/tts Olá pessoal, tudo bem?`' }, { quoted: msg });
  }

  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=pt&client=tw-ob`;
    const res = await axios.get(url, { responseType: 'arraybuffer' });

    let audioBuffer;
    let mimetype = 'audio/ogg; codecs=opus';
    try {
      audioBuffer = await convertMp3ToOggOpus(Buffer.from(res.data));
    } catch (ffmpegErr) {
      console.warn('⚠️ Falha ao converter TTS para Opus OGG, enviando MP3 nativo:', ffmpegErr.message);
      audioBuffer = Buffer.from(res.data);
      mimetype = 'audio/mp4';
    }

    return sock.sendMessage(from, { 
      audio: audioBuffer, 
      mimetype,
      ptt: true 
    }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /tts:', err.message);
    return sock.sendMessage(from, { text: '⚠️ Não foi possível converter o texto em áudio.' }, { quoted: msg });
  }
}

