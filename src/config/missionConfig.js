export const MISSION_DIFFICULTIES = {
  facil: {
    key: 'facil',
    name: '🟢 Fácil',
    cooldownMs: 15 * 60 * 1000, // 15 minutos
    levelReq: 1,
    minMoney: 500,
    maxMoney: 1500,
    minXp: 50,
    maxXp: 150,
    weight: 40,
    quests: [
      { id: 'f_1', title: '📜 Limpeza do Sótão da Taverna' },
      { id: 'f_2', title: '📜 Coleta de Ervas Medicinais na Floresta' },
      { id: 'f_3', title: '📜 Entrega de Suprimentos ao Ferreiro' },
      { id: 'f_4', title: '📜 Patrulha nas Ruas da Vila' }
    ]
  },
  normal: {
    key: 'normal',
    name: '🟡 Normal',
    cooldownMs: 30 * 60 * 1000, // 30 minutos
    levelReq: 5,
    minMoney: 2000,
    maxMoney: 5000,
    minXp: 200,
    maxXp: 450,
    weight: 30,
    quests: [
      { id: 'n_1', title: '📜 Defesa do Canteiro de Obras contra Goblins' },
      { id: 'n_2', title: '📜 Resgate do Amuleto Perdido dos Mercadores' },
      { id: 'n_3', title: '📜 Caça aos Lobos Cinzentos da Montanha' },
      { id: 'n_4', title: '📜 Escolta da Caravana de Comércio' }
    ]
  },
  dificil: {
    key: 'dificil',
    name: '🟠 Difícil',
    cooldownMs: 60 * 60 * 1000, // 1 hora
    levelReq: 15,
    minMoney: 7500,
    maxMoney: 15000,
    minXp: 600,
    maxXp: 1200,
    weight: 18,
    quests: [
      { id: 'd_1', title: '📜 Exploração da Caverna de Cristal Encantado' },
      { id: 'd_2', title: '📜 Extermínio da Ninho de Harpias das Rochas' },
      { id: 'd_3', title: '📜 Purificação do Altar das Sombras' },
      { id: 'd_4', title: '📜 Derrota do Bando de Saqueadores Orcs' }
    ]
  },
  extrema: {
    key: 'extrema',
    name: '🔴 Extrema',
    cooldownMs: 3 * 60 * 60 * 1000, // 3 horas
    levelReq: 40,
    minMoney: 25000,
    maxMoney: 50000,
    minXp: 1500,
    maxXp: 3000,
    weight: 9,
    quests: [
      { id: 'e_1', title: '📜 Confronto com o General Morto-Vivo' },
      { id: 'e_2', title: '📜 Invasão à Cripta do Nigromante Solitário' },
      { id: 'e_3', title: '📜 Captura da Esfera de Fogo Elemental' }
    ]
  },
  lendaria: {
    key: 'lendaria',
    name: '🟣 Lendária',
    cooldownMs: 6 * 60 * 60 * 1000, // 6 horas
    levelReq: 75,
    minMoney: 80000,
    maxMoney: 150000,
    minXp: 4000,
    maxXp: 8000,
    weight: 3,
    quests: [
      { id: 'l_1', title: '📜 Caça ao Dragão Ancião das Cinzas' },
      { id: 'l_2', title: '📜 Defesa da Cidadela Real contra o Devorador de Almas' },
      { id: 'l_3', title: '📜 Selamento da Fenda Abissal dos Titãs' }
    ]
  }
};

export function getRandomQuestForUser(userLevel = 1) {
  const availableDifficulties = Object.values(MISSION_DIFFICULTIES).filter(d => userLevel >= d.levelReq);
  
  let totalWeight = availableDifficulties.reduce((acc, curr) => acc + curr.weight, 0);
  let randomRoll = Math.floor(Math.random() * totalWeight);

  let selectedDiff = availableDifficulties[0];
  for (const diff of availableDifficulties) {
    if (randomRoll < diff.weight) {
      selectedDiff = diff;
      break;
    }
    randomRoll -= diff.weight;
  }

  const questTemplate = selectedDiff.quests[Math.floor(Math.random() * selectedDiff.quests.length)];
  const rewardMoney = Math.floor(Math.random() * (selectedDiff.maxMoney - selectedDiff.minMoney + 1)) + selectedDiff.minMoney;
  const rewardXp = Math.floor(Math.random() * (selectedDiff.maxXp - selectedDiff.minXp + 1)) + selectedDiff.minXp;

  return {
    missionId: `${questTemplate.id}_${Date.now()}`,
    difficultyKey: selectedDiff.key,
    difficultyName: selectedDiff.name,
    cooldownMs: selectedDiff.cooldownMs,
    title: questTemplate.title,
    rewardMoney,
    rewardXp
  };
}
