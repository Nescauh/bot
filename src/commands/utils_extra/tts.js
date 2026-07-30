import axios from 'axios';
import ffmpegPath from 'ffmpeg-static';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Configuração das vozes disponíveis e seus filtros de áudio no FFMPEG
const VOICES = {
  bob: {
    name: 'Bob Esponja',
    channel: 'Nickelodeon Brasil',
    aliases: ['bob', 'esponja', 'bobesponja'],
    filter: 'asetrate=44100*1.3,aresample=44100,atempo=1/1.3,equalizer=f=2000:g=5'
  },
  xandao: {
    name: 'Super Xandão',
    channel: 'Super Xandão',
    aliases: ['xandao', 'xandão', 'superxandao', 'superxandão'],
    filter: 'asetrate=44100*0.82,aresample=44100,atempo=1/0.82,equalizer=f=100:g=8'
  },
  trezoitao: {
    name: 'Renato Trezoitão',
    channel: 'Renato Trezoitão',
    aliases: ['trezoitao', 'trezoitão', 'renato', '38'],
    filter: 'asetrate=44100*0.85,aresample=44100,atempo=1/0.85,equalizer=f=120:g=6,aecho=0.8:0.88:20:0.3'
  },
  arthur: {
    name: 'Arthur do Val',
    channel: 'Mamãe Falei',
    aliases: ['arthur', 'mamaefalei', 'mamae'],
    filter: 'asetrate=44100*1.05,aresample=44100,atempo=1.2,equalizer=f=2500:g=4'
  },
  eneias: {
    name: 'Doutor Enéias',
    channel: 'Doutor Enéias',
    aliases: ['eneias', 'enéias', 'dreneias', 'dr.eneias', '56'],
    filter: 'asetrate=44100*0.9,aresample=44100,atempo=1.3,equalizer=f=1000:g=6'
  },
  serjao: {
    name: 'Serjão dos Foguetes',
    channel: 'Ciência Sem Fim',
    aliases: ['serjao', 'serjão', 'sacani', 'foguetes'],
    filter: 'asetrate=44100*0.88,aresample=44100,atempo=0.95,equalizer=f=150:g=6'
  },
  padrao: {
    name: 'Padrão',
    channel: 'Google TTS',
    aliases: ['padrao', 'padrão', 'google', 'default'],
    filter: null
  }
};

function getVoiceHelpText() {
  return `🗣️ *VOZES DISPONÍVEIS NO COMANDO /tts* 🗣️\n\n` +
         `*Como usar:*\n` +
         `• \`/tts <voz> <texto>\` — fala com a voz escolhida\n` +
         `• \`/tts <texto>\` — fala com a voz padrão\n\n` +
         `🎙️ *Lista de Vozes:* \n` +
         `1️⃣ *bob* — Bob Esponja (Nickelodeon Brasil)\n` +
         `2️⃣ *xandao* — Super Xandão (Super Xandão)\n` +
         `3️⃣ *trezoitao* — Renato Trezoitão (Renato Trezoitão)\n` +
         `4️⃣ *arthur* — Arthur do Val (Mamãe Falei)\n` +
         `5️⃣ *eneias* — Doutor Enéias (Doutor Enéias)\n` +
         `6️⃣ *serjao* — Serjão dos Foguetes (Ciência Sem Fim)\n` +
         `7️⃣ *padrao* — Voz Padrão (Google TTS)\n\n` +
         `💡 *Exemplos:* \n` +
         `• \`/tts xandao Fala meus voadores, Xandão na área!\` \n` +
         `• \`/tts bob Olá Patrick, vamos caçar água-viva!\` \n` +
         `• \`/tts eneias Meu nome é Enéias!\` \n` +
         `• \`/tts arthur Fala pessoal, Mamãe Falei aqui!\` \n` +
         `• \`/tts serjao Ciência sem fim no ar!\``;
}

function convertMp3ToOggOpus(buffer, filter = null) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).substring(7);
    const tmpInput = path.join(os.tmpdir(), `tts-in-${Date.now()}-${id}.mp3`);
    const tmpOutput = path.join(os.tmpdir(), `tts-out-${Date.now()}-${id}.ogg`);
    
    fs.writeFileSync(tmpInput, buffer);

    const args = ['-y', '-i', tmpInput];
    
    if (filter) {
      args.push('-af', filter);
    }

    args.push(
      '-c:a', 'libopus',
      '-b:a', '64k',
      '-vbr', 'on',
      tmpOutput
    );

    execFile(ffmpegPath, args, (err) => {
      if (err) {
        // Fallback simples se o filtro falhar
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

  if (!args || args.length === 0) {
    return sock.sendMessage(from, { text: getVoiceHelpText() }, { quoted: msg });
  }

  const firstArg = args[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Se o usuário pedir a lista de vozes
  if (['vozes', 'lista', 'help', 'voz'].includes(firstArg)) {
    return sock.sendMessage(from, { text: getVoiceHelpText() }, { quoted: msg });
  }

  let selectedVoice = VOICES.padrao;
  let text = '';

  // Procura se o primeiro argumento bate com alguma voz
  let foundVoiceKey = Object.keys(VOICES).find(key => 
    VOICES[key].aliases.some(alias => alias.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === firstArg)
  );

  if (foundVoiceKey) {
    selectedVoice = VOICES[foundVoiceKey];
    text = args.slice(1).join(' ');
  } else {
    // Caso não tenha especificado o nome de uma voz válida, usa o texto completo com a voz padrão
    text = args.join(' ');
  }

  if (!text) {
    return sock.sendMessage(from, { 
      text: `⚠️ Digite o texto para ser falado com a voz de *${selectedVoice.name}*.\nExemplo: \`/tts ${foundVoiceKey || 'padrao'} Olá pessoal!\`` 
    }, { quoted: msg });
  }

  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=pt&client=tw-ob`;
    const res = await axios.get(url, { responseType: 'arraybuffer' });

    let audioBuffer;
    let mimetype = 'audio/ogg; codecs=opus';

    try {
      audioBuffer = await convertMp3ToOggOpus(Buffer.from(res.data), selectedVoice.filter);
    } catch (ffmpegErr) {
      console.warn('⚠️ Falha ao aplicar efeito na voz TTS, enviando áudio padrão:', ffmpegErr.message);
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
