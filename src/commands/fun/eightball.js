export async function handleEightBallCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  const question = args.join(' ');

  if (!question) {
    return sock.sendMessage(from, { text: '⚠️ Faça uma pergunta para a Bola 8 Mágica! Ex: `/8ball Eu vou ficar rico?`' }, { quoted: msg });
  }

  const responses = [
    'Com certeza!',
    'Decididamente sim.',
    'Sem dúvidas.',
    'Com certeza sim.',
    'Pode contar com isso.',
    'A meu ver, sim.',
    'Provavelmente.',
    'Perspectiva boa.',
    'Sim.',
    'Sinais apontam que sim.',
    'Resposta nebulosa, tente de novo.',
    'Pergunte novamente mais tarde.',
    'Melhor não te dizer agora.',
    'Não posso prever agora.',
    'Concentre-se e pergunte novamente.',
    'Não conte com isso.',
    'Minha resposta é não.',
    'Minhas fontes dizem não.',
    'Perspectiva não é muito boa.',
    'Muito duvidoso.'
  ];

  const answer = responses[Math.floor(Math.random() * responses.length)];

  return sock.sendMessage(from, { 
    text: `🎱 *BOLA 8 MÁGICA*\n\n❓ *Pergunta:* ${question}\n🔮 *Resposta:* ${answer}` 
  }, { quoted: msg });
}
