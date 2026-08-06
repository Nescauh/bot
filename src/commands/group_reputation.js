import { getUser, updateUser } from '../database/sqlite.js';

export async function handleGroupReputationCommands(sock, msg, command, args, sender, mentioned) {
  const from = msg.key.remoteJid;
  const reply = async (text, mentions = []) => {
    await sock.sendMessage(from, { text, mentions }, { quoted: msg });
  };

  const user = getUser(sender);

  switch (command) {
    case 'rep':
    case 'unrep': {
      const target = mentioned[0] || msg.message?.extendedTextMessage?.contextInfo?.participant;
      if (!target || target === sender) {
        return reply('⚠️ Marque o membro que deseja dar ou tirar reputação!\nExemplo: `/rep @usuario` ou `/unrep @usuario`');
      }

      const targetUser = getUser(target);
      let targetExtra = {};
      try {
        targetExtra = typeof targetUser.extra_data === 'string' ? JSON.parse(targetUser.extra_data || '{}') : (targetUser.extra_data || {});
      } catch (_) {}

      const isPositive = command === 'rep';
      const currentRep = targetExtra.reputation || 0;
      const newRep = isPositive ? currentRep + 1 : currentRep - 1;
      targetExtra.reputation = newRep;

      updateUser(target, { extra_data: JSON.stringify(targetExtra) });

      return reply(`${isPositive ? '⭐ *REPUTAÇÃO AUMENTADA!*' : '📉 *REPUTAÇÃO DIMINUÍDA!*'}\n\n` +
                   `• *Membro:* @${target.split('@')[0]}\n` +
                   `• *Pontos de Reputação:* ${newRep > 0 ? `+${newRep}` : newRep}`, [target]);
    }

    case 'enquete':
    case 'poll': {
      const fullText = args.join(' ').trim();
      if (!fullText.includes('|')) {
        return reply('⚠️ Formato incorreto! Separe a pergunta e as opções por barra vertica (`|`).\nExemplo: `/enquete Qual o melhor jogo? | GTA V | Minecraft | Valorant`');
      }

      const parts = fullText.split('|').map(p => p.trim()).filter(Boolean);
      const name = parts[0];
      const options = parts.slice(1);

      if (options.length < 2) {
        return reply('⚠️ Forneça pelo menos 2 opções de resposta para a enquete.');
      }

      try {
        await sock.sendMessage(from, {
          poll: {
            name: `📊 ENQUETE: ${name}`,
            values: options,
            selectableCount: 1
          }
        });
      } catch (err) {
        console.error('Erro ao enviar enquete:', err);
        return reply('⚠️ Não foi possível criar a enquete nativa neste chat.');
      }
      return;
    }

    case 'ticket': {
      const topic = args.join(' ').trim();
      if (!topic) {
        return reply('⚠️ Digite o motivo ou dúvida do seu ticket.\nExemplo: `/ticket Preciso de ajuda com o comando /saldo`');
      }

      const ticketId = Math.floor(100000 + Math.random() * 900000);
      return reply(`🎟️ *TICKET DE SUPORTE ABERTO!* 🎟️\n\n` +
                   `• *ID do Ticket:* #${ticketId}\n` +
                   `• *Solicitante:* @${sender.split('@')[0]}\n` +
                   `• *Assunto:* "${topic}"\n\n` +
                   `📌 _Um administrador do grupo ou suporte entrará em contato em breve!_`, [sender]);
    }
  }
}
