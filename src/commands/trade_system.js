import { getUser, updateUser } from '../database/sqlite.js';
import { getKingdomData } from './kingdom_system.js';

// Mapas de sessões ativas em memória
// sessionId -> Session Object
export const tradeSessions = new Map();
// userJid -> sessionId
export const userToSessionMap = new Map();

const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos de inatividade

// Normalizadores de chaves de recursos de reino e dinheiro
const KINGDOM_RESOURCES = {
  comida: 'food',
  food: 'food',
  madeira: 'wood',
  wood: 'wood',
  pedra: 'stone',
  stone: 'stone',
  ferro: 'iron',
  iron: 'iron',
  tesouro: 'treasury',
  ouroreino: 'treasury',
  reinoouro: 'treasury',
  treasury: 'treasury'
};

const MONEY_KEYS = ['dinheiro', 'moeda', 'moedas', 'ouro', 'wallet', 'money', 'grana'];

export async function handleTradeCommands(sock, msg, command, args, sender, mentioned = []) {
  const from = msg.key.remoteJid;
  const reply = async (text, mentions = []) => {
    await sock.sendMessage(from, { text, mentions }, { quoted: msg });
  };

  const sub = args[0]?.toLowerCase();

  // Limpeza de sessões expiradas antes de processar
  cleanExpiredSessions();

  // 1. COMANDO: /trocar ajuda (ou /trade help)
  if (sub === 'ajuda' || sub === 'help' || sub === 'comandos') {
    return renderTradeHelp(reply);
  }

  // 2. COMANDO: /trocar aceitar (ou /trade accept)
  if (sub === 'aceitar' || sub === 'accept') {
    return handleAcceptTrade(reply, sender);
  }

  // 3. COMANDO: /trocar recusar ou /trocar cancelar
  if (sub === 'recusar' || sub === 'cancelar' || sub === 'cancel' || sub === 'rejeitar') {
    return handleCancelTrade(reply, sender);
  }

  // 4. COMANDO: /trocar ver (ou /trocar status / painel)
  if (sub === 'ver' || sub === 'status' || sub === 'painel' || sub === 'bancada') {
    return handleViewTrade(reply, sender);
  }

  // 5. COMANDO: /trocar adicionar (ou /trade add / ofertar / colocar)
  if (sub === 'adicionar' || sub === 'add' || sub === 'ofertar' || sub === 'colocar' || sub === 'botar') {
    return handleAddOffer(reply, sender, args.slice(1));
  }

  // 6. COMANDO: /trocar remover (ou /trade remove / retirar / tirar)
  if (sub === 'remover' || sub === 'remove' || sub === 'retirar' || sub === 'tirar') {
    return handleRemoveOffer(reply, sender, args.slice(1));
  }

  // 7. COMANDO: /trocar confirmar (ou /trade ready / pronto / aceitartroca / fechar)
  if (sub === 'confirmar' || sub === 'pronto' || sub === 'fechar' || sub === 'aceitartroca' || sub === 'confirm') {
    return handleConfirmTrade(reply, sender);
  }

  // 8. COMANDO: /trocar @usuario (Início de proposta)
  const targetJid = mentioned[0] || (args[0] && args[0].includes('@') ? args[0].replace('@', '') + '@s.whatsapp.net' : null);

  if (targetJid) {
    return handleProposeTrade(reply, sender, targetJid);
  }

  // Se o usuário já estiver em uma troca e apenas digitou /trocar, exibe a bancada
  const activeSessionId = userToSessionMap.get(sender);
  if (activeSessionId && tradeSessions.has(activeSessionId)) {
    return handleViewTrade(reply, sender);
  }

  // Caso padrão: exibir ajuda
  return renderTradeHelp(reply);
}

// ----------------------------------------------------
// HANDLERS ESPECÍFICOS DO SISTEMA DE TROCAS
// ----------------------------------------------------

