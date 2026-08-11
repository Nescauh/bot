/**
 * economicValidation.js
 * Módulo central de validação e segurança econômica para o SUBARU BOT.
 * 
 * Previne:
 * - NaN, Infinity, -Infinity
 * - Números fracionários / não inteiros em transações
 * - Overflow numérico
 * - Saldo/Prêmio negativo involuntário
 * - Adição ilimitada acima do teto econômico seguro
 */

export const ECONOMIC_LIMITS = {
  MAX_WALLET: 1000000000000, // 1 Trilhão
  MAX_BANK:   1000000000000, // 1 Trilhão
  MAX_XP:     1000000000000, // 1 Trilhão
  MAX_AURA:   1000000000000  // 1 Trilhão
};

/**
 * Valida se um valor numérico é válido, finito e inteiro.
 * @param {any} val 
 * @param {boolean} allowNegative 
 * @returns {boolean}
 */
export function validateEconomicValue(val, allowNegative = false) {
  if (val === null || val === undefined) return false;
  if (typeof val === 'symbol' || typeof val === 'object') return false;

  const num = Number(val);
  if (isNaN(num) || !isFinite(num)) return false;
  if (!allowNegative && num < 0) return false;
  if (!Number.isInteger(num)) return false;

  return true;
}

/**
 * Sanitiza um valor monetário para inteiro seguro não-negativo.
 * @param {any} val 
 * @param {number} defaultVal 
 * @param {boolean} allowNegative 
 * @returns {number}
 */
export function sanitizeMoney(val, defaultVal = 0, allowNegative = false) {
  if (!validateEconomicValue(val, allowNegative)) {
    return defaultVal;
  }
  const num = Math.floor(Number(val));
  if (!allowNegative && num < 0) return 0;
  return num;
}

/**
 * Sanitiza valor de XP.
 * @param {any} val 
 * @returns {number}
 */
export function sanitizeXP(val) {
  return sanitizeMoney(val, 0, false);
}

/**
 * Sanitiza valor de Aura.
 * @param {any} val 
 * @returns {number}
 */
export function sanitizeAura(val) {
  return sanitizeMoney(val, 0, false);
}

/**
 * Verifica se um acréscimo respeita o limite máximo configurado.
 * Se o usuário já possuir um valor acima do limite, NÃO reduz o saldo atual, apenas bloqueia novas adições.
 * @param {number} currentVal 
 * @param {number} amount 
 * @param {number} maxLimit 
 * @param {string} jid 
 * @param {string} fieldName 
 * @returns {{ allowed: boolean, maxAddable: number }}
 */
export function checkEconomicLimit(currentVal, amount, maxLimit, jid = '', fieldName = 'wallet') {
  const current = Number(currentVal) || 0;
  const amt = Number(amount) || 0;

  if (amt <= 0) {
    return { allowed: true, maxAddable: 0 };
  }

  if (current >= maxLimit) {
    console.warn(`[ECONOMY LIMIT] Operação de adição bloqueada para ${jid || 'usuário'}: ${fieldName} atual (${current.toLocaleString('pt-BR')}) atinge/excede o limite máximo (${maxLimit.toLocaleString('pt-BR')}).`);
    return { allowed: false, maxAddable: 0 };
  }

  const spaceLeft = maxLimit - current;
  if (amt > spaceLeft) {
    console.warn(`[ECONOMY LIMIT] Adição parcial para ${jid || 'usuário'}: tentou adicionar ${amt.toLocaleString('pt-BR')} em ${fieldName}, mas só restam ${spaceLeft.toLocaleString('pt-BR')} até o limite.`);
    return { allowed: true, maxAddable: Math.max(0, spaceLeft) };
  }

  return { allowed: true, maxAddable: amt };
}
