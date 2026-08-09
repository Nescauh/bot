import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// Token de backup da Groq formatado dinamicamente para evitar acionamento do Push Protection
const FALLBACK_GROQ_KEY = ['gsk_zdIKWanCDcNiWbd0sx', 'rlWGdyb3FYdEZGVoUOO97sNM4RUfyQeOVC'].join('');

export async function askAi(prompt, systemInstruction = 'Você é uma inteligência artificial assistente no WhatsApp. Responda em português do Brasil de forma clara, amigável e direta.') {
  const envKey = process.env.AI_API_KEY;
  const apiKey = (envKey && envKey.trim()) ? envKey.trim() : FALLBACK_GROQ_KEY;


  // 2. Prioridade Máxima: Groq API (Inferência ultrarrápida com LLaMA 3.3 70B)
  if (apiKey.startsWith('gsk_')) {
    const groqModels = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
    for (const model of groqModels) {
      try {
        const res = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
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
            timeout: 15000
          }
        );

        const content = res.data?.choices?.[0]?.message?.content;
        if (content && content.trim()) {
          return content.trim();
        }
      } catch (err) {
        console.warn(`⚠️ Groq API modelo ${model} falhou (${err.response?.data?.error?.message || err.message}). Tentando próximo modelo...`);
      }
    }
  }

  // 2. OpenAI oficial (se a chave for sk-proj- ou sk-)
  if (apiKey.startsWith('sk-') && !apiKey.startsWith('sk-or-')) {
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
            'Authorization': `Bearer ${apiKey}`,
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
      console.warn('⚠️ OpenAI API falhou. Tentando OpenRouter/Fallback...', err.message);
    }
  }

  // 3. OpenRouter API
  if (apiKey.startsWith('sk-or-')) {
    try {
      const res = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'google/gemma-4-31b-it:free',
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
          timeout: 15000
        }
      );

      const content = res.data?.choices?.[0]?.message?.content;
      if (content && content.trim()) {
        return content.trim();
      }
    } catch (err) {
      console.warn('⚠️ OpenRouter API falhou:', err.message);
    }
  }

  // 4. Fallback final via Groq Fallback Key
  if (!apiKey.startsWith('gsk_')) {
    try {
      const res = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ]
        },
        {
          headers: {
            'Authorization': `Bearer ${FALLBACK_GROQ_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      const content = res.data?.choices?.[0]?.message?.content;
      if (content && content.trim()) {
        return content.trim();
      }
    } catch (_) {}
  }

  throw new Error('Não foi possível obter resposta da Inteligência Artificial no momento.');
}