// 1. Propor Troca
function handleProposeTrade(reply, sender, targetJid) {
  if (targetJid === sender) {
    return reply('⚠️ Você não pode realizar uma troca com você mesmo!');
  }

  const userA = getUser(sender);
  const userB = getUser(targetJid);

  if (!userA) return reply('⚠️ Seu usuário não foi encontrado no sistema.');
  if (!userB) return reply('⚠️ O usuário marcado não possui cadastro no bot.');

  // Verifica se algum dos dois já está em uma negociação
  if (userToSessionMap.has(sender)) {
    return reply('⚠️ Você já está participando de uma sessão de troca ativa! Digite `/trocar ver` ou `/trocar cancelar`.');
  }

  if (userToSessionMap.has(targetJid)) {
    return reply(`⚠️ @${targetJid.split('@')[0]} já está em outra negociação no momento. Aguarde ele finalizar!`, [targetJid]);
  }

  const sessionId = `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const session = {
    id: sessionId,
    player1: sender,
    player2: targetJid,
    status: 'pending',
    offers: {
      [sender]: { money: 0, items: {}, kingdom: { food: 0, wood: 0, stone: 0, iron: 0, treasury: 0 }, confirmed: false },
      [targetJid]: { money: 0, items: {}, kingdom: { food: 0, wood: 0, stone: 0, iron: 0, treasury: 0 }, confirmed: false }
    },
    createdAt: Date.now(),
    lastActivity: Date.now()
  };

  tradeSessions.set(sessionId, session);
  userToSessionMap.set(sender, sessionId);
  userToSessionMap.set(targetJid, sessionId);

  const text = `🤝 *PROPOSTA DE TROCA & COMÉRCIO* 📦\n\n` +
               `@${sender.split('@')[0]} enviou uma solicitação de troca para @${targetJid.split('@')[0]}!\n\n` +
               `📜 *Você pode negociar:*\n` +
               `• 🌾 Recursos de Reino (Comida, Madeira, Pedra, Ferro e Tesouro)\n` +
               `• 🎒 Itens do Inventário (Consumíveis, Armas, Raros e Pets)\n` +
               `• 💵 Dinheiro da Carteira Pessoal\n\n` +
               `👉 Para aceitar, @${targetJid.split('@')[0]} digite: \`/trocar aceitar\`\n` +
               `👉 Para recusar, digite: \`/trocar recusar\`\n\n` +
               `⏱️ *Tempo para aceitar:* 5 minutos.`;

  return reply(text, [sender, targetJid]);
}

// 2. Aceitar Troca
function handleAcceptTrade(reply, sender) {
  const sessionId = userToSessionMap.get(sender);
  if (!sessionId || !tradeSessions.has(sessionId)) {
    return reply('⚠️ Você não possui nenhuma solicitação de troca pendente.');
  }

  const session = tradeSessions.get(sessionId);

  if (session.status !== 'pending') {
    return reply('⚠️ Esta troca já está em andamento! Use `/trocar ver` para visualizar as ofertas.');
  }

  if (session.player2 !== sender) {
    return reply('⚠️ Apenas quem recebeu o convite pode aceitar a proposta de troca.');
  }

  session.status = 'negotiating';
  session.lastActivity = Date.now();

  const otherPlayer = session.player1;

  const text = `🤝 *SESSÃO DE TROCA INICIADA COM SUCESSO!* 📦✨\n\n` +
               `Negociação ativa entre @${session.player1.split('@')[0]} e @${session.player2.split('@')[0]}!\n\n` +
               `💡 *COMO OFERTAR BENS:*\n` +
               `• \`/trocar adicionar <recurso> <qtd>\` (Ex: \`/trocar adicionar ferro 500\`)\n` +
               `• \`/trocar adicionar <item> <qtd>\` (Ex: \`/trocar adicionar "Rare Candy" 2\`)\n` +
               `• \`/trocar adicionar dinheiro <valor>\` (Ex: \`/trocar adicionar dinheiro 10000\`)\n` +
               `• \`/trocar remover <item/recurso> <qtd>\` ➔ Retirar da sua oferta\n` +
               `• \`/trocar ver\` ➔ Visualizar a bancada de negociação\n` +
               `• \`/trocar confirmar\` ➔ Confirmar que aceita as ofertas atuais!\n\n` +
               `🛡️ *Proteção Anti-Golpe:* Se qualquer participante alterar uma oferta, as confirmações são canceladas automaticamente.`;

  return reply(text, [session.player1, session.player2]);
}

