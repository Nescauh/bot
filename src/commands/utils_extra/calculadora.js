export async function handleCalculadoraCommand(sock, msg, args) {
  const from = msg.key.remoteJid;
  const expr = args.join(' ');

  if (!expr) {
    return sock.sendMessage(from, { text: '⚠️ Por favor, informe uma expressão matemática. Ex: `/calculadora (2 + 5) * 10`' }, { quoted: msg });
  }

  // Sanitizar expressão para aceitar apenas dígitos e operadores seguros
  const sanitized = expr.replace(/[^0-9+\-*/().%\s]/g, '');

  if (!sanitized) {
    return sock.sendMessage(from, { text: '⚠️ Expressão matemática inválida.' }, { quoted: msg });
  }

  try {
    // Avaliação segura com Function sem escopo global acessível
    const result = Function(`"use strict"; return (${sanitized})`)();

    return sock.sendMessage(from, { 
      text: `🔢 *CALCULADORA*\n\n📌 *Expressão:* \`${sanitized}\`\n✅ *Resultado:* *${result}*` 
    }, { quoted: msg });
  } catch (err) {
    return sock.sendMessage(from, { text: '⚠️ Erro ao calcular a expressão. Verifique a sintaxe.' }, { quoted: msg });
  }
}
