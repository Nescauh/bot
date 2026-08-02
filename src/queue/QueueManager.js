import pino from 'pino';

export const Priority = {
  HIGH: 1,    // Erros, confirmações, avisos, QR code, logins
  NORMAL: 2,  // Mensagens comuns, IA, figurinhas, OCR
  LOW: 3      // Heavy downloads (/play, /video, etc.)
};

class QueueManager {
  constructor() {
    // Fila de Envio de Mensagens (sock.sendMessage) por Chat JID: Map<chatJid, Array<MessageTask>>
    this.messageQueues = new Map();
    this.isProcessingMessageMap = new Map();

    // Fila de Comandos Pesados (/play, /video, /ia, /tts, /ocr) por Chat JID: Map<chatJid, Array<HeavyTask>>
    this.heavyQueues = new Map();
    this.isProcessingHeavyMap = new Map();

    // Configuração de delay humanizado (1800ms a 3000ms, média ~2.5s)
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

  // --- FILA DE MENSAGENS (sock.sendMessage) ---
  enqueueMessage(chatJid, sendFn, priority = Priority.NORMAL) {
    if (!chatJid) chatJid = 'global';

    if (!this.messageQueues.has(chatJid)) {
      this.messageQueues.set(chatJid, []);
    }

    const queue = this.messageQueues.get(chatJid);

    const taskItem = {
      id: Date.now() + Math.random(),
      sendFn,
      priority,
      addedAt: Date.now()
    };

    this.stats.messagesQueued++;

    // Insere ordenado por prioridade (HIGH=1 > NORMAL=2 > LOW=3)
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

    this.processNextMessage(chatJid);
  }

  async processNextMessage(chatJid) {
    if (this.isProcessingMessageMap.get(chatJid)) {
      return;
    }

    const queue = this.messageQueues.get(chatJid);
    if (!queue || queue.length === 0) {
      this.messageQueues.delete(chatJid);
      this.isProcessingMessageMap.delete(chatJid);
      return;
    }

    this.isProcessingMessageMap.set(chatJid, true);

    while (queue.length > 0) {
      const currentTask = queue.shift();

      try {
        await currentTask.sendFn();
        this.stats.completedTasks++;
      } catch (err) {
        this.logErr('Erro no envio da mensagem enfileirada:', err);
      }

      if (queue.length > 0) {
        const delay = this.getRandomHumanDelay();
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.isProcessingMessageMap.set(chatJid, false);
    this.messageQueues.delete(chatJid);
  }

  // --- FILA DE COMANDOS PESADOS (/play, /video, /ia, /tts, /ocr) ---
  enqueueHeavyCommand(chatJid, commandName, taskFn) {
    if (!chatJid) chatJid = 'global';

    const lowerCmd = (commandName || '').toLowerCase();
    if (['play', 'video', 'tiktok', 'ttvideo', 'tiktokaudio', 'ig', 'insta', 'igvideo', 'igaudio'].includes(lowerCmd)) {
      this.stats.downloadsQueued++;
    } else if (['ia', 'tts', 'ocr', 'traduzir', 'resumir', 'explicar'].includes(lowerCmd)) {
      this.stats.iaQueued++;
    }

    if (!this.heavyQueues.has(chatJid)) {
      this.heavyQueues.set(chatJid, []);
    }

    const queue = this.heavyQueues.get(chatJid);

    return new Promise((resolve, reject) => {
      queue.push({
        commandName,
        taskFn,
        resolve,
        reject
      });

      this.log('Comando adicionado.');
      this.processNextHeavy(chatJid);
    });
  }

  async processNextHeavy(chatJid) {
    if (this.isProcessingHeavyMap.get(chatJid)) {
      return;
    }

    const queue = this.heavyQueues.get(chatJid);
    if (!queue || queue.length === 0) {
      this.heavyQueues.delete(chatJid);
      this.isProcessingHeavyMap.delete(chatJid);
      return;
    }

    this.isProcessingHeavyMap.set(chatJid, true);

    while (queue.length > 0) {
      const item = queue.shift();
      this.log('Iniciando processamento.');

      try {
        const result = await item.taskFn();
        this.log('Finalizado.');
        item.resolve(result);
      } catch (err) {
        this.logErr(`Erro ao processar comando pesado /${item.commandName}:`, err);
        this.log('Finalizado.');
        item.reject(err);
      }

      if (queue.length > 0) {
        this.log('Próximo da fila.');
      }
    }

    this.isProcessingHeavyMap.set(chatJid, false);
    this.heavyQueues.delete(chatJid);
  }

  // --- RETRY DE MENSAGENS BAILEYS ---
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

  sendMessage(sock, jid, content, options = {}, priority = null) {
    const prio = priority || (content?.text && (content.text.includes('erro') || content.text.includes('⚠️')) ? Priority.HIGH : Priority.NORMAL);
    return new Promise((resolve, reject) => {
      this.enqueueMessage(
        jid,
        async () => {
          try {
            const res = await this.sendWithRetry(sock, jid, content, options);
            resolve(res);
          } catch (err) {
            reject(err);
          }
        },
        prio
      );
    });
  }

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

  getStats() {
    let activeQueues = 0;
    let totalPendingMessages = 0;

    for (const [jid, q] of this.messageQueues.entries()) {
      if (q.length > 0) {
        activeQueues++;
        totalPendingMessages += q.length;
      }
    }
    for (const [jid, q] of this.heavyQueues.entries()) {
      if (q.length > 0) {
        if (!this.messageQueues.has(jid)) activeQueues++;
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
