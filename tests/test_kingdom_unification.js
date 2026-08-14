import assert from 'assert';
import databaseManager, { getUser, updateUser } from '../src/database/sqlite.js';
import { getDatabase, updateDatabase } from '../src/database.js';
import { handleKingdomCommands, getKingdomData, mergeKingdoms, splitKingdoms } from '../src/commands/kingdom_system.js';
import { handleSocialCommands } from '../src/commands/social.js';
import queueManager from '../src/queue/QueueManager.js';

class MockSocket {
  constructor() {
    this.sentMessages = [];
  }
  async sendMessage(jid, content, options) {
    this.sentMessages.push({ jid, content, timestamp: Date.now() });
    return { key: { id: 'MOCK_UNIFICATION_' + Math.random() } };
  }
}

async function runUnificationTests() {
  console.log('\n===============================================================');
  console.log('🧪 INICIANDO TESTES: UNIÃO DE REINOS NO CASAMENTO & DIVISÃO');
  console.log('===============================================================\n');

  await databaseManager.initialize();

  queueManager.minDelay = 5;
  queueManager.maxDelay = 10;

  const mockRawSock = new MockSocket();
  const mockSock = queueManager.wrapSocket(mockRawSock);

  const king1 = `5511911110001_${Date.now()}@s.whatsapp.net`;
  const king2 = `5511922220002_${Date.now()}@s.whatsapp.net`;
  const chatJid = '120363000000000000@g.us';

  // Configura ambos os usuários no banco
  updateUser(king1, {
    wallet: 1000000,
    bank: 0,
    inventory: '[]',
    extra_data: JSON.stringify({})
  });

  updateUser(king2, {
    wallet: 1000000,
    bank: 0,
    inventory: '[]',
    extra_data: JSON.stringify({})
  });

  const makeMsg = (text, senderJid) => {
    const parts = text.trim().split(/\s+/);
    const cmd = parts[0].replace('/', '').toLowerCase();
    const args = parts.slice(1);
    return {
      sockMsg: {
        key: { remoteJid: chatJid, participant: senderJid },
        message: { conversation: text, extendedTextMessage: { contextInfo: { mentionedJid: [senderJid === king1 ? king2 : king1] } } }
      },
      command: cmd,
      args
    };
  };

  // ----------------------------------------------------
  // TESTE 1: Fundação de Reinos Distintos por Dois Jogadores
  // ----------------------------------------------------
  console.log('--- TESTE 1: Fundação de Dois Reinos Separados ---');
  const t1a = makeMsg('/reino comprar Reino de Eldoria', king1);
  await handleKingdomCommands(mockSock, t1a.sockMsg, t1a.command, t1a.args, king1, []);

  const t1b = makeMsg('/reino comprar Império de Valória', king2);
  await handleKingdomCommands(mockSock, t1b.sockMsg, t1b.command, t1b.args, king2, []);

  const kd1 = getKingdomData(getUser(king1));
  const kd2 = getKingdomData(getUser(king2));

  assert.ok(kd1.isMonarch, 'Rei 1 deve ser monarca de Eldoria');
  assert.strictEqual(kd1.kingdom.name, 'Reino de Eldoria');
  assert.ok(kd2.isMonarch, 'Rei 2 deve ser monarca de Valória');
  assert.strictEqual(kd2.kingdom.name, 'Império de Valória');
  console.log('✅ TESTE 1 PASSOU: Dois reinos distintos fundados com sucesso.');

  // ----------------------------------------------------
  // TESTE 2: Pedido de Casamento e Aceitação com Fusão de Reinos
  // ----------------------------------------------------
  console.log('\n--- TESTE 2: Matrimônio Real & Fusão em Reino Unido ---');
  const t2a = makeMsg(`/casar @${king2.split('@')[0]}`, king1);
  await handleSocialCommands(mockSock, t2a.sockMsg, t2a.command, t2a.args, king1, [king2]);

  const t2b = makeMsg(`/aceitar`, king2);
  await handleSocialCommands(mockSock, t2b.sockMsg, t2b.command, t2b.args, king2, []);

  const u1Merged = getUser(king1);
  const u2Merged = getUser(king2);
  const kd1Merged = getKingdomData(u1Merged);
  const kd2Merged = getKingdomData(u2Merged);

  assert.strictEqual(kd1Merged.kingdom.name, kd2Merged.kingdom.name, 'Ambos devem ter o mesmo nome de Reino Unido');
  assert.ok(kd1Merged.kingdom.is_unified, 'Reino deve estar marcado como unificado');
  assert.strictEqual(kd1Merged.kingdom.treasury, 100000, 'Tesouro de ambos os reinos ($50k + $50k) deve somar $100k');
  assert.strictEqual(kd1Merged.kingdom.resources.food, 1000, 'Comida (500 + 500) deve somar 1000');
  assert.strictEqual(kd1Merged.kingdom.resources.wood, 600, 'Madeira (300 + 300) deve somar 600');
  assert.strictEqual(kd1Merged.kingdom.resources.stone, 400, 'Pedra (200 + 200) deve somar 400');
  assert.strictEqual(kd1Merged.kingdom.resources.iron, 200, 'Ferro (100 + 100) deve somar 200');
  assert.strictEqual(kd1Merged.kingdom.population, 100, 'População (50 + 50) deve somar 100');
  assert.strictEqual(kd1Merged.kingdom.army.soldiers, 20, 'Exército (10 + 10) deve somar 20');
  assert.strictEqual(kd1Merged.kingdom.marriage, king2, 'Casamento do Rei 1 deve apontar para Rei 2');
  assert.strictEqual(kd2Merged.kingdom.marriage, king1, 'Casamento do Rei 2 deve apontar para Rei 1');

  console.log(`✅ TESTE 2 PASSOU: Reinos fundidos com sucesso em "${kd1Merged.kingdom.name}" com recursos somados!`);

  // ----------------------------------------------------
  // TESTE 3: Sincronização em Tempo Real entre Co-Governantes
  // ----------------------------------------------------
  console.log('\n--- TESTE 3: Sincronização em Tempo Real de Ações do Reino ---');
  // Rei 1 compra 10 de ferro pelo mercado
  const t3 = makeMsg('/reino comprar ferro 10', king1);
  await handleKingdomCommands(mockSock, t3.sockMsg, t3.command, t3.args, king1, []);

  // Verifica se Rei 2 imediatamente vê o ferro extra e o ouro reduzido
  const kd2Sync = getKingdomData(getUser(king2));
  assert.strictEqual(kd2Sync.kingdom.resources.iron, 210, 'Rei 2 deve ver 210 de ferro após compra do Rei 1');
  assert.strictEqual(kd2Sync.kingdom.treasury, 100000 - 500, 'Rei 2 deve ver o tesouro reduzido de $500');

  console.log('✅ TESTE 3 PASSOU: Ações de um monarca sincronizam em tempo real para o outro cônjuge.');

  // ----------------------------------------------------
  // TESTE 4: Proteção contra Guerra Fratricida entre Cônjuges
  // ----------------------------------------------------
  console.log('\n--- TESTE 4: Bloqueio de Guerra entre Cônjuges ---');
  const t4 = makeMsg(`/guerra @${king2.split('@')[0]}`, king1);
  await handleKingdomCommands(mockSock, t4.sockMsg, t4.command, t4.args, king1, [king2]);

  const lastMsg = mockRawSock.sentMessages[mockRawSock.sentMessages.length - 1]?.content?.text || '';
  assert.ok(lastMsg.includes('cônjuge real') || lastMsg.includes('próprio reino'), 'Deve impedir guerra entre casal real');
  console.log('✅ TESTE 4 PASSOU: Guerra entre cônjuges bloqueada com segurança.');

  // ----------------------------------------------------
  // TESTE 5: Divórcio e Divisão Justa do Reino (50% cada)
  // ----------------------------------------------------
  console.log('\n--- TESTE 5: Divórcio e Partilha Imperial de Bens (50%) ---');
  const t5 = makeMsg('/divorcio', king1);
  await handleSocialCommands(mockSock, t5.sockMsg, t5.command, t5.args, king1, []);

  const kd1Split = getKingdomData(getUser(king1));
  const kd2Split = getKingdomData(getUser(king2));

  assert.strictEqual(kd1Split.kingdom.is_unified, false, 'Reino 1 não é mais unificado');
  assert.strictEqual(kd2Split.kingdom.is_unified, false, 'Reino 2 não é mais unificado');
  assert.strictEqual(kd1Split.kingdom.marriage, null, 'Rei 1 está solteiro');
  assert.strictEqual(kd2Split.kingdom.marriage, null, 'Rei 2 está solteiro');
  assert.strictEqual(kd1Split.kingdom.resources.iron, 105, 'Rei 1 deve ficar com 50% do ferro (105)');
  assert.strictEqual(kd2Split.kingdom.resources.iron, 105, 'Rei 2 deve ficar com 50% do ferro (105)');
  assert.strictEqual(kd1Split.kingdom.treasury, Math.floor((100000 - 500) / 2), 'Rei 1 deve ficar com metade do ouro');
  assert.strictEqual(kd2Split.kingdom.treasury, Math.floor((100000 - 500) / 2), 'Rei 2 deve ficar com metade do ouro');

  console.log('✅ TESTE 5 PASSOU: Divórcio dividiu o reino 50/50 perfeitamente entre ambos os monarcas!');

  console.log('\n===============================================================');
  console.log('🎉 TODOS OS TESTES DE FUSÃO E DIVISÃO DE REINOS PASSARAM!');
  console.log('===============================================================\n');

  process.exit(0);
}

runUnificationTests().catch(err => {
  console.error('❌ ERRO NO TESTE DE UNIÃO DE REINOS:', err);
  process.exit(1);
});
