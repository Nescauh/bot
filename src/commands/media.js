import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { getDatabase } from '../database.js';
import { downloadWhatsAppMedia, downloadYoutubeAudio, downloadYoutubeVideo, downloadTiktokVideo, downloadTiktokAudio, downloadInstagramVideo, downloadInstagramAudio } from '../utils/helpers.js';
import { checkIfOwner } from './admin.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { execFile } from 'child_process';

// Configura o caminho do ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

// Função para converter WebP estático para PNG usando FFMPEG
function convertWebpToPng(inputPath) {
  const outputPath = path.join(os.tmpdir(), `unsticker-${Date.now()}.png`);
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run();
  });
}

// Função para converter Vídeo em Figurinha Animada WebP
function convertVideoToAnimatedSticker(inputPath) {
  const outputPath = path.join(os.tmpdir(), `anim-sticker-${Date.now()}.webp`);
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', inputPath,
      '-vcodec', 'libwebp',
      '-filter_complex', '[0:v] scale=512:512:force_original_aspect_ratio=decrease,fps=12,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
      '-loop', '0',
      '-ss', '00:00:00',
      '-t', '00:00:10',
      '-preset', 'default',
      '-an',
      '-vsync', '0',
      outputPath
    ];
    execFile(ffmpegPath, args, (err) => {
      if (err) return reject(err);
      try {
        const buffer = fs.readFileSync(outputPath);
        try { fs.unlinkSync(outputPath); } catch (_) {}
        resolve(buffer);
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Função para converter Figurinha Animada (WebP) em MP4/GIF
function convertWebpToMp4(inputPath) {
  const outputPath = path.join(os.tmpdir(), `unsticker-anim-${Date.now()}.mp4`);
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', inputPath,
      '-pix_fmt', 'yuv420p',
      '-c:v', 'libx264',
      '-movflags', '+faststart',
      '-filter_complex', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      outputPath
    ];
    execFile(ffmpegPath, args, (err) => {
      if (err) return reject(err);
      resolve(outputPath);
    });
  });
}

