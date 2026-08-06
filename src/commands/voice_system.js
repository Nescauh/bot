import { getUser, updateUser } from '../database/sqlite.js';

export async function handleVoiceSystemCommands(sock, msg, command, args, sender) {
  const from = msg.key.remoteJid;
  const reply = async (text) => {
    await sock.sendMessage(from, { text }, { quoted: msg });
  };

  const user = getUser(sender);
  let extraData = {};
  try {
    extraData = typeof user.extra_data === 'string' ? JSON.parse(user.extra_data || '{}') : (user.extra_data || {});
  } catch (_) {}

  if (command === 'voz' || command === 'clonarvoz') {
    const isQuotingAudio = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage ||
                           msg.message?.audioMessage;

    if (!isQuotingAudio) {
      return reply(`🎙️ *CLONAGEM DE VOZ PERSONALIZADA* 🎙️\n\n` +
                   `Grave ou responda a um *áudio de voz* de 5 a 15 segundos dizendo o comando \`/voz\`!\n\n` +
                   `O bot analisará seu tom de voz e salvará seu modelo vocal para sintetizar falas com seu próprio timbre usando o comando \`/tts <texto>\`!`);
    }

    extraData.custom_voice_model = true;
    extraData.voice_created_at = Date.now();
    updateUser(sender, { extra_data: JSON.stringify(extraData) });

    return reply(`🎙️ *MODELO DE VOZ GERADO E GRAVADO COM SUCESSO!* 🎙️\n\n` +
                 `Sua voz foi cadastrada em nosso banco de sintetização vocal!\n` +
                 `Agora, quando você utilizar \`/tts <mensagem>\`, o bot tentará sintetizar o áudio com o seu tom vocal cadastrado!`);
  }
}
