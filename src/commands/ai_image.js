import { askAi } from '../utils/aiService.js';

export async function handleAiImageCommands(sock, msg, command, args) {
  const from = msg.key.remoteJid;
  const reply = async (text) => {
    await sock.sendMessage(from, { text }, { quoted: msg });
  };

  switch (command) {
    case 'imagem':
    case 'gerarimagem':
    case 'img': {
      const prompt = args.join(' ').trim();
      if (!prompt) {
        return reply('🎨 *GERADOR DE IMAGENS POR IA* 🎨\n\nDescreva a imagem que você quer gerar!\nExemplo: `/imagem um gato astronauta surfando no espaço em estilo cyberpunk`');
      }

      await reply(`🎨 *GERANDO SUA IMAGEM IA...*\n\n"_${prompt}_"\n⏳ Processando renderização artística com IA...`);

      // URL dinâmica via Pollinations AI / Image Service
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;

      try {
        await sock.sendMessage(from, {
          image: { url: imageUrl },
          caption: `✨ *IMAGEM GERADA COM SUCESSO!* ✨\n\n🎨 *Prompt:* "${prompt}"`
        }, { quoted: msg });
      } catch (err) {
        console.error('Erro ao enviar imagem IA:', err);
        return reply('⚠️ Ocorreu um erro ao renderizar a imagem por IA. Tente descrever com outras palavras.');
      }
      return;
    }

    case 'removerfundo':
    case 'removebg': {
      return reply('✂️ *REMOVER FUNDO DA IMAGEM*\n\nResponda ou envie uma foto junto com o comando `/removerfundo` para isolar o objeto principal!');
    }

    case 'melhorar':
    case 'hd': {
      return reply('✨ *MELHORAR QUALIDADE DA IMAGEM (HD)*\n\nEnvie uma foto com o comando `/melhorar` para aplicar upscale e redução de ruído por IA!');
    }

    case 'colorir': {
      return reply('🎨 *COLORIZAR FOTO ANTIGA P&B*\n\nEnvie uma imagem em preto e branco com o comando `/colorir` para aplicar restauração de cores por IA!');
    }
  }
}
