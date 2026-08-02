import pino from 'pino';

export const Priority = {
  HIGH: 1,    // Erros, confirmações, avisos, QR code, logins
  NORMAL: 2,  // Mensagens comuns, IA, figurinhas, OCR
  LOW: 3      // Heavy downloads (/play, /video, etc.)
};

class QueueManager {
  constructor() {
    // Filas isoladas por Chat JID: Map<chatJid, Array<TaskItem>>
    this.chatQueues = new Map();
    // Estado de processamento por Chat JID: Map<chatJid, boolean>
    this.isProcessingMap = new Map();

    // Configuração de delay humanizado (padrão 1800ms a 3000ms, média ~2.5s)
    this.minDelay = 1800;
    this.maxDelay = 3000;

    // Métricas estatísticas
    this.stats = {
      messagesQueued: 0,
      downloadsQueued: 0,
      iaQueued: 0,
      completedTasks: 0,
      totalDelayMs: 0,
      delaySamples: 0
    };
  }

  // Helper de log padronizado
  log(msg) {
    console.log(`[QUEUE]\n${msg}`);
  }

  logErr(msg, err) {
    console.error(`[QUEUE ERROR] ${msg}`, err || '');
  }

  // Obtém intervalo humanizado aleatório entre minDelay e maxDelay
  getRandomHumanDelay() {
    const min = Math.max(0, this.minDelay);
    const max = Math.max(min, this.maxDelay);
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    this.stats.totalDelayMs += delay;
    this.stats.delaySamples += 1;
    return delay;
  }

  // Determina a prioridade baseada no comando ou conteúdo
  determinePriority(commandName, content) {
    if (!commandName && content?.text) {
      const lower = content.text.toLowerCase();
      if (lower.includes('erro') || lower.includes('⚠️') || lower.includes('🚫') || lower.includes('confirmac') || lower.includes('qr code')) {
        return Priority.HIGH;
      }
    }

    const cmd = (commandName || '').toLowerCase();
    if (['play', 'video', 'tiktok', 'ttvideo', 'tiktokaudio', 'ig', 'insta', 'igvideo', 'igaudio'].includes(cmd)) {
      return Priority.LOW;
    }
    if (['ia', 'tts', 'ocr', 'traduzir', 'resumir', 'explicar', 'sticker', 'unsticker'].includes(cmd)) {
      return Priority.NORMAL;
    }
    return Priority.NORMAL;
  }

