import { getDatabase, updateDatabase } from '../database.js';
import dotenv from 'dotenv';
dotenv.config();

// Verifica se o JID é o dono do bot
export function checkIfOwner(sender) {
  if (!sender) return false;
  const owner = (process.env.OWNER_NUMBER || '').replace(/\D/g, '');
  const cleanSender = sender.replace(/\D/g, '');
  if (!owner) return false;
  // Compara os últimos 8 dígitos para mitigar a diferença do 9º dígito no BR
  return cleanSender.endsWith(owner.slice(-8)) || owner.endsWith(cleanSender.slice(-8));
}

// Verifica se um participante é admin
export function isAdmin(participants, jid) {
  const participant = participants.find(p => p.id === jid);
  return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
}

export async function handleAdminCommands(sock, msg, command, args, sender, mentioned) {
  const from = msg.key.remoteJid;
  const isGroup = from.endsWith('@g.us');
  
  const reply = async (text, mentions = []) => {
    await sock.sendMessage(from, { text, mentions }, { quoted: msg });
  };

  const isSenderOwner = checkIfOwner(sender);

  switch (command) {
    case 'ban': {
      if (!isGroup) {
        return reply('⚠️ Este comando só pode ser utilizado em grupos.');
      }

      // Obter metadados do grupo
      let groupMetadata;
      try {
        groupMetadata = await sock.groupMetadata(from);
      } catch (err) {
        return reply('⚠️ Não foi possível obter os metadados do grupo.');
      }

      const participants = groupMetadata.participants;

      // Verificar se o solicitante é admin ou dono
      const senderAdmin = isAdmin(participants, sender);
      if (!senderAdmin && !isSenderOwner) {
        return reply('⚠️ Apenas administradores do grupo ou o dono do bot podem utilizar este comando.');
      }

      // Verificar se o bot é admin
      const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      const botAdmin = isAdmin(participants, botJid);
      if (!botAdmin) {
        return reply('⚠️ Eu preciso ser administrador do grupo para poder banir participantes.');
      }

      // Determinar o alvo (mencionado ou citado)
      let target = mentioned[0];
      if (!target && msg.message?.extendedTextMessage?.contextInfo?.participant) {
        target = msg.message.extendedTextMessage.contextInfo.participant;
      }

      if (!target) {
        return reply('⚠️ Marque alguém ou responda a mensagem da pessoa que deseja banir.');
      }

      if (target === botJid) {
        return reply('⚠️ Eu não posso me banir!');
      }

      if (checkIfOwner(target)) {
        return reply('⚠️ Eu não posso banir o meu dono!');
      }

      // Banir o participante
      try {
        await sock.groupParticipantsUpdate(from, [target], 'remove');
        return reply(`🔨 @${target.split('@')[0]} foi banido com sucesso.`, [target]);
      } catch (error) {
        console.error('Erro ao banir participante:', error);
        return reply('⚠️ Erro ao tentar remover o participante. Talvez ele já tenha saído ou eu não tenha permissão.');
      }
    }

    case 'adm': {
      if (!isSenderOwner) {
        return reply('⚠️ Apenas o dono do bot pode utilizar este comando.');
      }

      let target = mentioned[0];
      if (!target && msg.message?.extendedTextMessage?.contextInfo?.participant) {
        target = msg.message.extendedTextMessage.contextInfo.participant;
      }

      if (!target) {
        return reply('⚠️ Marque ou responda à pessoa que deseja autorizar.');
      }

      let jaAutorizado = false;
      updateDatabase((db) => {
        if (!db.autorizadosVer.includes(target)) {
          db.autorizadosVer.push(target);
        } else {
          jaAutorizado = true;
        }
      });

      if (jaAutorizado) {
        return reply(`⚠️ @${target.split('@')[0]} já está na lista de autorizados para usar /ver.`, [target]);
      }

      return reply(`🔑 @${target.split('@')[0]} foi autorizado com sucesso para usar /ver.`, [target]);
    }

    case 'remover': {
      if (!isSenderOwner) {
        return reply('⚠️ Apenas o dono do bot pode utilizar este comando.');
      }

      let target = mentioned[0];
      if (!target && msg.message?.extendedTextMessage?.contextInfo?.participant) {
        target = msg.message.extendedTextMessage.contextInfo.participant;
      }

      if (!target) {
        return reply('⚠️ Marque ou responda à pessoa que deseja remover a autorização.');
      }

      let removido = false;
      updateDatabase((db) => {
        const index = db.autorizadosVer.indexOf(target);
        if (index !== -1) {
          db.autorizadosVer.splice(index, 1);
          removido = true;
        }
      });

      if (!removido) {
        return reply(`⚠️ @${target.split('@')[0]} não estava na lista de autorizados.`, [target]);
      }

      return reply(`🚫 @${target.split('@')[0]} teve sua autorização para usar /ver removida.`, [target]);
    }

    case 'antidel': {
      if (!isGroup) {
        return reply('⚠️ Este comando só pode ser utilizado em grupos.');
      }

      if (!isSenderOwner) {
        return reply('⚠️ Apenas o dono do bot pode ativar/desativar o anti-delete.');
      }

      const param = args[0]?.toLowerCase();
      if (param !== 'on' && param !== 'off') {
        return reply('⚠️ Uso incorreto. Use: /antidel on ou /antidel off');
      }

      const active = param === 'on';

      updateDatabase((db) => {
        if (!db.configGrupos[from]) {
          db.configGrupos[from] = {};
        }
        db.configGrupos[from].antiDelete = active;
      });

      return reply(`🗑️ Anti-delete foi ${active ? '*ATIVADO*' : '*DESATIVADO*'} para este grupo.`);
    }

    default:
      break;
  }
}
