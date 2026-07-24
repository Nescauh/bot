import os from 'os';

export async function handleBotinfoCommand(sock, msg) {
  const from = msg.key.remoteJid;
  const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
  const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
  const platform = os.platform();
  const cpus = os.cpus().length;

  const text = `📊 *ESTATÍSTICAS TÉCNICAS DO BOT*\n\n` +
               `💻 *Sistema Operacional:* ${platform}\n` +
               `🧠 *Uso de Memória RAM:* ${memoryUsage} MB / ${totalMem} GB\n` +
               `⚙️ *Processadores (Cores):* ${cpus} cores\n` +
               `🟢 *Node.js:* ${process.version}`;

  return sock.sendMessage(from, { text }, { quoted: msg });
}
