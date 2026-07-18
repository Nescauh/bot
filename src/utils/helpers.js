import { downloadMediaMessage as baileysDownload } from '@whiskeysockets/baileys';
import youtubedl from 'youtube-dl-exec';
import ffmpegPath from 'ffmpeg-static';
import yts from 'yt-search';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

// Busca e baixa áudio do YouTube
export async function downloadYoutubeAudio(query) {
  try {
    const searchResult = await yts(query);
    if (!searchResult || !searchResult.videos.length) {
      throw new Error('Nenhum vídeo encontrado para esta busca.');
    }
    
    const video = searchResult.videos[0];
    const tempFileBase = path.join(os.tmpdir(), `yt-audio-${Date.now()}`);
    const tempFile = `${tempFileBase}.mp3`;
    
    await youtubedl(video.url, {
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: '0',
      output: `${tempFileBase}.%(ext)s`,
      ffmpegLocation: `"${ffmpegPath}"`,
      noPlaylist: true,
      noWarnings: true
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

// Busca e baixa vídeo do YouTube
export async function downloadYoutubeVideo(query) {
  try {
    const searchResult = await yts(query);
    if (!searchResult || !searchResult.videos.length) {
      throw new Error('Nenhum vídeo encontrado para esta busca.');
    }
    
    const video = searchResult.videos[0];
    const tempFileBase = path.join(os.tmpdir(), `yt-video-${Date.now()}`);
    const tempFile = `${tempFileBase}.mp4`;
    
    await youtubedl(video.url, {
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      output: `${tempFileBase}.%(ext)s`,
      ffmpegLocation: `"${ffmpegPath}"`,
      noPlaylist: true,
      noWarnings: true
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
