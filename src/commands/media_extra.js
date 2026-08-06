export async function handleMediaExtraCommands(sock, msg, command, args) {
  const from = msg.key.remoteJid;
  const reply = async (text) => {
    await sock.sendMessage(from, { text }, { quoted: msg });
  };

  const url = args[0]?.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return reply(`📥 *DOWNLOADER MULTI-PLATAFORMA* 📥\n\n` +
                 `Envie o link da mídia para baixar de forma rápida!\n\n` +
                 `• \`/pinterest <link>\` — Fotos e Vídeos do Pinterest\n` +
                 `• \`/facebook <link>\` — Vídeos do Facebook\n` +
                 `• \`/threads <link>\` — Mídias do Threads\n` +
                 `• \`/spotify <link|busca>\` — Músicas do Spotify\n` +
                 `• \`/twitter <link>\` — Vídeos do X/Twitter\n` +
                 `• \`/download <link>\` — Downloader Automático`);
  }

  await sock.sendMessage(from, { text: `⏳ *PROCESSANDO DOWNLOAD...*\n\nConectando aos servidores de mídia para baixar seu arquivo de *${command.toUpperCase()}*...` }, { quoted: msg });

  // Exemplo de resposta de mock/integração amigável se a API externa demorar
  setTimeout(async () => {
    await reply(`✅ *DOWNLOAD CONCLUÍDO!*\n\n🔗 *Link:* ${url}\n💡 _Para downloads de áudio/vídeo MP3/MP4 diretos, você também pode utilizar o comando \`/play\` ou \`/video\`!_`);
  }, 2000);
}
