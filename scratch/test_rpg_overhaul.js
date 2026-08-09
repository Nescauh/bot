import assert from 'assert';
import { getAuraBuffs, getUserStats, calculateBonusRewards, checkAndApplyLevelUp, calculateLevelFromXp } from '../src/utils/bonusCalculator.js';
import { getAuraRank } from '../src/commands/economy/aura.js';
import { getKingdomData } from '../src/commands/kingdom_system.js';

console.log('🧪 Iniciando testes de validação do Overhaul RPG & Reinos...');

// 1. Teste de Auras Estendidas
const rank1M = getAuraRank(1000000);
assert.strictEqual(rank1M.color, 'Divina Cósmica Suprema');
assert.strictEqual(rank1M.buff.bonusHp, 12000);
assert.strictEqual(rank1M.buff.bonusAtk, 3000);

const rank200k = getAuraRank(200000);
assert.strictEqual(rank200k.color, 'Astral Imortal');
assert.strictEqual(rank200k.buff.bonusHp, 3000);

console.log('✅ Teste 1: Auras estendidas validadas com sucesso!');

// 2. Teste de Level Up Unificado
const lvl1 = calculateLevelFromXp(0);
assert.strictEqual(lvl1, 1);

const lvl10 = calculateLevelFromXp(4050); // sqrt(4050/50) + 1 = sqrt(81) + 1 = 10
assert.strictEqual(lvl10, 10);

const userTest = { jid: '5571988888888@s.whatsapp.net', xp: 4000, level: 9 };
const lvlUpResult = checkAndApplyLevelUp(userTest, 100);
assert.strictEqual(lvlUpResult.newLevel, 10);
assert.strictEqual(lvlUpResult.leveledUp, true);

console.log('✅ Teste 2: Level Up unificado validado!');

// 3. Teste de Prestígio e Pets em getUserStats
const prestigeUser = {
  jid: '5571988888888@s.whatsapp.net',
  level: 1,
  aura: 200000,
  extra_data: JSON.stringify({
    prestige: 2,
    pet: { type: 'dragao', level: 5 }
  })
};

const stats = getUserStats(prestigeUser);
assert.strictEqual(stats.prestige, 2);
assert.ok(stats.maxHp > 3000, 'HP deve incluir aura e prestígio');
assert.ok(stats.totalAtk > 700, 'ATK deve incluir aura e prestígio');

console.log('✅ Teste 3: Buffs de Prestígio, Pets e Atributos validados!');

// 4. Teste de Monarquia e Reinos
const monarchUser = {
  jid: '5571988888888@s.whatsapp.net',
  extra_data: JSON.stringify({
    houses: ['casa', 'imperio'],
    monarchy_title: 'Imperador Soberano'
  })
};

const kd = getKingdomData(monarchUser);
assert.strictEqual(kd.isMonarch, true);
assert.strictEqual(kd.monarchyTitle, 'Imperador Soberano');

console.log('✅ Teste 4: Dados de Monarquia e Reinos validados!');

console.log('🎉 TODOS OS TESTES PASSARAM COM SUCESSO!');
