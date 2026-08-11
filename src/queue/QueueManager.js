import pino from 'pino';

export const Priority = {
  HIGH: 1,    // Erros, confirmações, avisos, QR code, logins
  NORMAL: 2,  // Mensagens comuns, IA, figurinhas, OCR
  LOW: 3      // Heavy downloads (/play, /video, etc.)
};

class QueueManager {
  constructor() {
    // Fila Única Global de Envio de Mensagens (sock.sendMessage)
    this.globalMessageQueue = [];
    this.isProcessingGlobalMessage = false;

    // Fila de Comandos Pesados (/play, /video, /ia, /tts, /ocr) por Chat JID: Map<chatJid, Array<HeavyTask>>
    this.heavyQueues = new Map();
    this.isProcessingHeavyMap = new Map();

    // Configuração de delay humanizado (2000ms a 3000ms, 2.0s a 3.0s)
    this.minDelay = 2000;
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

  log(msg) {
    console.log(`[QUEUE] ${msg}`);
  }

  logErr(msg, err) {
    console.error(`[QUEUE ERROR] ${msg}`, err || '');
  }

  // Obtém intervalo humanizado aleatório entre 2000ms e 3000ms
  getRandomHumanDelay() {
    const min = Math.max(0, this.minDelay);
    const max = Math.max(min, this.maxDelay);
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    this.stats.totalDelayMs += delay;
    this.stats.delaySamples += 1;
    return delay;
  }

  // --- FILA GLOBAL DE MENSAGENS (sock.sendMessage) ---
  enqueueMessage(chatJid, sendFn, priority = Priority.NORMAL) {
    const taskItem = {
      id: Date.now() + Math.random(),
      chatJid: chatJid || 'global',
      sendFn,
      priority,
      addedAt: Date.now()
    };

    this.stats.messagesQueued++;
    this.log('Mensagem adicionada');

    // Insere mantendo a ordem FIFO e a prioridade se necessário
    let inserted = false;
    for (let i = 0; i < this.globalMessageQueue.length; i++) {
      if (taskItem.priority < this.globalMessageQueue[i].priority) {
        this.globalMessageQueue.splice(i, 0, taskItem);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.globalMessageQueue.push(taskItem);
    }

    this.processGlobalQueue();
  }

  async processGlobalQueue() {
    if (this.isProcessingGlobalMessage) {
      return;
    }

    this.isProcessingGlobalMessage = true;

    while (this.globalMessageQueue.length > 0) {
      const currentTask = this.globalMessageQueue.shift();

      const delay = this.getRandomHumanDelay();
      this.log(`Aguardando ${delay}ms`);
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      try {
        await currentTask.sendFn();
        this.stats.completedTasks++;
        this.log('Mensagem enviada');
      } catch (err) {
        this.logErr('Erro ao enviar mensagem', err);
      }
    }

    this.isProcessingGlobalMessage = false;
  }

  // --- FILA SEPARADA DE COMANDOS PESADOS (/play, /video, /ia, /tts, /ocr) ---
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

      this.log(`Comando pesado /${commandName} adicionado para execução.`);
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
      try {
        const result = await item.taskFn();
        item.resolve(result);
      } catch (err) {
        this.logErr(`Erro ao processar comando pesado /${item.commandName}:`, err);
        item.reject(err);
      }
    }

    this.isProcessingHeavyMap.set(chatJid, false);
    this.heavyQueues.delete(chatJid);
  }

  // --- RETRY DE MENSAGENS BAILEYS ---
  async sendWithRetry(sock, jid, content, options, customDelays = [2000, 4000, 8000]) {
    const rawSock = sock._rawSock || sock;
    const delays = customDelays;
    let attempt = 0;

    while (attempt <= delays.length) {
      try {
        const result = await rawSock.sendMessage(jid, content, options);
        return result;
      } catch (err) {
        attempt++;
        if (attempt <= delays.length) {
          const retryDelay = delays[attempt - 1];
          console.warn(`[QUEUE RETRY] Falha no envio para ${jid}. Tentativa ${attempt}/${delays.length}. Aguardando ${retryDelay / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          this.logErr('Falha definitiva ao enviar mensagem.', err);
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
    if (!sock) return sock;
    if (sock._isQueueWrapped) return sock;

    const self = this;
    const wrapped = Object.create(sock);
    const rawSock = sock._rawSock || sock;

    wrapped.sendMessage = function (jid, content, options = {}) {
      return self.sendMessage(rawSock, jid, content, options);
    };

    wrapped._isQueueWrapped = true;
    wrapped._rawSock = rawSock;
    return wrapped;
  }

  getStats() {
    const avgDelay = this.stats.delaySamples > 0 
      ? (this.stats.totalDelayMs / this.stats.delaySamples / 1000).toFixed(1)
      : '2.5';

    return {
      messagesQueued: this.stats.messagesQueued,
      downloadsQueued: this.stats.downloadsQueued,
      iaQueued: this.stats.iaQueued,
      pendingMessages: this.globalMessageQueue.length,
      avgDelay: `${avgDelay}s`,
      isActive: true
    };
  }
}

export const queueManager = new QueueManager();
export default queueManager;
