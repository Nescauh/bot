import axios from 'axios';

export async function handleClimaCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  const city = args.join(' ');

  if (!city) {
    return sock.sendMessage(from, { text: '⚠️ Por favor, informe o nome de uma cidade. Ex: `/clima Salvador`' }, { quoted: msg });
  }

  try {
    const res = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
    const current = res.data.current_condition[0];
    const area = res.data.nearest_area[0];

    const tempC = current.temp_C;
    const feelsLike = current.FeelsLikeC;
    const humidity = current.humidity;
    const desc = current.lang_pt ? current.lang_pt[0].value : current.weatherDesc[0].value;
    const cityName = area.areaName[0].value;
    const country = area.country[0].value;

    const text = `🌤️ *PREVISÃO DO TEMPO*\n\n` +
                 `📍 *Local:* ${cityName}, ${country}\n` +
                 `🌡️ *Temperatura:* ${tempC}°C (Sensação: ${feelsLike}°C)\n` +
                 `💧 *Umidade:* ${humidity}%\n` +
                 `☁️ *Condição:* ${desc}`;

    return sock.sendMessage(from, { text }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /clima:', err.message);
    return sock.sendMessage(from, { text: '⚠️ Não foi possível obter o clima para a cidade informada.' }, { quoted: msg });
  }
}
