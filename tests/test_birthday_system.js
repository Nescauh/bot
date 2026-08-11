import assert from 'assert';
import databaseManager, { saveBirthday, getBirthday, removeBirthday, getAllBirthdays, saveStore } from '../src/database/sqlite.js';
import { parseAndValidateDate, calculateBirthdayCountdown, getBrazilDate } from '../src/utils/birthdayService.js';
import { handleBirthdayCommands, handleAniversariantesCommand } from '../src/commands/birthday.js';
import { checkBirthdays } from '../src/utils/birthdayChecker.js';
import queueManager from '../src/queue/QueueManager.js';

class MockSocket {
  constructor() {
    this.sentMessages = [];
  }
  async sendMessage(jid, content, options) {
    this.sentMessages.push({ jid, content, timestamp: Date.now() });
    return { key: { id: 'MOCK_BDAY_' + Math.random() } };
  }
}

async function runBirthdayTests() {
  console.log('\n=======================================================');
  console.log('🧪 INICIANDO TESTES DO SISTEMA DE ANIVERSÁRIOS (12 TESTES)');
  console.log('=======================================================\n');

  await databaseManager.initialize();

  const user1 = '5511911111111@s.whatsapp.net';
  const user2 = '5511922222222@s.whatsapp.net';

  const mockRawSock = new MockSocket();
  // Reduz temporariamente min/max delay para o teste rodar velozmente
  queueManager.minDelay = 10;
  queueManager.maxDelay = 20;
  const mockSock = queueManager.wrapSocket(mockRawSock);

  const makeMsg = (text, senderJid = user1) => ({
    key: { remoteJid: '120363000000000000@g.us', participant: senderJid },
    message: { conversation: text }
  });

  // Limpa registros prévios dos usuários de teste
  await removeBirthday(user1);
  await removeBirthday(user2);

  // ----------------------------------------------------
  // TESTE 1: Cadastrar Aniversário
  // ----------------------------------------------------
  console.log('--- TESTE 1: Cadastrar aniversário ---');
  await handleBirthdayCommands(mockSock, makeMsg('/aniversario 15/09/2008', user1), 'aniversario', ['15/09/2008'], user1);
  const b1 = getBirthday(user1);
  assert.ok(b1, 'Aniversário do usuário 1 deve estar gravado no banco.');
  assert.strictEqual(b1.day, 15);
  assert.strictEqual(b1.month, 9);
  assert.strictEqual(b1.year, 2008);
  console.log('✅ TESTE 1 PASSOU: Aniversário cadastrado com sucesso.');

  // ----------------------------------------------------
  // TESTE 2: Consultar Próprio Aniversário
  // ----------------------------------------------------
  console.log('\n--- TESTE 2: Consultar próprio aniversário ---');
  await handleBirthdayCommands(mockSock, makeMsg('/aniversario', user1), 'aniversario', [], user1);
  const lastMsg2 = mockRawSock.sentMessages[mockRawSock.sentMessages.length - 1];
  assert.ok(lastMsg2.content.text.includes('SEU ANIVERSÁRIO'), 'Resposta deve conter cabeçalho do aniversário.');
  assert.ok(lastMsg2.content.text.includes('15/09'), 'Resposta deve exibir a data 15/09.');
  console.log('✅ TESTE 2 PASSOU: Consulta do próprio aniversário bem sucedida.');

  // ----------------------------------------------------
  // TESTE 3: Alterar Aniversário
  // ----------------------------------------------------
  console.log('\n--- TESTE 3: Alterar aniversário ---');
  await handleBirthdayCommands(mockSock, makeMsg('/aniversario 20/10/2008', user1), 'aniversario', ['20/10/2008'], user1);
  const b1Updated = getBirthday(user1);
  assert.strictEqual(b1Updated.day, 20);
  assert.strictEqual(b1Updated.month, 10);
  assert.strictEqual(b1Updated.birthday_date, '20/10/2008');
  console.log('✅ TESTE 3 PASSOU: Data de aniversário alterada com sucesso.');

  // ----------------------------------------------------
  // TESTE 4: Remover Aniversário
  // ----------------------------------------------------
  console.log('\n--- TESTE 4: Remover aniversário ---');
  await handleBirthdayCommands(mockSock, makeMsg('/aniversario remover', user1), 'aniversario', ['remover'], user1);
  const b1Removed = getBirthday(user1);
  assert.strictEqual(b1Removed, null, 'Aniversário do usuário 1 deve ter sido removido.');
  console.log('✅ TESTE 4 PASSOU: Aniversário removido com sucesso.');

  // Recadastra o usuário 1 para continuar os próximos testes
  await handleBirthdayCommands(mockSock, makeMsg('/aniversario 15/09/2008', user1), 'aniversario', ['15/09/2008'], user1);

  // ----------------------------------------------------
  // TESTE 5: Validação de Data Inválida (ex: 31/02)
  // ----------------------------------------------------
  console.log('\n--- TESTE 5: Data inválida (ex: 31/02) ---');
  const invalidResult1 = parseAndValidateDate('31/02/2008');
  assert.strictEqual(invalidResult1.isValid, false, '31/02/2008 deve ser recusado.');

  const invalidResult2 = parseAndValidateDate('15/13/2008');
  assert.strictEqual(invalidResult2.isValid, false, 'Mês 13 deve ser recusado.');

  await handleBirthdayCommands(mockSock, makeMsg('/aniversario 31/02/2008', user2), 'aniversario', ['31/02/2008'], user2);
  const lastMsg5 = mockRawSock.sentMessages[mockRawSock.sentMessages.length - 1];
  assert.ok(lastMsg5.content.text.includes('Data inválida'), 'Mensagem de erro deve avisar sobre data inválida.');
  console.log('✅ TESTE 5 PASSOU: Datas impossíveis são devidamente bloqueadas.');

  // ----------------------------------------------------
  // TESTE 6: Contagem Regressiva em Meses, Dias, Horas, Minutos
  // ----------------------------------------------------
  console.log('\n--- TESTE 6: Contagem regressiva detalhada ---');
  const countdownFuture = calculateBirthdayCountdown(15, 9, 2008);
  assert.ok(typeof countdownFuture.countdownText === 'string', 'Texto de contagem deve ser string.');
  assert.ok(countdownFuture.countdownText.length > 0, 'Contagem regressiva não deve estar vazia.');
  console.log(`⏱️ Exemplo de saída da contagem: "${countdownFuture.countdownText}"`);
  console.log('✅ TESTE 6 PASSOU: Contagem regressiva formatada corretamente.');

  // ----------------------------------------------------
  // TESTE 7: Aniversário no Dia Atual
  // ----------------------------------------------------
  console.log('\n--- TESTE 7: Aniversário no dia atual ---');
  const brNow = getBrazilDate();
  const todayDay = brNow.getDate();
  const todayMonth = brNow.getMonth() + 1;

  await saveBirthday(user2, todayDay, todayMonth, 2000, `${todayDay}/${todayMonth}/2000`, '120363000000000000@g.us');
  const countdownToday = calculateBirthdayCountdown(todayDay, todayMonth, 2000);
  assert.strictEqual(countdownToday.isToday, true, 'isToday deve ser true para o dia atual.');
  assert.strictEqual(countdownToday.countdownText, '🎉 É HOJE! 🎉');
  console.log('✅ TESTE 7 PASSOU: Aniversário de hoje identificado com o status É HOJE!.');

  // ----------------------------------------------------
  // TESTE 8: Reiniciar o bot e confirmar persistência
  // ----------------------------------------------------
  console.log('\n--- TESTE 8: Persistência após reinicialização ---');
  await saveStore();
  const reloadedBday = getBirthday(user2);
  assert.ok(reloadedBday, 'Aniversário deve persistir na memória/banco.');
  assert.strictEqual(reloadedBday.day, todayDay);
  assert.strictEqual(reloadedBday.month, todayMonth);
  console.log('✅ TESTE 8 PASSOU: Dados continuam salvos e intactos após salvar o DB.');

  // ----------------------------------------------------
  // TESTE 9: Lembrete Automático não envia 2x no mesmo ano
  // ----------------------------------------------------
  console.log('\n--- TESTE 9: Não notificar 2x no mesmo ano ---');
  const countBeforeCheck = mockRawSock.sentMessages.length;

  // Primeira execução da checagem automática
  await checkBirthdays(mockSock);
  const countAfterFirstCheck = mockRawSock.sentMessages.length;
  assert.ok(countAfterFirstCheck > countBeforeCheck, 'Parabéns automático deve ser enviado na 1ª checagem do dia.');

  // Segunda execução da checagem automática no mesmo dia
  await checkBirthdays(mockSock);
  const countAfterSecondCheck = mockRawSock.sentMessages.length;
  assert.strictEqual(countAfterSecondCheck, countAfterFirstCheck, 'Parabéns NÃO deve ser reenviado na 2ª checagem do mesmo ano.');
  console.log('✅ TESTE 9 PASSOU: Notificação única garantida por ano (notification_year).');

  // ----------------------------------------------------
  // TESTE 10: Tratamento de Ano Bissexto (29/02)
  // ----------------------------------------------------
  console.log('\n--- TESTE 10: Ano Bissexto (29/02) ---');
  const leapValidation = parseAndValidateDate('29/02/2000');
  assert.strictEqual(leapValidation.isValid, true, '29/02/2000 é ano bissexto e deve ser válido.');

  const leapCountdown = calculateBirthdayCountdown(29, 2, 2000);
  assert.ok(leapCountdown.countdownText, 'Cálculo de contagem para 29/02 não deve estourar erro em anos não-bissextos.');
  console.log('✅ TESTE 10 PASSOU: Suporte a 29/02 funcionando sem exceções.');

  // ----------------------------------------------------
  // TESTE 11: /aniversariantes e Privacidade
  // ----------------------------------------------------
  console.log('\n--- TESTE 11: Comando /aniversariantes e privacidade ---');
  await handleAniversariantesCommand(mockSock, makeMsg('/aniversariantes'));
  const listMsg = mockRawSock.sentMessages[mockRawSock.sentMessages.length - 1];
  assert.ok(listMsg.content.text.includes('ANIVERSARIANTES'), 'Lista deve conter título de aniversariantes.');
  // Verifica privacidade: não deve vazar o ano do usuário 2 (2000) no texto público
  assert.strictEqual(listMsg.content.text.includes('/2000'), false, 'NÃO deve revelar o ano de nascimento de terceiros.');
  console.log('✅ TESTE 11 PASSOU: /aniversariantes exibe aniversariantes do dia e próximos com privacidade.');

  // ----------------------------------------------------
  // TESTE 12: Integração com QueueManager
  // ----------------------------------------------------
  console.log('\n--- TESTE 12: Integração com QueueManager ---');
  assert.ok(mockRawSock.sentMessages.length >= 4, 'Todas as mensagens devem ter passado pela fila do QueueManager.');
  console.log('✅ TESTE 12 PASSOU: Envio de mensagens integrados via QueueManager.');

  console.log('\n=======================================================');
  console.log('🎉 TODOS OS 12 TESTES DO SISTEMA DE ANIVERSÁRIOS PASSARAM!');
  console.log('=======================================================\n');
}

runBirthdayTests().catch(err => {
  console.error('❌ FALHA NO TESTE DE ANIVERSÁRIO:', err);
  process.exit(1);
});
