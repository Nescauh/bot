import path from 'path';
import fs from 'fs';
import { handleSocialCommands } from './commands/social.js';
import { handleAdminCommands } from './commands/admin.js';
import { handleMediaCommands } from './commands/media.js';
import { getDatabase } from './database.js';
import { getUser, updateUser, getGroupConfig } from './database/sqlite.js';
import { formatUptime } from './utils/helpers.js';
import dotenv from 'dotenv';

// Importação dos Novos Módulos de Comandos
import { handleIaCommand } from './commands/ai/ia.js';
import { handleTraduzirCommand } from './commands/ai/traduzir.js';
import { handleResumirCommand } from './commands/ai/resumir.js';
import { handleExplicarCommand } from './commands/ai/explicar.js';

import { handleKickCommand } from './commands/admin_extra/kick.js';
import { handlePromoteCommand } from './commands/admin_extra/promote.js';
import { handleDemoteCommand } from './commands/admin_extra/demote.js';
import { handleTagallCommand } from './commands/admin_extra/tagall.js';
import { handleMuteCommand } from './commands/admin_extra/mute.js';
import { handleUnmuteCommand } from './commands/admin_extra/unmute.js';
import { handleAntilinkCommand } from './commands/admin_extra/antilink.js';
import { handleAntispamCommand } from './commands/admin_extra/antispam.js';
import { handleBoasvindasCommand } from './commands/admin_extra/boasvindas.js';
import { handleRegrasCommand } from './commands/admin_extra/regras.js';
import { handleWarnCommand } from './commands/admin_extra/warn.js';
import { handleWarningsCommand } from './commands/admin_extra/warnings.js';

import { handleShipCommand } from './commands/fun/ship.js';
import { handleEightBallCommand } from './commands/fun/eightball.js';
import { handleDadoCommand } from './commands/fun/dado.js';
import { handleCaraOuCoroaCommand } from './commands/fun/caraoucoroa.js';
import { handlePptCommand } from './commands/fun/ppt.js';
import { handleRoletaCommand } from './commands/fun/roleta.js';
import { handleQuizCommand, activeQuizGames, processQuizAnswer } from './commands/fun/quiz.js';
import { handleForcaCommand, activeForcaGames, processForcaGuess } from './commands/fun/forca.js';
import { handleTaroCommand } from './commands/fun/taro.js';

import { handleDailyCommand } from './commands/economy/daily.js';
import { handleSaldoCommand } from './commands/economy/saldo.js';
import { handleTrabalharCommand } from './commands/economy/trabalhar.js';
import { handleTransferirCommand } from './commands/economy/transferir.js';
import { handleLojaCommand } from './commands/economy/loja.js';
import { handleComprarCommand } from './commands/economy/comprar.js';
import { handleInventarioCommand } from './commands/economy/inventario.js';
import { handleRankingCommand } from './commands/economy/ranking.js';
import { handleAuraCommand, handleFarmarAuraCommand } from './commands/economy/aura.js';

import { handleLevelCommand } from './commands/xp/level.js';
import { handleRankCommand } from './commands/xp/rank.js';
import { handleTopCommand } from './commands/xp/top.js';

import { handleCepCommand } from './commands/utils_extra/cep.js';
import { handleClimaCommand } from './commands/utils_extra/clima.js';
import { handleCalculadoraCommand } from './commands/utils_extra/calculadora.js';
import { handleLembreteCommand } from './commands/utils_extra/lembrete.js';
import { handleQrcodeCommand } from './commands/utils_extra/qrcode.js';
import { handleReadqrCommand } from './commands/utils_extra/readqr.js';
import { handleTtsCommand } from './commands/utils_extra/tts.js';
import { handleOcrCommand } from './commands/utils_extra/ocr.js';

import { handlePingCommand } from './commands/info/ping.js';
import { handleUptimeCommand } from './commands/info/uptime.js';
import { handleInfoCommand } from './commands/info/info.js';
import { handleBotinfoCommand } from './commands/info/botinfo.js';
import { handleGrupoCommand } from './commands/info/grupo.js';

// Módulos do Sistema de Interação Inteligente
import { AutoReply } from './interaction/AutoReply.js';
import { conversationMemory } from './interaction/ConversationMemory.js';

dotenv.config();
const prefix = process.env.PREFIX || '/';

// Cache de mensagens em memória para Anti-Delete
const messageCache = {};
const CACHE_LIMIT = 500;

