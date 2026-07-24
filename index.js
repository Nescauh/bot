import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import { loadDatabase } from './src/database.js';
import { initSqlite } from './src/database/sqlite.js';
import { handleMessages } from './src/messageHandler.js';


// Marca o horário de início do bot
global.botStartTime = Date.now();

async function startBot() {
  // Carrega banco de dados local
  loadDatabase();
  initSqlite();
  console.log('📦 Bancos de dados carregados com sucesso!');

  // Define diretório de sessão para salvar as credenciais de autenticação
  const { state, saveCreds } = await useMultiFileAuthState('session');

  // Obtém a versão mais recente suportada do WhatsApp Web para evitar erros de handshake (como 405)
  let version;
  try {
    const latest = await fetchLatestBaileysVersion();
    version = latest.version;
    console.log(`🌐 Usando a versão do WhatsApp Web: v${version.join('.')}`);
  } catch (err) {
    console.warn('⚠️ Não foi possível buscar a versão mais recente do WA Web, usando padrão interno do Baileys.', err);
  }

  // Inicializa o socket do Baileys
  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }), // Mantém o console limpo de logs de debug internos
    browser: ['Série Bot', 'Chrome', '1.0.0'] // Define nome da sessão no celular do usuário
  });

  // Atualiza as credenciais sempre que houver mudança (ex: conexão estabelecida)
  sock.ev.on('creds.update', saveCreds);

  // Monitora alterações na conexão
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Se o QR Code estiver disponível no update, imprime ele no terminal e salva como imagem PNG
    if (qr) {
      console.log('\n✨ ESCANEIE O QR CODE ABAIXO COM O WHATSAPP DO SEU CELULAR:');
      qrcode.generate(qr, { small: true });
      console.log('Dica: Abra o WhatsApp > Configurações/Três Pontinhos > Dispositivos Conectados > Conectar um Dispositivo.\n');
      
      // Salva o QR Code como arquivo de imagem para evitar problemas de visualização em telas pequenas ou desconfigurações do terminal
      QRCode.toFile('./qrcode.png', qr, (err) => {
        if (err) {
          console.error('Erro ao salvar o QR Code em arquivo de imagem:', err);
        } else {
          console.log('📂 Um arquivo chamado "qrcode.png" foi gerado na pasta do seu bot de WhatsApp.');
          console.log('Caso o QR Code acima esteja cortado ou muito grande na sua tela, abra o arquivo "qrcode.png" que está na pasta do seu bot e escaneie o QR Code pela imagem!\n');
        }
      });
    }

    if (connection === 'close') {
      // Determina se deve tentar reconectar
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`🔌 Conexão fechada. Código: ${statusCode}. Reconectando: ${shouldReconnect}`);
      
      if (shouldReconnect) {
        // Tenta reconectar após 3 segundos
        setTimeout(() => startBot(), 3000);
      } else {
        console.log('❌ O bot foi desconectado pelo celular (desconectado do dispositivo). Escaneie o QR Code novamente para conectar.');
      }
    } else if (connection === 'open') {
      console.log('\n╔════════════════════════════════════════╗');
      console.log('║ 🤖 SERIE BOT CONECTADO COM SUCESSO!     ║');
      console.log('║                                        ║');
      console.log('║ Digite os comandos no WhatsApp para    ║');
      console.log('║ interagir com o bot.                   ║');
      console.log('╚════════════════════════════════════════╝\n');
    }
  });

  // Escuta novas mensagens recebidas
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type === 'notify') {
      for (const msg of m.messages) {
        try {
          await handleMessages(sock, msg);
        } catch (err) {
          console.error('Erro ao processar mensagem no loop principal:', err);
        }
      }
    }
  });
}

// Inicia o bot
startBot().catch(err => {
  console.error('Erro ao iniciar o bot:', err);
});