export async function handleMediaCommands(sock, msg, command, args, sender) {
  const from = msg.key.remoteJid;
  const reply = async (text) => {
    await sock.sendMessage(from, { text }, { quoted: msg });
  };

  const db = getDatabase();

  switch (command) {
    case 'sticker': {
      let mediaMessage = null;
      let mediaType = null;

      // Verifica se a mensagem original é imagem ou vídeo curto
      if (msg.message?.imageMessage) {
        mediaMessage = msg;
        mediaType = 'image';
      } else if (msg.message?.videoMessage) {
        const duration = msg.message.videoMessage.seconds;
        if (duration > 15) {
          return reply('⚠️ O vídeo deve ter no máximo 15 segundos para virar figurinha animada.');
        }
        mediaMessage = msg;
        mediaType = 'video';
      } else {
        // Verifica a mensagem citada
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quoted) {
          if (quoted.imageMessage) {
            mediaMessage = {
              key: {
                remoteJid: from,
                id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                participant: msg.message.extendedTextMessage.contextInfo.participant
              },
              message: quoted
            };
            mediaType = 'image';
          } else if (quoted.videoMessage) {
            const duration = quoted.videoMessage.seconds;
            if (duration > 15) {
              return reply('⚠️ O vídeo deve ter no máximo 15 segundos para virar figurinha animada.');
            }
            mediaMessage = {
              key: {
                remoteJid: from,
                id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                participant: msg.message.extendedTextMessage.contextInfo.participant
              },
              message: quoted
            };
            mediaType = 'video';
          }
        }
      }

      if (!mediaMessage) {
        return reply('⚠️ Envie uma imagem/vídeo com o comando /sticker na legenda, ou responda a uma imagem/vídeo com o comando.');
      }

      await reply('⏳ Criando sua figurinha, aguarde...');

      try {
        const filePath = await downloadWhatsAppMedia(mediaMessage, mediaType);
        let buffer;

        if (mediaType === 'video') {
          // Converte o vídeo em WebP animado com FFMPEG
          buffer = await convertVideoToAnimatedSticker(filePath);
        } else {
          // Imagem estática
          const sticker = new Sticker(filePath, {
            pack: 'Série Bot 🤖',
            author: 'Bot de Whatsapp',
            type: StickerTypes.FULL,
            quality: 60
          });
          buffer = await sticker.toBuffer();
        }
        
        // Apaga arquivo temporário
        try { fs.unlinkSync(filePath); } catch (_) {}

        await sock.sendMessage(from, { sticker: buffer }, { quoted: msg });
      } catch (error) {
        console.error('Erro ao criar sticker:', error);
        return reply('⚠️ Não foi possível criar a figurinha. Certifique-se de que a imagem ou vídeo é válido.');
      }
      break;
    }

    case 'unsticker': {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      let stickerMessage = null;
      let isAnimated = false;

      if (quoted?.stickerMessage) {
        stickerMessage = {
          key: {
            remoteJid: from,
            id: msg.message.extendedTextMessage.contextInfo.stanzaId,
            participant: msg.message.extendedTextMessage.contextInfo.participant
          },
          message: quoted
        };
        isAnimated = quoted.stickerMessage.isAnimated === true;
      }

      if (!stickerMessage) {
        return reply('⚠️ Responda a uma figurinha com /unsticker para transformá-la em imagem ou GIF/vídeo.');
      }

      await reply('⏳ Convertendo figurinha, aguarde...');

      try {
        const filePath = await downloadWhatsAppMedia(stickerMessage, 'sticker');
        
        if (isAnimated) {
          // Tenta converter WebP animado em MP4/GIF
          try {
            const mp4Path = await convertWebpToMp4(filePath);
            await sock.sendMessage(from, { 
              video: { url: mp4Path }, 
              gifPlayback: true,
              caption: '🎬 Figurinha animada convertida em GIF com sucesso!' 
            }, { quoted: msg });
            
            try { fs.unlinkSync(filePath); } catch (_) {}
            try { fs.unlinkSync(mp4Path); } catch (_) {}
            return;
          } catch (animErr) {
            console.warn('⚠️ Falha ao converter sticker animado para MP4, tentando PNG:', animErr.message);
          }
        }

        // Se for estático ou fallback para PNG
        const pngPath = await convertWebpToPng(filePath);
        await sock.sendMessage(from, { image: { url: pngPath }, caption: '🖼️ Figurinha convertida com sucesso!' }, { quoted: msg });
        
        try { fs.unlinkSync(filePath); } catch (_) {}
        try { fs.unlinkSync(pngPath); } catch (_) {}
      } catch (error) {
        console.error('Erro ao converter figurinha:', error);
        return reply('⚠️ Erro ao converter a figurinha.');
      }
      break;
    }

    case 'ver': {
      // Verificar se é o dono ou se está na lista de autorizados
      const isOwner = checkIfOwner(sender, msg);
      const isAuthorized = db.autorizadosVer?.includes(sender);

      if (!isOwner && !isAuthorized) {
        return reply('⚠️ Você não tem permissão para usar este comando.');
      }

      const contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
                          msg.message?.imageMessage?.contextInfo ||
                          msg.message?.videoMessage?.contextInfo || {};

      const quoted = contextInfo?.quotedMessage || 
                     msg.message?.viewOnceMessageV2?.message || 
                     msg.message?.viewOnceMessage?.message;

      let viewOnceContent = null;
      let mediaType = null;

      if (quoted) {
        if (quoted.viewOnceMessageV2?.message?.imageMessage) {
          viewOnceContent = quoted.viewOnceMessageV2.message.imageMessage;
          mediaType = 'image';
        } else if (quoted.viewOnceMessageV2?.message?.videoMessage) {
          viewOnceContent = quoted.viewOnceMessageV2.message.videoMessage;
          mediaType = 'video';
        } else if (quoted.viewOnceMessageV2Extension?.message?.imageMessage) {
          viewOnceContent = quoted.viewOnceMessageV2Extension.message.imageMessage;
          mediaType = 'image';
        } else if (quoted.viewOnceMessageV2Extension?.message?.videoMessage) {
          viewOnceContent = quoted.viewOnceMessageV2Extension.message.videoMessage;
          mediaType = 'video';
        } else if (quoted.viewOnceMessage?.message?.imageMessage) {
          viewOnceContent = quoted.viewOnceMessage.message.imageMessage;
          mediaType = 'image';
        } else if (quoted.viewOnceMessage?.message?.videoMessage) {
          viewOnceContent = quoted.viewOnceMessage.message.videoMessage;
          mediaType = 'video';
        } else if (quoted.imageMessage) {
          viewOnceContent = quoted.imageMessage;
          mediaType = 'image';
        } else if (quoted.videoMessage) {
          viewOnceContent = quoted.videoMessage;
          mediaType = 'video';
        }
      }

      if (!viewOnceContent) {
        return reply('⚠️ Responda a uma mensagem de visualização única (foto ou vídeo) com /ver.');
      }

      await reply('⏳ Baixando mídia de visualização única, aguarde...');

      try {
        const cleanQuoted = {};
        if (mediaType === 'image') cleanQuoted.imageMessage = viewOnceContent;
        if (mediaType === 'video') cleanQuoted.videoMessage = viewOnceContent;

        const stanzaId = contextInfo.stanzaId || msg.key.id;
        const participant = contextInfo.participant || sender;

        const simulatedMsg = {
          key: {
            remoteJid: from,
            id: stanzaId,
            participant: participant
          },
          message: cleanQuoted
        };

        const filePath = await downloadWhatsAppMedia(simulatedMsg, mediaType);

        if (mediaType === 'image') {
          await sock.sendMessage(from, { image: { url: filePath }, caption: '👁️ Mídia revelada!' }, { quoted: msg });
        } else {
          await sock.sendMessage(from, { video: { url: filePath }, caption: '👁️ Mídia revelada!' }, { quoted: msg });
        }

        // Deleta arquivo temporário
        try { fs.unlinkSync(filePath); } catch (_) {}
      } catch (error) {
        console.error('Erro ao revelar visualização única:', error);
        return reply('⚠️ Erro ao tentar baixar e revelar a mídia.');
      }
      break;
    }

    case 'play': {
      const query = args.join(' ');
      if (!query) {
        return reply('⚠️ Digite o nome da música ou o link do YouTube/TikTok/Instagram. Exemplo: /play Linkin Park Numb');
      }

      if (/tiktok\.com/i.test(query)) {
        await reply('⏳ Baixando áudio do TikTok, aguarde...');
        try {
          const music = await downloadTiktokAudio(query);
          await sock.sendMessage(
            from, 
            { 
              audio: { url: music.filePath }, 
              mimetype: 'audio/mp4', 
              fileName: `${music.title}.mp3` 
            }, 
            { quoted: msg }
          );
          fs.unlinkSync(music.filePath);
          return;
        } catch (error) {
          console.error('Erro ao baixar áudio do TikTok via /play:', error);
          return reply('⚠️ Erro ao baixar áudio do TikTok.');
        }
      }

      if (/instagram\.com/i.test(query)) {
        await reply('⏳ Baixando áudio do Instagram, aguarde...');
        try {
          const music = await downloadInstagramAudio(query);
          await sock.sendMessage(
            from, 
            { 
              audio: { url: music.filePath }, 
              mimetype: 'audio/mp4', 
              fileName: `${music.title}.mp3` 
            }, 
            { quoted: msg }
          );
          fs.unlinkSync(music.filePath);
          return;
        } catch (error) {
          console.error('Erro ao baixar áudio do Instagram via /play:', error);
          return reply('⚠️ Erro ao baixar áudio do Instagram. Verifique se a publicação é pública.');
        }
      }

      await reply('⏳ Buscando e baixando áudio do YouTube, aguarde...');

      try {
        const music = await downloadYoutubeAudio(query);

        await sock.sendMessage(
          from, 
          { 
            audio: { url: music.filePath }, 
            mimetype: 'audio/mp4', 
            fileName: `${music.title}.mp3` 
          }, 
          { quoted: msg }
        );

        // Limpa temporários
        fs.unlinkSync(music.filePath);
      } catch (error) {
        console.error('Erro ao baixar música:', error);
        const detail = error?.message ? ` (${error.message.slice(0, 100)})` : '';
        return reply(`⚠️ Erro ao buscar/baixar a música${detail}. Tente novamente em instantes.`);
      }
      break;
    }

    case 'video': {
      const query = args.join(' ');
      if (!query) {
        return reply('⚠️ Digite o nome do vídeo ou o link do YouTube/TikTok/Instagram. Exemplo: /video Minecraft Speedrun');
      }

      if (/tiktok\.com/i.test(query)) {
        await reply('⏳ Baixando vídeo do TikTok sem marca d\'água, aguarde...');
        try {
          const video = await downloadTiktokVideo(query);
          await sock.sendMessage(
            from, 
            { 
              video: { url: video.filePath }, 
              caption: `🎥 *${video.title}*\n\nCriador: ${video.author}`
            }, 
            { quoted: msg }
          );
          fs.unlinkSync(video.filePath);
          return;
        } catch (error) {
          console.error('Erro ao baixar vídeo do TikTok via /video:', error);
          return reply('⚠️ Erro ao baixar vídeo do TikTok.');
        }
      }

      if (/instagram\.com/i.test(query)) {
        await reply('⏳ Baixando vídeo do Instagram, aguarde...');
        try {
          const video = await downloadInstagramVideo(query);
          await sock.sendMessage(
            from, 
            { 
              video: { url: video.filePath }, 
              caption: `🎥 *${video.title}*\n\nOrigem: Instagram`
            }, 
            { quoted: msg }
          );
          fs.unlinkSync(video.filePath);
          return;
        } catch (error) {
          console.error('Erro ao baixar vídeo do Instagram via /video:', error);
          return reply('⚠️ Erro ao baixar vídeo do Instagram. Verifique se a publicação é pública.');
        }
      }

      await reply('⏳ Buscando e baixando vídeo do YouTube, aguarde...');

      try {
        const video = await downloadYoutubeVideo(query);

        await sock.sendMessage(
          from, 
          { 
            video: { url: video.filePath }, 
            caption: `🎥 *${video.title}*\n\nCanal: ${video.author}\nVisualizações: ${video.views.toLocaleString()}`
          }, 
          { quoted: msg }
        );

        // Limpa temporários
        fs.unlinkSync(video.filePath);
      } catch (error) {
        console.error('Erro ao baixar vídeo:', error);
        const detail = error?.message ? ` (${error.message.slice(0, 100)})` : '';
        return reply(`⚠️ Erro ao buscar/baixar o vídeo${detail}. O vídeo pode ser muito grande ou indisponível.`);
      }
      break;
    }

    case 'ig':
    case 'insta':
    case 'igvideo':
    case 'instavideo': {
      const url = args[0];
      if (!url || !/instagram\.com/i.test(url)) {
        return reply('⚠️ Cole um link válido do Instagram. Exemplo: `/ig https://www.instagram.com/reel/...`');
      }

      await reply('⏳ Baixando vídeo do Instagram, aguarde...');

      try {
        const video = await downloadInstagramVideo(url);
        await sock.sendMessage(
          from, 
          { 
            video: { url: video.filePath }, 
            caption: `🎥 *${video.title}*\n\nOrigem: Instagram`
          }, 
          { quoted: msg }
        );
        fs.unlinkSync(video.filePath);
      } catch (error) {
        console.error('Erro ao baixar vídeo do Instagram:', error);
        return reply('⚠️ Erro ao baixar vídeo do Instagram. Verifique o link e tente novamente.');
      }
      break;
    }

    case 'igaudio':
    case 'instaaudio':
    case 'igplay': {
      const url = args[0];
      if (!url || !/instagram\.com/i.test(url)) {
        return reply('⚠️ Cole um link válido do Instagram. Exemplo: `/igaudio https://www.instagram.com/reel/...`');
      }

      await reply('⏳ Baixando áudio do Instagram, aguarde...');

      try {
        const music = await downloadInstagramAudio(url);
        await sock.sendMessage(
          from, 
          { 
            audio: { url: music.filePath }, 
            mimetype: 'audio/mp4', 
            fileName: `${music.title}.mp3` 
          }, 
          { quoted: msg }
        );
        fs.unlinkSync(music.filePath);
      } catch (error) {
        console.error('Erro ao baixar áudio do Instagram:', error);
        return reply('⚠️ Erro ao baixar áudio do Instagram. Verifique o link e tente novamente.');
      }
      break;
    }

    case 'tiktok':
    case 'ttvideo': {
      const url = args[0];
      if (!url || !/tiktok\.com/i.test(url)) {
        return reply('⚠️ Cole um link válido do TikTok. Exemplo: `/tiktok https://vm.tiktok.com/...`');
      }

      await reply('⏳ Baixando vídeo do TikTok sem marca d\'água, aguarde...');

      try {
        const video = await downloadTiktokVideo(url);
        await sock.sendMessage(
          from, 
          { 
            video: { url: video.filePath }, 
            caption: `🎥 *${video.title}*\n\nCriador: ${video.author}`
          }, 
          { quoted: msg }
        );
        fs.unlinkSync(video.filePath);
      } catch (error) {
        console.error('Erro ao baixar vídeo do TikTok:', error);
        return reply('⚠️ Erro ao baixar vídeo do TikTok. Verifique o link e tente novamente.');
      }
      break;
    }

    case 'tiktokaudio':
    case 'ttplay': {
      const url = args[0];
      if (!url || !/tiktok\.com/i.test(url)) {
        return reply('⚠️ Cole um link válido do TikTok. Exemplo: `/tiktokaudio https://vm.tiktok.com/...`');
      }

      await reply('⏳ Baixando áudio do TikTok, aguarde...');

      try {
        const music = await downloadTiktokAudio(url);
        await sock.sendMessage(
          from, 
          { 
            audio: { url: music.filePath }, 
            mimetype: 'audio/mp4', 
            fileName: `${music.title}.mp3` 
          }, 
          { quoted: msg }
        );
        fs.unlinkSync(music.filePath);
      } catch (error) {
        console.error('Erro ao baixar áudio do TikTok:', error);
        return reply('⚠️ Erro ao baixar áudio do TikTok. Verifique o link e tente novamente.');
      }
      break;
    }

    default:
      break;
  }
}

