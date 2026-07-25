import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export async function askAi(prompt, systemInstruction = 'Você é uma inteligência artificial assistente no WhatsApp. Responda em português do Brasil de forma clara, amigável e direta.') {
  const apiKey = process.env.AI_API_KEY;

  if (apiKey && apiKey.startsWith('sk-or-v1-')) {
    try {
      const res = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'openrouter/auto',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ]
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 25000
        }
      );

      const content = res.data?.choices?.[0]?.message?.content;
      if (content && content.trim()) {
        return content.trim();
      }
    } catch (err) {
      console.warn('⚠️ Falha na chamada via OpenRouter API Key. Tentando fallback...', err.response?.data || err.message);
    }
  }

  // Fallback 1: Pollinations AI com prompt de sistema formatado
  try {
    const fullPrompt = `${systemInstruction}\n\nPergunta: ${prompt}`;
    const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}?model=openai`, { timeout: 20000 });
    if (res.data) {
      return typeof res.data === 'string' ? res.data.trim() : JSON.stringify(res.data);
    }
  } catch (err) {
    console.error('Erro no fallback do serviço de IA:', err.message);
  }

  throw new Error('Não foi possível obter resposta da Inteligência Artificial no momento.');
}
