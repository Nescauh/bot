import { getUser, updateUser } from '../../database/sqlite.js';

// Ranks de Aura baseados na quantidade acumulada
export function getAuraRank(auraPoints) {
  if (auraPoints >= 20000) return { title: '👑 Divino / Lendário', emoji: '👑', color: 'Divina' };
  if (auraPoints >= 12000) return { title: '🌀 Aura Suprema', emoji: '🌀', color: 'Suprema' };
  if (auraPoints >= 7000) return { title: '💎 Aura Celestial', emoji: '💎', color: 'Celestial' };
  if (auraPoints >= 3500) return { title: '🔥 Aura Flamejante', emoji: '🔥', color: 'Flamejante' };
  if (auraPoints >= 1500) return { title: '⚡ Aura Mística', emoji: '⚡', color: 'Mística' };
  if (auraPoints >= 500) return { title: '🌟 Aura Iluminada', emoji: '🌟', color: 'Iluminada' };
  return { title: '🌫️ Aura Comum', emoji: '🌫️', color: 'Comum' };
}

const farmEvents = [
  'meditou sob a luz do luar sagrado e canalizou',
  'derrotou um espectro das sombras e absorveu',
  'despertou o seu ki interior e cultivou',
  'encontrou um cristal místico nas montanhas e extraiu',
  'realizou um ritual de energia cósmica e adquiriu',
  'venceu um duelo espiritual épico e conquistou',
  'absorveu a energia vital da natureza e acumulou',
  'abriu o seu sexto sentido e sintonizou',
  'dominou o fluxo de aura do ambiente e canalizou',
  'recebeu a bênção dos antigos ancestrais e ganhou'
];

// Comando /farmar aura (ou /aura farmar)
export async function handleFarmarAuraCommand(sock, msg, sender) {
  const from = msg.key.remoteJid;
  const user = getUser(sender);
  const now = Date.now();
  const COOLDOWN = 15 * 60 * 1000; // Cooldown de 15 minutos

  if (now - user.last_aura_farm < COOLDOWN) {
    const remaining = COOLDOWN - (now - user.last_aura_farm);
    const minutes = Math.floor(remaining / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    return sock.sendMessage(from, { 
      text: `⏳ *SUA ENERGIA AINDA ESTÁ SE RECARREGANDO!*\n\nVocê precisa esperar sua energia espiritual se estabilizar.\n\n⏱️ *Tempo restante:* *${minutes}m ${seconds}s*` 
    }, { quoted: msg });
  }

  // Gera aura base de 80 a 250
  let earnedAura = Math.floor(Math.random() * 171) + 80;
  
  // 15% de chance de farm Crítico (bônus x2)
  const isCritical = Math.random() < 0.15;
  if (isCritical) {
    earnedAura *= 2;
  }

  const newAura = (user.aura || 0) + earnedAura;
  const oldRank = getAuraRank(user.aura || 0);
  const newRank = getAuraRank(newAura);

  updateUser(sender, {
    aura: newAura,
    last_aura_farm: now
  });

  const eventText = farmEvents[Math.floor(Math.random() * farmEvents.length)];
  let critTag = isCritical ? '\n🔥 *CRÍTICO TRANSCENDENTE! (Aura dobrada x2)*' : '';
  let rankUpTag = oldRank.title !== newRank.title ? `\n🎉 *EVOLUÇÃO DE AURA!* Sua aura evoluiu para *${newRank.title}*!` : '';

  const responseText = `✨ *FARM DE AURA CONCLUÍDO!* ✨\n\n` +
                       `🧘 *Ação:* Você ${eventText} +*${earnedAura} de Aura*!${critTag}\n\n` +
                       `⚡ *Aura Total:* *${newAura.toLocaleString()} pts*\n` +
                       `🛡️ *Status de Aura:* ${newRank.emoji} *${newRank.title}*${rankUpTag}\n\n` +
                       `⏱️ *Próximo farm disponível em:* 15 minutos.`;

  return sock.sendMessage(from, { text: responseText }, { quoted: msg });
}

// Comando /aura (mostra aura do usuário ou da pessoa mencionada)
export async function handleAuraCommand(sock, msg, args, sender, mentioned) {
  const from = msg.key.remoteJid;
  
  // Se o usuário digitou "/aura farmar", redireciona para o farmar aura
  if (args[0]?.toLowerCase() === 'farmar') {
    return handleFarmarAuraCommand(sock, msg, sender);
  }

  let targetJid = sender;
  if (mentioned && mentioned.length > 0) {
    targetJid = mentioned[0];
  } else if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
    targetJid = msg.message.extendedTextMessage.contextInfo.participant;
  }

  const user = getUser(targetJid);
  const auraPoints = user.aura || 0;
  const rank = getAuraRank(auraPoints);
  const targetName = targetJid === sender ? 'Sua' : `@${targetJid.split('@')[0]}`;

  const now = Date.now();
  const COOLDOWN = 15 * 60 * 1000;
  const lastFarm = user.last_aura_farm || 0;
  let farmStatus = '✅ Disponível agora! Use `/farmar aura`';
  if (now - lastFarm < COOLDOWN) {
    const remaining = COOLDOWN - (now - lastFarm);
    const minutes = Math.floor(remaining / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    farmStatus = `⏳ Disponível em *${minutes}m ${seconds}s*`;
  }

  const text = `╔════════════════╗\n` +
               `  ✨ *CARD DE AURA* ✨  \n` +
               `╚════════════════╝\n\n` +
               `👤 *Membro:* ${targetName}\n` +
               `⚡ *Aura Acumulada:* *${auraPoints.toLocaleString()} pts*\n` +
               `🏅 *Nível Espiritual:* ${rank.emoji} *${rank.title}*\n\n` +
               `🌾 *Farm de Aura:* ${farmStatus}\n\n` +
               `💡 _Dica: Use \`/farmar aura\` a cada 15 minutos para aumentar seu poder e subir de nível espiritual!_`;

  return sock.sendMessage(from, { 
    text, 
    mentions: [targetJid] 
  }, { quoted: msg });
}
