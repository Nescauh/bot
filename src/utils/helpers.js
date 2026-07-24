import { downloadMediaMessage as baileysDownload } from '@whiskeysockets/baileys';
import ytdl from 'youtube-dl-exec';
import { execFile } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import yts from 'yt-search';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// Caminho base para encontrar o cookies.txt na raiz do projeto
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COOKIES_PATH = path.resolve(__dirname, '../../cookies.txt');

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
    const buffer = await baileysDownload(message, 'buffer', {});

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

// Executa o yt-dlp diretamente via child_process.execFile para evitar bugs do shell (cmd.exe no Windows)
function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const ytDlpPath = ytdl.constants.YOUTUBE_DL_PATH;
    execFile(ytDlpPath, args, (error, stdout, stderr) => {
      if (error) {
        console.error('[yt-dlp error]', stderr || error.message);
        return reject(error);
      }
      resolve(stdout);
    });
  });
}

// Monta os argumentos base para o yt-dlp
function buildBaseArgs() {
  const args = ['--no-playlist', '--ffmpeg-location', ffmpegPath];
  if (fs.existsSync(COOKIES_PATH)) {
    args.push('--cookies', COOKIES_PATH);
    console.log('[yt-dlp] Usando cookies.txt do YouTube para autenticação.');
  }
  return args;
}

// Busca e baixa áudio do YouTube
export async function downloadYoutubeAudio(query) {
  try {
    const searchResult = await yts(query);
    const video = searchResult.videos ? searchResult.videos[0] : searchResult;
    
    if (!video || !video.url) {
      throw new Error('Nenhum vídeo encontrado para a busca.');
    }

    const tmpFile = path.join(os.tmpdir(), `yt-audio-${Date.now()}.mp3`);

    const args = [
      video.url,
      ...buildBaseArgs(),
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--output', tmpFile
    ];

    await runYtDlp(args);

    return {
      filePath: tmpFile,
      title: video.title || query,
      duration: video.timestamp || '',
      views: video.views || 0,
      author: video.author?.name || '',
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
    const video = searchResult.videos ? searchResult.videos[0] : searchResult;
    
    if (!video || !video.url) {
      throw new Error('Nenhum vídeo encontrado para a busca.');
    }

    const tmpFile = path.join(os.tmpdir(), `yt-video-${Date.now()}.mp4`);

    const args = [
      video.url,
      ...buildBaseArgs(),
      '--format', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]/best',
      '--merge-output-format', 'mp4',
      '--output', tmpFile
    ];

    await runYtDlp(args);

    return {
      filePath: tmpFile,
      title: video.title || query,
      duration: video.timestamp || '',
      views: video.views || 0,
      author: video.author?.name || '',
      url: video.url
    };
  } catch (error) {
    console.error('Erro no downloadYoutubeVideo:', error);
    throw error;
  }
}

