import { getUser, updateUser } from '../database/sqlite.js';

export const AI_MODES = {
  anime: {
    name: '🎌 Mode Anime / Otaku',
    system: 'Você é um personagem de anime entusiasmado, usando expressões como "Nani?!", "Sugoi!", "Dattebayo!", e agindo como um protagonista de shonen épico e engraçado. Responda em português do Brasil.'
  },
  professor: {
    name: '👨‍🏫 Modo Professor Erudito',
    system: 'Você é um professor acadêmico sábio, extremamente elegante, usando vocabulário rico, explicações didáticas e um toque de ironia refinada. Responda em português do Brasil.'
  },
  engracado: {
    name: '🤡 Modo Comediante / Zueira',
    system: 'Você é um comediante brasileiro de stand-up extremamente sarcástico, zombadeiro e usando gírias atuais de internet. Faça piadas leves e seja muito engraçado. Responda em português do Brasil.'
  },
  psicologo: {
    name: '🧠 Modo Psicólogo Empático',
    system: 'Você é um terapeuta e psicólogo empático, calmo, acolhedor e atencioso. Ouça os sentimentos do usuário e dê conselhos reconfortantes e construtivos. Responda em português do Brasil.'
  },
  padrao: {
    name: '🤖 Modo Padrão',
    system: 'Você é o SUBARU BOT, um assistente virtual útil, inteligente, rápido e amigável para WhatsApp.'
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

  if (command === 'ia') {
    const sub = args[0]?.toLowerCase();

    if (sub === 'modo' || sub === 'personality' || sub === 'estilo') {
      const selectedMode = args[1]?.toLowerCase();

      if (!selectedMode || !AI_MODES[selectedMode]) {
        let modesList = Object.keys(AI_MODES).map(m => `• \`/ia modo ${m}\` — ${AI_MODES[m].name}`).join('\n');
        return reply(`🧠 *SELEÇÃO DE PERSONALIDADE DA IA* 🧠\n\n` +
                     `Escolha como deseja que a IA converse com você:\n\n${modesList}\n\n` +
                     `💡 *Modo Atual:* ${AI_MODES[extraData.ai_mode || 'padrao']?.name}`);
      }

      extraData.ai_mode = selectedMode;
      updateUser(sender, { extra_data: JSON.stringify(extraData) });

      return reply(`✨ *PERSONALIDADE ALTERADA!*\n\nAgora a IA responderá você no modo: *${AI_MODES[selectedMode].name}*! 🚀`);
    }

    if (sub === 'lembra' || sub === 'lembrar' || sub === 'memorizar') {
      const fact = args.slice(1).join(' ').trim();
      if (!fact) {
        return reply('⚠️ Diga o que deseja que a IA lembre sobre você.\nExemplo: `/ia lembra que meu aniversário é em maio` ou `/ia lembra que meu nome é Samuel`');
      }

      if (!extraData.ai_memory) extraData.ai_memory = [];
      extraData.ai_memory.push(fact);
      // Manter no máximo 15 memórias recentes por usuário
      if (extraData.ai_memory.length > 15) extraData.ai_memory.shift();

      updateUser(sender, { extra_data: JSON.stringify(extraData) });

      return reply(`🧠 *MEMÓRIA GRAVADA!*\n\nAnotado em meu banco de dados: _"${fact}"_\nVocê pode me perguntar sobre isso a qualquer momento!`);
    }

    if (sub === 'memoria' || sub === 'memorias') {
      const memories = extraData.ai_memory || [];
      if (memories.length === 0) {
        return reply('🧠 *MEMÓRIA DA IA*\n\nAinda não tenho memórias salvas sobre você. Use `/ia lembra <fato>` para me ensinar algo!');
      }

      const listStr = memories.map((m, i) => `${i + 1}. ${m}`).join('\n');
      return reply(`🧠 *SUAS MEMÓRIAS SALVAS NA IA* 🧠\n\n${listStr}\n\n💡 _Para adicionar mais, use /ia lembra <fato>_`);
    }

    if (sub === 'esquecer' || sub === 'limparmemoria') {
      extraData.ai_memory = [];
      updateUser(sender, { extra_data: JSON.stringify(extraData) });
      return reply('🗑️ *MEMÓRIA LIMPA!* Esqueci todos os fatos que havia gravado sobre você.');
    }
  }
}
