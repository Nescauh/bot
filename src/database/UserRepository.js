import databaseManager from './DatabaseManager.js';

class UserRepository {
  /**
   * Obtém um usuário pelo JID (cria um novo se não existir).
   * @param {string} jid 
   * @returns {object} Usuário
   */
  getUser(jid) {
    return databaseManager.getUser(jid);
  }

  /**
   * Cria explicitamente um novo usuário com dados iniciais se não existir.
   * @param {string} jid 
   * @param {object} initialData 
   * @returns {Promise<object>}
   */
  async createUser(jid, initialData = {}) {
    if (!jid) return null;
    const existing = this.getUser(jid);
    if (initialData && Object.keys(initialData).length > 0) {
      await this.updateUser(jid, initialData);
    }
    return this.getUser(jid);
  }

  /**
   * Atualiza campos de um usuário e salva no Supabase.
   * @param {string} jid 
   * @param {object} updates 
   */
  async updateUser(jid, updates) {
    return await databaseManager.updateUser(jid, updates);
  }

  /**
   * Adiciona XP para um usuário.
   * @param {string} jid 
   * @param {number} amount 
   * @returns {Promise<object>} Usuário atualizado
   */
  async addXP(jid, amount) {
    const user = this.getUser(jid);
    if (!user) return null;
    const currentXP = Number(user.xp || 0);
    const newXP = currentXP + Number(amount || 0);
    
    // Cálculo padronizado de nível baseado em XP
    const newLevel = Math.floor(Math.sqrt(newXP / 50)) + 1;

    await this.updateUser(jid, {
      xp: newXP,
      level: Math.max(Number(user.level || 1), newLevel)
    });
    return this.getUser(jid);
  }

  /**
   * Adiciona saldo (carteira) para um usuário.
   * @param {string} jid 
   * @param {number} amount 
   * @returns {Promise<object>} Usuário atualizado
   */
  async addBalance(jid, amount) {
    const user = this.getUser(jid);
    if (!user) return null;
    const currentWallet = Number(user.wallet || 0);
    const newWallet = currentWallet + Number(amount || 0);
    await this.updateUser(jid, { wallet: Math.max(0, newWallet) });
    return this.getUser(jid);
  }

  /**
   * Salva o objeto completo do usuário no banco.
   * @param {object} user 
   */
  async saveUser(user) {
    if (!user || !user.jid) return;
    await databaseManager.persistUser(user);
  }

  /**
   * Retorna os usuários com maior saldo.
   * @param {number} limit 
   */
  getTopByWallet(limit = 10) {
    return databaseManager.getTopUsersByWallet(limit);
  }

  /**
   * Retorna os usuários com maior XP.
   * @param {number} limit 
   */
  getTopByXP(limit = 10) {
    return databaseManager.getTopUsersByXP(limit);
  }
}

export const userRepository = new UserRepository();
export default userRepository;