// 3. Cancelar / Recusar Troca
function handleCancelTrade(reply, sender) {
  const sessionId = userToSessionMap.get(sender);
  if (!sessionId || !tradeSessions.has(sessionId)) {
    return reply('⚠️ Você não está em nenhuma sessão de troca ativa.');
  }

  const session = tradeSessions.get(sessionId);
  const p1 = session.player1;
  const p2 = session.player2;

  tradeSessions.delete(sessionId);
  userToSessionMap.delete(p1);
  userToSessionMap.delete(p2);

  const text = `❌ *SESSÃO DE TROCA CANCELADA!*\n\nA negociação entre @${p1.split('@')[0]} e @${p2.split('@')[0]} foi encerrada por @${sender.split('@')[0]}.`;
  return reply(text, [p1, p2, sender]);
}

// 4. Visualizar Bancada de Troca
function handleViewTrade(reply, sender) {
  const sessionId = userToSessionMap.get(sender);
  if (!sessionId || !tradeSessions.has(sessionId)) {
    return reply('⚠️ Você não está em nenhuma sessão de troca ativa.\n💡 Inicie uma nova troca com `/trocar @usuario`!');
  }

  const session = tradeSessions.get(sessionId);
  const text = formatTradeView(session);
  return reply(text, [session.player1, session.player2]);
}

// 5. Adicionar Oferta
function handleAddOffer(reply, sender, args) {
  const sessionId = userToSessionMap.get(sender);
  if (!sessionId || !tradeSessions.has(sessionId)) {
    return reply('⚠️ Você precisa estar em uma troca ativa para adicionar itens.\n💡 Inicie com `/trocar @usuario`');
  }

  const session = tradeSessions.get(sessionId);
  if (session.status !== 'negotiating') {
    return reply('⚠️ A troca precisa ser aceita pelo outro jogador antes de ofertar bens.');
  }

  if (args.length === 0) {
    return reply('⚠️ Informe o item/recurso e a quantidade que deseja ofertar!\nExemplo: `/trocar adicionar ferro 200` ou `/trocar adicionar "Rare Candy" 1`');
  }

  // Parse flexível de argumentos
  const parsed = parseTradeArguments(args);
  if (!parsed || parsed.amount <= 0) {
    return reply('⚠️ Quantidade inválida. Informe um valor numérico positivo.\nExemplo: `/trocar adicionar ferro 100`');
  }

  const user = getUser(sender);
  const myOffer = session.offers[sender];
  session.lastActivity = Date.now();

  const type = parsed.type;
  const key = parsed.key;
  const amount = parsed.amount;

  // CASO A: DINHEIRO DA CARTEIRA
  if (type === 'money') {
    const currentOffered = myOffer.money || 0;
    const totalNeeded = currentOffered + amount;

    if (user.wallet < totalNeeded) {
      return reply(`⚠️ Saldo insuficiente na carteira pessoal!\n• Você possui: **$${user.wallet.toLocaleString('pt-BR')}**\n• Oferta total solicitada: **$${totalNeeded.toLocaleString('pt-BR')}**`);
    }

    myOffer.money += amount;
  }
  // CASO B: RECURSOS DO REINO
  else if (type === 'kingdom') {
    const kd = getKingdomData(user);
    if (!kd || !kd.isMonarch) {
      return reply('⚠️ Você precisa ter um Reino fundado (`/reino comprar <nome>`) para comercializar recursos reais!');
    }

    const resKey = KINGDOM_RESOURCES[key];
    const k = kd.kingdom;

    if (resKey === 'treasury') {
      const currentOffered = myOffer.kingdom.treasury || 0;
      const totalNeeded = currentOffered + amount;
      if ((k.treasury || 0) < totalNeeded) {
        return reply(`⚠️ Ouro insuficiente no Tesouro do Reino!\n• Tesouro Atual: **$${(k.treasury || 0).toLocaleString('pt-BR')}**\n• Oferta Total: **$${totalNeeded.toLocaleString('pt-BR')}**`);
      }
      myOffer.kingdom.treasury += amount;
    } else {
      const currentOffered = myOffer.kingdom[resKey] || 0;
      const totalNeeded = currentOffered + amount;
      const available = k.resources?.[resKey] || 0;

      if (available < totalNeeded) {
        return reply(`⚠️ Recursos insuficientes no armazém do reino!\n• Estoque de ${key}: **${available}**\n• Oferta Total: **${totalNeeded}**`);
      }
      myOffer.kingdom[resKey] += amount;
    }
  }
  // CASO C: ITENS DO INVENTÁRIO PESSOAL
  else if (type === 'item') {
    let inventory = [];
    try {
      inventory = JSON.parse(user.inventory || '[]');
    } catch (_) {}

    // Contagem de itens no inventário do jogador
    const totalInInventory = inventory.filter(i => i.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(i.toLowerCase())).length;
    const matchedItemName = inventory.find(i => i.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(i.toLowerCase()));

    if (!matchedItemName || totalInInventory <= 0) {
      return reply(`⚠️ Você não possui o item **"${key}"** no seu \`/inventario\`!`);
    }

    const currentOffered = myOffer.items[matchedItemName] || 0;
    const totalNeeded = currentOffered + amount;

    if (totalInInventory < totalNeeded) {
      return reply(`⚠️ Quantidade insuficiente no inventário!\n• Você possui: **${totalInInventory}x ${matchedItemName}**\n• Oferta total solicitada: **${totalNeeded}x**`);
    }

    myOffer.items[matchedItemName] = totalNeeded;
  }

  // PROTEÇÃO ANTI-SCAM: Reseta confirmações de ambos ao mudar oferta
  session.offers[session.player1].confirmed = false;
  session.offers[session.player2].confirmed = false;

  const text = `➕ *OFERTA ATUALIZADA!* 📦\n\n` +
               `@${sender.split('@')[0]} adicionou **${amount}x ${parsed.rawName || key}** à negociação!\n\n` +
               formatTradeView(session);

  return reply(text, [session.player1, session.player2]);
}