function cacheMessage(from, msg) {
  if (!from || !msg.key?.id || msg.key.fromMe) return;
  
  if (!messageCache[from]) {
    messageCache[from] = [];
  }

  if (msg.message) {
    messageCache[from].push({
      id: msg.key.id,
      sender: msg.key.participant || msg.key.remoteJid,
      message: JSON.parse(JSON.stringify(msg.message)),
      pushName: msg.pushName || 'Usuário',
      timestamp: msg.messageTimestamp
    });

    if (messageCache[from].length > CACHE_LIMIT) {
      messageCache[from].shift();
    }
  }
}

export async function handleMessages(sock, msg) {
  const from = msg.key.remoteJid;
  if (!from) return;

  const isGroup = from.endsWith('@g.us');
  const sender = msg.key.participant || msg.key.remoteJid;

  // 1. Processar Anti-Delete Legado
  const protocolMsg = msg.message?.protocolMessage;
  if (protocolMsg && protocolMsg.type === 0) {
    const deletedId = protocolMsg.key.id;
    const db = getDatabase();
    
    const isAntiDelActive = isGroup && db.configGrupos[from]?.antiDelete === true;

    if (isAntiDelActive) {
      const cached = messageCache[from]?.find(m => m.id === deletedId);
      if (cached) {
        const senderName = cached.pushName;
        const senderJid = cached.sender;
        
        let textContent = '';
        let hasMedia = false;

        if (cached.message.conversation) {
          textContent = cached.message.conversation;
        } else if (cached.message.extendedTextMessage) {
          textContent = cached.message.extendedTextMessage.text;
        } else if (cached.message.imageMessage?.caption) {
          textContent = cached.message.imageMessage.caption;
          hasMedia = true;
        } else if (cached.message.videoMessage?.caption) {
          textContent = cached.message.videoMessage.caption;
          hasMedia = true;
        } else {
          hasMedia = true;
        }

        const header = `🗑️ *ANTI-DELETE DETECTADO* 🗑️\n\n` +
                       `• *Usuário:* @${senderJid.split('@')[0]} (${senderName})\n` +
                       `• *Horário:* ${new Date(cached.timestamp * 1000).toLocaleTimeString('pt-BR')}\n`;

        if (!hasMedia) {
          await sock.sendMessage(from, { 
            text: `${header}• *Mensagem deletada:* ${textContent}`,
            mentions: [senderJid]
          });
        } else {
          await sock.sendMessage(from, { 
            text: `${header}• *Mídia deletada abaixo:* ${textContent ? `"${textContent}"` : '(sem legenda)'}`,
            mentions: [senderJid]
          });
          
          try {
            await sock.sendMessage(from, { 
              forward: { 
                key: { remoteJid: from, id: cached.id, participant: senderJid }, 
                message: cached.message 
              } 
            });
          } catch (err) {
            console.error('Erro ao encaminhar mídia deletada:', err);
          }
        }
      }
    }
    return;
  }

  cacheMessage(from, msg);

  // Extrair texto da mensagem (suporte total a mensagens temporárias/PV, viewOnce e legendas de mídia)
  let messageObj = msg.message;
  if (messageObj?.ephemeralMessage?.message) messageObj = messageObj.ephemeralMessage.message;
  if (messageObj?.viewOnceMessage?.message) messageObj = messageObj.viewOnceMessage.message;
  if (messageObj?.viewOnceMessageV2?.message) messageObj = messageObj.viewOnceMessageV2.message;
  if (messageObj?.documentWithCaptionMessage?.message) messageObj = messageObj.documentWithCaptionMessage.message;

  let body = '';
  if (messageObj?.conversation) {
    body = messageObj.conversation;
  } else if (messageObj?.extendedTextMessage?.text) {
    body = messageObj.extendedTextMessage.text;
  } else if (messageObj?.imageMessage?.caption) {
    body = messageObj.imageMessage.caption;
  } else if (messageObj?.videoMessage?.caption) {
    body = messageObj.videoMessage.caption;
  } else if (messageObj?.documentMessage?.caption) {
    body = messageObj.documentMessage.caption;
  } else if (messageObj?.buttonsResponseMessage?.selectedButtonId) {
    body = messageObj.buttonsResponseMessage.selectedButtonId;
  } else if (messageObj?.listResponseMessage?.singleSelectReply?.selectedRowId) {
    body = messageObj.listResponseMessage.singleSelectReply.selectedRowId;
  } else if (messageObj?.templateButtonReplyMessage?.selectedId) {
    body = messageObj.templateButtonReplyMessage.selectedId;
  }

  // Permitir que o usuário no privado digite "menu" ou "help" mesmo sem a barra "/"
  if (!isGroup && body && ['menu', 'help', 'ajuda'].includes(body.toLowerCase().trim())) {
    body = prefix + 'menu';
  }

  // Ignorar mensagens enviadas pelo próprio bot, a menos que sejam comandos iniciados pelo prefixo
  if (msg.key.fromMe && !body.startsWith(prefix)) return;

  // 1.5. Processar palpites dos jogos interativos (Forca e Quiz)
  if (body && !msg.key.fromMe) {
    const isMenu = body.toLowerCase().startsWith(prefix + 'menu');
    if (!isMenu) {
      if (activeForcaGames.has(from)) {
        const isForcaCmd = body.toLowerCase().startsWith(prefix + 'forca');
        const guess = isForcaCmd ? body.slice((prefix + 'forca').length).trim() : body.trim();
        if (guess) {
          const handled = await processForcaGuess(sock, msg, from, guess, sender);
          if (handled && !isForcaCmd) return;
        }
      }

      if (activeQuizGames.has(from)) {
        const isQuizCmd = body.toLowerCase().startsWith(prefix + 'quiz');
        const answer = isQuizCmd ? body.slice((prefix + 'quiz').length).trim() : body.trim();
        if (answer) {
          const handled = await processQuizAnswer(sock, msg, from, answer, sender);
          if (handled && !isQuizCmd) return;
        }
      }
    }
  }

  // 2. Anti-link Automático
  if (isGroup && body) {
    const groupCfg = getGroupConfig(from);
    if (groupCfg.antilink) {
      const hasLink = /(chat\.whatsapp\.com\/[A-Za-z0-9]|https?:\/\/[^\s]+)/i.test(body);
      if (hasLink) {
        try {
          const groupMetadata = await sock.groupMetadata(from);
          const isUserAdmin = groupMetadata.participants.find(p => p.id === sender)?.admin;
          if (!isUserAdmin) {
            await sock.sendMessage(from, { delete: msg.key }).catch(() => {});
            await sock.sendMessage(from, { 
              text: `🚫 @${sender.split('@')[0]}, links não são permitidos neste grupo!`, 
              mentions: [sender] 
            });
            return;
          }
        } catch (_) {}
      }
    }
  }

  // 3. Sistema de XP Automático para mensagens que não são comandos
  if (sender && !body.startsWith(prefix)) {
    const xpCooldowns = global.xpCooldowns || (global.xpCooldowns = new Map());
    const lastXpTime = xpCooldowns.get(sender) || 0;
    if (Date.now() - lastXpTime > 60000) { // Cooldown de 1 minuto
      xpCooldowns.set(sender, Date.now());
      const userObj = getUser(sender);
      const earnedXp = Math.floor(Math.random() * 15) + 10;
      const newXp = userObj.xp + earnedXp;
      const nextLevelXp = Math.pow(userObj.level, 2) * 50;
      let newLevel = userObj.level;

      if (newXp >= nextLevelXp) {
        newLevel += 1;
        await sock.sendMessage(from, { 
          text: `🎉 Parabéns @${sender.split('@')[0]}! Você alcançou o *Nível ${newLevel}*! 🏆`,
          mentions: [sender]
        }).catch(() => {});
      }

      updateUser(sender, { xp: newXp, level: newLevel });
    }
  }

  if (!body.startsWith(prefix)) {
    // Processar resposta automática/menção/saudação espontânea e memória
    await AutoReply.processMessage(sock, msg, body);
    return;
  }

  // Se for um comando, registra também na memória de conversa
  conversationMemory.addMessage(from, {
    id: msg.key.id,
    sender,
    senderName: msg.pushName || sender.split('@')[0],
    text: body,
    timestamp: msg.messageTimestamp,
    isBot: false
  });

  const args = body.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  let mentioned = [];
  if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
    mentioned = msg.message.extendedTextMessage.contextInfo.mentionedJid;
  }

  console.log(`[COMANDO] ${command} executado por ${sender} no chat ${from}`);

  try {    if (['menu', 'help', 'bot'].includes(command)) {
      const uptimeSeconds = (Date.now() - (global.botStartTime || Date.now())) / 1000;
      const uptimeStr = formatUptime(uptimeSeconds);
      
      const timestamp = msg.messageTimestamp;
      const latency = ((Date.now() - (timestamp * 1000)) / 1000).toFixed(3);
      const velocityStr = latency < 0 ? '0.002' : latency;

      const menuText = `╔════════════════╗\n` +
                       ` ✨ SUBARU BOT ✨ \n` +
                       `╚════════════════╝\n` +
                       `─── Comandos Originais ───\n` +
                       `「 🎵 」/play — baixar música (YouTube / TikTok / Instagram)\n` +
                       `「 🎥 」/video — Baixar vídeo (YouTube / TikTok / Instagram)\n` +
                       `「 📸 」/ig — vídeo do Instagram\n` +
                       `「 🎧 」/igaudio — áudio do Instagram\n` +
                       `「 📱 」/tiktok — vídeo do TikTok sem marca d'água\n` +
                       `「 🎶 」/tiktokaudio — áudio MP3 do TikTok\n` +
                       `「 🖼️ 」/sticker — Figurinha\n` +
                       `「 🖼️ 」/unsticker — transforma sticker em imagem\n` +
                       `「 💍 」/casar - pedir casamento\n` +
                       `「 ✅ 」/aceitar - aceitar pedido\n` +
                       `「 ❌ 」/recusar - recusar pedido\n` +
                       `「 💔 」/divorcio - se divorciar\n` +
                       `「 👤 」/perfil - ver status de casamento\n` +
                       `「 🏳️‍🌈 」/gay - procentagem\n` +
                       `「 💖 」/romance - Compatibilidade\n` +
                       `「 🐂 」/corno - teste de corno\n` +
                       `「 👹 」/feio - medidor de feiura\n` +
                       `「 🔥 」/gostoso - medidor de gostosura\n` +
                       `「 🍺 」/bebado - nível de embriaguez\n` +
                       `「 🙄 」/chato - medidor de chatice\n` +
                       `「 🍀 」/sortudo - medidor de sorte\n` +
                       `「 💋 」/beijo - dar um beijo em alguém\n` +
                       `「 🖐️ 」/tapa - dar um tapa em alguém\n` +
                       `「 🥛 」/mamada - mamada em alguém\n` +
                       `「 💦 」/gozar - expressar pura emoção\n` +
                       `「 🤙 」/67 - medidor do meme Sixen Seven (67)\n` +
                       `「 📉 」/betinha - medidor de nível Betinha\n` +
                       `「 🗿 」/mogar - duelo de Mogging para roubar Aura do oponente\n` +
                       `「 🔨 」/ban - remover alguém do grupo (admin)\n` +
                       `「 👁️ 」/ver - revelar mídia de visualização única\n` +
                       `「 🔑 」/adm - autorizar alguém a usar /ver (dono)\n` +
                       `「 🚫 」/remover - remover autorização do /ver (dono)\n` +
                       `「 🗑️ 」/antidel on/off - ativar/desativar anti-delete (dono)\n\n` +
                       `🤖 *IA*\n` +
                       `「 🧠 」/ia - conversar com Inteligência Artificial\n` +
                       `「 🌐 」/traduzir - traduzir texto/mensagem\n` +
                       `「 📝 」/resumir - resumir texto longo\n` +
                       `「 💡 」/explicar - explicação detalhada de conceitos\n\n` +
                       `👥 *ADMINISTRAÇÃO*\n` +
                       `「 🚪 」/kick - expulsar membro do grupo\n` +
                       `「 👑 」/promote - promover membro a admin\n` +
                       `「 🛡️ 」/demote - rebaixar admin a membro\n` +
                       `「 📢 」/tagall - marcar todos os membros\n` +
                       `「 🔒 」/mute - fechar o grupo para admins\n` +
                       `「 🔓 」/unmute - abrir o grupo para todos\n` +
                       `「 🔗 」/antilink - ativar/desativar anti-link\n` +
                       `「 🚫 」/antispam - ativar/desativar anti-spam\n` +
                       `「 👋 」/boasvindas - ativar/desativar boas-vindas\n` +
                       `「 📜 」/regras - ver ou definir regras do grupo\n` +
                       `「 ⚠️ 」/warn - dar advertência a um membro\n` +
                       `「 📋 」/warnings - ver advertências do membro\n\n` +
                       `🎮 *DIVERSÃO*\n` +
                       `「 👩‍❤️‍👨 」/ship - medir afinidade de casal\n` +
                       `「 🎱 」/8ball - bola 8 mágica de perguntas (IA)\n` +
                       `「 🎲 」/dado - rolar dado (1 a 6)\n` +
                       `「 🪙 」/caraoucoroa - cara ou coroa\n` +
                       `「 🎮 」/ppt - pedra, papel e tesoura\n` +
                       `「 💥 」/roleta - roleta russa animada\n` +
                       `「 🧠 」/quiz - quiz de conhecimentos gerais (IA)\n` +
                       `「 🎯 」/forca - jogo da forca\n` +
                       `「 🃏 」/tarô - leitura mística de Tarô com IA\n\n` +
                       `💰 *ECONOMIA & OSTENTAÇÃO*\n` +
                       `「 🎁 」/daily - recompensa diária com combo + Biscoito da Sorte (IA)\n` +
                       `「 💵 」/saldo - extrato de carteira, banco e status ostentação\n` +
                       `「 💼 」/trabalhar - turnos de trabalho dinâmicos com IA (+Moedas & XP)\n` +
                       `「 💸 」/transferir - enviar Pix para outro membro com comprovante\n` +
                       `「 🏪 」/loja - catálogo de itens RPG e carros de luxo\n` +
                       `「 🛒 」/comprar - adquirir itens para sua coleção\n` +
                       `「 🎒 」/inventario - itens comprados + avaliação de colecionador (IA)\n` +
                       `「 🏆 」/ranking - top membros mais ricos (Forbes Bot)\n` +
                       `「 ✨ 」/aura - ver seu status espiritual e card de Aura\n` +
                       `「 🧘 」/farmar aura - canalizar e cultivar pontos de Aura (cooldown 15m)\n\n` +
                       `⭐ *SISTEMA DE XP & PATENTES RPG*\n` +
                       `「 🎖️ 」/level - nível atual, XP e barra de progresso com Patente RPG\n` +
                       `「 📇 」/rank - cartão completo de perfil RPG + lema do guerreiro (IA)\n` +
                       `「 🌟 」/top - hall da fama das maiores lendas do grupo\n\n` +
                       `🛠 *UTILIDADES*\n` +
                       `「 🌤️ 」/clima - previsão do tempo por cidade\n` +
                       `「 🔢 」/calculadora - calcular expressões matemáticas\n` +
                       `「 ⏰ 」/lembrete - agendar alertas e lembretes\n` +
                       `「 🏁 」/qrcode - gerar imagem de QR Code\n` +
                       `「 🔍 」/readqr - ler QR Code de imagem\n` +
                       `「 🗣️ 」/tts - texto em áudio (com várias vozes)\n` +
                       `「 📝 」/ocr - extrair texto de fotos\n` +
                       `══════════════════\n` +
                       `🤖 Bot: SUBARU BOT\n` +
                       `⚡ Velocidade: ${velocityStr}s\n` +
                       `🌙 Uptime: ${uptimeStr}\n` +
                       `══════════════════`;
                         
       const menuImgPath = path.resolve('assets/menu.jpg');
       if (fs.existsSync(menuImgPath)) {
         return sock.sendMessage(from, { image: fs.readFileSync(menuImgPath), caption: menuText }, { quoted: msg });
       } else {
         return sock.sendMessage(from, { text: menuText }, { quoted: msg });
       }
    }
    // Comandos Sociais Legados
    else if (['casar', 'aceitar', 'recusar', 'divorcio', 'perfil', 'gay', 'romance', 'corno', 'feio', 'gostoso', 'bebado', 'chato', 'sortudo', 'beijo', 'tapa', 'mamada', 'gozar', '67', 'six7', 'sixenseven', 'sixseven', 'betinha', 'beta', 'mogar', 'mogado', 'mog'].includes(command)) {
      await handleSocialCommands(sock, msg, command, args, sender, mentioned);
    } 
    // Comandos de Administração Legados
    else if (['ban', 'adm', 'remover', 'antidel'].includes(command)) {
      await handleAdminCommands(sock, msg, command, args, sender, mentioned);
    } 
    // Comandos de Mídia Legados
    else if (['sticker', 'unsticker', 'ver', 'play', 'video', 'tiktok', 'ttvideo', 'tiktokaudio', 'ttplay', 'ig', 'insta', 'igvideo', 'igaudio', 'instavideo', 'instaaudio', 'igplay'].includes(command)) {
      await handleMediaCommands(sock, msg, command, args, sender);
    }
    // 🤖 IA
    else if (command === 'ia') await handleIaCommand(sock, msg, args);
    else if (command === 'traduzir') await handleTraduzirCommand(sock, msg, args);
    else if (command === 'resumir') await handleResumirCommand(sock, msg, args);
    else if (command === 'explicar') await handleExplicarCommand(sock, msg, args);
    // 👥 Administração Adicional
    else if (command === 'kick') await handleKickCommand(sock, msg, args, sender, mentioned);
    else if (command === 'promote') await handlePromoteCommand(sock, msg, args, sender, mentioned);
    else if (command === 'demote') await handleDemoteCommand(sock, msg, args, sender, mentioned);
    else if (command === 'tagall') await handleTagallCommand(sock, msg, args, sender);
    else if (command === 'mute') await handleMuteCommand(sock, msg, args, sender);
    else if (command === 'unmute') await handleUnmuteCommand(sock, msg, args, sender);
    else if (command === 'antilink') await handleAntilinkCommand(sock, msg, args, sender);
    else if (command === 'antispam') await handleAntispamCommand(sock, msg, args, sender);
    else if (command === 'boasvindas') await handleBoasvindasCommand(sock, msg, args, sender);
    else if (command === 'regras') await handleRegrasCommand(sock, msg, args, sender);
    else if (command === 'warn') await handleWarnCommand(sock, msg, args, sender, mentioned);
    else if (command === 'warnings') await handleWarningsCommand(sock, msg, args, sender, mentioned);
    // 🎮 Diversão
    else if (command === 'ship') await handleShipCommand(sock, msg, args, sender, mentioned);
    else if (['8ball', 'eightball'].includes(command)) await handleEightBallCommand(sock, msg, args);
    else if (command === 'dado') await handleDadoCommand(sock, msg);
    else if (command === 'caraoucoroa') await handleCaraOuCoroaCommand(sock, msg, args);
    else if (command === 'ppt') await handlePptCommand(sock, msg, args);
    else if (command === 'roleta') await handleRoletaCommand(sock, msg, sender);
    else if (command === 'quiz') await handleQuizCommand(sock, msg, args, sender);
    else if (command === 'forca') await handleForcaCommand(sock, msg, args, sender);
    else if (['taro', 'tarot', 'tarô'].includes(command)) await handleTaroCommand(sock, msg, args);
    // 💰 Economia
    else if (command === 'daily') await handleDailyCommand(sock, msg, sender);
    else if (command === 'saldo') await handleSaldoCommand(sock, msg, sender, mentioned);
    else if (command === 'trabalhar') await handleTrabalharCommand(sock, msg, sender);
    else if (command === 'transferir') await handleTransferirCommand(sock, msg, args, sender, mentioned);
    else if (command === 'loja') await handleLojaCommand(sock, msg);
    else if (command === 'comprar') await handleComprarCommand(sock, msg, args, sender);
    else if (command === 'inventario') await handleInventarioCommand(sock, msg, sender, mentioned);
    else if (command === 'ranking') await handleRankingCommand(sock, msg);
    else if (command === 'aura') await handleAuraCommand(sock, msg, args, sender, mentioned);
    else if (command === 'farmar') await handleFarmarAuraCommand(sock, msg, sender);
    // ⭐ Sistema de XP
    else if (command === 'level') await handleLevelCommand(sock, msg, sender, mentioned);
    else if (command === 'rank') await handleRankCommand(sock, msg, sender, mentioned);
    else if (command === 'top') await handleTopCommand(sock, msg);
    // 🛠 Utilidades
    else if (command === 'cep') await handleCepCommand(sock, msg, args);
    else if (command === 'clima') await handleClimaCommand(sock, msg, args);
    else if (command === 'calculadora') await handleCalculadoraCommand(sock, msg, args);
    else if (command === 'lembrete') await handleLembreteCommand(sock, msg, args, sender);
    else if (command === 'qrcode') await handleQrcodeCommand(sock, msg, args);
    else if (command === 'readqr') await handleReadqrCommand(sock, msg);
    else if (command === 'tts') await handleTtsCommand(sock, msg, args);
    else if (command === 'ocr') await handleOcrCommand(sock, msg);
    // ℹ Informações
    else if (command === 'ping') await handlePingCommand(sock, msg);
    else if (command === 'uptime') await handleUptimeCommand(sock, msg);
    else if (command === 'info') await handleInfoCommand(sock, msg);
    else if (command === 'botinfo') await handleBotinfoCommand(sock, msg);
    else if (command === 'grupo') await handleGrupoCommand(sock, msg);

  } catch (error) {
    console.error(`Erro ao executar o comando /${command}:`, error);
    await sock.sendMessage(from, { text: `⚠️ Ocorreu um erro interno ao processar o comando /${command}.` }, { quoted: msg });
  }
}
