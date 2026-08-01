import { downloadMediaMessage as baileysDownload } from '@whiskeysockets/baileys';
import axios from 'axios';
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

// Executa o binário do yt-dlp com garantias de permissão e suporte a fallback de cookies
function runYtDlpExecFile(args) {
  return new Promise((resolve, reject) => {
    let ytDlpPath = ytdl.constants.YOUTUBE_DL_PATH;
    
    // Verifica se o binário local existe; se não existir, tenta o yt-dlp do sistema (PATH)
    if (!fs.existsSync(ytDlpPath)) {
      ytDlpPath = 'yt-dlp';
    } else if (process.platform !== 'win32') {
      try {
        fs.chmodSync(ytDlpPath, '755');
      } catch (_) {}
    }

    execFile(ytDlpPath, args, (error, stdout, stderr) => {
      if (error) {
        const errStr = stderr || error.message;
        console.error('[yt-dlp error]', errStr);
        if (errStr.includes("python3': No such file or directory") || errStr.includes("python3: not found")) {
          return reject(new Error('Python 3 não está instalado no ambiente do servidor.'));
        }
        return reject(new Error(errStr));
      }
      resolve(stdout);
    });
  });
}

// Monta os argumentos base
function buildBaseArgs(withCookies = true) {
  const args = ['--no-playlist', '--js-runtimes', 'node'];
  
  if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    args.push('--ffmpeg-location', ffmpegPath);
  }
  
  if (withCookies && fs.existsSync(COOKIES_PATH)) {
    args.push('--cookies', COOKIES_PATH);
    console.log('[yt-dlp] Usando cookies.txt do YouTube.');
  }

  return args;
}

// Executa o download com retentativa (primeiro com cookies, depois sem cookies caso os cookies tenham expirado)
async function downloadWithYtDlp(url, specificArgs) {
  try {
    const argsWithCookies = [url, ...buildBaseArgs(true), ...specificArgs];
    return await runYtDlpExecFile(argsWithCookies);
  } catch (firstError) {
    console.warn('⚠️ Falha ao baixar com cookies (podem estar expirados). Tentando sem cookies...', firstError.message);
    try {
      const argsWithoutCookies = [url, ...buildBaseArgs(false), ...specificArgs];
      return await runYtDlpExecFile(argsWithoutCookies);
    } catch (secondError) {
      console.warn('⚠️ Falha na execução direta do binário. Tentando via wrapper youtube-dl-exec...', secondError.message);
      // Fallback final: tenta via pacote youtube-dl-exec padrão
      return await ytdl(url, {
        noPlaylist: true,
        jsRuntimes: 'node',
        ...(ffmpegPath && fs.existsSync(ffmpegPath) ? { ffmpegLocation: ffmpegPath } : {}),
      });
    }
  }
}

// Extrai ID ou resolve URL / busca do YouTube
async function resolveYoutubeInfo(query) {
  const cleanQuery = query.trim();
  const ytUrlRegex = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|v\/|embed\/)|youtu\.be\/)([\w-]{11})/;
  const match = cleanQuery.match(ytUrlRegex);

  if (match && match[1]) {
    const videoId = match[1];
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    try {
      const videoDetails = await yts({ videoId });
      if (videoDetails && videoDetails.title) {
        return {
          url,
          title: videoDetails.title,
          duration: videoDetails.timestamp || '',
          views: videoDetails.views || 0,
          author: videoDetails.author?.name || 'YouTube'
        };
      }
    } catch (err) {
      console.warn('⚠️ Não foi possível obter detalhes via yts para videoId:', videoId, err.message);
    }
    return {
      url,
      title: 'Áudio do YouTube',
      duration: '',
      views: 0,
      author: 'YouTube'
    };
  }

  // Busca por texto
  const searchResult = await yts(cleanQuery);
  const video = searchResult.videos ? searchResult.videos[0] : searchResult;
  if (!video || !video.url) {
    throw new Error('Nenhum vídeo encontrado para esta busca.');
  }
  return {
    url: video.url,
    title: video.title || cleanQuery,
    duration: video.timestamp || '',
    views: video.views || 0,
    author: video.author?.name || 'YouTube'
  };
}

// Busca e baixa áudio do YouTube
export async function downloadYoutubeAudio(query) {
  try {
    const info = await resolveYoutubeInfo(query);
    const tmpFile = path.join(os.tmpdir(), `yt-audio-${Date.now()}.mp3`);

    const specificArgs = [
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--output', tmpFile
    ];

    await downloadWithYtDlp(info.url, specificArgs);

    return {
      filePath: tmpFile,
      title: info.title,
      duration: info.duration,
      views: info.views,
      author: info.author,
      url: info.url
    };
  } catch (error) {
    console.error('Erro no downloadYoutubeAudio:', error);
    throw error;
  }
}

