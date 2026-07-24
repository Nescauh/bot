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
import { handleQuizCommand } from './commands/fun/quiz.js';
import { handleForcaCommand } from './commands/fun/forca.js';

import { handleDailyCommand } from './commands/economy/daily.js';
import { handleSaldoCommand } from './commands/economy/saldo.js';
import { handleTrabalharCommand } from './commands/economy/trabalhar.js';
import { handleTransferirCommand } from './commands/economy/transferir.js';
import { handleLojaCommand } from './commands/economy/loja.js';
import { handleComprarCommand } from './commands/economy/comprar.js';
import { handleInventarioCommand } from './commands/economy/inventario.js';
import { handleRankingCommand } from './commands/economy/ranking.js';

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

  if (msg.key.fromMe) return;

  // Extrair texto da mensagem
  let body = '';
  if (msg.message?.conversation) {
    body = msg.message.conversation;
  } else if (msg.message?.extendedTextMessage?.text) {
    body = msg.message.extendedTextMessage.text;
  } else if (msg.message?.imageMessage?.caption) {
    body = msg.message.imageMessage.caption;
  } else if (msg.message?.videoMessage?.caption) {
    body = msg.message.videoMessage.caption;
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

  if (!body.startsWith(prefix)) return;

  const args = body.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  let mentioned = [];
  if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
    mentioned = msg.message.extendedTextMessage.contextInfo.mentionedJid;
  }

  console.log(`[COMANDO] ${command} executado por ${sender} no chat ${from}`);

  try {
    // Menu Principal com todas as categorias
    if (['menu', 'help', 'bot'].includes(command)) {
      const uptimeSeconds = (Date.now() - (global.botStartTime || Date.now())) / 1000;
      const uptimeStr = formatUptime(uptimeSeconds);
      
      const timestamp = msg.messageTimestamp;
      const latency = ((Date.now() - (timestamp * 1000)) / 1000).toFixed(3);
      const velocityStr = latency < 0 ? '0.002' : latency;

      const menuText = `╔════════════════╗\n` +
                       ` ✨ SERIE BOT ✨ \n` +
                       `╚════════════════╝\n` +
                       `─── Comandos Originais ───\n` +
                       `「 🎵 」/play — baixar musica\n` +
                       `「 🎥 」/video — Baixar vídeo\n` +
                       `「 🖼️ 」/sticker — Figurinha\n` +
                       `「 🖼️ 」/unsticker — transforma sticker em imagem\n` +
                       `「 💍 」/casar - pedir casamento\n` +
                       `「 ✅ 」/aceitar - aceitar pedido\n` +
                       `「 ❌ 」/recusar - recusar pedido\n` +
                       `「 💔 」/divorcio - se divorciar\n` +
                       `「 👤 」/perfil - ver status de casamento\n` +
                       `「 🏳️‍🌈 」/gay - procentagem\n` +
                       `「 💖 」/romance - Compatibilidade\n` +
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
                       `「 🎱 」/8ball - bola 8 mágica de perguntas\n` +
                       `「 🎲 」/dado - rolar dado (1 a 6)\n` +
                       `「 🪙 」/caraoucoroa - cara ou coroa\n` +
                       `「 🎮 」/ppt - pedra, papel e tesoura\n` +
                       `「 💥 」/roleta - roleta russa\n` +
                       `「 🧠 」/quiz - quiz de conhecimentos gerais\n` +
                       `「 🎯 」/forca - jogo da forca\n\n` +
                       `💰 *ECONOMIA*\n` +
                       `「 🎁 」/daily - resgatar recompensa diária\n` +
                       `「 💵 」/saldo - ver saldo da carteira e banco\n` +
                       `「 💼 」/trabalhar - trabalhar para ganhar moedas\n` +
                       `「 💸 」/transferir - transferir moedas para outro membro\n` +
                       `「 🏪 」/loja - ver itens disponíveis na loja\n` +
                       `「 🛒 」/comprar - comprar item da loja\n` +
                       `「 🎒 」/inventario - ver seus itens comprados\n` +
                       `「 🏆 」/ranking - top membros mais ricos\n\n` +
                       `⭐ *SISTEMA DE XP*\n` +
                       `「 🎖️ 」/level - ver seu nível e XP atual\n` +
                       `「 📇 」/rank - cartão de status do perfil\n` +
                       `「 🌟 」/top - ranking dos maiores níveis\n\n` +
                       `🛠 *UTILIDADES*\n` +
                       `「 📍 」/cep - consultar endereço por CEP\n` +
                       `「 🌤️ 」/clima - previsão do tempo por cidade\n` +
                       `「 🔢 」/calculadora - calcular expressões matemáticas\n` +
                       `「 ⏰ 」/lembrete - agendar alertas e lembretes\n` +
                       `「 🏁 」/qrcode - gerar imagem de QR Code\n` +
                       `「 🔍 」/readqr - ler QR Code de imagem\n` +
                       `「 🗣️ 」/tts - converter texto em áudio falado\n` +
                       `「 📝 」/ocr - extrair texto de fotos\n\n` +
                       `ℹ *INFORMAÇÕES*\n` +
                       `「 🏓 」/ping - latência do bot em milissegundos\n` +
                       `「 🌙 」/uptime - tempo online do bot\n` +
                       `「 ℹ️ 」/info - informações do bot\n` +
                       `「 💻 」/botinfo - dados técnicos do servidor\n` +
                       `「 👥 」/grupo - informações sobre o grupo\n` +
                       `══════════════════\n` +
                       `🤖 Bot: Online\n` +
                       `⚡ Velocidade: ${velocityStr}s\n` +
                       `🌙 Uptime: ${uptimeStr}\n` +
                       `══════════════════`;
                       
      await sock.sendMessage(from, { text: menuText }, { quoted: msg });
    }
    // Comandos Sociais Legados
    else if (['casar', 'aceitar', 'recusar', 'divorcio', 'perfil', 'gay', 'romance'].includes(command)) {
      await handleSocialCommands(sock, msg, command, args, sender, mentioned);
    } 
    // Comandos de Administração Legados
    else if (['ban', 'adm', 'remover', 'antidel'].includes(command)) {
      await handleAdminCommands(sock, msg, command, args, sender, mentioned);
    } 
    // Comandos de Mídia Legados
    else if (['sticker', 'unsticker', 'ver', 'play', 'video'].includes(command)) {
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
    else if (command === 'quiz') await handleQuizCommand(sock, msg, args);
    else if (command === 'forca') await handleForcaCommand(sock, msg, args);
    // 💰 Economia
    else if (command === 'daily') await handleDailyCommand(sock, msg, sender);
    else if (command === 'saldo') await handleSaldoCommand(sock, msg, sender, mentioned);
    else if (command === 'trabalhar') await handleTrabalharCommand(sock, msg, sender);
    else if (command === 'transferir') await handleTransferirCommand(sock, msg, args, sender, mentioned);
    else if (command === 'loja') await handleLojaCommand(sock, msg);
    else if (command === 'comprar') await handleComprarCommand(sock, msg, args, sender);
    else if (command === 'inventario') await handleInventarioCommand(sock, msg, sender, mentioned);
    else if (command === 'ranking') await handleRankingCommand(sock, msg);
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
