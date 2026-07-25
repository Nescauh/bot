import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// Lista de modelos 100% gratuitos do OpenRouter
const OPENROUTER_FREE_MODELS = [
  'openrouter/free',
  'google/gemma-4-31b-it:free',
  'inclusionai/ling-3.0-flash:free',
  'cohere/north-mini-code:free'
];

export async function askAi(prompt, systemInstruction = 'Você é uma inteligência artificial assistente no WhatsApp. Responda em português do Brasil de forma clara, amigável e direta.') {
  const apiKey = process.env.AI_API_KEY;

  // 1. Tenta OpenRouter com os modelos gratuitos (evita erro 402 Payment Required)
  if (apiKey && apiKey.startsWith('sk-or-v1-')) {
    for (const model of OPENROUTER_FREE_MODELS) {
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
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 20000
          }
        );

        const content = res.data?.choices?.[0]?.message?.content;
        if (content && content.trim()) {
          return content.trim();
        }
      } catch (err) {
        console.warn(`⚠️ OpenRouter modelo ${model} retornou erro (${err.response?.status || err.message}). Tentando próximo modelo...`);
      }
    }
  }

  // 2. Fallback Secundário: Pollinations AI (100% Gratuito sem necessidade de chave)
  try {
    const fullPrompt = `${systemInstruction}\n\nPergunta: ${prompt}`;
    const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}?model=openai`, { timeout: 20000 });
    if (res.data) {
      const answer = typeof res.data === 'string' ? res.data.trim() : JSON.stringify(res.data);
      if (answer && !answer.includes('402')) {
        return answer;
      }
    }
  } catch (err) {
    console.warn('⚠️ Fallback Pollinations falhou. Tentando backup final...', err.message);
  }

  // 3. Fallback Terciário: Endpoint Público do DuckDuckGo AI / HuggingFace
  try {
    const fullPrompt = `${systemInstruction}\n\n${prompt}`;
    const res = await axios.post('https://text.pollinations.ai/', {
      messages: [{ role: 'user', content: fullPrompt }],
      model: 'mistral'
    }, { timeout: 20000 });

    if (res.data) {
      return typeof res.data === 'string' ? res.data.trim() : JSON.stringify(res.data);
    }
  } catch (err) {
    console.error('Erro em todos os provedores de IA:', err.message);
  }

  throw new Error('Não foi possível obter resposta da Inteligência Artificial no momento.');
}
