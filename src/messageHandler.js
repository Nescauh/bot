import { handleSocialCommands } from './commands/social.js';
import { handleAdminCommands } from './commands/admin.js';
import { handleMediaCommands } from './commands/media.js';
import { getDatabase } from './database.js';
import { formatUptime } from './utils/helpers.js';
import dotenv from 'dotenv';


dotenv.config();
const prefix = process.env.PREFIX || '/';

// Cache de mensagens em memória para Anti-Delete
const messageCache = {};
const CACHE_LIMIT = 500;

// Salva mensagem no cache
function cacheMessage(from, msg) {
  if (!from || !msg.key?.id || msg.key.fromMe) return;
  
  if (!messageCache[from]) {
    messageCache[from] = [];
  }

  // Apenas guardamos mensagens que tenham conteúdo
  if (msg.message) {
    messageCache[from].push({
      id: msg.key.id,
      sender: msg.key.participant || msg.key.remoteJid,
      message: JSON.parse(JSON.stringify(msg.message)), // Cópia profunda
      pushName: msg.pushName || 'Usuário',
      timestamp: msg.messageTimestamp
    });

    // Limita o cache
    if (messageCache[from].length > CACHE_LIMIT) {
      messageCache[from].shift();
    }
  }
}

export async function handleMessages(sock, msg) {
  const from = msg.key.remoteJid;
  if (!from) return;

  const isGroup = from.endsWith('@g.us');

  // 1. Processar Anti-Delete
  const protocolMsg = msg.message?.protocolMessage;
  if (protocolMsg && protocolMsg.type === 0) {
    const deletedId = protocolMsg.key.id;
    const db = getDatabase();
    
    // Verificar se o anti-delete está ativo no grupo (ou se for chat privado, ignorar por padrão ou tratar)
    const isAntiDelActive = isGroup && db.configGrupos[from]?.antiDelete === true;

    if (isAntiDelActive) {
      const cached = messageCache[from]?.find(m => m.id === deletedId);
      if (cached) {
        const senderName = cached.pushName;
        const senderJid = cached.sender;
        
        let textContent = '';
        let hasMedia = false;

        // Extrai texto dependendo do tipo de mensagem
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
          // Reenvia apenas texto
          await sock.sendMessage(from, { 
            text: `${header}• *Mensagem deletada:* ${textContent}`,
            mentions: [senderJid]
          });
        } else {
          // Reenvia aviso e tenta encaminhar a mídia deletada
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

  // Salvar mensagem atual no cache para possíveis futuros anti-deletes
  cacheMessage(from, msg);

  // Ignorar mensagens enviadas pelo próprio bot
  if (msg.key.fromMe) return;

  // 2. Processar Comandos
  // Obter o texto da mensagem
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

  // Verificar se começa com o prefixo
  if (!body.startsWith(prefix)) return;

  // Parse do comando e argumentos
  const args = body.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  // Obter o remetente
  const sender = msg.key.participant || msg.key.remoteJid;

  // Obter menções
  let mentioned = [];
  if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
    mentioned = msg.message.extendedTextMessage.contextInfo.mentionedJid;
  }

  console.log(`[COMANDO] ${command} executado por ${sender} no chat ${from}`);

  // Chamar handlers de comandos correspondentes
  try {
    // Comando do Menu Principal
    if (['menu', 'help', 'bot'].includes(command)) {
      const uptimeSeconds = (Date.now() - (global.botStartTime || Date.now())) / 1000;
      const uptimeStr = formatUptime(uptimeSeconds);
      
      const timestamp = msg.messageTimestamp;
      const latency = ((Date.now() - (timestamp * 1000)) / 1000).toFixed(3);
      const velocityStr = latency < 0 ? '0.002' : latency;

      const menuText = `╔════════════════╗\n` +
                       ` ✨ SERIE BOT ✨ \n` +
                       `╚════════════════╝\n` +
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
                       `「 🗑️ 」/antidel on/off - ativar/desativar anti-delete (dono)\n` +
                       `══════════════════\n` +
                       `🤖 Bot: Online\n` +
                       `⚡ Velocidade: ${velocityStr}s\n` +
                       `🌙 Uptime: ${uptimeStr}\n` +
                       `══════════════════`;
                       
      await sock.sendMessage(from, { text: menuText }, { quoted: msg });
    }
    // Comandos Sociais
    else if (['casar', 'aceitar', 'recusar', 'divorcio', 'perfil', 'gay', 'romance'].includes(command)) {
      await handleSocialCommands(sock, msg, command, args, sender, mentioned);
    } 
    // Comandos de Administração
    else if (['ban', 'adm', 'remover', 'antidel'].includes(command)) {
      await handleAdminCommands(sock, msg, command, args, sender, mentioned);
    } 
    // Comandos de Mídia
    else if (['sticker', 'unsticker', 'ver', 'play', 'video'].includes(command)) {
      await handleMediaCommands(sock, msg, command, args, sender);
    }
  } catch (error) {
    console.error(`Erro ao executar o comando /${command}:`, error);
    await sock.sendMessage(from, { text: `⚠️ Ocorreu um erro interno ao processar o comando /${command}.` }, { quoted: msg });
  }
}
