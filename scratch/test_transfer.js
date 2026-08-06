import assert from 'assert';
import databaseManager, { getUser, updateUser, transferMoney } from '../src/database/sqlite.js';

async function runTransferTest() {
  console.log('🧪 Iniciando Teste de Transações de Transferência...');

  await databaseManager.initialize();

  const userAJid = `user_a_${Date.now()}@s.whatsapp.net`;
  const userBJid = `user_b_${Date.now()}@s.whatsapp.net`;

  // 1. Configura Usuário A (10000) e Usuário B (1000)
  getUser(userAJid);
  getUser(userBJid);

  await updateUser(userAJid, { wallet: 10000 });
  await updateUser(userBJid, { wallet: 1000 });
  await databaseManager.saveDatabase();

  console.log('💵 Saldos iniciais -> A: 10000, B: 1000');

  // 2. Transfere 3000 de A para B
  await transferMoney(userAJid, userBJid, 3000);

  const uA = getUser(userAJid);
  const uB = getUser(userBJid);

  assert.strictEqual(uA.wallet, 7000, 'Saldo do usuário A deve ser 7000 após a transferência');
  assert.strictEqual(uB.wallet, 4000, 'Saldo do usuário B deve ser 4000 após a transferência');
  console.log('✅ Transferência de 3000 realizada com sucesso -> A: 7000, B: 4000');

  // 3. Simula falha por saldo insuficiente (não deve alterar saldos)
  try {
    await transferMoney(userAJid, userBJid, 50000);
    assert.fail('Deveria ter lançado erro por saldo insuficiente');
  } catch (err) {
    assert.strictEqual(err.message, 'Saldo insuficiente.');
  }

  assert.strictEqual(getUser(userAJid).wallet, 7000, 'Saldo do usuário A deve continuar 7000');
  assert.strictEqual(getUser(userBJid).wallet, 4000, 'Saldo do usuário B deve continuar 4000');
  console.log('✅ Tentativa de saldo insuficiente bloqueada e mantida inalterada.');

  // 4. Simulação de falha no meio da transação com Rollback
  console.log('🔄 Simulando falha durante a transação...');

  // Injeta erro simulado ao forçar uma exceção na query
  const originalRun = databaseManager.dbInstance ? databaseManager.dbInstance.run : null;
  const originalPg = databaseManager.pgClient ? databaseManager.pgClient.query : null;

  if (databaseManager.isPg) {
    let queryCallCount = 0;
    databaseManager.pgClient.query = async (...args) => {
      queryCallCount++;
      if (args[0] && args[0].includes('UPDATE users SET wallet = $1 WHERE jid = $2') && queryCallCount === 3) {
        throw new Error('SIMULATED_DB_FAILURE_DURING_TRANSACTION');
      }
      return originalPg.apply(databaseManager.pgClient, args);
    };
  } else if (databaseManager.dbInstance) {
    let runCallCount = 0;
    databaseManager.dbInstance.run = (...args) => {
      runCallCount++;
      // Falha na segunda atualização (do destinatário)
      if (args[0] && args[0].includes('UPDATE users SET wallet = ? WHERE jid = ?') && runCallCount === 2) {
        throw new Error('SIMULATED_DB_FAILURE_DURING_TRANSACTION');
      }
      return originalRun.apply(databaseManager.dbInstance, args);
    };
  }

  try {
    await transferMoney(userAJid, userBJid, 2000);
    assert.fail('Deveria ter falhado no erro injetado');
  } catch (err) {
    assert.strictEqual(err.message, 'SIMULATED_DB_FAILURE_DURING_TRANSACTION');
    console.log('✅ Erro simulado capturado com sucesso.');
  } finally {
    // Restaura métodos originais
    if (databaseManager.isPg) {
      databaseManager.pgClient.query = originalPg;
    } else if (databaseManager.dbInstance) {
      databaseManager.dbInstance.run = originalRun;
    }
  }

  // Recarrega do banco para garantir que nada foi alterado devido ao rollback
  databaseManager.memoryStore.users = {};
  await databaseManager.loadFromDb();

  const finalA = getUser(userAJid);
  const finalB = getUser(userBJid);

  assert.strictEqual(finalA.wallet, 7000, 'Rollback falhou: Saldo de A foi alterado no erro!');
  assert.strictEqual(finalB.wallet, 4000, 'Rollback falhou: Saldo de B foi alterado no erro!');
  console.log('✅ Rollback verificado com sucesso! Saldos mantidos -> A: 7000, B: 4000');

  console.log('🎉 TESTE DE TRANSFERÊNCIA E ROLLBACK PASSOU COM SUCESSO!');
}

runTransferTest().catch(err => {
  console.error('❌ FALHA NO TESTE DE TRANSFERÊNCIA:', err);
  process.exit(1);
});
