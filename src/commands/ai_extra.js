import { getUser, updateUser } from '../database/sqlite.js';
import { QUINTUPLETS } from '../interaction/PersonalityManager.js';
import { ContextManager } from '../interaction/ContextManager.js';

export const AI_MODES = {
  nino: {
    name: '🦋 Nino Nakano (Tsundere & Culinária)',
    desc: 'Direta, estilosa, protetora ferrenha e mestra na cozinha.'
  },
  miku: {
    name: '🎧 Miku Nakano (Tímida & Sengoku)',
    desc: 'Meiga, calma, sincera e apaixonada por história e generais de guerra.'
  },
  ichika: {
    name: '🎭 Ichika Nakano (Onee-san & Atriz)',
    desc: 'Irmã mais velha madura, provocadora charmosa e brincalhona.'
  },
  yotsuba: {
    name: '🍀 Yotsuba Nakano (Genki & Esportista)',
    desc: 'Hiperativa, alegre, positiva e sempre querendo ajudar com um sorriso.'
  },
  itsuki: {
    name: '⭐ Itsuki Nakano (Comilona & Estudiosa)',
    desc: 'Formal, educada, esforçada nos estudos e fã número 1 de boa comida.'
  },
  padrao: {
    name: '🤖 Assistente Padrão',
    desc: 'Assistente virtual simpático, direto e inteligente.'
  }
};

