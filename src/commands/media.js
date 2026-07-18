import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { getDatabase } from '../database.js';
import { downloadWhatsAppMedia, downloadYoutubeAudio, downloadYoutubeVideo } from '../utils/helpers.js';
import { checkIfOwner } from './admin.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Configura o caminho do ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

// Função para converter WebP para PNG usando FFMPEG
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
        // Vídeos com menos de 10 segundos podem ser stickers animados
        const duration = msg.message.videoMessage.seconds;
        if (duration > 10) {
          return reply('⚠️ O vídeo deve ter no máximo 10 segundos para virar figurinha animada.');
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
            if (duration > 10) {
              return reply('⚠️ O vídeo deve ter no máximo 10 segundos para virar figurinha animada.');
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
        
        const sticker = new Sticker(filePath, {
          pack: 'Série Bot 🤖',
          author: 'Bot de Whatsapp',
          type: StickerTypes.FULL,
          quality: 60
        });

        const buffer = await sticker.toBuffer();
        
        // Apaga arquivo temporário
        fs.unlinkSync(filePath);

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

      if (quoted?.stickerMessage) {
        stickerMessage = {
          key: {
            remoteJid: from,
            id: msg.message.extendedTextMessage.contextInfo.stanzaId,
            participant: msg.message.extendedTextMessage.contextInfo.participant
          },
          message: quoted
        };
      }

      if (!stickerMessage) {
        return reply('⚠️ Responda a uma figurinha com /unsticker para transformá-la em imagem.');
      }

      await reply('⏳ Convertendo figurinha em imagem, aguarde...');

      try {
        const filePath = await downloadWhatsAppMedia(stickerMessage, 'sticker');
        
        // Converte WebP para PNG
        const pngPath = await convertWebpToPng(filePath);
        
        // Envia de volta como imagem
        await sock.sendMessage(from, { image: { url: pngPath }, caption: '🖼️ Figurinha convertida com sucesso!' }, { quoted: msg });
        
        // Limpa temporários
        fs.unlinkSync(filePath);
        fs.unlinkSync(pngPath);
      } catch (error) {
        console.error('Erro ao converter figurinha:', error);
        return reply('⚠️ Erro ao converter a figurinha para imagem.');
      }
      break;
    }

    case 'ver': {
      // Verificar se é o dono ou se está na lista de autorizados
      const isOwner = checkIfOwner(sender);
      const isAuthorized = db.autorizadosVer.includes(sender);

      if (!isOwner && !isAuthorized) {
        return reply('⚠️ Você não tem permissão para usar este comando.');
      }

      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      let viewOnceContent = null;
      let mediaType = null;

      if (quoted) {
        if (quoted.viewOnceMessageV2?.message?.imageMessage) {
          viewOnceContent = quoted.viewOnceMessageV2.message.imageMessage;
          mediaType = 'image';
        } else if (quoted.viewOnceMessageV2?.message?.videoMessage) {
          viewOnceContent = quoted.viewOnceMessageV2.message.videoMessage;
          mediaType = 'video';
        } else if (quoted.viewOnceMessage?.message?.imageMessage) {
          viewOnceContent = quoted.viewOnceMessage.message.imageMessage;
          mediaType = 'image';
        } else if (quoted.viewOnceMessage?.message?.videoMessage) {
          viewOnceContent = quoted.viewOnceMessage.message.videoMessage;
          mediaType = 'video';
        } else if (quoted.imageMessage?.viewOnce) {
          viewOnceContent = quoted.imageMessage;
          mediaType = 'image';
        } else if (quoted.videoMessage?.viewOnce) {
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

        const simulatedMsg = {
          key: {
            remoteJid: from,
            id: msg.message.extendedTextMessage.contextInfo.stanzaId,
            participant: msg.message.extendedTextMessage.contextInfo.participant
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
        fs.unlinkSync(filePath);
      } catch (error) {
        console.error('Erro ao revelar visualização única:', error);
        return reply('⚠️ Erro ao tentar baixar e revelar a mídia.');
      }
      break;
    }

    case 'play': {
      const query = args.join(' ');
      if (!query) {
        return reply('⚠️ Digite o nome da música ou o link do YouTube. Exemplo: /play Linkin Park Numb');
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
        return reply('⚠️ Erro ao buscar/baixar a música. Verifique se o termo de busca é válido.');
      }
      break;
    }

    case 'video': {
      const query = args.join(' ');
      if (!query) {
        return reply('⚠️ Digite o nome do vídeo ou o link do YouTube. Exemplo: /video Minecraft Speedrun');
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
        return reply('⚠️ Erro ao buscar/baixar o vídeo. O YouTube pode estar bloqueando a requisição ou o vídeo é muito grande.');
      }
      break;
    }

    default:
      break;
  }
}
