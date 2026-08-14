import assert from 'assert';
import databaseManager, { getUser, updateUser } from '../src/database/sqlite.js';
import { PersonalityManager, QUINTUPLETS } from '../src/interaction/PersonalityManager.js';
import { conversationMemory } from '../src/interaction/ConversationMemory.js';
import { ContextManager } from '../src/interaction/ContextManager.js';
import { handleAiExtraCommands } from '../src/commands/ai_extra.js';
import queueManager from '../src/queue/QueueManager.js';

class MockSocket {
  constructor() {
    this.sentMessages = [];
  }
  async sendMessage(jid, content, options) {
    this.sentMessages.push({ jid, content, timestamp: Date.now() });
    return { key: { id: 'MOCK_AI_' + Math.random() } };
  }
}

async function runQuintupletsAiTests() {
  console.log('\n===============================================================');
  console.log('🧪 INICIANDO TESTES: PERSONALIDADES DAS QUINTUPLETS & MEMÓRIA IA');
  console.log('===============================================================\n');

  await databaseManager.initialize();

  queueManager.minDelay = 5;
  queueManager.maxDelay = 10;

  const mockRawSock = new MockSocket();
  const mockSock = queueManager.wrapSocket(mockRawSock);

  const testUser = `5511955554444_${Date.now()}@s.whatsapp.net`;
  const chatJid = '120363000000000000@g.us';

  updateUser(testUser, {
    wallet: 1000,
    bank: 0,
    inventory: '[]',
    extra_data: JSON.stringify({})
  });

  const makeMsg = (text, cmdName = 'ia') => {
    const parts = text.trim().split(/\s+/);
    const cmd = cmdName;
    const args = parts.slice(1);
    return {
      sockMsg: {
        key: { remoteJid: chatJid, participant: testUser },
        message: { conversation: text }
      },
      command: cmd,
      args
    };
  };

  // ----------------------------------------------------
  // TESTE 1: Validar Existência das 5 Irmãs Nakano
  // ----------------------------------------------------
  console.log('--- TESTE 1: Definições das 5 Irmãs Nakano ---');
  const sisters = ['nino', 'miku', 'ichika', 'yotsuba', 'itsuki'];
  for (const s of sisters) {
    assert.ok(QUINTUPLETS[s], `Irmã ${s} deve existir`);
    assert.ok(QUINTUPLETS[s].systemPrompt.length > 50, `System prompt de ${s} deve ser rico`);
  }
  console.log('✅ TESTE 1 PASSOU: Nino, Miku, Ichika, Yotsuba e Itsuki configuradas perfeitamente.');

  // ----------------------------------------------------
  // TESTE 2: Detecção de Irmã Citada no Texto
  // ----------------------------------------------------
  console.log('\n--- TESTE 2: Detecção de Menção Nominal das Irmãs ---');
  assert.strictEqual(PersonalityManager.detectMentionedQuintuplet('Nino, o que você acha disso?'), 'nino');
  assert.strictEqual(PersonalityManager.detectMentionedQuintuplet('Miku você sabe quem foi Oda Nobunaga?'), 'miku');
  assert.strictEqual(PersonalityManager.detectMentionedQuintuplet('Ichika você foi gravar o filme hoje?'), 'ichika');
  assert.strictEqual(PersonalityManager.detectMentionedQuintuplet('Yotsuba vamos correr no parque!'), 'yotsuba');
  assert.strictEqual(PersonalityManager.detectMentionedQuintuplet('Itsuki qual seu restaurante favorito?'), 'itsuki');
  assert.strictEqual(PersonalityManager.detectMentionedQuintuplet('Olá tudo bem bot?'), null);
  console.log('✅ TESTE 2 PASSOU: Detecção nominal identificou cada irmã corretamente.');

  // ----------------------------------------------------
  // TESTE 3: Selecionar Irmã pelo Comando /ia nino e /miku
  // ----------------------------------------------------
  console.log('\n--- TESTE 3: Seleção de Irmã Ativa ---');
  const t3a = makeMsg('/ia nino', 'ia');
  await handleAiExtraCommands(mockSock, t3a.sockMsg, t3a.command, t3a.args, testUser);

  let u = getUser(testUser);
  let extra = JSON.parse(u.extra_data || '{}');
  assert.strictEqual(extra.quintuplet, 'nino', 'Nino deve ser a personagem ativa');

  const t3b = makeMsg('/miku', 'miku');
  await handleAiExtraCommands(mockSock, t3b.sockMsg, t3b.command, t3b.args, testUser);

  u = getUser(testUser);
  extra = JSON.parse(u.extra_data || '{}');
  assert.strictEqual(extra.quintuplet, 'miku', 'Miku deve ser a personagem ativa');
  console.log('✅ TESTE 3 PASSOU: Comandos /ia nino e /miku ativaram as personagens no perfil.');

  // ----------------------------------------------------
  // TESTE 4: Gravação e Persistência de Memórias (/ia lembra)
  // ----------------------------------------------------
  console.log('\n--- TESTE 4: Gravação Persistente de Memória ---');
  const t4 = makeMsg('/ia lembra que minha comida favorita é lasanha à bolonhesa', 'ia');
  await handleAiExtraCommands(mockSock, t4.sockMsg, t4.command, t4.args, testUser);

  u = getUser(testUser);
  extra = JSON.parse(u.extra_data || '{}');
  assert.ok(extra.ai_memory && extra.ai_memory.length > 0, 'Memória deve estar salva no banco de dados');
  assert.ok(extra.ai_memory[0].includes('lasanha'), 'Fato deve conter a comida favorita');

  const loadedFacts = ContextManager.getUserFacts(testUser);
  assert.ok(loadedFacts.some(f => f.includes('lasanha')), 'ContextManager deve carregar a memória do banco');
  console.log('✅ TESTE 4 PASSOU: Memória do usuário gravada e persistida no banco com sucesso.');

  // ----------------------------------------------------
  // TESTE 5: Injeção de Memória no System Instruction
  // ----------------------------------------------------
  console.log('\n--- TESTE 5: Injeção de Memória no Prompt de Sistema ---');
  const systemPrompt = PersonalityManager.getSystemInstruction({
    quintupletId: 'nino',
    groupName: 'Família Nakano',
    userName: 'Carlos',
    userFacts: loadedFacts
  });

  assert.ok(systemPrompt.includes('NINO NAKANO'), 'Deve conter o nome da Nino');
  assert.ok(systemPrompt.includes('lasanha'), 'Deve injetar a memória da lasanha no prompt da Nino');
  assert.ok(systemPrompt.includes('Carlos'), 'Deve conter o nome do usuário');
  console.log('✅ TESTE 5 PASSOU: Instrução de sistema gerada com a persona da Nino e fatos do usuário.');

  // ----------------------------------------------------
  // TESTE 6: Histórico Multi-turn para a LLM
  // ----------------------------------------------------
  console.log('\n--- TESTE 6: Formatação de Chat Multi-turn ---');
  conversationMemory.clearHistory(chatJid);

  conversationMemory.addMessage(chatJid, {
    id: 'M1',
    sender: testUser,
    senderName: 'Carlos',
    text: 'Oi Nino, tudo bem?',
    isBot: false
  });

  conversationMemory.addMessage(chatJid, {
    id: 'M2',
    sender: 'bot',
    senderName: 'Nino Nakano',
    text: 'Hmph, o que você quer? Não é como se eu estivesse esperando você me chamar...',
    isBot: true
  });

  const chatMessages = conversationMemory.getMultiTurnMessages(
    chatJid,
    systemPrompt,
    'Você se lembra do que eu gosto de comer?',
    10
  );

  assert.strictEqual(chatMessages[0].role, 'system', 'Primeira mensagem deve ser system');
  assert.strictEqual(chatMessages[1].role, 'user', 'Segunda mensagem deve ser user');
  assert.strictEqual(chatMessages[2].role, 'assistant', 'Terceira mensagem deve ser assistant');
  assert.strictEqual(chatMessages[3].role, 'user', 'Última mensagem deve ser o prompt atual');
  assert.ok(chatMessages[3].content.includes('gosto de comer'));

  console.log('✅ TESTE 6 PASSOU: Estrutura multi-turn [system, user, assistant, user] montada com precisão.');

  console.log('\n===============================================================');
  console.log('🎉 TODOS OS TESTES DAS QUINTUPLETS E MEMÓRIA IA PASSARAM!');
  console.log('===============================================================\n');

  process.exit(0);
}

runQuintupletsAiTests().catch(err => {
  console.error('❌ ERRO DURANTE TESTES DAS QUINTUPLETS:', err);
  process.exit(1);
});
