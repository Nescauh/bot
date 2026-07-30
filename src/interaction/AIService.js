/**
 * AIService.js
 * Módulo de interação com a Inteligência Artificial para o Subaru Bot.
 */

import { askAi } from '../utils/aiService.js';
import { PersonalityManager } from './PersonalityManager.js';

export class AIService {
  /**
   * Gera uma resposta contextualizada e inteligente para a conversa do grupo
   * @param {Object} context Objeto retornado pelo ContextManager.buildContext
   * @param {string} userPrompt Mensagem enviada pelo usuário
   * @returns {Promise<string>} Resposta gerada pela IA
   */
  static async generateReply(context, userPrompt) {
    try {
      const systemInstruction = PersonalityManager.getSystemInstruction(
        context.groupName,
        context.userName,
        context.userFacts,
        'Subaru Bot'
      );

      const fullPrompt = `HISTÓRICO RECENTE DA CONVERSA (Grupo: "${context.groupName}" | Horário: ${context.timeContext}):\n${context.history}\n\nMENSAGEM ATUAL DE ${context.userName}:\n"${userPrompt}"\n\nResponda diretamente a ${context.userName} como Subaru Bot, mantendo o contexto inteiro da conversa acima.`;

      const response = await askAi(fullPrompt, systemInstruction);

      if (!response) {
        return 'Tive um pequeno lapso aqui... O que você dizia mesmo?';
      }

      // Limpa possíveis prefixos robóticos que algumas IAs colocam
      let cleaned = response
        .replace(/^Subaru Bot:\s*/i, '')
        .replace(/^\[Subaru Bot\]:\s*/i, '')
        .replace(/^Bot:\s*/i, '')
        .trim();

      return cleaned;
    } catch (err) {
      console.error('Erro ao gerar resposta na IA de interação:', err.message);
      return null;
    }
  }
}
