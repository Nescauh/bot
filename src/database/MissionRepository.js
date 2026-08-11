import databaseManager from './DatabaseManager.js';
import { getRandomQuestForUser, MISSION_DIFFICULTIES } from '../config/missionConfig.js';
import { getUser, addBalance, addXP } from './sqlite.js';
import { calculateBonusRewards, checkAndApplyLevelUp } from '../utils/bonusCalculator.js';

export function getActiveUserMission(userJid) {
  const store = databaseManager.getDatabase();
  const missions = store.userMissions || (store.userMissions = {});
  return missions[userJid] || null;
}

export function getLastMissionCompletion(userJid) {
  const store = databaseManager.getDatabase();
  const history = store.missionHistory || (store.missionHistory = {});
  return history[userJid] || null;
}

export async function createMissionForUser(userJid, userLevel = 1) {
  const active = getActiveUserMission(userJid);
  if (active && active.status === 'active') {
    return { created: false, reason: 'ACTIVE_EXISTS', mission: active };
  }

  const lastComp = getLastMissionCompletion(userJid);
  const now = Date.now();

  if (lastComp && lastComp.completed_at) {
    const diffCfg = MISSION_DIFFICULTIES[lastComp.difficulty] || MISSION_DIFFICULTIES.facil;
    const elapsed = now - Number(lastComp.completed_at);
    if (elapsed < diffCfg.cooldownMs) {
      const remainingMs = diffCfg.cooldownMs - elapsed;
      return { created: false, reason: 'COOLDOWN', remainingMs, difficultyName: diffCfg.name };
    }
  }

  const quest = getRandomQuestForUser(userLevel);
  const newMission = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    user_jid: userJid,
    mission_id: quest.missionId,
    difficulty: quest.difficultyKey,
    difficulty_name: quest.difficultyName,
    title: quest.title,
    reward_money: quest.rewardMoney,
    reward_xp: quest.rewardXp,
    status: 'active',
    reward_claimed: 0,
    started_at: now
  };

  const store = databaseManager.getDatabase();
  store.userMissions = store.userMissions || {};
  store.userMissions[userJid] = newMission;

  if (databaseManager.isPg) {
    try {
      await databaseManager.pgClient.query(
        `INSERT INTO user_missions
          (user_jid, mission_id, difficulty, title, reward_money, reward_xp, status, reward_claimed, started_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          userJid,
          quest.missionId,
          quest.difficultyKey,
          quest.title,
          quest.rewardMoney,
          quest.rewardXp,
          'active',
          0
        ]
      );
    } catch (err) {
      databaseManager.logErr('[MISSION ERROR] Erro ao inserir missão no PG:', err);
    }
  } else if (databaseManager.dbInstance) {
    try {
      databaseManager.dbInstance.run(
        `INSERT INTO user_missions
          (user_jid, mission_id, difficulty, title, reward_money, reward_xp, status, reward_claimed, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          userJid,
          quest.missionId,
          quest.difficultyKey,
          quest.title,
          quest.rewardMoney,
          quest.rewardXp,
          'active',
          0
        ]
      );
      databaseManager.persistSqliteFile();
    } catch (err) {
      databaseManager.logErr('[MISSION ERROR] Erro ao inserir missão no SQLite:', err);
    }
  }

  console.log(`[MISSION] Missão ${quest.title} (${quest.difficultyName}) iniciada para ${userJid}`);
  return { created: true, mission: newMission };
}

export async function claimMissionRewardAtomic(userJid) {
  const active = getActiveUserMission(userJid);
  if (!active || active.status !== 'active' || active.reward_claimed === 1) {
    return { success: false, reason: 'NO_ACTIVE_MISSION' };
  }

  let claimSuccess = false;

  if (databaseManager.isPg) {
    try {
      const res = await databaseManager.pgClient.query(
        `UPDATE user_missions
         SET status = 'completed', reward_claimed = 1, completed_at = NOW()
         WHERE user_jid = $1 AND mission_id = $2 AND status = 'active' AND reward_claimed = 0
         RETURNING *`,
        [userJid, active.mission_id]
      );

      if (res.rowCount > 0) {
        claimSuccess = true;
      }
    } catch (err) {
      databaseManager.logErr('[MISSION ATOMIC ERROR] Erro ao resgatar missão no PG:', err);
    }
  } else {
    // Fallback SQLite / Memory
    claimSuccess = true;
  }

  if (!claimSuccess) {
    console.warn(`[MISSION] Tentativa duplicada de resgate bloqueada para ${userJid}`);
    return { success: false, reason: 'ALREADY_CLAIMED' };
  }

  // Atualiza in-memory state
  const now = Date.now();
  active.status = 'completed';
  active.reward_claimed = 1;
  active.completed_at = now;

  const store = databaseManager.getDatabase();
  store.missionHistory = store.missionHistory || {};
  store.missionHistory[userJid] = { ...active };
  delete store.userMissions[userJid];

  // Aplica bônus de Rebirth + Classe + Pets + Aura aos prêmios da missão
  const user = getUser(userJid);
  const { finalCoins, finalXp, bonusCoinsApplied, bonusXpApplied } = calculateBonusRewards(user, active.reward_money, active.reward_xp, 'quest');

  await addBalance(userJid, finalCoins);
  await addXP(userJid, finalXp);

  const updatedUser = getUser(userJid);
  const levelCheck = checkAndApplyLevelUp(updatedUser, 0);

  console.log(`[MISSION] Recompensa de $${finalCoins} e ${finalXp} XP concedida para ${userJid}`);

  return {
    success: true,
    mission: active,
    finalCoins,
    finalXp,
    bonusCoinsApplied,
    bonusXpApplied,
    levelUpMsg: levelCheck.levelUpMsg
  };
}