// 6. Remover Oferta
function handleRemoveOffer(reply, sender, args) {
  const sessionId = userToSessionMap.get(sender);
  if (!sessionId || !tradeSessions.has(sessionId)) {
    return reply('⚠️ Você precisa estar em uma troca ativa para remover itens.');
  }

  const session = tradeSessions.get(sessionId);
  if (session.status !== 'negotiating') {
    return reply('⚠️ A troca não está no estado de negociação.');
  }

  if (args.length === 0) {
    return reply('⚠️ Informe o que deseja retirar da sua oferta.\nExemplo: `/trocar remover ferro 100` ou `/trocar remover dinheiro 5000`');
  }

  const parsed = parseTradeArguments(args);
  if (!parsed || parsed.amount <= 0) {
    return reply('⚠️ Quantidade inválida para remover.');
  }

  const myOffer = session.offers[sender];
  session.lastActivity = Date.now();

  const type = parsed.type;
  const key = parsed.key;
  const amount = parsed.amount;

  if (type === 'money') {
    myOffer.money = Math.max(0, (myOffer.money || 0) - amount);
  } else if (type === 'kingdom') {
    const resKey = KINGDOM_RESOURCES[key];
    if (resKey === 'treasury') {
      myOffer.kingdom.treasury = Math.max(0, (myOffer.kingdom.treasury || 0) - amount);
    } else {
      myOffer.kingdom[resKey] = Math.max(0, (myOffer.kingdom[resKey] || 0) - amount);
    }
  } else if (type === 'item') {
    const matchedKey = Object.keys(myOffer.items).find(k => k.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(k.toLowerCase()));
    if (!matchedKey || !myOffer.items[matchedKey]) {
      return reply(`⚠️ Você não está ofertando o item **"${key}"** na bancada de troca.`);
    }

    myOffer.items[matchedKey] = Math.max(0, myOffer.items[matchedKey] - amount);
    if (myOffer.items[matchedKey] <= 0) {
      delete myOffer.items[matchedKey];
    }
  }

  // PROTEÇÃO ANTI-SCAM
  session.offers[session.player1].confirmed = false;
  session.offers[session.player2].confirmed = false;

  const text = `➖ *ITEM REMOVIDO DA OFERTA!*\n\n` +
               `@${sender.split('@')[0]} retirou bens da bancada de negociação.\n\n` +
               formatTradeView(session);

  return reply(text, [session.player1, session.player2]);
}

