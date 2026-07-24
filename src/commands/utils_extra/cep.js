import axios from 'axios';

export async function handleCepCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  const cep = args[0]?.replace(/\D/g, '');

  if (!cep || cep.length !== 8) {
    return sock.sendMessage(from, { text: '⚠️ Por favor, informe um CEP válido com 8 dígitos. Ex: `/cep 01001000`' }, { quoted: msg });
  }

  try {
    const res = await axios.get(`https://viacep.com.br/ws/${cep}/json/`);
    if (res.data.erro) {
      return sock.sendMessage(from, { text: '⚠️ CEP não encontrado.' }, { quoted: msg });
    }

    const data = res.data;
    const text = `📍 *CONSULTA DE CEP*\n\n` +
                 `📮 *CEP:* ${data.cep}\n` +
                 `🏠 *Logradouro:* ${data.logradouro || 'N/A'}\n` +
                 `🏙️ *Bairro:* ${data.bairro || 'N/A'}\n` +
                 `🌆 *Cidade:* ${data.localidade}\n` +
                 `🗺️ *Estado (UF):* ${data.uf}\n` +
                 `📞 *DDD:* ${data.ddd}`;

    return sock.sendMessage(from, { text }, { quoted: msg });
  } catch (err) {
    console.error('Erro no comando /cep:', err.message);
    return sock.sendMessage(from, { text: '⚠️ Erro ao consultar o CEP.' }, { quoted: msg });
  }
}
