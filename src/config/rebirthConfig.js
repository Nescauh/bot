export const REBIRTH_CONFIG = {
  // Bônus base por nível de Rebirth (+5% Moedas e +5% XP por nível)
  COIN_BONUS_PER_LEVEL: 0.05,
  XP_BONUS_PER_LEVEL: 0.05,

  // Níveis pré-definidos do Rebirth (Endgame ultra exigente)
  LEVELS: {
    1: {
      rebirthLevel: 1,
      name: 'Rebirth I',
      rarity: 'Lendário 🌟',
      levelReq: 100,
      xpReq: 10000000, // 10M XP
      auraReq: 1000000, // 1M Aura
      moneyReq: 100000000, // 100M (Wallet + Bank)
      title: '[Renascido]',
      achievement: 'Primeiro Renascimento',
      coinBonus: 0.05,
      xpBonus: 0.05
    },
    2: {
      rebirthLevel: 2,
      name: 'Rebirth II',
      rarity: 'Mítico 🔮',
      levelReq: 250,
      xpReq: 100000000, // 100M XP
      auraReq: 10000000, // 10M Aura
      moneyReq: 10000000000, // 10B (Wallet + Bank)
      title: '[Ascendente]',
      achievement: 'Renascido',
      coinBonus: 0.10,
      xpBonus: 0.10
    },
    3: {
      rebirthLevel: 3,
      name: 'Rebirth III',
      rarity: 'Divino ⚡',
      levelReq: 500,
      xpReq: 1000000000, // 1B XP
      auraReq: 100000000, // 100M Aura
      moneyReq: 1000000000000, // 1T (Teto da Economia)
      title: '[Transcendente]',
      achievement: 'Além dos Limites',
      coinBonus: 0.15,
      xpBonus: 0.15
    },
    4: {
      rebirthLevel: 4,
      name: 'Rebirth IV',
      rarity: 'Celestial 👑',
      levelReq: 750,
      xpReq: 5000000000, // 5B XP
      auraReq: 250000000, // 250M Aura
      moneyReq: 1000000000000, // 1T
      title: '[Imortal]',
      achievement: 'Lenda Viva',
      coinBonus: 0.20,
      xpBonus: 0.20
    },
    5: {
      rebirthLevel: 5,
      name: 'Rebirth V',
      rarity: 'Supremo 🌌',
      levelReq: 1000,
      xpReq: 10000000000, // 10B XP
      auraReq: 500000000, // 500M Aura
      moneyReq: 1000000000000, // 1T
      title: '[Além do Limite]',
      achievement: 'Transcendente',
      coinBonus: 0.25,
      xpBonus: 0.25
    }
  }
};

export function getRebirthRequirements(targetRebirthLevel) {
  const lvl = Number(targetRebirthLevel);
  if (REBIRTH_CONFIG.LEVELS[lvl]) {
    return REBIRTH_CONFIG.LEVELS[lvl];
  }

  // Escalonamento automático para níveis > 5
  const extra = lvl - 5;
  return {
    rebirthLevel: lvl,
    name: `Rebirth ${lvl}`,
    rarity: 'Soberano Supremo ♾️',
    levelReq: 1000 + extra * 250,
    xpReq: 10000000000 + extra * 5000000000,
    auraReq: 500000000 + extra * 250000000,
    moneyReq: 1000000000000, // 1T max limit
    title: '[Deus Supremo]',
    achievement: lvl >= 10 ? 'Lenda Suprema' : 'Transcendente',
    coinBonus: Math.min(0.50, 0.25 + extra * 0.05),
    xpBonus: Math.min(0.50, 0.25 + extra * 0.05)
  };
}

export function getRebirthBonus(rebirthsCount) {
  const count = Math.max(0, Number(rebirthsCount || 0));
  if (count === 0) {
    return { coinBonusPct: 0, xpBonusPct: 0 };
  }
  const req = getRebirthRequirements(count);
  return {
    coinBonusPct: req.coinBonus,
    xpBonusPct: req.xpBonus
  };
}

export const MOTIVATIONAL_REBIRTH_QUOTES = [
  "Grandes vitórias exigem grandes sacrifícios.",
  "O topo é reservado para aqueles que não temem recomeçar.",
  "Cada recomeço é a fundação para a verdadeira imortalidade.",
  "Treine duro até que sua antiga glória pareça apenas um aquecimento.",
  "O guerreiro supremo não acumula riquezas efêmeras, acumula poder permanente."
];