export async function handleAiExtraCommands(sock, msg, command, args, sender) {
  const from = msg.key.remoteJid;
  const reply = async (text) => {
    await sock.sendMessage(from, { text }, { quoted: msg });
  };

  const user = getUser(sender);
  let extraData = {};
  try {
    extraData = typeof user.extra_data === 'string' ? JSON.parse(user.extra_data || '{}') : (user.extra_data || {});
  } catch (_) {
    extraData = {};
  }

  // Atalhos diretos: /nino, /miku, /ichika, /yotsuba, /itsuki
  if (['nino', 'miku', 'ichika', 'yotsuba', 'itsuki'].includes(command)) {
    extraData.quintuplet = command;
    updateUser(sender, { extra_data: JSON.stringify(extraData) });
    const sister = QUINTUPLETS[command];
    return reply(`✨ *IRMÃ NAKANO SELECIONADA!* 🌸\n\n` +
                 `Agora a **${sister.name}** responderá diretamente você no privado e nos grupos!\n\n` +
                 `📜 *Sobre ela:* ${sister.title}\n` +
                 `💬 _"${sister.catchphrases[0]}"_`);
  }

  if (command === 'ia') {
    const sub = args[0]?.toLowerCase();

    // 1. Seleção direta de uma das quíntuplas: /ia nino, /ia miku, etc.
    if (['nino', 'miku', 'ichika', 'yotsuba', 'itsuki'].includes(sub)) {
      extraData.quintuplet = sub;
      updateUser(sender, { extra_data: JSON.stringify(extraData) });
      const sister = QUINTUPLETS[sub];
      return reply(`✨ *IRMÃ NAKANO SELECIONADA!* 🌸\n\n` +
                   `Agora a **${sister.name}** responderá você!\n\n` +
                   `📜 *Título:* ${sister.title}\n` +
                   `💬 *Frase Marcante:* _"${sister.catchphrases[0]}"_`);
    }

    // 2. Menu das Quíntuplas: /ia irmas ou /ia quintuplets
    if (['irmas', 'irmãs', 'quintuplets', 'personagens', 'nakano'].includes(sub)) {
      const active = extraData.quintuplet || 'nino';
      const text = `🌸 *AS 5 IRMÃS NAKANO (QUINTUPLETS)* 🌸\n\n` +
                   `Escolha com qual irmã você deseja conversar:\n\n` +
                   `🦋 \`/ia nino\` ➔ **Nino Nakano**\n` +
                   `  _${QUINTUPLETS.nino.title}_\n\n` +
                   `🎧 \`/ia miku\` ➔ **Miku Nakano**\n` +
                   `  _${QUINTUPLETS.miku.title}_\n\n` +
                   `🎭 \`/ia ichika\` ➔ **Ichika Nakano**\n` +
                   `  _${QUINTUPLETS.ichika.title}_\n\n` +
                   `🍀 \`/ia yotsuba\` ➔ **Yotsuba Nakano**\n` +
                   `  _${QUINTUPLETS.yotsuba.title}_\n\n` +
                   `⭐ \`/ia itsuki\` ➔ **Itsuki Nakano**\n` +
                   `  _${QUINTUPLETS.itsuki.title}_\n\n` +
                   `━━━━━━━━━━━━━━━━━━━━\n` +
                   `💡 *Irmã Ativa no seu Perfil:* **${QUINTUPLETS[active]?.name || 'Nino Nakano'}**\n` +
                   `💬 _No privado ou no grupo, você pode chamá-la pelo nome a qualquer momento!_`;
      return reply(text);
    }

    // 3. /ia modo <opção>
    if (sub === 'modo' || sub === 'personality' || sub === 'estilo') {
      const selectedMode = args[1]?.toLowerCase();

      if (!selectedMode || !AI_MODES[selectedMode]) {
        let modesList = Object.keys(AI_MODES).map(m => `• \`/ia modo ${m}\` — ${AI_MODES[m].name}`).join('\n');
        return reply(`🧠 *SELEÇÃO DE PERSONALIDADE DA IA* 🧠\n\n` +
                     `Escolha como deseja que a IA converse com você:\n\n${modesList}\n\n` +
                     `💡 *Modo Atual:* ${AI_MODES[extraData.quintuplet || extraData.ai_mode || 'nino']?.name}`);
      }

      extraData.quintuplet = selectedMode;
      updateUser(sender, { extra_data: JSON.stringify(extraData) });

      return reply(`✨ *PERSONALIDADE ALTERADA!*\n\nAgora a IA responderá você no modo: *${AI_MODES[selectedMode].name}*! 🚀`);
    }

    // 4. /ia lembra <fato>
    if (sub === 'lembra' || sub === 'lembrar' || sub === 'memorizar') {
      const fact = args.slice(1).join(' ').trim();
      if (!fact) {
        return reply('⚠️ Diga o que deseja que as irmãs lembrem sobre você.\nExemplo: `/ia lembra que minha comida favorita é bolo de chocolate` ou `/ia lembra que eu toco violão`');
      }

      ContextManager.addUserFact(sender, fact);

      const active = extraData.quintuplet || 'nino';
      const charName = QUINTUPLETS[active]?.nickname || 'Nino';

      return reply(`🧠 *MEMÓRIA GRAVADA COM SUCESSO!* ✨\n\n` +
                   `${charName} anotou na memória:\n` +
                   `📝 _"${fact}"_\n\n` +
                   `Ela lembrará disso nas conversas futuras com você!`);
    }

    // 5. /ia memorias
    if (sub === 'memoria' || sub === 'memorias') {
      const memories = ContextManager.getUserFacts(sender);
      if (memories.length === 0) {
        return reply('🧠 *MEMÓRIA DAS QUINTUPLETS*\n\nAinda não tenho memórias salvas sobre você. Diga algo nas conversas ou use `/ia lembra <fato>` para me ensinar!');
      }

      const listStr = memories.map((m, i) => `${i + 1}. ${m}`).join('\n');
      return reply(`🧠 *SUAS MEMÓRIAS SALVAS NA IA* 🧠\n\n${listStr}\n\n💡 _Para adicionar mais, use \`/ia lembra <fato>\`_`);
    }

    // 6. /ia esquecer
    if (sub === 'esquecer' || sub === 'limparmemoria') {
      extraData.ai_memory = [];
      updateUser(sender, { extra_data: JSON.stringify(extraData) });
      return reply('🗑️ *MEMÓRIA LIMPA!* Esqueci todos os fatos que havia gravado sobre você no banco de dados.');
    }
  }
}
