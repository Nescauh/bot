import databaseManager from './DatabaseManager.js';
import { getRebirthRequirements } from '../config/rebirthConfig.js';
import { sanitizeMoney, sanitizeXP, sanitizeAura } from '../utils/economicValidation.js';

export async function checkRebirthEligibility(userJid) {
  const user = databaseManager.getUser(userJid);
  if (!user) return { eligible: false, reason: 'Usuário não encontrado.' };

  const currentRebirths = Number(user.rebirths || 0);
  const targetLevel = currentRebirths + 1;
  const req = getRebirthRequirements(targetLevel);

  const currentLevel = Number(user.level || 1);
  const currentXp = Number(user.xp || 0);
  const currentAura = Number(user.aura || 0);
  const currentWallet = Number(user.wallet || 0);
  const currentBank = Number(user.bank || 0);
  const currentMoney = currentWallet + currentBank;

  const missingLevel = Math.max(0, req.levelReq - currentLevel);
  const missingXp = Math.max(0, req.xpReq - currentXp);
  const missingAura = Math.max(0, req.auraReq - currentAura);
  const missingMoney = Math.max(0, req.moneyReq - currentMoney);

  const eligible = missingLevel === 0 && missingXp === 0 && missingAura === 0 && missingMoney === 0;

  return {
    user,
    currentRebirths,
    targetLevel,
    req,
    currentStats: {
      level: currentLevel,
      xp: currentXp,
      aura: currentAura,
      wallet: currentWallet,
      bank: currentBank,
      totalMoney: currentMoney
    },
    missing: {
      level: missingLevel,
      xp: missingXp,
      aura: missingAura,
      money: missingMoney
    },
    eligible
  };
}

export async function performRebirthTransaction(userJid) {
  const check = await checkRebirthEligibility(userJid);
  if (!check.eligible) {
    throw new Error('Você ainda não possui os requisitos necessários para realizar o Rebirth.');
  }

  const { user, targetLevel, req, currentStats } = check;

  let extraData = {};
  try {
    extraData = typeof user.extra_data === 'string' ? JSON.parse(user.extra_data || '{}') : (user.extra_data || {});
  } catch (_) {
    extraData = {};
  }

  const achievements = Array.isArray(extraData.achievements) ? extraData.achievements : [];
  if (req.achievement && !achievements.includes(req.achievement)) {
    achievements.push(req.achievement);
  }
  extraData.achievements = achievements;

  const newHighestLevel = Math.max(Number(user.highest_level || 1), currentStats.level);
  const newHighestWallet = Math.max(Number(user.highest_wallet || 0), currentStats.wallet);
  const newHighestBank = Math.max(Number(user.highest_bank || 0), currentStats.bank);
  const newHighestAura = Math.max(Number(user.highest_aura || 0), currentStats.aura);
  const newTotalXp = Number(user.total_xp_earned || 0) + currentStats.xp;
  const newTotalMoney = Number(user.total_money_earned || 0) + currentStats.totalMoney;

  if (databaseManager.isPg) {
    try {
      await databaseManager.pgClient.query('BEGIN');

      await databaseManager.pgClient.query(
        `UPDATE users SET
          wallet = 0,
          bank = 0,
          xp = 0,
          level = 1,
          aura = 0,
          rebirths = $1,
          highest_level = $2,
          highest_wallet = $3,
          highest_bank = $4,
          highest_aura = $5,
          total_xp_earned = $6,
          total_money_earned = $7,
          title = $8,
          extra_data = $9,
          updated_at = NOW()
         WHERE jid = $10`,
        [
          targetLevel,
          newHighestLevel,
          newHighestWallet,
          newHighestBank,
          newHighestAura,
          newTotalXp,
          newTotalMoney,
          req.title,
          JSON.stringify(extraData),
          userJid
        ]
      );

      await databaseManager.pgClient.query(
        `INSERT INTO rebirth_history
          (user_jid, rebirth_level, sacrificed_wallet, sacrificed_bank, sacrificed_xp, sacrificed_aura, sacrificed_level, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          userJid,
          targetLevel,
          currentStats.wallet,
          currentStats.bank,
          currentStats.xp,
          currentStats.aura,
          currentStats.level
        ]
      );

      await databaseManager.pgClient.query('COMMIT');
    } catch (err) {
      await databaseManager.pgClient.query('ROLLBACK').catch(() => {});
      databaseManager.logErr('[REBIRTH TRANSACTION ERROR] Rollback executado no PostgreSQL:', err);
      throw new Error('Falha atômica ao processar a transação do Rebirth. Nada foi alterado.');
    }
  } else if (databaseManager.dbInstance) {
    try {
      databaseManager.dbInstance.run('BEGIN TRANSACTION');

      databaseManager.dbInstance.run(
        `UPDATE users SET
          wallet = 0,
          bank = 0,
          xp = 0,
          level = 1,
          aura = 0,
          rebirths = ?,
          highest_level = ?,
          highest_wallet = ?,
          highest_bank = ?,
          highest_aura = ?,
          total_xp_earned = ?,
          total_money_earned = ?,
          title = ?,
          extra_data = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE jid = ?`,
        [
          targetLevel,
          newHighestLevel,
          newHighestWallet,
          newHighestBank,
          newHighestAura,
          newTotalXp,
          newTotalMoney,
          req.title,
          JSON.stringify(extraData),
          userJid
        ]
      );

      databaseManager.dbInstance.run(
        `INSERT INTO rebirth_history
          (user_jid, rebirth_level, sacrificed_wallet, sacrificed_bank, sacrificed_xp, sacrificed_aura, sacrificed_level, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          userJid,
          targetLevel,
          currentStats.wallet,
          currentStats.bank,
          currentStats.xp,
          currentStats.aura,
          currentStats.level
        ]
      );

      databaseManager.dbInstance.run('COMMIT');
      databaseManager.persistSqliteFile();
    } catch (err) {
      try { databaseManager.dbInstance.run('ROLLBACK'); } catch (_) {}
      databaseManager.logErr('[REBIRTH TRANSACTION ERROR] Rollback executado no SQLite:', err);
      throw new Error('Falha atômica ao processar a transação do Rebirth no SQLite. Nada foi alterado.');
    }
  }

  // Atualiza in-memory store
  user.wallet = 0;
  user.bank = 0;
  user.xp = 0;
  user.level = 1;
  user.aura = 0;
  user.rebirths = targetLevel;
  user.highest_level = newHighestLevel;
  user.highest_wallet = newHighestWallet;
  user.highest_bank = newHighestBank;
  user.highest_aura = newHighestAura;
  user.total_xp_earned = newTotalXp;
  user.total_money_earned = newTotalMoney;
  user.title = req.title;
  user.extra_data = JSON.stringify(extraData);

  console.log(`[REBIRTH SUCCESS] Rebirth ${targetLevel} concluído para ${userJid}`);

  return {
    targetLevel,
    req,
    sacrificed: currentStats
  };
}

export function getTopRebirthUsers(limit = 10) {
  const store = databaseManager.getDatabase();
  const list = Object.values(store.users || {});

  list.sort((a, b) => {
    const rA = Number(a.rebirths || 0);
    const rB = Number(b.rebirths || 0);
    if (rB !== rA) return rB - rA;

    const hlA = Number(a.highest_level || a.level || 1);
    const hlB = Number(b.highest_level || b.level || 1);
    if (hlB !== hlA) return hlB - hlA;

    return Number(b.total_xp_earned || 0) - Number(a.total_xp_earned || 0);
  });

  return list.slice(0, limit);
}