// 7. Confirmar e Executar Troca
function handleConfirmTrade(reply, sender) {
  const sessionId = userToSessionMap.get(sender);
  if (!sessionId || !tradeSessions.has(sessionId)) {
    return reply('⚠️ Você não possui negociações ativas para confirmar.');
  }

  const session = tradeSessions.get(sessionId);
  if (session.status !== 'negotiating') {
    return reply('⚠️ A troca precisa estar ativa para ser confirmada.');
  }

  session.offers[sender].confirmed = true;
  session.lastActivity = Date.now();

  const p1 = session.player1;
  const p2 = session.player2;
  const otherPlayer = sender === p1 ? p2 : p1;

  // Se apenas 1 jogador confirmou
  if (!session.offers[p1].confirmed || !session.offers[p2].confirmed) {
    const text = `✅ *CONFIRMAÇÃO REGISTRADA!* ⏳\n\n` +
                 `@${sender.split('@')[0]} confirmou a troca!\n` +
                 `👉 Aguardando @${otherPlayer.split('@')[0]} digitar \`/trocar confirmar\` para finalizar!\n\n` +
                 formatTradeView(session);

    return reply(text, [p1, p2]);
  }

  // AMBOS OS JOGADORES CONFIRMARAM! EXECUÇÃO ATÔMICA DA TROCA
  return executeTradeAtomic(reply, session);
}

