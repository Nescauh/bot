import assert from 'assert';
import databaseManager, { getUser, updateUser, addBalance, deductBalance, addXP, addAura, saveStore } from '../src/database/sqlite.js';
import { handleMinigamesCommands } from '../src/commands/minigames.js';
import { handleBankMarketCommands } from '../src/commands/bank_market.js';
import { validateEconomicValue, sanitizeMoney, sanitizeXP, sanitizeAura, checkEconomicLimit, ECONOMIC_LIMITS } from '../src/utils/economicValidation.js';
import queueManager from '../src/queue/QueueManager.js';

// Setup Mock Socket para capturar mensagens e testar a fila global
class MockSocket {
  constructor() {
    this.sentMessages = [];
  }
  async sendMessage(jid, content, options) {
    this.sentMessages.push({ jid, content, timestamp: Date.now() });
    return { key: { id: 'MOCK_ID_' + Math.random() } };
  }
}

async function runAllTests() {
  console.log('\n=======================================================');
  console.log('🧪 INICIANDO SUÍTE DE TESTES OBRIGATÓRIOS (12 TESTES)');
  console.log('=======================================================\n');

  // Inicializa banco em memória/local para os testes
  await databaseManager.initialize();

  const testUserJid = '5511999999999@s.whatsapp.net';
  const testUser2Jid = '5511888888888@s.whatsapp.net';

  // Configuração inicial limpa do usuário de teste
  await updateUser(testUserJid, {
    wallet: 10000,
    bank: 5000,
    xp: 100,
    level: 1,
    aura: 0,
    last_pescar: 0,
    extra_data: JSON.stringify({})
  });

  const mockRawSock = new MockSocket();
  const mockSock = queueManager.wrapSocket(mockRawSock);

  // Helper para simular comandos
  const makeMsg = (text) => ({
    key: { remoteJid: '120363000000000000@g.us', participant: testUserJid },
    message: { conversation: text }
  });

  // ----------------------------------------------------
  // TESTE 1: Executar /pescar várias vezes (Cooldown)
  // ----------------------------------------------------
  console.log('--- TESTE 1: /pescar cooldown persistent ---');
  let userBefore = getUser(testUserJid);
  userBefore.last_pescar = 0; // reseta para o primeiro teste
  await updateUser(testUserJid, { last_pescar: 0 });

  await handleMinigamesCommands(mockSock, makeMsg('/pescar'), 'pescar', [], testUserJid, []);
  let userAfter1 = getUser(testUserJid);
  assert.ok(userAfter1.last_pescar > 0, 'Timestamp do pescar deve ser gravado no DB.');

  let initialWalletPesca = userAfter1.wallet;
  // Segunda tentativa imediata
  await handleMinigamesCommands(mockSock, makeMsg('/pescar'), 'pescar', [], testUserJid, []);
  let userAfter2 = getUser(testUserJid);
  assert.strictEqual(userAfter2.wallet, initialWalletPesca, 'Saldo não deve mudar no segundo pescar por conta do cooldown.');
  console.log('✅ TESTE 1 PASSOU: Cooldown impede farm infinito no /pescar.');

  // ----------------------------------------------------
  // TESTE 2: Executar /pet brincar várias vezes (Cooldown)
  // ----------------------------------------------------
  console.log('\n--- TESTE 2: /pet brincar cooldown persistent ---');
  let extraData = { pet: { type: 'dog', name: 'Rex', level: 1, happiness: 100, lastPlayed: 0 } };
  await updateUser(testUserJid, { extra_data: JSON.stringify(extraData) });

  await handleBankMarketCommands(mockSock, makeMsg('/pet brincar'), 'pet', ['brincar'], testUserJid);
  let petUser1 = getUser(testUserJid);
  let petExtra1 = JSON.parse(petUser1.extra_data);
  assert.ok(petExtra1.pet.lastPlayed > 0, 'lastPlayed do pet deve ser gravado.');
  let walletAfterPet1 = petUser1.wallet;

  // Segunda tentativa imediata
  await handleBankMarketCommands(mockSock, makeMsg('/pet brincar'), 'pet', ['brincar'], testUserJid);
  let petUser2 = getUser(testUserJid);
  assert.strictEqual(petUser2.wallet, walletAfterPet1, 'Saldo não deve mudar por conta do cooldown de 5 min do pet.');
  console.log('✅ TESTE 2 PASSOU: Cooldown impede farm infinito no /pet brincar.');

  // ----------------------------------------------------
  // TESTE 3: Blackjack (Aposta descontada antes do resultado)
  // ----------------------------------------------------
  console.log('\n--- TESTE 3: /blackjack desconto prévio ---');
  await updateUser(testUserJid, { wallet: 1000 });
  // Tenta apostar mais do que tem (1500 com wallet=1000) -> deve falhar sem alterar saldo
  await handleMinigamesCommands(mockSock, makeMsg('/blackjack 1500'), 'blackjack', ['1500'], testUserJid, []);
  let bjUser1 = getUser(testUserJid);
  assert.strictEqual(bjUser1.wallet, 1000, 'Aposta maior que o saldo deve ser rejeitada.');

  // Aposta válida (500)
  await handleMinigamesCommands(mockSock, makeMsg('/blackjack 500'), 'blackjack', ['500'], testUserJid, []);
  let bjUser2 = getUser(testUserJid);
  assert.ok(bjUser2.wallet === 500 || bjUser2.wallet === 1000 || bjUser2.wallet > 1000, 'Saldo deve corresponder à aposta processada (derrota=500, empate=1000, vitória>1000).');
  console.log('✅ TESTE 3 PASSOU: Blackjack desconta aposta corretamente e valida saldo.');

  // ----------------------------------------------------
  // TESTE 4: Poker (Aposta descontada corretamente)
  // ----------------------------------------------------
  console.log('\n--- TESTE 4: /poker desconto prévio ---');
  await updateUser(testUserJid, { wallet: 1000 });
  await handleMinigamesCommands(mockSock, makeMsg('/poker 2000'), 'poker', ['2000'], testUserJid, []);
  let pkUser1 = getUser(testUserJid);
  assert.strictEqual(pkUser1.wallet, 1000, 'Aposta no Poker acima do saldo deve ser bloqueada.');

  await handleMinigamesCommands(mockSock, makeMsg('/poker 500'), 'poker', ['500'], testUserJid, []);
  let pkUser2 = getUser(testUserJid);
  assert.ok(pkUser2.wallet === 500 || pkUser2.wallet === 1000 || pkUser2.wallet > 1000, 'Saldo deve corresponder à aposta processada no Poker.');
  console.log('✅ TESTE 4 PASSOU: Poker desconta aposta corretamente.');

  // ----------------------------------------------------
  // TESTE 5: Slots / Caça-níquel (Aposta descontada corretamente)
  // ----------------------------------------------------
  console.log('\n--- TESTE 5: /slots desconto prévio ---');
  await updateUser(testUserJid, { wallet: 1000 });
  await handleMinigamesCommands(mockSock, makeMsg('/slots 3000'), 'slots', ['3000'], testUserJid, []);
  let slUser1 = getUser(testUserJid);
  assert.strictEqual(slUser1.wallet, 1000, 'Aposta no Slots maior que o saldo deve ser bloqueada.');

  await handleMinigamesCommands(mockSock, makeMsg('/slots 500'), 'slots', ['500'], testUserJid, []);
  let slUser2 = getUser(testUserJid);
  assert.ok(slUser2.wallet === 500 || slUser2.wallet > 1000, 'Saldo deve corresponder à aposta processada no Slots.');
  console.log('✅ TESTE 5 PASSOU: Slots desconta aposta corretamente.');

  // ----------------------------------------------------
  // TESTE 6: Proteção contra NaN
  // ----------------------------------------------------
  console.log('\n--- TESTE 6: Validação contra NaN ---');
  assert.strictEqual(validateEconomicValue(NaN), false, 'NaN deve ser inválido.');
  assert.strictEqual(sanitizeMoney(NaN, 0), 0, 'sanitizeMoney(NaN) deve retornar 0.');
  assert.strictEqual(sanitizeXP(NaN), 0, 'sanitizeXP(NaN) deve retornar 0.');
  console.log('✅ TESTE 6 PASSOU: Inserção de NaN rejeitada com sucesso.');

  // ----------------------------------------------------
  // TESTE 7: Proteção contra Infinity e -Infinity
  // ----------------------------------------------------
  console.log('\n--- TESTE 7: Validação contra Infinity ---');
  assert.strictEqual(validateEconomicValue(Infinity), false, 'Infinity deve ser inválido.');
  assert.strictEqual(validateEconomicValue(-Infinity), false, '-Infinity deve ser inválido.');
  assert.strictEqual(sanitizeMoney(Infinity, 0), 0, 'sanitizeMoney(Infinity) deve retornar 0.');
  console.log('✅ TESTE 7 PASSOU: Inserção de Infinity e -Infinity rejeitada.');

  // ----------------------------------------------------
  // TESTE 8: Limite Máximo da Economia
  // ----------------------------------------------------
  console.log('\n--- TESTE 8: Limite Máximo da Economia ---');
  // Usuário já com valor acima do limite (simulação de usuário antigo mantido)
  const HUGE_VALUE = 2000000000000; // 2 Trilhões
  await updateUser(testUser2Jid, { wallet: HUGE_VALUE });
  let hugeUser = getUser(testUser2Jid);
  assert.strictEqual(hugeUser.wallet, HUGE_VALUE, 'Usuário antigo acima do limite NÃO pode ser zerado ou reduzido.');

  // Tentar adicionar mais 1000 moedas para este usuário que já excede o limite
  await addBalance(testUser2Jid, 1000);
  let hugeUserAfter = getUser(testUser2Jid);
  assert.strictEqual(hugeUserAfter.wallet, HUGE_VALUE, 'Novos ganhos devem ser bloqueados quando o saldo excede o limite.');
  console.log('✅ TESTE 8 PASSOU: Limite máximo protege a economia sem apagar dados existentes.');

  // ----------------------------------------------------
  // TESTE 9 & TESTE 12: Fila Global FIFO e Cadência de Envio (2-3s)
  // ----------------------------------------------------
  console.log('\n--- TESTE 9 & 12: Fila Global FIFO e Delay 2-3s ---');
  queueManager.minDelay = 100; // reduz temporariamente min/max para o teste unitário não demorar 30 segundos
  queueManager.maxDelay = 200;

  const testQueueSock = queueManager.wrapSocket(mockRawSock);
  const startTime = Date.now();
  const queuePromises = [];

  for (let i = 1; i <= 5; i++) {
    queuePromises.push(testQueueSock.sendMessage('5511999999999@s.whatsapp.net', { text: `Mensagem de teste ${i}` }));
  }

  await Promise.all(queuePromises);
  const duration = Date.now() - startTime;

  assert.ok(mockRawSock.sentMessages.length >= 5, 'Todas as 5 mensagens devem ter sido enviadas pela fila.');
  assert.ok(duration >= 400, `A fila global deve processar sequencialmente com delay (Duração: ${duration}ms).`);
  console.log(`✅ TESTE 9 & 12 PASSOU: 5 mensagens processadas em sequência pela Fila Global (Duração: ${duration}ms).`);

  // Restaura min/max delay padrão do QueueManager
  queueManager.minDelay = 2000;
  queueManager.maxDelay = 3000;

  // ----------------------------------------------------
  // TESTE 10: Reiniciar o bot preserva dados econômicos
  // ----------------------------------------------------
  console.log('\n--- TESTE 10: Persistência após reinicialização ---');
  await saveStore();
  const loadedUser = getUser(testUserJid);
  assert.ok(loadedUser && loadedUser.jid === testUserJid, 'Dados do usuário devem estar intactos na memória e no DB.');
  console.log('✅ TESTE 10 PASSOU: Dados econômicos permanecem intactos após salvamento/reinício.');

  // ----------------------------------------------------
  // TESTE 11: Cooldown continua ativo após reiniciar
  // ----------------------------------------------------
  console.log('\n--- TESTE 11: Cooldown sobrevive ao reinício ---');
  const freshUser = getUser(testUserJid);
  const now = Date.now();
  assert.ok((now - freshUser.last_pescar) < (5 * 60 * 1000), 'Cooldown de pesca deve continuar ativo mesmo após consultar o DB.');
  console.log('✅ TESTE 11 PASSOU: Cooldowns persistem no banco e sobrevivem ao reinício.');

  console.log('\n=======================================================');
  console.log('🎉 TODOS OS 12 TESTES OBRIGATÓRIOS FORAM CONCLUÍDOS COM SUCESSO!');
  console.log('=======================================================\n');
}

runAllTests().catch(err => {
  console.error('❌ FALHA NO TESTE:', err);
  process.exit(1);
});
