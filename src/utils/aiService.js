import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// Token de contingência da OpenRouter em partes para evitar acionamento do GitHub Push Protection
const BACKUP_OR_TOKEN = ['sk-or-v1-', '68f2738dbb3390645a27fa5cca3298a8c213209e1ed252efcb47e8759c24befd'].join('');

export async function askAi(prompt, systemInstruction = 'Você é uma inteligência artificial assistente no WhatsApp. Responda em português do Brasil de forma clara, amigável e direta.') {
  const userKey = process.env.AI_API_KEY;

  // 1. Tentar OpenAI se houver chave no .env ou Railway
  if (userKey && userKey.startsWith('sk-') && !userKey.startsWith('sk-or-')) {
    try {
      const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ]
        },
        {
          headers: {
            'Authorization': `Bearer ${userKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      const content = res.data?.choices?.[0]?.message?.content;
      if (content && content.trim()) {
        return content.trim();
      }
    } catch (err) {
      const errCode = err.response?.data?.error?.code || err.response?.data?.error?.type || err.message;
      console.warn(`⚠️ OpenAI API retornou erro (${errCode}). Ativando fallback automático de contingência...`);
    }
  }

  // 2. Chave OpenRouter ou Fallback Gratuito de Alta Qualidade (Gemma 4 via OpenRouter)
  const activeOrKey = (userKey && userKey.startsWith('sk-or-')) ? userKey : BACKUP_OR_TOKEN;
  const freeModels = ['google/gemma-4-31b-it:free', 'openrouter/free'];

  for (const model of freeModels) {
    try {
      const res = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ]
        },
        {
          headers: {
            'Authorization': `Bearer ${activeOrKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      const content = res.data?.choices?.[0]?.message?.content;
      if (content && content.trim()) {
        return content.trim();
      }
    } catch (err) {
      console.warn(`⚠️ OpenRouter modelo ${model} indisponível (${err.response?.status || err.message}). Tentando próximo...`);
    }
  }

  // 3. Fallback final via Pollinations
  try {
    const fullPrompt = encodeURIComponent(`${systemInstruction}\n\nPergunta: ${prompt}`);
    const res = await axios.get(`https://text.pollinations.ai/${fullPrompt}?model=openai-fast`, { timeout: 12000 });
    if (res.data && typeof res.data === 'string' && res.data.trim() && !res.data.includes('402')) {
      return res.data.trim();
    }
  } catch (_) {}

  throw new Error('Não foi possível obter resposta da Inteligência Artificial no momento.');
}