// 8. Execução Transacional Atômica da Troca
function executeTradeAtomic(reply, session) {
  const p1 = session.player1;
  const p2 = session.player2;

  const u1 = getUser(p1);
  const u2 = getUser(p2);

  if (!u1 || !u2) {
    tradeSessions.delete(session.id);
    userToSessionMap.delete(p1);
    userToSessionMap.delete(p2);
    return reply('⚠️ Erro ao carregar os dados dos usuários. Troca cancelada por segurança.');
  }

  const o1 = session.offers[p1];
  const o2 = session.offers[p2];

  // Revalidação de Carteira
  if (u1.wallet < (o1.money || 0)) {
    session.offers[p1].confirmed = false;
    return reply(`⚠️ Falha na transação! @${p1.split('@')[0]} não possui mais o saldo pessoal ofertado ($${(o1.money || 0).toLocaleString('pt-BR')}).`, [p1]);
  }
  if (u2.wallet < (o2.money || 0)) {
    session.offers[p2].confirmed = false;
    return reply(`⚠️ Falha na transação! @${p2.split('@')[0]} não possui mais o saldo pessoal ofertado ($${(o2.money || 0).toLocaleString('pt-BR')}).`, [p2]);
  }

  // Revalidação de Inventário
  let inv1 = [];
  let inv2 = [];
  try { inv1 = JSON.parse(u1.inventory || '[]'); } catch (_) {}
  try { inv2 = JSON.parse(u2.inventory || '[]'); } catch (_) {}

  for (const [item, qty] of Object.entries(o1.items || {})) {
    const available = inv1.filter(i => i === item).length;
    if (available < qty) {
      session.offers[p1].confirmed = false;
      return reply(`⚠️ Falha na transação! @${p1.split('@')[0]} não possui mais os ${qty}x ${item} no inventário.`, [p1]);
    }
  }

  for (const [item, qty] of Object.entries(o2.items || {})) {
    const available = inv2.filter(i => i === item).length;
    if (available < qty) {
      session.offers[p2].confirmed = false;
      return reply(`⚠️ Falha na transação! @${p2.split('@')[0]} não possui mais os ${qty}x ${item} no inventário.`, [p2]);
    }
  }

  // Revalidação de Recursos de Reino
  const kd1 = getKingdomData(u1);
  const kd2 = getKingdomData(u2);

  if (hasKingdomOffer(o1) && (!kd1 || !kd1.isMonarch)) {
    session.offers[p1].confirmed = false;
    return reply(`⚠️ @${p1.split('@')[0]} precisa de um reino fundado para transferir recursos reais.`, [p1]);
  }
  if (hasKingdomOffer(o2) && (!kd2 || !kd2.isMonarch)) {
    session.offers[p2].confirmed = false;
    return reply(`⚠️ @${p2.split('@')[0]} precisa de um reino fundado para transferir recursos reais.`, [p2]);
  }

  if (kd1 && kd1.isMonarch) {
    const k1 = kd1.kingdom;
    if ((k1.treasury || 0) < (o1.kingdom.treasury || 0) ||
        (k1.resources?.food || 0) < (o1.kingdom.food || 0) ||
        (k1.resources?.wood || 0) < (o1.kingdom.wood || 0) ||
        (k1.resources?.stone || 0) < (o1.kingdom.stone || 0) ||
        (k1.resources?.iron || 0) < (o1.kingdom.iron || 0)) {
      session.offers[p1].confirmed = false;
      return reply(`⚠️ Falha na transação! @${p1.split('@')[0]} não possui os recursos de reino suficientes no cofre/armazém.`, [p1]);
    }
  }

  if (kd2 && kd2.isMonarch) {
    const k2 = kd2.kingdom;
    if ((k2.treasury || 0) < (o2.kingdom.treasury || 0) ||
        (k2.resources?.food || 0) < (o2.kingdom.food || 0) ||
        (k2.resources?.wood || 0) < (o2.kingdom.wood || 0) ||
        (k2.resources?.stone || 0) < (o2.kingdom.stone || 0) ||
        (k2.resources?.iron || 0) < (o2.kingdom.iron || 0)) {
      session.offers[p2].confirmed = false;
      return reply(`⚠️ Falha na transação! @${p2.split('@')[0]} não possui os recursos de reino suficientes no cofre/armazém.`, [p2]);
    }
  }

  // --- EXECUÇÃO TRANSACIONAL ---

  // 1. Transferência de Dinheiro Pessoal
  const newWallet1 = u1.wallet - (o1.money || 0) + (o2.money || 0);
  const newWallet2 = u2.wallet - (o2.money || 0) + (o1.money || 0);

  // 2. Transferência de Itens do Inventário
  // Remove itens de u1 e adiciona em u2
  for (const [item, qty] of Object.entries(o1.items || {})) {
    for (let i = 0; i < qty; i++) {
      const idx = inv1.indexOf(item);
      if (idx > -1) inv1.splice(idx, 1);
      inv2.push(item);
    }
  }

  // Remove itens de u2 e adiciona em u1
  for (const [item, qty] of Object.entries(o2.items || {})) {
    for (let i = 0; i < qty; i++) {
      const idx = inv2.indexOf(item);
      if (idx > -1) inv2.splice(idx, 1);
      inv1.push(item);
    }
  }

  // 3. Transferência de Recursos de Reino
  let extraData1 = kd1?.extraData || {};
  let extraData2 = kd2?.extraData || {};

  if (kd1 && kd1.isMonarch) {
    const k1 = kd1.kingdom;
    k1.treasury = (k1.treasury || 0) - (o1.kingdom.treasury || 0) + (o2.kingdom.treasury || 0);
    k1.resources.food = (k1.resources.food || 0) - (o1.kingdom.food || 0) + (o2.kingdom.food || 0);
    k1.resources.wood = (k1.resources.wood || 0) - (o1.kingdom.wood || 0) + (o2.kingdom.wood || 0);
    k1.resources.stone = (k1.resources.stone || 0) - (o1.kingdom.stone || 0) + (o2.kingdom.stone || 0);
    k1.resources.iron = (k1.resources.iron || 0) - (o1.kingdom.iron || 0) + (o2.kingdom.iron || 0);
    extraData1.kingdom = k1;
  }

  if (kd2 && kd2.isMonarch) {
    const k2 = kd2.kingdom;
    k2.treasury = (k2.treasury || 0) - (o2.kingdom.treasury || 0) + (o1.kingdom.treasury || 0);
    k2.resources.food = (k2.resources.food || 0) - (o2.kingdom.food || 0) + (o1.kingdom.food || 0);
    k2.resources.wood = (k2.resources.wood || 0) - (o2.kingdom.wood || 0) + (o1.kingdom.wood || 0);
    k2.resources.stone = (k2.resources.stone || 0) - (o2.kingdom.stone || 0) + (o1.kingdom.stone || 0);
    k2.resources.iron = (k2.resources.iron || 0) - (o2.kingdom.iron || 0) + (o1.kingdom.iron || 0);
    extraData2.kingdom = k2;
  }

  // Atualização atômica dos usuários no banco
  updateUser(p1, {
    wallet: newWallet1,
    inventory: JSON.stringify(inv1),
    extra_data: JSON.stringify(extraData1)
  });

  updateUser(p2, {
    wallet: newWallet2,
    inventory: JSON.stringify(inv2),
    extra_data: JSON.stringify(extraData2)
  });

  // Limpeza da sessão
  tradeSessions.delete(session.id);
  userToSessionMap.delete(p1);
  userToSessionMap.delete(p2);

  const text = `🎉 *TROCA CONCLUÍDA COM SUCESSO!* 🤝✨\n\n` +
               `Negociação finalizada entre @${p1.split('@')[0]} e @${p2.split('@')[0]}!\n\n` +
               `📜 *RESUMO DAS TRANSFERÊNCIAS:*\n\n` +
               `📦 *Enviado por @${p1.split('@')[0]}:*\n${formatOfferList(o1)}\n\n` +
               `📦 *Enviado por @${p2.split('@')[0]}:*\n${formatOfferList(o2)}\n\n` +
               `💰 Todos os itens, recursos e moedas foram transferidos aos respectivos inventários e armazéns!`;

  return reply(text, [p1, p2]);
}

