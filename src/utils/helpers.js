import { downloadMediaMessage as baileysDownload } from '@whiskeysockets/baileys';
import { spawn } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// Caminho base do projeto (para encontrar os cookies)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COOKIES_PATH = path.resolve(__dirname, '../../cookies.txt');

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

// Busca a URL do YouTube a partir de um nome ou URL
async function buscarUrlYoutube(query) {
  // Se já é uma URL do YouTube, retorna direto
  if (query.startsWith('http') && (query.includes('youtube.com') || query.includes('youtu.be'))) {
    return query;
  }

  // Busca pelo nome usando yt-dlp
  return new Promise((resolve, reject) => {
    const args = [
      `ytsearch1:${query}`,
      '--get-id',
      '--no-playlist'
    ];

    // Usa cookies se o arquivo existir
    if (fs.existsSync(COOKIES_PATH)) {
      args.unshift('--cookies', COOKIES_PATH);
    }

    const proc = spawn('yt-dlp', args);
    let id = '';

    proc.stdout.on('data', (data) => { id += data.toString().trim(); });
    proc.stderr.on('data', (data) => { console.error(`[yt-dlp busca] ${data}`); });
    proc.on('close', (code) => {
      if (code === 0 && id) {
        resolve(`https://www.youtube.com/watch?v=${id}`);
      } else {
        reject(new Error('Nenhum vídeo encontrado para esta busca.'));
      }
    });
    proc.on('error', () => reject(new Error('yt-dlp não encontrado. Instale com: pip install yt-dlp')));
  });
}

// Baixa áudio via yt-dlp com cookies para evitar bloqueio anti-bot
async function ytdlpDownload(url, args) {
  return new Promise((resolve, reject) => {
    const finalArgs = [...args];

    // Usa cookies se o arquivo existir
    if (fs.existsSync(COOKIES_PATH)) {
      finalArgs.unshift('--cookies', COOKIES_PATH);
    }

    const proc = spawn('yt-dlp', finalArgs);
    proc.stderr.on('data', (data) => { console.error(`[yt-dlp] ${data}`); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp finalizou com erro (código ${code})`));
    });
    proc.on('error', () => reject(new Error('yt-dlp não encontrado. Instale com: pip install yt-dlp')));
  });
}

// Busca e baixa áudio do YouTube
export async function downloadYoutubeAudio(query) {
  try {
    const url = await buscarUrlYoutube(query);
    const tmpFile = path.join(os.tmpdir(), `yt-audio-${Date.now()}.mp3`);

    await ytdlpDownload(url, [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', tmpFile,
      url
    ]);

    // Pega título do vídeo
    let title = 'audio';
    try {
      const info = await new Promise((resolve, reject) => {
        const args = ['--get-title', '--no-playlist'];
        if (fs.existsSync(COOKIES_PATH)) args.unshift('--cookies', COOKIES_PATH);
        const proc = spawn('yt-dlp', [...args, url]);
        let out = '';
        proc.stdout.on('data', (d) => { out += d.toString(); });
        proc.on('close', () => resolve(out.trim()));
        proc.on('error', reject);
      });
      title = info || title;
    } catch (_) {}

    return { filePath: tmpFile, title, duration: '', views: 0, author: '', url };
  } catch (error) {
    console.error('Erro no downloadYoutubeAudio:', error);
    throw error;
  }
}

// Busca e baixa vídeo do YouTube
export async function downloadYoutubeVideo(query) {
  try {
    const url = await buscarUrlYoutube(query);
    const tmpFile = path.join(os.tmpdir(), `yt-video-${Date.now()}.mp4`);

    await ytdlpDownload(url, [
      '-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]',
      '--merge-output-format', 'mp4',
      '-o', tmpFile,
      url
    ]);

    // Pega título do vídeo
    let title = 'video';
    try {
      const info = await new Promise((resolve, reject) => {
        const args = ['--get-title', '--no-playlist'];
        if (fs.existsSync(COOKIES_PATH)) args.unshift('--cookies', COOKIES_PATH);
        const proc = spawn('yt-dlp', [...args, url]);
        let out = '';
        proc.stdout.on('data', (d) => { out += d.toString(); });
        proc.on('close', () => resolve(out.trim()));
        proc.on('error', reject);
      });
      title = info || title;
    } catch (_) {}

    return { filePath: tmpFile, title, duration: '', views: 0, author: '', url };
  } catch (error) {
    console.error('Erro no downloadYoutubeVideo:', error);
    throw error;
  }
}
