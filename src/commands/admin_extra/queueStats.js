import queueManager from '../../queue/QueueManager.js';

export async function handleQueueStatsCommand(sock, msg) {
  const from = msg.key.remoteJid;
  const stats = queueManager.getStats();

  const text = `📊 *QUEUE STATUS*\n\n` +
               `🔹 *Mensagens na fila:* ${stats.pendingMessages}\n` +
               `🔹 *Downloads pesados na fila:* ${stats.downloadsQueued}\n` +
               `🔹 *IA / Processamento na fila:* ${stats.iaQueued}\n` +
               `🔹 *Tempo médio entre envios:* ~${stats.avgDelay} (1.8s - 3.0s)\n` +
               `🔹 *Filas ativas (Grupos/PV):* ${stats.activeQueues}\n` +
               `🔹 *Fila ativa:* ${stats.isActive ? 'Sim' : 'Não'}`;

  await sock.sendMessage(from, { text }, { quoted: msg });
}
