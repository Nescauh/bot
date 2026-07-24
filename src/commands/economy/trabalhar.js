import { getUser, updateUser } from '../../database/sqlite.js';

const jobs = [
  'desenvolveu um bot para WhatsApp',
  'entregou pizzas pela cidade',
  'formatou o computador do vizinho',
  'vendeu pães de queijo na feira',
  'trabalhou como motorista de aplicativo',
  'prestou consultoria de TI'
];

export async function handleTrabalharCommand(sock, msg, sender) {
  const from = msg.key.remoteJid;
  const user = getUser(sender);
  const now = Date.now();
  const COOLDOWN = 60 * 60 * 1000; // 1 hora

  if (now - user.last_work < COOLDOWN) {
    const remaining = COOLDOWN - (now - user.last_work);
    const minutes = Math.floor(remaining / (1000 * 60));
    return sock.sendMessage(from, { text: `⏳ Você está cansado! Aguarde mais *${minutes} minutos* para trabalhar novamente.` }, { quoted: msg });
  }

  const earned = Math.floor(Math.random() * 300) + 150;
  const job = jobs[Math.floor(Math.random() * jobs.length)];
  const newWallet = user.wallet + earned;

  updateUser(sender, {
    wallet: newWallet,
    last_work: now
  });

  return sock.sendMessage(from, { text: `💼 Você *${job}* e ganhou *$${earned}* moedas!\n💵 *Novo saldo:* *$${newWallet}*` }, { quoted: msg });
}
