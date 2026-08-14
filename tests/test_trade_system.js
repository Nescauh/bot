import assert from 'assert';
import databaseManager, { getUser, updateUser } from '../src/database/sqlite.js';
import { handleTradeCommands, tradeSessions, userToSessionMap } from '../src/commands/trade_system.js';
import { getKingdomData } from '../src/commands/kingdom_system.js';
import queueManager from '../src/queue/QueueManager.js';

class MockSocket {
  constructor() {
    this.sentMessages = [];
  }
  async sendMessage(jid, content, options) {
    this.sentMessages.push({ jid, content, timestamp: Date.now() });
    return { key: { id: 'MOCK_TRADE_' + Math.random() } };
  }
}

async function runTradeTests() {
  console.log('\n===============================================================');
  console.log('🧪 INICIANDO SUÍTE DE TESTES: SISTEMA DE TROCAS (TRADE SYSTEM)');
  console.log('===============================================================\n');

  await databaseManager.initialize();

  queueManager.minDelay = 5;
  queueManager.maxDelay = 10;

  const mockRawSock = new MockSocket();
  const mockSock = queueManager.wrapSocket(mockRawSock);

  const ts = Date.now();
  const userA = `5511900001111_${ts}@s.whatsapp.net`;
  const userB = `5511900002222_${ts}@s.whatsapp.net`;

  // Configuração inicial do Usuário A (Reino + Inventário + Carteira)
  const kdDataA = {
    name: 'Reino do Norte',
    level: 1,
    population: 50,
    treasury: 50000,
    resources: { food: 500, wood: 1000, stone: 500, iron: 800 },
    buildings: { town_center: 1, houses: 1, farms: 1, mines: 1, markets: 1, barracks: 1, walls: 1 },
    workers: { farmer: 10, lumberjack: 10, miner: 10, merchant: 10, soldier: 0 },
    army: { soldiers: 10, equipment_level: 1, generals: [] }
  };

  updateUser(userA, {
    wallet: 50000,
    bank: 0,
    inventory: JSON.stringify(['🍬 Rare Candy', '🍬 Rare Candy', '🗡️ Adaga de Aço']),
    extra_data: JSON.stringify({ kingdom: kdDataA })
  });

  // Configuração inicial do Usuário B (Reino + Inventário + Carteira)
  const kdDataB = {
    name: 'Império do Sul',
    level: 1,
    population: 50,
    treasury: 30000,
    resources: { food: 1200, wood: 400, stone: 600, iron: 100 },
    buildings: { town_center: 1, houses: 1, farms: 1, mines: 1, markets: 1, barracks: 1, walls: 1 },
    workers: { farmer: 10, lumberjack: 10, miner: 10, merchant: 10, soldier: 0 },
    army: { soldiers: 10, equipment_level: 1, generals: [] }
  };

  updateUser(userB, {
    wallet: 30000,
    bank: 0,
    inventory: JSON.stringify(['🍕 Pizza Infinita', '🔮 Amuleto da Sorte Místico']),
    extra_data: JSON.stringify({ kingdom: kdDataB })
  });

  // Limpa sessões em memória
  tradeSessions.clear();
  userToSessionMap.clear();

  const makeMsg = (text, senderJid, mentions = []) => {
    const parts = text.trim().split(/\s+/);
    const cmd = parts[0].replace('/', '').toLowerCase();
    const args = parts.slice(1);
    return {
      sockMsg: {
        key: { remoteJid: '120363000000000000@g.us', participant: senderJid },
        message: {
          conversation: text,
          extendedTextMessage: { contextInfo: { mentionedJid: mentions } }
        }
      },
      command: cmd,
      args,
      mentions
    };
  };

  // ----------------------------------------------------
  // TESTE 1: Bloqueio de auto-troca
  // ----------------------------------------------------
  console.log('--- TESTE 1: Bloqueio de auto-troca ---');
  const t1 = makeMsg('/trocar @5511900001111', userA, [userA]);
  await handleTradeCommands(mockSock, t1.sockMsg, t1.command, t1.args, userA, t1.mentions);
  assert.strictEqual(userToSessionMap.has(userA), false, 'Não deve criar sessão consigo mesmo');
  console.log('✅ TESTE 1 PASSOU: Auto-troca bloqueada com sucesso.');

  // ----------------------------------------------------
  // TESTE 2: Propor troca válida
  // ----------------------------------------------------
  console.log('\n--- TESTE 2: Propor troca válida ---');
  const t2 = makeMsg('/trocar @5511900002222', userA, [userB]);
  await handleTradeCommands(mockSock, t2.sockMsg, t2.command, t2.args, userA, t2.mentions);
  assert.strictEqual(userToSessionMap.has(userA), true, 'User A deve estar na sessão');
  assert.strictEqual(userToSessionMap.has(userB), true, 'User B deve estar na sessão');
  const s2 = tradeSessions.get(userToSessionMap.get(userA));
  assert.strictEqual(s2.status, 'pending');
  console.log('✅ TESTE 2 PASSOU: Proposta de troca enviada e registrada.');

  // ----------------------------------------------------
  // TESTE 3: Aceitar troca
  // ----------------------------------------------------
  console.log('\n--- TESTE 3: Aceitar troca recebida ---');
  const t3 = makeMsg('/trocar aceitar', userB);
  await handleTradeCommands(mockSock, t3.sockMsg, t3.command, t3.args, userB, []);
  const s3 = tradeSessions.get(userToSessionMap.get(userA));
  assert.strictEqual(s3.status, 'negotiating', 'Status deve mudar para negotiating');
  console.log('✅ TESTE 3 PASSOU: Troca aceita e iniciada.');

  // ----------------------------------------------------
  // TESTE 4: Ofertar recursos do Reino
  // ----------------------------------------------------
  console.log('\n--- TESTE 4: Ofertar recursos de reino (Ferro, Madeira, Comida) ---');
  // User A oferta 300 ferro e 200 madeira
  const t4a = makeMsg('/trocar adicionar ferro 300', userA);
  await handleTradeCommands(mockSock, t4a.sockMsg, t4a.command, t4a.args, userA, []);
  const t4b = makeMsg('/trocar adicionar madeira 200', userA);
  await handleTradeCommands(mockSock, t4b.sockMsg, t4b.command, t4b.args, userA, []);

  // User B oferta 400 comida
  const t4c = makeMsg('/trocar adicionar comida 400', userB);
  await handleTradeCommands(mockSock, t4c.sockMsg, t4c.command, t4c.args, userB, []);

  const s4 = tradeSessions.get(userToSessionMap.get(userA));
  assert.strictEqual(s4.offers[userA].kingdom.iron, 300);
  assert.strictEqual(s4.offers[userA].kingdom.wood, 200);
  assert.strictEqual(s4.offers[userB].kingdom.food, 400);
  console.log('✅ TESTE 4 PASSOU: Recursos de reino adicionados à bancada.');

  // ----------------------------------------------------
  // TESTE 5: Ofertar itens do inventário pessoal
  // ----------------------------------------------------
  console.log('\n--- TESTE 5: Ofertar itens do inventário ---');
  // User A oferta 2x Rare Candy
  const t5a = makeMsg('/trocar adicionar "Rare Candy" 2', userA);
  await handleTradeCommands(mockSock, t5a.sockMsg, t5a.command, t5a.args, userA, []);

  // User B oferta 1x Pizza Infinita
  const t5b = makeMsg('/trocar adicionar "Pizza Infinita" 1', userB);
  await handleTradeCommands(mockSock, t5b.sockMsg, t5b.command, t5b.args, userB, []);

  const s5 = tradeSessions.get(userToSessionMap.get(userA));
  assert.ok(s5.offers[userA].items['🍬 Rare Candy'] === 2, 'User A deve ter 2 Rare Candy ofertados');
  assert.ok(s5.offers[userB].items['🍕 Pizza Infinita'] === 1, 'User B deve ter 1 Pizza Infinita ofertada');
  console.log('✅ TESTE 5 PASSOU: Itens de inventário adicionados com sucesso.');

  // ----------------------------------------------------
  // TESTE 6: Ofertar dinheiro da carteira
  // ----------------------------------------------------
  console.log('\n--- TESTE 6: Ofertar dinheiro pessoal ---');
  const t6a = makeMsg('/trocar adicionar dinheiro 10000', userA);
  await handleTradeCommands(mockSock, t6a.sockMsg, t6a.command, t6a.args, userA, []);

  const t6b = makeMsg('/trocar adicionar dinheiro 5000', userB);
  await handleTradeCommands(mockSock, t6b.sockMsg, t6b.command, t6b.args, userB, []);

  const s6 = tradeSessions.get(userToSessionMap.get(userA));
  assert.strictEqual(s6.offers[userA].money, 10000);
  assert.strictEqual(s6.offers[userB].money, 5000);
  console.log('✅ TESTE 6 PASSOU: Moedas pessoais adicionadas à bancada.');

  // ----------------------------------------------------
  // TESTE 7: Validação de posse (bloquear ofertar mais do que tem)
  // ----------------------------------------------------
  console.log('\n--- TESTE 7: Bloqueio de excesso de itens/recursos ---');
  const t7 = makeMsg('/trocar adicionar dinheiro 999999', userA);
  await handleTradeCommands(mockSock, t7.sockMsg, t7.command, t7.args, userA, []);
  assert.strictEqual(s6.offers[userA].money, 10000, 'Oferta de dinheiro não deve ultrapassar saldo');
  console.log('✅ TESTE 7 PASSOU: Tentativa de ofertar saldo inexistente bloqueada.');

  // ----------------------------------------------------
  // TESTE 8: Proteção Anti-Scam (reset de confirmações)
  // ----------------------------------------------------
  console.log('\n--- TESTE 8: Mecanismo Anti-Scam ao alterar oferta ---');
  // User A confirma
  const t8a = makeMsg('/trocar confirmar', userA);
  await handleTradeCommands(mockSock, t8a.sockMsg, t8a.command, t8a.args, userA, []);
  assert.strictEqual(s6.offers[userA].confirmed, true, 'User A confirmou');

  // User B remove 100 de comida (alteração na negociação)
  const t8b = makeMsg('/trocar remover comida 100', userB);
  await handleTradeCommands(mockSock, t8b.sockMsg, t8b.command, t8b.args, userB, []);
  assert.strictEqual(s6.offers[userA].confirmed, false, 'Confirmação de User A deve ser resetada após alteração de User B');
  assert.strictEqual(s6.offers[userB].confirmed, false, 'Confirmação de User B deve ser resetada');
  console.log('✅ TESTE 8 PASSOU: Proteção anti-scam resetou confirmações após edição da bancada.');

  // ----------------------------------------------------
  // TESTE 9: Confirmação Mútua e Execução Atômica
  // ----------------------------------------------------
  console.log('\n--- TESTE 9: Confirmação mútua e transferência atômica ---');
  // User A confirma
  const t9a = makeMsg('/trocar confirmar', userA);
  await handleTradeCommands(mockSock, t9a.sockMsg, t9a.command, t9a.args, userA, []);

  // User B confirma (Finaliza a troca!)
  const t9b = makeMsg('/trocar confirmar', userB);
  await handleTradeCommands(mockSock, t9b.sockMsg, t9b.command, t9b.args, userB, []);

  // Sessão deve ter sido limpa
  assert.strictEqual(userToSessionMap.has(userA), false, 'Sessão de User A deve ter sido encerrada');
  assert.strictEqual(userToSessionMap.has(userB), false, 'Sessão de User B deve ter sido encerrada');

  // Verifica saldos pós-troca do Usuário A:
  // Carteira: 50.000 - 10.000 + 5.000 = 45.000
  const uA = getUser(userA);
  const kdA = getKingdomData(uA);
  const invA = JSON.parse(uA.inventory || '[]');

  assert.strictEqual(uA.wallet, 45000, 'Carteira de A deve ser $45.000');
  // Recursos Reino A: Ferro (800 - 300 = 500), Madeira (1000 - 200 = 800), Comida (500 + 300 = 800)
  assert.strictEqual(kdA.kingdom.resources.iron, 500, 'Ferro de A deve ser 500');
  assert.strictEqual(kdA.kingdom.resources.wood, 800, 'Madeira de A deve ser 800');
  assert.strictEqual(kdA.kingdom.resources.food, 800, 'Comida de A deve ser 800');
  // Inventário A: perdeu 2 Rare Candy e ganhou 1 Pizza Infinita
  assert.strictEqual(invA.filter(i => i.includes('Rare Candy')).length, 0, 'A não deve ter mais Rare Candy');
  assert.strictEqual(invA.filter(i => i.includes('Pizza Infinita')).length, 1, 'A deve ter recebido Pizza Infinita');
  assert.strictEqual(invA.filter(i => i.includes('Adaga de Aço')).length, 1, 'A manteve sua Adaga de Aço');

  // Verifica saldos pós-troca do Usuário B:
  // Carteira: 30.000 - 5.000 + 10.000 = 35.000
  const uB = getUser(userB);
  const kdB = getKingdomData(uB);
  const invB = JSON.parse(uB.inventory || '[]');

  assert.strictEqual(uB.wallet, 35000, 'Carteira de B deve ser $35.000');
  // Recursos Reino B: Comida (1200 - 300 = 900), Ferro (100 + 300 = 400), Madeira (400 + 200 = 600)
  assert.strictEqual(kdB.kingdom.resources.food, 900, 'Comida de B deve ser 900');
  assert.strictEqual(kdB.kingdom.resources.iron, 400, 'Ferro de B deve ser 400');
  assert.strictEqual(kdB.kingdom.resources.wood, 600, 'Madeira de B deve ser 600');
  // Inventário B: ganhou 2 Rare Candy e perdeu 1 Pizza Infinita
  assert.strictEqual(invB.filter(i => i.includes('Rare Candy')).length, 2, 'B deve ter recebido 2 Rare Candy');
  assert.strictEqual(invB.filter(i => i.includes('Pizza Infinita')).length, 0, 'B perdeu a Pizza Infinita');

  console.log('✅ TESTE 9 PASSOU: Transferência atômica de recursos, dinheiro e itens executada com 100% de precisão.');

  // ----------------------------------------------------
  // TESTE 10: Cancelamento de sessão de troca
  // ----------------------------------------------------
  console.log('\n--- TESTE 10: Cancelamento de sessão ---');
  const t10a = makeMsg('/trocar @5511900002222', userA, [userB]);
  await handleTradeCommands(mockSock, t10a.sockMsg, t10a.command, t10a.args, userA, t10a.mentions);
  assert.strictEqual(userToSessionMap.has(userA), true);

  const t10b = makeMsg('/trocar cancelar', userA);
  await handleTradeCommands(mockSock, t10b.sockMsg, t10b.command, t10b.args, userA, []);
  assert.strictEqual(userToSessionMap.has(userA), false, 'Sessão cancelada com sucesso');
  console.log('✅ TESTE 10 PASSOU: Cancelamento e limpeza de sessão funcionando perfeitamente.');

  console.log('\n===============================================================');
  console.log('🎉 TODOS OS 10 TESTES DO SISTEMA DE TROCAS PASSARAM COM SUCESSO!');
  console.log('===============================================================\n');

  process.exit(0);
}

runTradeTests().catch(err => {
  console.error('❌ ERRO DURANTE TESTES DE TROCA:', err);
  process.exit(1);
});