// ----------------------------------------------------
// FUNÇÕES AUXILIARES DE FORMATAÇÃO E PARSE
// ----------------------------------------------------

function parseTradeArguments(args) {
  if (!args || args.length === 0) return null;

  // Se o primeiro argumento for número: /trocar adicionar 500 ferro
  let amount = 1;
  let targetName = '';

  if (!isNaN(parseInt(args[0])) && args.length >= 2) {
    amount = parseInt(args[0]);
    targetName = args.slice(1).join(' ').replace(/["']/g, '').trim();
  } else if (!isNaN(parseInt(args[args.length - 1])) && args.length >= 2) {
    amount = parseInt(args[args.length - 1]);
    targetName = args.slice(0, -1).join(' ').replace(/["']/g, '').trim();
  } else {
    targetName = args.join(' ').replace(/["']/g, '').trim();
    amount = 1;
  }

  const cleanName = targetName.toLowerCase();

  // Verifica se é dinheiro
  if (MONEY_KEYS.includes(cleanName)) {
    return { type: 'money', key: 'money', amount, rawName: 'Dinheiro Pessoal' };
  }

  // Verifica se é recurso de reino
  if (KINGDOM_RESOURCES[cleanName]) {
    return { type: 'kingdom', key: cleanName, amount, rawName: cleanName.toUpperCase() };
  }

  // Caso contrário, trata como item de inventário
  return { type: 'item', key: targetName, amount, rawName: targetName };
}

function hasKingdomOffer(offer) {
  if (!offer || !offer.kingdom) return false;
  const k = offer.kingdom;
  return (k.food || 0) > 0 || (k.wood || 0) > 0 || (k.stone || 0) > 0 || (k.iron || 0) > 0 || (k.treasury || 0) > 0;
}

function formatTradeView(session) {
  const p1 = session.player1;
  const p2 = session.player2;

  const o1 = session.offers[p1];
  const o2 = session.offers[p2];

  const status1 = o1.confirmed ? '✅ Pronto' : '⏳ Negociando';
  const status2 = o2.confirmed ? '✅ Pronto' : '⏳ Negociando';

  return `📊 *BANCADA DE NEGOCIAÇÃO* 🤝\n\n` +
         `👤 *Jogador 1:* @${p1.split('@')[0]} [${status1}]\n` +
         `${formatOfferList(o1)}\n\n` +
         `👤 *Jogador 2:* @${p2.split('@')[0]} [${status2}]\n` +
         `${formatOfferList(o2)}\n\n` +
         `━━━━━━━━━━━━━━━━━━━━\n` +
         `💡 \`/trocar adicionar <item/recurso> <qtd>\` ➔ Ofertar bens\n` +
         `💡 \`/trocar remover <item/recurso> <qtd>\` ➔ Retirar bens\n` +
         `💡 \`/trocar confirmar\` ➔ Finalizar quando ambos estiverem prontos\n` +
         `💡 \`/trocar cancelar\` ➔ Encerrar a negociação`;
}

function formatOfferList(offer) {
  if (!offer) return '  _(Nenhum item ofertado)_';

  const lines = [];

  if (offer.money > 0) {
    lines.push(`• 💵 Dinheiro: **$${offer.money.toLocaleString('pt-BR')}** moedas`);
  }

  if (offer.kingdom) {
    if (offer.kingdom.treasury > 0) lines.push(`• 🪙 Tesouro Real: **$${offer.kingdom.treasury.toLocaleString('pt-BR')}** ouro`);
    if (offer.kingdom.food > 0) lines.push(`• 🍞 Comida: **${offer.kingdom.food}** unid`);
    if (offer.kingdom.wood > 0) lines.push(`• 🪵 Madeira: **${offer.kingdom.wood}** unid`);
    if (offer.kingdom.stone > 0) lines.push(`• 🪨 Pedra: **${offer.kingdom.stone}** unid`);
    if (offer.kingdom.iron > 0) lines.push(`• ⚙️ Ferro: **${offer.kingdom.iron}** unid`);
  }

  if (offer.items && Object.keys(offer.items).length > 0) {
    for (const [item, qty] of Object.entries(offer.items)) {
      lines.push(`• 🎒 ${item} **(x${qty})**`);
    }
  }

  if (lines.length === 0) {
    return '  _(Nenhum item ofertado na bancada)_';
  }

  return lines.join('\n');
}

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of tradeSessions.entries()) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      tradeSessions.delete(sessionId);
      userToSessionMap.delete(session.player1);
      userToSessionMap.delete(session.player2);
    }
  }
}

function renderTradeHelp(reply) {
  const text = `🤝 *SISTEMA COMPLETO DE TROCAS & COMÉRCIO* 📦\n\n` +
               `Negocie recursos de reino, itens de inventário e moedas com outros jogadores!\n\n` +
               `📜 *COMANDOS DE TROCA:*\n` +
               `• \`/trocar @usuario\` ➔ Propor uma negociação direta\n` +
               `• \`/trocar aceitar\` ➔ Aceitar proposta recebida\n` +
               `• \`/trocar recusar\` ➔ Recusar ou cancelar a negociação\n` +
               `• \`/trocar ver\` ➔ Visualizar a bancada de negociação\n` +
               `• \`/trocar adicionar <item/recurso> <qtd>\` ➔ Adicionar à sua oferta\n` +
               `• \`/trocar remover <item/recurso> <qtd>\` ➔ Retirar da sua oferta\n` +
               `• \`/trocar confirmar\` ➔ Confirmar e finalizar a troca mútua\n\n` +
               `💡 *Exemplos de Adição:*\n` +
               `• \`/trocar adicionar ferro 500\`\n` +
               `• \`/trocar adicionar madeira 200\`\n` +
               `• \`/trocar adicionar dinheiro 10000\`\n` +
               `• \`/trocar adicionar "Rare Candy" 2\`\n` +
               `• \`/trocar adicionar "Adaga de Aço" 1\``;

  return reply(text);
}
