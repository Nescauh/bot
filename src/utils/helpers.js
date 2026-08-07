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

// Sincroniza cookies vindos da variável de ambiente YOUTUBE_COOKIES (se existir)
if (process.env.YOUTUBE_COOKIES && process.env.YOUTUBE_COOKIES.trim()) {
  try {
    fs.writeFileSync(COOKIES_PATH, process.env.YOUTUBE_COOKIES.trim(), 'utf-8');
  } catch (err) {
    console.error('Erro ao escrever YOUTUBE_COOKIES no cookies.txt:', err);
  }
}

// Adiciona diretório do deno ao PATH se existir
if (fs.existsSync('/root/.deno/bin') && !process.env.PATH.includes('/root/.deno/bin')) {
  process.env.PATH = `/root/.deno/bin:${process.env.PATH}`;
}

// Monta os argumentos base para o yt-dlp ignorar bloqueios de robôs do YouTube em servidores (Railway/Cloud)
function buildBaseArgs(withCookies = true, clientOverride = null) {
  const nodePath = process.execPath;
  
  const args = [
    '--no-playlist',
    '--force-ipv4',
    '--geo-bypass',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  ];

  if (fs.existsSync('/root/.deno/bin/deno')) {
    args.push('--js-runtimes', 'deno:/root/.deno/bin/deno');
  } else {
    args.push('--js-runtimes', 'deno');
  }
  args.push('--js-runtimes', `node:${nodePath}`);
  
  if (clientOverride) {
    args.push('--extractor-args', `youtube:player_client=${clientOverride}`);
  }
  
  if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    args.push('--ffmpeg-location', ffmpegPath);
  }
  
  if (withCookies && fs.existsSync(COOKIES_PATH)) {
    args.push('--cookies', COOKIES_PATH);
    console.log('[yt-dlp] Usando cookies.txt do YouTube.');
  }

  return args;
}

// Executa o download com retentativas inteligentes (prioriza requisição com cookies autenticados e JS runtime do Node)
async function downloadWithYtDlp(url, specificArgs) {
  // Tentativa 1: Com cookies.txt (se existir) + padrão do yt-dlp (Mais confiável)
  try {
    const argsStandard = [url, ...buildBaseArgs(true, null), ...specificArgs];
    return await runYtDlpExecFile(argsStandard);
  } catch (firstError) {
    console.warn('⚠️ Falha 1 (cookies padrao). Tentando com cookies + cliente ios,web...', firstError.message);
    
    // Tentativa 2: Com cookies + cliente ios,web
    try {
      const argsIos = [url, ...buildBaseArgs(true, 'ios,web'), ...specificArgs];
      return await runYtDlpExecFile(argsIos);
    } catch (secondError) {
      console.warn('⚠️ Falha 2 (cookies ios). Tentando com cookies + cliente android,web...', secondError.message);
      
      // Tentativa 3: Com cookies + cliente android,web
      try {
        const argsAndroid = [url, ...buildBaseArgs(true, 'android,web'), ...specificArgs];
        return await runYtDlpExecFile(argsAndroid);
      } catch (thirdError) {
        console.warn('⚠️ Falha 3 (cookies android). Tentando com cookies + cliente web_creator,web...', thirdError.message);
        
        // Tentativa 4: Com cookies + cliente web_creator,web
        try {
          const argsCreator = [url, ...buildBaseArgs(true, 'web_creator,web'), ...specificArgs];
          return await runYtDlpExecFile(argsCreator);
        } catch (fourthError) {
          console.warn('⚠️ Falha 4 (cookies web_creator). Tentando sem cookies + cliente ios,web...', fourthError.message);
          
          // Tentativa 5: Sem cookies + cliente ios,web
          try {
            const argsNoCookies = [url, ...buildBaseArgs(false, 'ios,web'), ...specificArgs];
            return await runYtDlpExecFile(argsNoCookies);
          } catch (fifthError) {
            console.warn('⚠️ Falha 5 (sem cookies). Tentando wrapper ytdl...', fifthError.message);
            
            // Tentativa 6: Wrapper ytdl com cookies e jsRuntimes
            try {
              return await ytdl(url, {
                noPlaylist: true,
                forceIpv4: true,
                jsRuntimes: 'node',
                ...(fs.existsSync(COOKIES_PATH) ? { cookies: COOKIES_PATH } : {}),
                ...(ffmpegPath && fs.existsSync(ffmpegPath) ? { ffmpegLocation: ffmpegPath } : {}),
              });
            } catch (finalErr) {
              const errStr = finalErr.message || '';
              if (errStr.includes('Sign in to confirm you’re not a bot') || errStr.includes('429')) {
                throw new Error('O YouTube exigiu login ou bloqueou o IP do Railway. Por favor, adicione/atualize a variável YOUTUBE_COOKIES no painel do Railway com um cookies.txt logado.');
              }
              throw finalErr;
            }
          }
        }
      }
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




