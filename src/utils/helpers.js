import { downloadMediaMessage as baileysDownload } from '@whiskeysockets/baileys';
import playdl from 'play-dl';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Configura o ffmpeg com o binário estático
ffmpeg.setFfmpegPath(ffmpegPath);

// Formata segundos em "Xh Ym Zs"
export function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

// Baixa uma mídia de uma mensagem do WhatsApp e retorna o caminho do arquivo temporário
export async function downloadWhatsAppMedia(message, messageType) {
  try {
    const buffer = await baileysDownload(
      message,
      'buffer',
      {}
    );
    
    // Determinar extensão básica
    let ext = 'bin';
    if (messageType === 'image') ext = 'jpg';
    else if (messageType === 'video') ext = 'mp4';
    else if (messageType === 'audio') ext = 'mp3';
    else if (messageType === 'sticker') ext = 'webp';
    
    const tempFile = path.join(os.tmpdir(), `wa-media-${Date.now()}.${ext}`);
    fs.writeFileSync(tempFile, buffer);
    return tempFile;
  } catch (error) {
    console.error('Erro ao baixar mídia do WhatsApp:', error);
    throw error;
  }
}

// Busca e baixa áudio do YouTube (usando play-dl + ffmpeg)
// play-dl usa o protocolo interno do YouTube, evitando bloqueio anti-bot em servidores
export async function downloadYoutubeAudio(query) {
  try {
    // Busca o vídeo no YouTube
    const searchResults = await playdl.search(query, { source: { youtube: 'video' }, limit: 1 });
    if (!searchResults || searchResults.length === 0) {
      throw new Error('Nenhum vídeo encontrado para esta busca.');
    }

    const video = searchResults[0];
    const tempFile = path.join(os.tmpdir(), `yt-audio-${Date.now()}.mp3`);

    // Obtém o stream de áudio via play-dl
    const stream = await playdl.stream(video.url, { quality: 0 });

    // Converte para mp3 via ffmpeg
    await new Promise((resolve, reject) => {
      ffmpeg(stream.stream)
        .inputFormat(stream.type === 'opus' ? 'opus' : 'webm')
        .audioBitrate(128)
        .toFormat('mp3')
        .save(tempFile)
        .on('end', resolve)
        .on('error', reject);
    });

    return {
      filePath: tempFile,
      title: video.title,
      duration: video.durationRaw,
      views: video.views,
      author: video.channel?.name || 'Desconhecido',
      url: video.url
    };
  } catch (error) {
    console.error('Erro no downloadYoutubeAudio:', error);
    throw error;
  }
}

// Busca e baixa vídeo do YouTube (usando play-dl + ffmpeg)
export async function downloadYoutubeVideo(query) {
  try {
    // Busca o vídeo no YouTube
    const searchResults = await playdl.search(query, { source: { youtube: 'video' }, limit: 1 });
    if (!searchResults || searchResults.length === 0) {
      throw new Error('Nenhum vídeo encontrado para esta busca.');
    }

    const video = searchResults[0];
    const tempFile = path.join(os.tmpdir(), `yt-video-${Date.now()}.mp4`);

    // Obtém o stream de áudio via play-dl
    const stream = await playdl.stream(video.url, { quality: 0 });

    // Converte para mp4 via ffmpeg (apenas áudio com vídeo thumbnail — limitação do play-dl)
    await new Promise((resolve, reject) => {
      ffmpeg(stream.stream)
        .inputFormat(stream.type === 'opus' ? 'opus' : 'webm')
        .audioCodec('aac')
        .videoCodec('libx264')
        .outputOptions(['-f mp4', '-movflags frag_keyframe+empty_moov'])
        .save(tempFile)
        .on('end', resolve)
        .on('error', reject);
    });

    return {
      filePath: tempFile,
      title: video.title,
      duration: video.durationRaw,
      views: video.views,
      author: video.channel?.name || 'Desconhecido',
      url: video.url
    };
  } catch (error) {
    console.error('Erro no downloadYoutubeVideo:', error);
    throw error;
  }
}
