import assert from 'assert';
import databaseManager, { getUser, updateUser } from '../src/database/sqlite.js';
import { handleBankMarketCommands } from '../src/commands/bank_market.js';
import queueManager from '../src/queue/QueueManager.js';

class MockSocket {
  constructor() {
    this.sentMessages = [];
  }
  async sendMessage(jid, content, options) {
    this.sentMessages.push({ jid, content, timestamp: Date.now() });
    return { key: { id: 'MOCK_BANK_' + Math.random() } };
  }
}

async function runBankTests() {
  console.log('\n===============================================================');
  console.log('🧪 INICIANDO TESTES: /DEPOSITAR E /SACAR (BANCO)');
  console.log('===============================================================\n');

  await databaseManager.initialize();

  queueManager.minDelay = 5;
  queueManager.maxDelay = 10;

  const mockRawSock = new MockSocket();
  const mockSock = queueManager.wrapSocket(mockRawSock);

  const testUser = '5511977776666_' + Date.now() + '@s.whatsapp.net';

  // Configura saldo inicial: $50.000 na carteira, $0 no banco
  updateUser(testUser, {
    wallet: 50000,
    bank: 0,
    inventory: '[]',
    extra_data: JSON.stringify({})
  });

  const makeMsg = (text, cmdName = 'depositar') => {
    const parts = text.trim().split(/\s+/);
    const cmd = cmdName;
    const args = parts.slice(1);
    return {
      sockMsg: {
        key: { remoteJid: '120363000000000000@g.us', participant: testUser },
        message: { conversation: text }
      },
      command: cmd,
      args
    };
  };

  // ----------------------------------------------------
  // TESTE 1: /depositar com valor numérico
  // ----------------------------------------------------
  console.log('--- TESTE 1: /depositar 20000 ---');
  const t1 = makeMsg('/depositar 20000', 'depositar');
  await handleBankMarketCommands(mockSock, t1.sockMsg, t1.command, t1.args, testUser);

  let u = getUser(testUser);
  assert.strictEqual(u.wallet, 30000, 'Carteira deve ser $30.000');
  assert.strictEqual(u.bank, 20000, 'Banco deve ter $20.000');
  console.log('✅ TESTE 1 PASSOU: Depósito parcial efetuado com sucesso.');

  // ----------------------------------------------------
  // TESTE 2: /depositar tudo
  // ----------------------------------------------------
  console.log('\n--- TESTE 2: /depositar tudo ---');
  const t2 = makeMsg('/depositar tudo', 'depositar');
  await handleBankMarketCommands(mockSock, t2.sockMsg, t2.command, t2.args, testUser);

  u = getUser(testUser);
  assert.strictEqual(u.wallet, 0, 'Carteira deve estar zerada');
  assert.strictEqual(u.bank, 50000, 'Banco deve ter $50.000');
  console.log('✅ TESTE 2 PASSOU: /depositar tudo executado sem erro interno.');

  // ----------------------------------------------------
  // TESTE 3: /depositar tudo com carteira zerada
  // ----------------------------------------------------
  console.log('\n--- TESTE 3: /depositar tudo com saldo zero ---');
  const t3 = makeMsg('/depositar tudo', 'depositar');
  await handleBankMarketCommands(mockSock, t3.sockMsg, t3.command, t3.args, testUser);

  u = getUser(testUser);
  assert.strictEqual(u.wallet, 0);
  assert.strictEqual(u.bank, 50000);
  console.log('✅ TESTE 3 PASSOU: /depositar tudo com carteira vazia tratado com mensagem amigável.');

  // ----------------------------------------------------
  // TESTE 4: /sacar com valor parcial
  // ----------------------------------------------------
  console.log('\n--- TESTE 4: /sacar 15000 ---');
  const t4 = makeMsg('/sacar 15000', 'sacar');
  await handleBankMarketCommands(mockSock, t4.sockMsg, t4.command, t4.args, testUser);

  u = getUser(testUser);
  assert.strictEqual(u.wallet, 15000, 'Carteira deve ter $15.000');
  assert.strictEqual(u.bank, 35000, 'Banco deve ter $35.000');
  console.log('✅ TESTE 4 PASSOU: Saque parcial efetuado com sucesso.');

  // ----------------------------------------------------
  // TESTE 5: /sacar tudo
  // ----------------------------------------------------
  console.log('\n--- TESTE 5: /sacar tudo ---');
  const t5 = makeMsg('/sacar tudo', 'sacar');
  await handleBankMarketCommands(mockSock, t5.sockMsg, t5.command, t5.args, testUser);

  u = getUser(testUser);
  assert.strictEqual(u.wallet, 50000, 'Carteira deve ter recuperado $50.000');
  assert.strictEqual(u.bank, 0, 'Banco deve estar zerado');
  console.log('✅ TESTE 5 PASSOU: /sacar tudo executado sem erro interno.');

  // ----------------------------------------------------
  // TESTE 6: /sacar tudo com banco zerado
  // ----------------------------------------------------
  console.log('\n--- TESTE 6: /sacar tudo com banco zerado ---');
  const t6 = makeMsg('/sacar tudo', 'sacar');
  await handleBankMarketCommands(mockSock, t6.sockMsg, t6.command, t6.args, testUser);

  u = getUser(testUser);
  assert.strictEqual(u.bank, 0);
  console.log('✅ TESTE 6 PASSOU: /sacar tudo com banco vazio tratado com mensagem amigável.');

  console.log('\n===============================================================');
  console.log('🎉 TODOS OS TESTES DE BANCO (/DEPOSITAR E /SACAR) PASSARAM!');
  console.log('===============================================================\n');

  process.exit(0);
}

runBankTests().catch(err => {
  console.error('❌ ERRO DURANTE TESTES DE BANCO:', err);
  process.exit(1);
});
