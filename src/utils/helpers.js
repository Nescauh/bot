import { downloadMediaMessage as baileysDownload } from '@whiskeysockets/baileys';
import ytdl from '@distube/ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import yts from 'yt-search';
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

// Busca e baixa áudio do YouTube (usando ytdl-core + ffmpeg)
export async function downloadYoutubeAudio(query) {
  try {
    // Busca o vídeo
    const searchResult = await yts(query);
    if (!searchResult || !searchResult.videos.length) {
      throw new Error('Nenhum vídeo encontrado para esta busca.');
    }

    const video = searchResult.videos[0];
    const tempFile = path.join(os.tmpdir(), `yt-audio-${Date.now()}.mp3`);

    // Baixa o stream de áudio e converte para mp3
    await new Promise((resolve, reject) => {
      const stream = ytdl(video.url, {
        quality: 'highestaudio',
        filter: 'audioonly',
      });

      ffmpeg(stream)
        .audioBitrate(128)
        .toFormat('mp3')
        .save(tempFile)
        .on('end', resolve)
        .on('error', reject);
    });

    return {
      filePath: tempFile,
      title: video.title,
      duration: video.timestamp,
      views: video.views,
      author: video.author.name,
      url: video.url
    };
  } catch (error) {
    console.error('Erro no downloadYoutubeAudio:', error);
    throw error;
  }
}

// Busca e baixa vídeo do YouTube (usando ytdl-core + ffmpeg)
export async function downloadYoutubeVideo(query) {
  try {
    // Busca o vídeo
    const searchResult = await yts(query);
    if (!searchResult || !searchResult.videos.length) {
      throw new Error('Nenhum vídeo encontrado para esta busca.');
    }

    const video = searchResult.videos[0];
    const tempFile = path.join(os.tmpdir(), `yt-video-${Date.now()}.mp4`);

    // Baixa streams de vídeo e áudio e mescla com ffmpeg
    await new Promise((resolve, reject) => {
      const videoStream = ytdl(video.url, { quality: 'highestvideo', filter: 'videoonly' });
      const audioStream = ytdl(video.url, { quality: 'highestaudio', filter: 'audioonly' });

      ffmpeg()
        .input(videoStream)
        .input(audioStream)
        .outputOptions('-c:v copy')
        .outputOptions('-c:a aac')
        .save(tempFile)
        .on('end', resolve)
        .on('error', reject);
    });

    return {
      filePath: tempFile,
      title: video.title,
      duration: video.timestamp,
      views: video.views,
      author: video.author.name,
      url: video.url
    };
  } catch (error) {
    console.error('Erro no downloadYoutubeVideo:', error);
    throw error;
  }
}