  // Adiciona uma tarefa à fila de um determinado chatJid
  enqueue(chatJid, taskFn, priority = Priority.NORMAL, category = 'message') {
    if (!chatJid) chatJid = 'global';

    if (!this.chatQueues.has(chatJid)) {
      this.chatQueues.set(chatJid, []);
    }

    const queue = this.chatQueues.get(chatJid);

    const taskItem = {
      id: Date.now() + Math.random(),
      taskFn,
      priority,
      category,
      addedAt: Date.now()
    };

    // Atualiza contadores globais de estatísticas
    if (category === 'download') this.stats.downloadsQueued++;
    else if (category === 'ia') this.stats.iaQueued++;
    else this.stats.messagesQueued++;

    // Insere ordenando por prioridade (HIGH > NORMAL > LOW), mantendo FIFO para prioridades iguais
    let inserted = false;
    for (let i = 0; i < queue.length; i++) {
      if (taskItem.priority < queue[i].priority) {
        queue.splice(i, 0, taskItem);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      queue.push(taskItem);
    }

    this.log('Comando adicionado.');

    // Dispara o loop de processamento para esse chat se ainda não estiver rodando
    this.processNext(chatJid);
  }

  // Processa itens da fila de um chat específico sequencialmente (FIFO por prioridade)
  async processNext(chatJid) {
    if (this.isProcessingMap.get(chatJid)) {
      return; // Já existe um loop rodando para este chat
    }

    const queue = this.chatQueues.get(chatJid);
    if (!queue || queue.length === 0) {
      this.chatQueues.delete(chatJid);
      this.isProcessingMap.delete(chatJid);
      return;
    }

    this.isProcessingMap.set(chatJid, true);

    while (queue.length > 0) {
      const currentTask = queue.shift();
      this.log('Iniciando processamento.');

      try {
        await currentTask.taskFn();
        this.stats.completedTasks++;
        this.log('Finalizado.');
      } catch (err) {
        this.logErr('Erro na execução da tarefa da fila:', err);
      }

      // Aplica intervalo humanizado se houver mais itens para este chat
      if (queue.length > 0) {
        this.log('Próximo da fila.');
        const delay = this.getRandomHumanDelay();
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.isProcessingMap.set(chatJid, false);
    this.chatQueues.delete(chatJid);
  }

  // Executa envio de mensagem Baileys com Retry Automático (2s, 4s, 8s)
  async sendWithRetry(sock, jid, content, options, customDelays = [2000, 4000, 8000]) {
    const delays = customDelays;
    let attempt = 0;

    while (attempt <= delays.length) {
      try {
        const result = await sock.sendMessage(jid, content, options);
        return result;
      } catch (err) {
        attempt++;
        if (attempt <= delays.length) {
          const retryDelay = delays[attempt - 1];
          console.warn(`[QUEUE RETRY] Falha no envio para ${jid}. Tentativa ${attempt}/${delays.length}. Aguardando ${retryDelay / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          this.log('Falha definitiva.');
          throw err;
        }
      }
    }
  }

  // Submete um envio de mensagem para a fila do chat
  sendMessage(sock, jid, content, options = {}, priority = null) {
    const prio = priority || this.determinePriority(null, content);
    return new Promise((resolve, reject) => {
      this.enqueue(
        jid,
        async () => {
          try {
            const res = await this.sendWithRetry(sock, jid, content, options);
            resolve(res);
          } catch (err) {
            reject(err);
          }
        },
        prio,
        'message'
      );
    });
  }

  // Submete um comando pesado (/play, /video, /tts, /ia, /ocr) para a fila do chat
  enqueueHeavyCommand(chatJid, commandName, taskFn) {
    const lowerCmd = (commandName || '').toLowerCase();
    let category = 'message';
    if (['play', 'video', 'tiktok', 'ttvideo', 'tiktokaudio', 'ig', 'insta', 'igvideo', 'igaudio'].includes(lowerCmd)) {
      category = 'download';
    } else if (['ia', 'tts', 'ocr', 'traduzir', 'resumir', 'explicar'].includes(lowerCmd)) {
      category = 'ia';
    }

    const priority = this.determinePriority(lowerCmd);

    return new Promise((resolve, reject) => {
      this.enqueue(
        chatJid,
        async () => {
          try {
            const res = await taskFn();
            resolve(res);
          } catch (err) {
            // Em caso de falha no comando, captura para não travar a fila
            reject(err);
          }
        },
        priority,
        category
      );
    });
  }

  // Wrapper para o Socket do Baileys para interceptar sock.sendMessage transparentemente
  wrapSocket(sock) {
    if (sock._isQueueWrapped) return sock;

    const self = this;
    const wrapped = Object.create(sock);

    wrapped.sendMessage = function (jid, content, options = {}) {
      return self.sendMessage(sock, jid, content, options);
    };

    wrapped._isQueueWrapped = true;
    return wrapped;
  }

  // Métricas para o comando /queue
  getStats() {
    let activeQueues = 0;
    let totalPendingMessages = 0;

    for (const [jid, q] of this.chatQueues.entries()) {
      if (q.length > 0) {
        activeQueues++;
        totalPendingMessages += q.length;
      }
    }

    const avgDelay = this.stats.delaySamples > 0 
      ? (this.stats.totalDelayMs / this.stats.delaySamples / 1000).toFixed(1)
      : '2.5';

    return {
      messagesQueued: this.stats.messagesQueued,
      downloadsQueued: this.stats.downloadsQueued,
      iaQueued: this.stats.iaQueued,
      pendingMessages: totalPendingMessages,
      activeQueues,
      avgDelay: `${avgDelay}s`,
      isActive: true
    };
  }
}

export const queueManager = new QueueManager();
export default queueManager;
