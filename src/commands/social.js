import { getDatabase, updateDatabase } from '../database.js';

// Função auxiliar para formatar tempo de casamento
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} dia(s)`;
  if (hours > 0) return `${hours} hora(s)`;
  if (minutes > 0) return `${minutes} minuto(s)`;
  return `${seconds} segundo(s)`;
}

export async function handleSocialCommands(sock, msg, command, args, sender, mentioned) {
  const db = getDatabase();
  const from = msg.key.remoteJid;
  const reply = async (text, mentions = []) => {
    await sock.sendMessage(from, { text, mentions }, { quoted: msg });
  };

  switch (command) {
    case 'casar': {
      if (!mentioned || mentioned.length === 0) {
        return reply('⚠️ Você precisa marcar alguém para pedir em casamento! Exemplo: /casar @marcar');
      }
      
      const target = mentioned[0];
      if (target === sender) {
        return reply('⚠️ Você não pode se casar com você mesmo!');
      }

      if (db.casamentos[sender]) {
        const parceiro = db.casamentos[sender].parceiro;
        return reply(`⚠️ Você já está casado(a) com @${parceiro.split('@')[0]}! Se divorcie primeiro.`, [parceiro]);
      }

      if (db.casamentos[target]) {
        return reply(`⚠️ Essa pessoa já está casada com @${db.casamentos[target].parceiro.split('@')[0]}!`, [db.casamentos[target].parceiro]);
      }

      updateDatabase((d) => {
        d.pedidosCasamento[target] = sender;
      });

      return reply(`💍 @${sender.split('@')[0]} pediu @${target.split('@')[0]} em casamento!\n\nUse /aceitar ou /recusar para responder ao pedido.`, [sender, target]);
    }

    case 'aceitar': {
      const noivo = db.pedidosCasamento[sender];
      if (!noivo) {
        return reply('⚠️ Você não tem nenhum pedido de casamento pendente.');
      }

      // Validar se o noivo já não casou com outro no meio tempo
      if (db.casamentos[noivo]) {
        updateDatabase((d) => {
          delete d.pedidosCasamento[sender];
        });
        return reply('⚠️ O pedido expirou pois a pessoa já se casou com outro.');
      }

      updateDatabase((d) => {
        d.casamentos[sender] = { parceiro: noivo, since: Date.now() };
        d.casamentos[noivo] = { parceiro: sender, since: Date.now() };
        delete d.pedidosCasamento[sender];
      });

      return reply(`💍 Parabéns! @${sender.split('@')[0]} e @${noivo.split('@')[0]} agora estão casados! 🎉\nQue essa união seja repleta de felicidade!`, [sender, noivo]);
    }

    case 'recusar': {
      const noivo = db.pedidosCasamento[sender];
      if (!noivo) {
        return reply('⚠️ Você não tem nenhum pedido de casamento pendente.');
      }

      updateDatabase((d) => {
        delete d.pedidosCasamento[sender];
      });

      return reply(`💔 O pedido de casamento de @${noivo.split('@')[0]} foi recusado por @${sender.split('@')[0]}... Fica para a próxima!`, [noivo, sender]);
    }

    case 'divorcio': {
      if (!db.casamentos[sender]) {
        return reply('⚠️ Você não está casado(a).');
      }

      const parceiro = db.casamentos[sender].parceiro;

      updateDatabase((d) => {
        delete d.casamentos[sender];
        delete d.casamentos[parceiro];
      });

      return reply(`💔 Triste notícia! @${sender.split('@')[0]} e @${parceiro.split('@')[0]} se divorciaram... A vida segue.`, [sender, parceiro]);
    }

    case 'perfil': {
      const target = mentioned[0] || sender;
      const targetName = target.split('@')[0];
      const infoCasamento = db.casamentos[target];
      
      let status = 'Solteiro(a) 🍃';
      let mencoes = [];

      if (infoCasamento) {
        const parceiro = infoCasamento.parceiro;
        const tempo = formatDuration(Date.now() - infoCasamento.since);
        status = `Casado(a) com @${parceiro.split('@')[0]} há ${tempo} 💍`;
        mencoes.push(parceiro);
      }

      const strPerfil = `👤 *PERFIL DE USUÁRIO*\n\n` +
                        `• *Usuário:* @${targetName}\n` +
                        `• *Status:* ${status}`;
      
      mencoes.push(target);
      return reply(strPerfil, mencoes);
    }

    case 'gay': {
      const target = mentioned[0] || sender;
      const targetName = target.split('@')[0];
      // Gerar porcentagem aleatória
      const pct = Math.floor(Math.random() * 101);
      
      let desc = 'Hetero puro! 🥖';
      if (pct > 20) desc = 'Um pouquinho suspeito... 🤔';
      if (pct > 50) desc = 'Já está saindo do armário! 🌈';
      if (pct > 80) desc = 'Gay assumidíssimo! 🏳️‍🌈✨';

      return reply(`🏳️‍🌈 *TESTE GAY*\n\n@${targetName} é *${pct}%* gay!\nStatus: ${desc}`, [target]);
    }

    case 'romance': {
      if (!mentioned || mentioned.length === 0) {
        return reply('⚠️ Você precisa marcar alguém para calcular o romance! Exemplo: /romance @marcar');
      }

      const target = mentioned[0];
      if (target === sender) {
        return reply('⚠️ Você não pode calcular romance com você mesmo!');
      }

      // Gerar compatibilidade consistente baseada nos JIDs (para ser engraçado/fixo)
      const combined = (sender + target).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const pct = combined % 101;
      
      let msgRomance = '';
      if (pct < 20) msgRomance = 'Melhor continuarem apenas conhecidos... 🥶';
      else if (pct < 50) msgRomance = 'Amizade é o caminho seguro. 🤝';
      else if (pct < 80) msgRomance = 'Tem química! Rolaria um clima. 😏';
      else msgRomance = 'Almas gêmeas! Casamento à vista! 💍💖';

      return reply(`💖 *TESTE DE COMPATIBILIDADE* 💖\n\n` +
                   `• @${sender.split('@')[0]}\n` +
                   `• @${target.split('@')[0]}\n\n` +
                   `Compatibilidade: *${pct}%*\n\n${msgRomance}`, [sender, target]);
    }

    default:
      break;
  }
}
