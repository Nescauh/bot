/**
 * AutoReply.js
 * Gerencia a lógica de respostas automáticas, menções, respostas a mensagens do bot
 * e respostas espontâneas no grupo.
 */

import { conversationMemory } from './ConversationMemory.js';
import { ContextManager } from './ContextManager.js';
import { AIService } from './AIService.js';

// Cooldown interno para respostas espontâneas por grupo (evitar spam)
const spontaneousCooldowns = new Map();

// Variações de respostas espontâneas diretas para economizar API e variar no grupo
const SPONTANEOUS_RESPONSES = {
  bomdia: [
    'Bom dia! Como vocês estão hoje? ☀️',
    'Bom dia, pessoal! Bora pra mais um dia 🚀',
    'Diaaa! Tudo certo por aí?',
    'Bom dia! Tomara que o café de vocês esteja forte hoje ☕',
    'Opa, bom dia! Que o dia de vocês seja sensacional!'
  ],
  boanoite: [
    'Boa noite, turma! Descansem bem 🌙',
    'Boa noite! Quem fica até tarde no grupo hoje? haha',
    'Noiteee! Até amanhã, pessoal ✨',
    'Boa noite! Durmam com Deus 😴',
    'Boa noite galera! Hora de recarregar as energias.'
  ],
  boatarde: [
    'Boa tarde! Como tá o dia de vocês por aí? 🌤️',
    'Boa tarde, galera! Cheguei!',
    'Tarde! Alguém aí já almoçou?',
    'Boa tarde, pessoal! Força na missão 🚀'
  ],
  risada: [
    'Kkkkkkk perdi tudo',
    'Hahaha sensacional!',
    'Rindo muito disso kkkk',
    'Kkkkk tankei foi nada',
    'Kkkkkkkkk rindo até 2030'
  ],
  parabens: [
    'Parabéns!! Muito sucesso e tudo de bom! 🎉🎂',
    'Aeeee! Parabéns!! 👏🎉',
    'Parabéns! Que seja um ano incrível! ✨',
    'Felicidades!! Muita saúde e conquistas 🥳'
  ],
  agradecimento: [
    'Por nada! Tamo junto 🤝',
    'Imagina! Qualquer coisa tamo aí 😉',
    'Valeuuu! Disponha sempre!',
    'Tamo junto! Precisando é só chamar 🚀',
    'Por nada! Sempre às ordens!'
  ],
  socorro: [
    'Calma lá, o que aconteceu?! 😮',
    'Quem tá precisando de ajuda aí? Kkkk',
    'Socorro com o quê? Conta a fofoca inteira! 😂',
    'Eita, o que houve?!'
  ]
};

export class AutoReply {
  /**
   * Processa uma mensagem não-comando e decide se o bot deve responder.
   * @param {Object} sock Instância do Baileys
   * @param {Object} msg Objeto da mensagem Baileys
   * @param {string} text Texto limpo da mensagem
   * @returns {Promise<boolean>} True se respondeu, false caso contrário
   */
  static async processMessage(sock, msg, text) {
    if (!text || !text.trim()) return false;

    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const sender = msg.key.participant || msg.key.remoteJid;
    const userName = msg.pushName || sender.split('@')[0];

    // Registra a mensagem no aprendizado de fatos
    ContextManager.detectAndLearnFact(sender, text);

    // Registra no histórico do grupo
    conversationMemory.addMessage(from, {
      id: msg.key.id,
      sender,
      senderName: userName,
      text,
      timestamp: msg.messageTimestamp,
      isBot: false
    });

    // Identificar JID do Bot
    const rawBotId = sock.user?.id || '';
    const botNum = rawBotId.split(':')[0].split('@')[0];
    const botJid = botNum ? `${botNum}@s.whatsapp.net` : '';

    // Contexto de citação/menção
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
                        msg.message?.imageMessage?.contextInfo ||
                        msg.message?.videoMessage?.contextInfo;

    const mentionedJids = contextInfo?.mentionedJid || [];
    const quotedParticipant = contextInfo?.participant || '';

    // 1. Verificação de Menção ao Bot
    const isMentionedByName = /@subarubot/i.test(text);
    const isMentionedByJid = botJid && mentionedJids.includes(botJid);
    const isMentioned = isMentionedByName || isMentionedByJid;

    // 2. Verificação se estão respondendo uma mensagem do Bot
    const isReplyingToBot = quotedParticipant && botJid && (
      quotedParticipant === botJid ||
      quotedParticipant.split('@')[0] === botNum
    );

    // Se for conversa privada (PV/DM) OU se foi mencionado diretamente ou teve mensagem citada -> Resposta via IA com contexto total
    if (!isGroup || isMentioned || isReplyingToBot) {
      // Remove a tag @SubaruBot do prompt para não poluir
      const cleanPrompt = text.replace(/@subarubot/gi, '').trim() || 'Olá!';

      await sock.sendPresenceUpdate?.('composing', from).catch(() => {});

      const context = await ContextManager.buildContext(sock, msg);
      const replyText = await AIService.generateReply(context, cleanPrompt);

      if (replyText) {
        const sentMsg = await sock.sendMessage(from, { text: replyText }, { quoted: msg });

        // Salva a resposta do bot na memória da conversa
        if (sentMsg) {
          conversationMemory.addMessage(from, {
            id: sentMsg.key.id,
            sender: botJid,
            senderName: 'Subaru Bot',
            text: replyText,
            timestamp: Math.floor(Date.now() / 1000),
            isBot: true
          });
        }
        return true;
      }
    }

    // 3. Respostas Espontâneas (Apenas em grupos ou se for mensagem comum)
    if (isGroup) {
      const lower = text.toLowerCase().trim();

      // Categoriar expressões espontâneas
      let category = null;
      if (/^bom\s*dia+/i.test(lower)) category = 'bomdia';
      else if (/^boa\s*noite+/i.test(lower)) category = 'boanoite';
      else if (/^boa\s*tarde+/i.test(lower)) category = 'boatarde';
      else if (/^(kkk+|haha+|rsrs+|hsuahs+|ksksk+)/i.test(lower) && lower.length < 25) category = 'risada';
      else if (/^(parab[eé]ns|felicidades)/i.test(lower)) category = 'parabens';
      else if (/^(obrigad[oa]|valeu|vlw|tmj)/i.test(lower) && lower.length < 20) category = 'agradecimento';
      else if (/^(socorro|help|algu[eé]m\s+ajuda)/i.test(lower) && lower.length < 25) category = 'socorro';

      if (category) {
        // Checar Cooldown espontâneo (mínimo de 45 segundos entre respostas espontâneas no mesmo grupo)
        const lastSpontaneous = spontaneousCooldowns.get(from) || 0;
        const now = Date.now();

        if (now - lastSpontaneous > 45000) {
          // 40% de chance de responder espontaneamente para parecer natural e não monopolizar o grupo
          const shouldReply = Math.random() < 0.40;

          if (shouldReply) {
            spontaneousCooldowns.set(from, now);

            // Selecionar variação aleatória de resposta
            const options = SPONTANEOUS_RESPONSES[category];
            const randomReply = options[Math.floor(Math.random() * options.length)];

            const sentMsg = await sock.sendMessage(from, { text: randomReply }, { quoted: msg });

            if (sentMsg) {
              conversationMemory.addMessage(from, {
                id: sentMsg.key.id,
                sender: botJid,
                senderName: 'Subaru Bot',
                text: randomReply,
                timestamp: Math.floor(Date.now() / 1000),
                isBot: true
              });
            }
            return true;
          }
        }
      }
    }

    return false;
  }
}