// Busca e baixa vídeo do YouTube
export async function downloadYoutubeVideo(query) {
  try {
    const info = await resolveYoutubeInfo(query);
    const tmpFile = path.join(os.tmpdir(), `yt-video-${Date.now()}.mp4`);

    const specificArgs = [
      '--format', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]/best',
      '--merge-output-format', 'mp4',
      '--output', tmpFile
    ];

    await downloadWithYtDlp(info.url, specificArgs);

    return {
      filePath: tmpFile,
      title: info.title,
      duration: info.duration,
      views: info.views,
      author: info.author,
      url: info.url
    };
  } catch (error) {
    console.error('Erro no downloadYoutubeVideo:', error);
    throw error;
  }
}

// Busca e baixa vídeo do TikTok sem marca d'água
export async function downloadTiktokVideo(url) {
  try {
    const apiRes = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    const resData = apiRes.data;

    if (resData && resData.code === 0 && resData.data?.play) {
      const videoUrl = resData.data.play;
      const title = resData.data.title || 'Vídeo do TikTok';
      const author = resData.data.author?.nickname || resData.data.author?.unique_id || 'TikTok User';

      const videoRes = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 30000 });
      const tmpFile = path.join(os.tmpdir(), `tt-video-${Date.now()}.mp4`);
      fs.writeFileSync(tmpFile, Buffer.from(videoRes.data));

      return {
        filePath: tmpFile,
        title,
        author,
        url
      };
    }
  } catch (err) {
    console.warn('⚠️ Falha no TikWM API para vídeo, tentando via yt-dlp...', err.message);
  }

  // Fallback via yt-dlp
  try {
    const tmpFile = path.join(os.tmpdir(), `tt-video-${Date.now()}.mp4`);
    const specificArgs = [
      '--format', 'mp4',
      '--output', tmpFile
    ];
    await downloadWithYtDlp(url, specificArgs);
    return {
      filePath: tmpFile,
      title: 'Vídeo do TikTok',
      author: 'TikTok',
      url
    };
  } catch (error) {
    console.error('Erro no downloadTiktokVideo:', error);
    throw new Error('Não foi possível baixar o vídeo do TikTok.');
  }
}

// Busca e baixa áudio do TikTok (MP3)
export async function downloadTiktokAudio(url) {
  try {
    const apiRes = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    const resData = apiRes.data;

    if (resData && resData.code === 0 && (resData.data?.music || resData.data?.play)) {
      const audioUrl = resData.data.music || resData.data.play;
      const title = resData.data.title || resData.data.music_info?.title || 'Áudio do TikTok';
      const author = resData.data.author?.nickname || 'TikTok';

      const audioRes = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 30000 });
      const tmpFile = path.join(os.tmpdir(), `tt-audio-${Date.now()}.mp3`);
      fs.writeFileSync(tmpFile, Buffer.from(audioRes.data));

      return {
        filePath: tmpFile,
        title,
        author,
        url
      };
    }
  } catch (err) {
    console.warn('⚠️ Falha no TikWM API para áudio, tentando via yt-dlp...', err.message);
  }

  // Fallback via yt-dlp
  try {
    const tmpFile = path.join(os.tmpdir(), `tt-audio-${Date.now()}.mp3`);
    const specificArgs = [
      '--extract-audio',
      '--audio-format', 'mp3',
      '--output', tmpFile
    ];
    await downloadWithYtDlp(url, specificArgs);
    return {
      filePath: tmpFile,
      title: 'Áudio do TikTok',
      author: 'TikTok',
      url
    };
  } catch (error) {
    console.error('Erro no downloadTiktokAudio:', error);
    throw new Error('Não foi possível baixar o áudio do TikTok.');
  }
}

// Busca e baixa vídeo do Instagram
export async function downloadInstagramVideo(url) {
  try {
    const tmpFile = path.join(os.tmpdir(), `ig-video-${Date.now()}.mp4`);
    const specificArgs = [
      '--format', 'mp4/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--output', tmpFile
    ];

    await downloadWithYtDlp(url, specificArgs);

    return {
      filePath: tmpFile,
      title: 'Vídeo do Instagram',
      author: 'Instagram',
      url
    };
  } catch (error) {
    console.error('Erro no downloadInstagramVideo:', error);
    throw new Error('Não foi possível baixar o vídeo do Instagram. Certifique-se de que a conta ou publicação é pública.');
  }
}

// Busca e baixa áudio do Instagram (MP3)
export async function downloadInstagramAudio(url) {
  try {
    const tmpFile = path.join(os.tmpdir(), `ig-audio-${Date.now()}.mp3`);
    const specificArgs = [
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--output', tmpFile
    ];

    await downloadWithYtDlp(url, specificArgs);

    return {
      filePath: tmpFile,
      title: 'Áudio do Instagram',
      author: 'Instagram',
      url
    };
  } catch (error) {
    console.error('Erro no downloadInstagramAudio:', error);
    throw new Error('Não foi possível baixar o áudio do Instagram. Certifique-se de que a conta ou publicação é pública.');
  }
}




