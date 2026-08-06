import { checkIfOwner, isAdmin } from './admin.js';
import { getUser, updateUser, getWarns } from '../database/sqlite.js';
import { getDatabase } from '../database.js';

// Mapa para confirmações pendentes de reset: key -> { target, timeoutId }
export const activeResetConfirmations = new Map();

function formatDuration(ms) {
  if (!ms || ms < 0) ms = 0;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} dia(s)`;
  if (hours > 0) return `${hours} hora(s)`;
  if (minutes > 0) return `${minutes} minuto(s)`;
  return `${seconds} segundo(s)`;
}

function getTargetUser(msg, mentioned, args) {
  if (mentioned && mentioned.length > 0) {
    return mentioned[0];
  }
  const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
  if (quotedParticipant) {
    return quotedParticipant;
  }
  if (args && args[0]) {
    const cleanNum = args[0].replace(/\D/g, '');
    if (cleanNum.length >= 8) {
      return cleanNum + '@s.whatsapp.net';
    }
  }
  return null;
}

function parseAmount(args) {
  for (const arg of args) {
    const clean = arg.trim();
    if (/^\d+$/.test(clean)) {
      const val = parseInt(clean, 10);
      if (!isNaN(val) && val > 0) return val;
    }
  }
  return null;
}

export async function handleOwnerEconomyCommands(sock, msg, command, args, sender, mentioned) {
  const from = msg.key.remoteJid;
  const isGroup = from.endsWith('@g.us');

  const reply = async (text, mentions = []) => {
    await sock.sendMessage(from, { text, mentions }, { quoted: msg });
  };

  const isOwner = checkIfOwner(sender, msg);
  if (!isOwner) {
    return reply('⚠️ Apenas o dono do bot pode utilizar este comando.');
  }

  switch (command) {
    case 'givesaldo': {
      const target = getTargetUser(msg, mentioned, args);
      if (!target) {
        return reply('⚠️ Marque um usuário ou responda à mensagem dele.\nExemplo: `/givesaldo @usuario 5000`');
      }

      const amount = parseAmount(args);
      if (!amount) {
        return reply('⚠️ Informe uma quantidade válida de moedas maior que zero.\nExemplo: `/givesaldo @usuario 5000`');
      }

      const user = getUser(target);
      const newWallet = user.wallet + amount;
      updateUser(target, { wallet: newWallet });

      return reply(`✅ Adicionado *$${amount.toLocaleString('pt-BR')}* ao saldo de @${target.split('@')[0]}.\n💵 *Novo saldo na carteira:* $${newWallet.toLocaleString('pt-BR')}`, [target]);
    }

    case 'removesaldo': {
      const target = getTargetUser(msg, mentioned, args);
      if (!target) {
        return reply('⚠️ Marque um usuário ou responda à mensagem dele.\nExemplo: `/removesaldo @usuario 5000`');
      }

      const amount = parseAmount(args);
      if (!amount) {
        return reply('⚠️ Informe uma quantidade válida de moedas maior que zero.\nExemplo: `/removesaldo @usuario 5000`');
      }

      const user = getUser(target);
      const newWallet = Math.max(0, user.wallet - amount);
      updateUser(target, { wallet: newWallet });

      return reply(`✅ Removido *$${amount.toLocaleString('pt-BR')}* do saldo de @${target.split('@')[0]}.\n💵 *Novo saldo na carteira:* $${newWallet.toLocaleString('pt-BR')}`, [target]);
    }

    case 'givexp': {
      const target = getTargetUser(msg, mentioned, args);
      if (!target) {
        return reply('⚠️ Marque um usuário ou responda à mensagem dele.\nExemplo: `/givexp @usuario 1000`');
      }

      const amount = parseAmount(args);
      if (!amount) {
        return reply('⚠️ Informe uma quantidade válida de XP maior que zero.\nExemplo: `/givexp @usuario 1000`');
      }

      const user = getUser(target);
      const newXp = user.xp + amount;
      updateUser(target, { xp: newXp });

      return reply(`✨ Adicionado *${amount.toLocaleString('pt-BR')} XP* para @${target.split('@')[0]}.\n⭐ *Novo XP total:* ${newXp.toLocaleString('pt-BR')} XP`, [target]);
    }

    case 'removexp': {
      const target = getTargetUser(msg, mentioned, args);
      if (!target) {
        return reply('⚠️ Marque um usuário ou responda à mensagem dele.\nExemplo: `/removexp @usuario 500`');
      }

      const amount = parseAmount(args);
      if (!amount) {
        return reply('⚠️ Informe uma quantidade válida de XP maior que zero.\nExemplo: `/removexp @usuario 500`');
      }

      const user = getUser(target);
      const newXp = Math.max(0, user.xp - amount);
      updateUser(target, { xp: newXp });

      return reply(`✨ Removido *${amount.toLocaleString('pt-BR')} XP* de @${target.split('@')[0]}.\n⭐ *Novo XP total:* ${newXp.toLocaleString('pt-BR')} XP`, [target]);
    }

    case 'givelevel': {
      const target = getTargetUser(msg, mentioned, args);
      if (!target) {
        return reply('⚠️ Marque um usuário ou responda à mensagem dele.\nExemplo: `/givelevel @usuario 5`');
      }

      const amount = parseAmount(args);
      if (!amount) {
        return reply('⚠️ Informe uma quantidade de níveis válida maior que zero.\nExemplo: `/givelevel @usuario 5`');
      }

      const user = getUser(target);
      const newLevel = user.level + amount;
      updateUser(target, { level: newLevel });

      return reply(`🏆 Adicionado *${amount} nível(is)* para @${target.split('@')[0]}.\n🎖️ *Novo Nível:* ${newLevel}`, [target]);
    }

    case 'removelevel': {
      const target = getTargetUser(msg, mentioned, args);
      if (!target) {
        return reply('⚠️ Marque um usuário ou responda à mensagem dele.\nExemplo: `/removelevel @usuario 2`');
      }

      const amount = parseAmount(args);
      if (!amount) {
        return reply('⚠️ Informe uma quantidade de níveis válida maior que zero.\nExemplo: `/removelevel @usuario 2`');
      }

      const user = getUser(target);
      const newLevel = Math.max(1, user.level - amount);
      updateUser(target, { level: newLevel });

      return reply(`🏆 Removido *${amount} nível(is)* de @${target.split('@')[0]}.\n🎖️ *Novo Nível:* ${newLevel}`, [target]);
    }

    case 'giveaura': {
      const target = getTargetUser(msg, mentioned, args);
      if (!target) {
        return reply('⚠️ Marque um usuário ou responda à mensagem dele.\nExemplo: `/giveaura @usuario 50`');
      }

      const amount = parseAmount(args);
      if (!amount) {
        return reply('⚠️ Informe uma quantidade de aura válida maior que zero.\nExemplo: `/giveaura @usuario 50`');
      }

      const user = getUser(target);
      const newAura = user.aura + amount;
      updateUser(target, { aura: newAura });

      return reply(`🔮 Adicionado *${amount.toLocaleString('pt-BR')} de Aura* para @${target.split('@')[0]}.\n✨ *Nova Aura total:* ${newAura.toLocaleString('pt-BR')}`, [target]);
    }

    case 'removeaura': {
      const target = getTargetUser(msg, mentioned, args);
      if (!target) {
        return reply('⚠️ Marque um usuário ou responda à mensagem dele.\nExemplo: `/removeaura @usuario 20`');
      }

      const amount = parseAmount(args);
      if (!amount) {
        return reply('⚠️ Informe uma quantidade de aura válida maior que zero.\nExemplo: `/removeaura @usuario 20`');
      }

      const user = getUser(target);
      const newAura = Math.max(0, user.aura - amount);
      updateUser(target, { aura: newAura });

      return reply(`🔮 Removido *${amount.toLocaleString('pt-BR')} de Aura* de @${target.split('@')[0]}.\n✨ *Nova Aura total:* ${newAura.toLocaleString('pt-BR')}`, [target]);
    }

    case 'resetuser': {
      const target = getTargetUser(msg, mentioned, args);
      if (!target) {
        return reply('⚠️ Marque o usuário que deseja resetar.\nExemplo: `/resetuser @usuario`');
      }

      const isConfirmedParam = args.some(a => ['sim', 'confirmar', 'confirm', 'yes'].includes(a.toLowerCase().trim()));
      const key = `${from}_${sender}_${target}`;
      const hasPending = activeResetConfirmations.has(key);

      if (isConfirmedParam || hasPending) {
        if (hasPending) {
          clearTimeout(activeResetConfirmations.get(key).timeoutId);
          activeResetConfirmations.delete(key);
        }

        const user = getUser(target);
        const now = Date.now();

        updateUser(target, {
          wallet: 0,
          bank: 0,
          xp: 0,
          level: 1,
          aura: 0,
          daily_streak: 0,
          inventory: '[]',
          last_daily: 0,
          last_work: 0,
          last_aura_farm: 0,
          created_at: user.created_at || now
        });

        return reply(`🔄 *USUÁRIO RESETADO COM SUCESSO!*\n\n` +
                     `• *Usuário:* @${target.split('@')[0]}\n` +
                     `• Saldo, banco, XP, aura, streak e inventário foram redefinidos para os valores iniciais.\n` +
                     `• Nível redefinido para *1*.`, [target]);
      }

      // Se não passou "sim", solicita confirmação
      const timeoutId = setTimeout(() => {
        if (activeResetConfirmations.has(key)) {
          activeResetConfirmations.delete(key);
          reply(`⚠️ O tempo de confirmação para o reset de @${target.split('@')[0]} expirou.`, [target]);
        }
      }, 30000);

      activeResetConfirmations.set(key, { target, timeoutId });

      return reply(`⚠️ *CONFIRMAÇÃO DE RESET NECESSÁRIA* ⚠️\n\n` +
                   `Você tem certeza que deseja resetar TODOS os dados de @${target.split('@')[0]}?\n\n` +
                   `• Saldo: Zerado\n` +
                   `• Banco: Zerado\n` +
                   `• XP: Zerado\n` +
                   `• Nível: Voltará para 1\n` +
                   `• Aura: Zerada\n` +
                   `• Streak diário: Zerado\n` +
                   `• Inventário: Limpo\n\n` +
                   `Para confirmar, responda nesta conversa com *sim* ou envie:\n` +
                   `*/resetuser @${target.split('@')[0]} sim* (em até 30 segundos)`, [target]);
    }

    case 'userinfo': {
      const target = getTargetUser(msg, mentioned, args) || sender;
      const user = getUser(target);
      const db = getDatabase();

      if (!user.created_at) {
        user.created_at = Date.now();
        updateUser(target, { created_at: user.created_at });
      }

      // Cargo do usuário
      let role = '👤 Membro';
      if (checkIfOwner(target)) {
        role = '👑 Dono do Bot';
      } else if (isGroup) {
        try {
          const groupMetadata = await sock.groupMetadata(from);
          if (isAdmin(groupMetadata.participants, target)) {
            role = '🛡️ Administrador do Grupo';
          }
        } catch (_) {}
      }

      // Casamento
      let marriageStr = '💔 Solteiro(a)';
      if (db.casamentos && db.casamentos[target]) {
        const cInfo = db.casamentos[target];
        const parceiroJid = cInfo.parceiro;
        const duration = formatDuration(Date.now() - (cInfo.since || Date.now()));
        marriageStr = `💍 Casado(a) com @${parceiroJid.split('@')[0]} (${duration})`;
      }

      // Inventário
      let inventoryList = [];
      try {
        inventoryList = JSON.parse(user.inventory || '[]');
      } catch (_) {}

      let inventoryStr = `${inventoryList.length} item(s)`;
      if (inventoryList.length > 0) {
        const itemNames = inventoryList.map(i => typeof i === 'string' ? i : (i.nome || i.name || 'Item')).slice(0, 5);
        inventoryStr += ` (${itemNames.join(', ')}${inventoryList.length > 5 ? '...' : ''})`;
      }

      // Advertências
      const warnsCount = getWarns(from, target);

      // Data de Criação
      const createdAtDate = new Date(user.created_at || Date.now());
      const createdAtStr = `${createdAtDate.toLocaleDateString('pt-BR')} ${createdAtDate.toLocaleTimeString('pt-BR')}`;

      const mentions = [target];
      if (db.casamentos?.[target]?.parceiro) {
        mentions.push(db.casamentos[target].parceiro);
      }

      const text = `📊 *DADOS COMPLETOS DO USUÁRIO* 📊\n\n` +
                   `👤 *Usuário:* @${target.split('@')[0]}\n` +
                   `🏷️ *Cargo:* ${role}\n` +
                   `📅 *Data de Criação:* ${createdAtStr}\n\n` +
                   `💵 *Saldo (Carteira):* $${(user.wallet || 0).toLocaleString('pt-BR')}\n` +
                   `🏦 *Banco:* $${(user.bank || 0).toLocaleString('pt-BR')}\n` +
                   `🔮 *Aura:* ${(user.aura || 0).toLocaleString('pt-BR')}\n` +
                   `✨ *XP Total:* ${(user.xp || 0).toLocaleString('pt-BR')}\n` +
                   `🌟 *Level:* ${user.level || 1}\n` +
                   `🎒 *Inventário:* ${inventoryStr}\n` +
                   `🔥 *Streak Diário:* ${user.daily_streak || 0} dia(s)\n` +
                   `💍 *Casamento:* ${marriageStr}\n` +
                   `⚠️ *Advertências (Grupo):* ${warnsCount}\n`;

      return reply(text, mentions);
    }

    default:
      break;
  }
}
