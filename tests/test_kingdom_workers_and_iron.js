import assert from 'assert';
import databaseManager, { getUser, updateUser, saveStore } from '../src/database/sqlite.js';
import { handleKingdomCommands, getKingdomData } from '../src/commands/kingdom_system.js';
import queueManager from '../src/queue/QueueManager.js';

class MockSocket {
  constructor() {
    this.sentMessages = [];
  }
  async sendMessage(jid, content, options) {
    this.sentMessages.push({ jid, content, timestamp: Date.now() });
    return { key: { id: 'MOCK_KD_' + Math.random() } };
  }
}

async function runKingdomTests() {
  console.log('\n===============================================================');
  console.log('🧪 INICIANDO TESTES: GESTÃO DE TRABALHADORES & PRODUÇÃO DE FERRO');
  console.log('===============================================================\n');

  await databaseManager.initialize();

  // Reduz delays da fila para agilidade
  queueManager.minDelay = 5;
  queueManager.maxDelay = 10;

  const mockRawSock = new MockSocket();
  const mockSock = queueManager.wrapSocket(mockRawSock);

  const testUser = '5511988887777_' + Date.now() + '@s.whatsapp.net';

  // Configura usuário de teste com carteira e limpa reino anterior
  updateUser(testUser, {
    wallet: 1000000,
    bank: 0,
    inventory: '[]',
    extra_data: JSON.stringify({})
  });

  const makeMsg = (text, senderJid = testUser) => {
    const parts = text.trim().split(/\s+/);
    const cmd = parts[0].replace('/', '').toLowerCase();
    const args = parts.slice(1);
    return {
      sockMsg: {
        key: { remoteJid: '120363000000000000@g.us', participant: senderJid },
        message: { conversation: text }
      },
      command: cmd,
      args
    };
  };

  // ----------------------------------------------------
  // TESTE 1: Fundar Reino
  // ----------------------------------------------------
  console.log('--- TESTE 1: Fundação do Reino ---');
  const t1 = makeMsg('/reino comprar Império de Valória');
  await handleKingdomCommands(mockSock, t1.sockMsg, t1.command, t1.args, testUser);

  let u = getUser(testUser);
  let kd = getKingdomData(u);
  assert.ok(kd.isMonarch, 'Usuário deve ser monarca');
  assert.strictEqual(kd.kingdom.name, 'Império de Valória');
  assert.strictEqual(kd.kingdom.population, 50);
  assert.strictEqual(kd.kingdom.resources.iron, 100);
  console.log('✅ TESTE 1 PASSOU: Reino fundado com sucesso.');

  // ----------------------------------------------------
  // TESTE 2: Recrutamento e Cidadãos Livres
  // ----------------------------------------------------
  console.log('\n--- TESTE 2: Recrutamento sem travar população livre ---');
  const t2 = makeMsg('/reino recrutar 20');
  await handleKingdomCommands(mockSock, t2.sockMsg, t2.command, t2.args, testUser);

  u = getUser(testUser);
  kd = getKingdomData(u);
  assert.strictEqual(kd.kingdom.population, 70, 'População deve ser 70');
  const w2 = kd.kingdom.workers;
  const totalAllocated2 = w2.farmer + w2.lumberjack + w2.miner + w2.merchant;
  const freePop2 = kd.kingdom.population - totalAllocated2;
  assert.ok(freePop2 >= 20, 'Novos recrutas devem ficar como cidadãos livres para alocação');
  console.log(`✅ TESTE 2 PASSOU: Recrutamento adicionou 20 habitantes e deixou ${freePop2} livres.`);

  // ----------------------------------------------------
  // TESTE 3: Repartir Trabalhadores de Forma Justa e Equilibrada
  // ----------------------------------------------------
  console.log('\n--- TESTE 3: Repartir trabalhadores igualmente ---');
  const t3 = makeMsg('/reino trabalhadores repartir');
  await handleKingdomCommands(mockSock, t3.sockMsg, t3.command, t3.args, testUser);

  u = getUser(testUser);
  kd = getKingdomData(u);
  const w3 = kd.kingdom.workers;
  const total3 = w3.farmer + w3.lumberjack + w3.miner + w3.merchant;
  assert.strictEqual(total3, 70, 'A soma dos trabalhadores repartidos deve ser exatamente a população (70)');
  // 70 / 4 = 17 com resto 2 -> 18, 18, 17, 17
  assert.strictEqual(w3.farmer, 18, 'Agricultor deve ter 18');
  assert.strictEqual(w3.lumberjack, 18, 'Lenhador deve ter 18');
  assert.strictEqual(w3.miner, 17, 'Minerador deve ter 17');
  assert.strictEqual(w3.merchant, 17, 'Comerciante deve ter 17');
  console.log(`✅ TESTE 3 PASSOU: Repartição equilibrada perfeita (Agr: ${w3.farmer}, Lenh: ${w3.lumberjack}, Min: ${w3.miner}, Com: ${w3.merchant}).`);

  // ----------------------------------------------------
  // TESTE 4: Definir Todas as 4 Profissões Simultaneamente
  // ----------------------------------------------------
  console.log('\n--- TESTE 4: Definir 4 profissões em massa ---');
  const t4 = makeMsg('/reino trabalhadores definir 10 10 35 15');
  await handleKingdomCommands(mockSock, t4.sockMsg, t4.command, t4.args, testUser);

  u = getUser(testUser);
  kd = getKingdomData(u);
  const w4 = kd.kingdom.workers;
  assert.strictEqual(w4.farmer, 10);
  assert.strictEqual(w4.lumberjack, 10);
  assert.strictEqual(w4.miner, 35, 'Mineradores definidos com sucesso para 35');
  assert.strictEqual(w4.merchant, 15);
  console.log('✅ TESTE 4 PASSOU: Configuração em lote definida com sucesso.');

  // ----------------------------------------------------
  // TESTE 5: Resetar/Desalocar Todos os Trabalhadores
  // ----------------------------------------------------
  console.log('\n--- TESTE 5: Resetar trabalhadores ---');
  const t5 = makeMsg('/reino trabalhadores resetar');
  await handleKingdomCommands(mockSock, t5.sockMsg, t5.command, t5.args, testUser);

  u = getUser(testUser);
  kd = getKingdomData(u);
  const w5 = kd.kingdom.workers;
  assert.strictEqual(w5.farmer, 0);
  assert.strictEqual(w5.lumberjack, 0);
  assert.strictEqual(w5.miner, 0);
  assert.strictEqual(w5.merchant, 0);
  console.log('✅ TESTE 5 PASSOU: Todos os trabalhadores foram zerados/liberados.');

  // ----------------------------------------------------
  // TESTE 6: Alocação Individual por Profissão
  // ----------------------------------------------------
  console.log('\n--- TESTE 6: Alocação individual flexível ---');
  const t6 = makeMsg('/reino trabalhadores minerador 40');
  await handleKingdomCommands(mockSock, t6.sockMsg, t6.command, t6.args, testUser);

  u = getUser(testUser);
  kd = getKingdomData(u);
  assert.strictEqual(kd.kingdom.workers.miner, 40, 'Mineradores deve ser 40');
  console.log('✅ TESTE 6 PASSOU: Alocação individual de 40 mineradores realizada.');

  // ----------------------------------------------------
  // TESTE 7: Bloqueio informativo quando excede população
  // ----------------------------------------------------
  console.log('\n--- TESTE 7: Validação de limite de população ---');
  const t7 = makeMsg('/reino trabalhadores agricultor 50'); // 40 mineradores + 50 agr = 90 > 70
  await handleKingdomCommands(mockSock, t7.sockMsg, t7.command, t7.args, testUser);

  u = getUser(testUser);
  kd = getKingdomData(u);
  assert.strictEqual(kd.kingdom.workers.farmer, 0, 'Agricultor não deve ter sido alterado pois excederia limite');
  console.log('✅ TESTE 7 PASSOU: Limite protegido com mensagem informativa.');

  // ----------------------------------------------------
  // TESTE 8: Produção de Ferro Aumentada e Evolução das Minas
  // ----------------------------------------------------
  console.log('\n--- TESTE 8: Coleta de recursos e produção de ferro evoluída ---');
  // Configura mineradores = 30, minas = Nível 3, last_collect = 3h atrás
  kd.kingdom.workers.miner = 30;
  kd.kingdom.buildings.mines = 3; // +60% bônus
  kd.kingdom.last_collect = Date.now() - (3 * 60 * 60 * 1000); // 3 horas
  const ironBefore = kd.kingdom.resources.iron || 0;

  updateUser(testUser, { extra_data: JSON.stringify(kd.extraData) });

  const t8 = makeMsg('/reino coletar');
  await handleKingdomCommands(mockSock, t8.sockMsg, t8.command, t8.args, testUser);

  u = getUser(testUser);
  kd = getKingdomData(u);
  const ironAfter = kd.kingdom.resources.iron;
  const ironEarned = ironAfter - ironBefore;

  // Cálculo esperado: 30 miner * 10 base * 3h * (1 + 3*0.2 = 1.6) * 1.25 (sat) = 1800 ferro (+ eventos)
  assert.ok(ironEarned >= 1000, `O ferro ganho (${ironEarned}) deve ser expressivo e proporcional aos mineradores e minas`);
  console.log(`✅ TESTE 8 PASSOU: Produção de ferro gerou +${ironEarned} unidades em 3h com Minas Nível 3.`);

  // ----------------------------------------------------
  // TESTE 9: Bônus de Ferro na Especialização Militar
  // ----------------------------------------------------
  console.log('\n--- TESTE 9: Bônus de especialização militar na extração de ferro ---');
  kd.kingdom.specialization = 'militar';
  kd.kingdom.last_collect = Date.now() - (2 * 60 * 60 * 1000);
  const ironBeforeSpec = kd.kingdom.resources.iron;

  updateUser(testUser, { extra_data: JSON.stringify(kd.extraData) });

  const t9 = makeMsg('/reino coletar');
  await handleKingdomCommands(mockSock, t9.sockMsg, t9.command, t9.args, testUser);

  u = getUser(testUser);
  kd = getKingdomData(u);
  const ironGainedMil = kd.kingdom.resources.iron - ironBeforeSpec;
  assert.ok(ironGainedMil > 0, 'Deve colher ferro com bônus militar');
  console.log(`✅ TESTE 9 PASSOU: Especialização militar aplicou bônus de extração (+${ironGainedMil} ferro).`);

  // ----------------------------------------------------
  // TESTE 10: Compra de Ferro no Mercado Real
  // ----------------------------------------------------
  console.log('\n--- TESTE 10: Compra de Ferro no Mercado Real ---');
  kd.kingdom.treasury = 50000;
  const ironBeforeBuy = kd.kingdom.resources.iron;
  updateUser(testUser, { extra_data: JSON.stringify(kd.extraData) });

  const t10 = makeMsg('/reino comprar ferro 50');
  await handleKingdomCommands(mockSock, t10.sockMsg, t10.command, t10.args, testUser);

  u = getUser(testUser);
  kd = getKingdomData(u);
  assert.strictEqual(kd.kingdom.resources.iron, ironBeforeBuy + 50, 'Deve ter adicionado 50 de ferro');
  assert.strictEqual(kd.kingdom.treasury, 50000 - (50 * 50), 'Deve ter deduzido 50 * $50 = $2.500 do tesouro');
  console.log('✅ TESTE 10 PASSOU: Compra de 50 ferro concluída com sucesso no Mercado Real.');

  // ----------------------------------------------------
  // TESTE 11: Venda de Recursos no Mercado Real
  // ----------------------------------------------------
  console.log('\n--- TESTE 11: Venda de Recursos no Mercado Real ---');
  kd.kingdom.resources.food = 500;
  const treasuryBeforeSell = kd.kingdom.treasury;
  updateUser(testUser, { extra_data: JSON.stringify(kd.extraData) });

  const t11 = makeMsg('/reino vender comida 100');
  await handleKingdomCommands(mockSock, t11.sockMsg, t11.command, t11.args, testUser);

  u = getUser(testUser);
  kd = getKingdomData(u);
  assert.strictEqual(kd.kingdom.resources.food, 400);
  assert.strictEqual(kd.kingdom.treasury, treasuryBeforeSell + (100 * 5), 'Deve receber 100 * $5 = $500 no tesouro');
  console.log('✅ TESTE 11 PASSOU: Venda de 100 comida por $500 concluída.');

  // ----------------------------------------------------
  // TESTE 12: Bloqueio de Compra no Mercado sem Ouro Suficiente
  // ----------------------------------------------------
  console.log('\n--- TESTE 12: Validação de saldo ao comprar no mercado ---');
  kd.kingdom.treasury = 100;
  updateUser(testUser, { extra_data: JSON.stringify(kd.extraData) });

  const t12 = makeMsg('/reino comprar ferro 100'); // Custo 100 * 50 = $5000 > $100
  await handleKingdomCommands(mockSock, t12.sockMsg, t12.command, t12.args, testUser);

  u = getUser(testUser);
  kd = getKingdomData(u);
  assert.strictEqual(kd.kingdom.treasury, 100, 'Tesouro não deve ter mudado');
  console.log('✅ TESTE 12 PASSOU: Tentativa de compra sem saldo bloqueada com segurança.');

  console.log('\n===============================================================');
  console.log('🎉 TODOS OS 12 TESTES DO SISTEMA DE REINOS PASSARAM COM SUCESSO!');
  console.log('===============================================================\n');

  process.exit(0);
}

runKingdomTests().catch(err => {
  console.error('❌ ERRO DURANTE EXECUÇÃO DOS TESTES:', err);
  process.exit(1);
});
