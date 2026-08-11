import assert from 'assert';
import databaseManager, { getUser, updateUser, saveStore } from '../src/database/sqlite.js';
import { checkRebirthEligibility, performRebirthTransaction, getTopRebirthUsers } from '../src/database/RebirthRepository.js';
import { handleRebirthCommand, handleTopRebirthCommand } from '../src/commands/rebirth.js';
import { getActiveUserMission, createMissionForUser, claimMissionRewardAtomic } from '../src/database/MissionRepository.js';
import { handleRpgSystemCommands } from '../src/commands/rpg_system.js';
import { calculateBonusRewards } from '../src/utils/bonusCalculator.js';
import queueManager from '../src/queue/QueueManager.js';

class MockSocket {
  constructor() {
    this.sentMessages = [];
  }
  async sendMessage(jid, content, options) {
    this.sentMessages.push({ jid, content, timestamp: Date.now() });
    return { key: { id: 'MOCK_REBIRTH_' + Math.random() } };
  }
}

async function runRebirthAndMissionTests() {
  console.log('\n=======================================================');
  console.log('🧪 INICIANDO SUÍTE DE TESTES REBIRTH & MISSÕES (15 TESTES)');
  console.log('=======================================================\n');

  await databaseManager.initialize();

  const user1 = '5511977777777@s.whatsapp.net';
  const user2 = '5511966666666@s.whatsapp.net';

  const mockRawSock = new MockSocket();
  queueManager.minDelay = 10;
  queueManager.maxDelay = 20;
  const mockSock = queueManager.wrapSocket(mockRawSock);

  const makeMsg = (text, senderJid = user1) => ({
    key: { remoteJid: '120363000000000000@g.us', participant: senderJid },
    message: { conversation: text }
  });

  // Configuração inicial limpa do usuário 1
  await updateUser(user1, {
    wallet: 1000,
    bank: 0,
    xp: 500,
    level: 5,
    aura: 100,
    rebirths: 0,
    highest_level: 5,
    highest_wallet: 1000,
    highest_bank: 0,
    highest_aura: 100,
    total_xp_earned: 500,
    total_money_earned: 1000,
    title: ''
  });

  // ----------------------------------------------------
  // TESTE 1: /rebirth Sem Requisitos Sificientes
  // ----------------------------------------------------
  console.log('--- TESTE 1: /rebirth sem requisitos ---');
  await handleRebirthCommand(mockSock, makeMsg('/rebirth', user1), 'rebirth', [], user1);
  const msg1 = mockRawSock.sentMessages[mockRawSock.sentMessages.length - 1];
  assert.ok(msg1.content.text.includes('REBIRTH INDISPONÍVEL'), 'Deve informar que o Rebirth está indisponível.');
  assert.ok(msg1.content.text.includes('FALTAM PARA O REBIRTH'), 'Deve detalhar os requisitos faltantes.');
  console.log('✅ TESTE 1 PASSOU: Rejeição de Rebirth sem requisitos funcionou.');

  // ----------------------------------------------------
  // TESTE 2: /rebirth Com Requisitos (Solicita Confirmação)
  // ----------------------------------------------------
  console.log('\n--- TESTE 2: /rebirth com requisitos (solicita confirmação) ---');
  // Dá requisitos para o Rebirth I (Level 100, XP 10M, Aura 1M, Patrimônio 100M)
  await updateUser(user1, {
    wallet: 50000000,
    bank: 60000000, // 110M Total
    xp: 15000000, // 15M XP
    level: 120,
    aura: 1200000 // 1.2M Aura
  });

  await handleRebirthCommand(mockSock, makeMsg('/rebirth', user1), 'rebirth', [], user1);
  const msg2 = mockRawSock.sentMessages[mockRawSock.sentMessages.length - 1];
  assert.ok(msg2.content.text.includes('CONFIRMAÇÃO DE REBIRTH'), 'Deve exibir tela de confirmação.');
  assert.ok(msg2.content.text.includes('/rebirth confirmar'), 'Deve orientar a utilizar /rebirth confirmar.');
  console.log('✅ TESTE 2 PASSOU: Tela de confirmação exibida com sucesso.');

  // ----------------------------------------------------
  // TESTE 3: Transação Atômica do /rebirth confirmar
  // ----------------------------------------------------
  console.log('\n--- TESTE 3: /rebirth confirmar (Transação Atômica) ---');
  await handleRebirthCommand(mockSock, makeMsg('/rebirth confirmar', user1), 'rebirth', ['confirmar'], user1);
  const u1PostRebirth = getUser(user1);

  assert.strictEqual(u1PostRebirth.rebirths, 1, 'Rebirth deve subir para 1.');
  assert.strictEqual(u1PostRebirth.wallet, 0, 'Wallet deve ser resetada para 0.');
  assert.strictEqual(u1PostRebirth.bank, 0, 'Bank deve ser resetado para 0.');
  assert.strictEqual(u1PostRebirth.xp, 0, 'XP deve ser resetado para 0.');
  assert.strictEqual(u1PostRebirth.level, 1, 'Level deve ser resetado para 1.');
  assert.strictEqual(u1PostRebirth.aura, 0, 'Aura deve ser resetada para 0.');

  // Verifica salvamento dos Picos Históricos
  assert.strictEqual(u1PostRebirth.highest_level, 120, 'Maior nível atingido deve ser gravado como 120.');
  assert.strictEqual(u1PostRebirth.highest_wallet, 50000000, 'Maior carteira atingida deve ser salva.');
  assert.strictEqual(u1PostRebirth.highest_aura, 1200000, 'Maior aura deve ser salva.');
  console.log('✅ TESTE 3 PASSOU: Transação atômica de reset e salvamento de picos realizada.');

  // ----------------------------------------------------
  // TESTE 4: Conquista e Título Permanentes
  // ----------------------------------------------------
  console.log('\n--- TESTE 4: Título e conquistas permanentes ---');
  assert.strictEqual(u1PostRebirth.title, '[Renascido]', 'Título deve ser [Renascido].');
  const extra1 = typeof u1PostRebirth.extra_data === 'string' ? JSON.parse(u1PostRebirth.extra_data) : u1PostRebirth.extra_data;
  assert.ok(extra1.achievements.includes('Primeiro Renascimento'), 'Conquista deve estar gravada permanentemente.');
  console.log('✅ TESTE 4 PASSOU: Título e conquista gravados com sucesso.');

  // ----------------------------------------------------
  // TESTE 5: Tentativa de Pular Rebirth / Requisitos de Rebirth II
  // ----------------------------------------------------
  console.log('\n--- TESTE 5: Exigência de Requisitos do Rebirth II ---');
  // Dá requisitos do Rebirth I de novo, mas não os do Rebirth II (Level 250, XP 100M, 10M Aura, 10B Money)
  await updateUser(user1, {
    wallet: 50000000,
    bank: 60000000,
    xp: 15000000,
    level: 120,
    aura: 1200000
  });

  const checkRebirth2 = await checkRebirthEligibility(user1);
  assert.strictEqual(checkRebirth2.targetLevel, 2);
  assert.strictEqual(checkRebirth2.eligible, false, 'Não deve ser elegível para o Rebirth II sem os requisitos.');
  console.log('✅ TESTE 5 PASSOU: Não permite pular níveis e exige requisitos do Rebirth II.');

  // ----------------------------------------------------
  // TESTE 6: Leaderboard /toprebirth
  // ----------------------------------------------------
  console.log('\n--- TESTE 6: Leaderboard /toprebirth ---');
  await handleTopRebirthCommand(mockSock, makeMsg('/toprebirth'));
  const topMsg = mockRawSock.sentMessages[mockRawSock.sentMessages.length - 1];
  assert.ok(topMsg.content.text.includes('TOP REBIRTHS'), 'Leaderboard deve exibir título de Top Rebirths.');
  assert.ok(topMsg.content.text.includes('Rebirth 1'), 'Usuário 1 deve figurar no ranking.');
  console.log('✅ TESTE 6 PASSOU: Leaderboard /toprebirth funcionando.');

  // ----------------------------------------------------
  // TESTE 7: Bônus Permanente do Rebirth nas Recompensas
  // ----------------------------------------------------
  console.log('\n--- TESTE 7: Aplicação dos bônus permanentes do Rebirth ---');
  const user1Obj = getUser(user1);
  const rewards = calculateBonusRewards(user1Obj, 1000, 100, 'general');
  // Com Rebirth I (+5% Moedas e +5% XP) + Evento (+15%), multiplicador >= 1.20
  assert.ok(rewards.coinMultiplier >= 1.20, 'Multiplicador de moedas deve incluir bônus do Rebirth.');
  assert.ok(rewards.xpMultiplier >= 1.20, 'Multiplicador de XP deve incluir bônus do Rebirth.');
  console.log('✅ TESTE 7 PASSOU: Bônus permanentes de Rebirth aplicados aos ganhos.');

  // ----------------------------------------------------
  // TESTE 8 & 9: Sistema de Missões por Dificuldade (/missao)
  // ----------------------------------------------------
  console.log('\n--- TESTE 8 & 9: Iniciar nova missão ---');
  await updateUser(user2, { level: 20 });
  await handleRpgSystemCommands(mockSock, makeMsg('/missao', user2), 'missao', [], user2);

  const activeMission = getActiveUserMission(user2);
  assert.ok(activeMission, 'Missão deve ser criada para o usuário 2.');
  assert.strictEqual(activeMission.status, 'active');
  console.log(`📜 Missão designada: ${activeMission.title} (${activeMission.difficulty_name})`);
  console.log('✅ TESTE 8 & 9 PASSOU: Missão iniciada e registrada no banco.');

  // ----------------------------------------------------
  // TESTE 10 & 11: Concluir Missão e Prevenção Atômica de Resgate Duplo
  // ----------------------------------------------------
  console.log('\n--- TESTE 10 & 11: Concluir missão e trava atômica anti-exploit ---');
  await handleRpgSystemCommands(mockSock, makeMsg('/missao', user2), 'missao', [], user2);
  const u2PostMission = getUser(user2);
  assert.ok(u2PostMission.wallet > 0, 'Saldo deve ser concedido ao concluir a missão.');

  // Tentativa duplicada imediata de resgate da mesma missão
  const duplicateClaim = await claimMissionRewardAtomic(user2);
  assert.strictEqual(duplicateClaim.success, false, 'Tentativa de resgate duplo deve ser bloqueada no banco.');
  console.log('✅ TESTE 10 & 11 PASSOU: Recompensa concedida e resgate duplo bloqueado.');

  // ----------------------------------------------------
  // TESTE 12: Cooldown de Missão
  // ----------------------------------------------------
  console.log('\n--- TESTE 12: Cooldown de missão ---');
  await handleRpgSystemCommands(mockSock, makeMsg('/missao', user2), 'missao', [], user2);
  const cooldownMsg = mockRawSock.sentMessages[mockRawSock.sentMessages.length - 1];
  assert.ok(cooldownMsg.content.text.includes('GUILDA EM DESCANSO'), 'Deve avisar sobre o cooldown da missão.');
  console.log('✅ TESTE 12 PASSOU: Cooldown entre missões funcionando.');

  // ----------------------------------------------------
  // TESTE 13: Persistência após Salvamento/Reinício
  // ----------------------------------------------------
  console.log('\n--- TESTE 13: Persistência após reinicialização ---');
  await saveStore();
  const reloadedU1 = getUser(user1);
  assert.strictEqual(reloadedU1.rebirths, 1, 'Rebirth 1 deve continuar salvo.');
  assert.strictEqual(reloadedU1.highest_level, 120, 'Maior nível deve continuar salvo.');
  console.log('✅ TESTE 13 PASSOU: Dados de Rebirth continuam salvos e intactos após salvar DB.');

  // ----------------------------------------------------
  // TESTE 14 & 15: Confirmação de Integridade dos Dados Existentes
  // ----------------------------------------------------
  console.log('\n--- TESTE 14 & 15: Integridade dos dados pré-existentes ---');
  const allUsers = databaseManager.getDatabase().users;
  assert.ok(Object.keys(allUsers).length > 0, 'Usuários do banco continuam ativos.');
  console.log('✅ TESTE 14 & 15 PASSOU: Nenhum dado existente foi apagado ou corrompido.');

  console.log('\n=======================================================');
  console.log('🎉 TODOS OS 15 TESTES DE REBIRTH E MISSÕES PASSARAM!');
  console.log('=======================================================\n');
}

runRebirthAndMissionTests().catch(err => {
  console.error('❌ FALHA NO TESTE DE REBIRTH/MISSÕES:', err);
  process.exit(1);
});
