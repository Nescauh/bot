import assert from 'assert';
import databaseManager, { getUser, updateUser } from '../src/database/sqlite.js';

async function runTest() {
  console.log('🧪 Iniciando Teste de Persistência...');

  // 1. Inicializa o banco de dados
  await databaseManager.initialize();

  const testJid = `test_persist_${Date.now()}@s.whatsapp.net`;
  const now = Date.now();
  const nowWork = now - 5000;
  const nowAura = now - 10000;

  const initialExtra = {
    pet: { name: 'Fênix', level: 10 },
    reputation: 42,
    prestige: 3,
    aiMode: 'goku'
  };

  // 2. Cria e configura o usuário
  const u = getUser(testJid);
  assert.ok(u, 'Usuário deve ser criado');

  await updateUser(testJid, {
    wallet: 30000,
    aura: 20000,
    xp: 15000,
    level: 25,
    bank: 5000,
    last_daily: now,
    last_work: nowWork,
    last_aura_farm: nowAura,
    extra_data: JSON.stringify(initialExtra)
  });

  await databaseManager.saveDatabase();
  console.log('✅ Dados salvos com sucesso.');

  // 3. Simula reinicialização (limpa a memória RAM e recarrega do banco)
  console.log('🔄 Simulando reboot do bot...');
  databaseManager.memoryStore.users = {};
  await databaseManager.loadFromDb();

  // 4. Carrega novamente o usuário
  const loadedUser = getUser(testJid);
  assert.ok(loadedUser, 'Usuário recarregado deve existir');

  // 5. Verificação campo a campo
  console.log('🔍 Verificando integridade dos campos...');
  assert.strictEqual(Number(loadedUser.wallet), 30000, 'wallet incorreto');
  assert.strictEqual(Number(loadedUser.aura), 20000, 'aura incorreto');
  assert.strictEqual(Number(loadedUser.xp), 15000, 'xp incorreto');
  assert.strictEqual(Number(loadedUser.level), 25, 'level incorreto');
  assert.strictEqual(Number(loadedUser.bank), 5000, 'bank incorreto');

  assert.strictEqual(Number(loadedUser.last_daily), now, 'last_daily timestamp alterado');
  assert.strictEqual(Number(loadedUser.last_work), nowWork, 'last_work timestamp alterado');
  assert.strictEqual(Number(loadedUser.last_aura_farm), nowAura, 'last_aura_farm timestamp alterado');

  // Verificação do extra_data
  const extraParsed = typeof loadedUser.extra_data === 'string' ? JSON.parse(loadedUser.extra_data) : loadedUser.extra_data;
  assert.deepStrictEqual(extraParsed.pet, initialExtra.pet, 'pet em extra_data incorreto');
  assert.strictEqual(extraParsed.reputation, 42, 'reputation incorreto');
  assert.strictEqual(extraParsed.prestige, 3, 'prestige incorreto');
  assert.strictEqual(extraParsed.aiMode, 'goku', 'aiMode incorreto');

  // Propriedades diretas no objeto
  assert.deepStrictEqual(loadedUser.pet, initialExtra.pet, 'propriedade pet direta no objeto incorreta');
  assert.strictEqual(loadedUser.reputation, 42, 'propriedade reputation direta incorreta');

  console.log('🎉 TESTE DE PERSISTÊNCIA PASSOU COM SUCESSO!');
}

runTest().catch(err => {
  console.error('❌ FALA NO TESTE DE PERSISTÊNCIA:', err);
  process.exit(1);
});
