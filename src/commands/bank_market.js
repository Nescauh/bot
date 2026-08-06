import { getUser, updateUser } from '../database/sqlite.js';

export const HOUSES = {
  casa: { name: '🏠 Casa de Bairro', price: 15000, dailyBonus: 1000 },
  apartamento: { name: '🏢 Apartamento de Luxo', price: 50000, dailyBonus: 3500 },
  mansao: { name: '🏰 Mansão de Alto Padrão', price: 200000, dailyBonus: 12000 }
};

export const PETS = {
  cachorro: { name: '🐶 Cachorro Fiel', price: 5000, baseIncome: 300 },
  gato: { name: '🐱 Gato Místico', price: 8000, baseIncome: 500 },
  dragao: { name: '🐉 Bebê Dragão', price: 50000, baseIncome: 3000 }
};

export async function handleBankMarketCommands(sock, msg, command, args, sender) {
  const from = msg.key.remoteJid;
  const reply = async (text) => {
    await sock.sendMessage(from, { text }, { quoted: msg });
  };

  const user = getUser(sender);
  let extraData = {};
  try {
    extraData = typeof user.extra_data === 'string' ? JSON.parse(user.extra_data || '{}') : (user.extra_data || {});
  } catch (_) {
    extraData = {};
  }

  switch (command) {
    case 'depositar': {
      const valStr = args[0]?.toLowerCase()?.trim();
      if (!valStr) {
        return reply('⚠️ Informe a quantia que deseja depositar no banco.\nExemplo: `/depositar 1000` ou `/depositar tudo`');
      }

      let amount = 0;
      if (valStr === 'tudo' || valStr === 'all') {
        amount = user.wallet;
      } else {
        amount = parseInt(valStr, 10);
      }

      if (isNaN(amount) || amount <= 0) {
        return reply('⚠️ Digite um valor numérico válido maior que zero.');
      }

      if (user.wallet < amount) {
        return reply(`⚠️ Você não tem **$${amount.toLocaleString('pt-BR')}** na sua carteira. Saldo atual: **$${user.wallet.toLocaleString('pt-BR')}**.`);
      }

      const newWallet = user.wallet - amount;
      const newBank = user.bank + amount;
      updateUser(sender, { wallet: newWallet, bank: newBank });

      return reply(`🏦 *DEPÓSITO BANCÁRIO REALIZADO!*\n\n` +
                   `💸 *Depositado:* $${amount.toLocaleString('pt-BR')}\n` +
                   `💵 *Carteira:* $${newWallet.toLocaleString('pt-BR')}\n` +
                   `🏦 *Banco:* $${newBank.toLocaleString('pt-BR')}\n\n` +
                   `📈 _Seu dinheiro no banco rende 1% de juros diários!_`);
    }

    case 'sacar': {
      const valStr = args[0]?.toLowerCase()?.trim();
      if (!valStr) {
        return reply('⚠️ Informe a quantia que deseja sacar do banco.\nExemplo: `/sacar 1000` ou `/sacar tudo`');
      }

      let amount = 0;
      if (valStr === 'tudo' || valStr === 'all') {
        amount = user.bank;
      } else {
        amount = parseInt(valStr, 10);
      }

      if (isNaN(amount) || amount <= 0) {
        return reply('⚠️ Digite um valor numérico válido maior que zero.');
      }

      if (user.bank < amount) {
        return reply(`⚠️ Você não tem **$${amount.toLocaleString('pt-BR')}** no banco. Saldo bancário atual: **$${user.bank.toLocaleString('pt-BR')}**.`);
      }

      const newWallet = user.wallet + amount;
      const newBank = user.bank - amount;
      updateUser(sender, { wallet: newWallet, bank: newBank });

      return reply(`🏧 *SAQUE BANCÁRIO REALIZADO!*\n\n` +
                   `💵 *Sacado:* $${amount.toLocaleString('pt-BR')}\n` +
                   `💵 *Carteira:* $${newWallet.toLocaleString('pt-BR')}\n` +
                   `🏦 *Banco:* $${newBank.toLocaleString('pt-BR')}`);
    }

    case 'imoveis':
    case 'casas': {
      const sub = args[0]?.toLowerCase();
      if (sub === 'comprar') {
        const houseKey = args[1]?.toLowerCase();
        if (!houseKey || !HOUSES[houseKey]) {
          return reply('⚠️ Escolha um imóvel válido: `casa`, `apartamento` ou `mansao`.\nExemplo: `/casas comprar casa`');
        }

        const house = HOUSES[houseKey];
        if (user.wallet < house.price) {
          return reply(`⚠️ Você precisa de **$${house.price.toLocaleString('pt-BR')}** na carteira para comprar ${house.name}.`);
        }

        if (!extraData.houses) extraData.houses = [];
        if (extraData.houses.includes(houseKey)) {
          return reply(`⚠️ Você já possui este imóvel!`);
        }

        extraData.houses.push(houseKey);
        const newWallet = user.wallet - house.price;

        updateUser(sender, { wallet: newWallet, extra_data: JSON.stringify(extraData) });

        return reply(`🏡 *PARABÉNS PELA CONQUISTA!*\n\n` +
                     `Você comprou ${house.name} por *$${house.price.toLocaleString('pt-BR')}*!\n` +
                     `📈 *Bônus diário de aluguel:* +$${house.dailyBonus.toLocaleString('pt-BR')} no seu \`/daily\`!`);
      }

      let housesCatalog = Object.keys(HOUSES).map(k => {
        const h = HOUSES[k];
        const owned = extraData.houses?.includes(k) ? ' (✅ Adquirido)' : '';
        return `• *${h.name}* ${owned}\n  💰 Preço: $${h.price.toLocaleString('pt-BR')} | 🎁 Bônus Diário: +$${h.dailyBonus.toLocaleString('pt-BR')}\n  👉 Use: \`/casas comprar ${k}\``;
      }).join('\n\n');

      return reply(`🏙️ *MERCADO DE IMÓVEIS & PROPRIEDADES* 🏙️\n\n${housesCatalog}`);
    }

    case 'pet':
    case 'pets': {
      const sub = args[0]?.toLowerCase();

      if (sub === 'comprar') {
        const petKey = args[1]?.toLowerCase();
        if (!petKey || !PETS[petKey]) {
          return reply('⚠️ Escolha um pet válido: `cachorro`, `gato` ou `dragao`.\nExemplo: `/pet comprar cachorro`');
        }

        const petSpec = PETS[petKey];
        if (user.wallet < petSpec.price) {
          return reply(`⚠️ Você precisa de **$${petSpec.price.toLocaleString('pt-BR')}** na carteira para adotar ${petSpec.name}.`);
        }

        if (extraData.pet) {
          return reply(`⚠️ Você já possui o pet **${PETS[extraData.pet.type]?.name || 'Pet'}**! Cuide bem dele primeiro.`);
        }

        extraData.pet = {
          type: petKey,
          name: petSpec.name,
          happiness: 100,
          lastFed: Date.now(),
          lastPlayed: Date.now()
        };

        const newWallet = user.wallet - petSpec.price;
        updateUser(sender, { wallet: newWallet, extra_data: JSON.stringify(extraData) });

        return reply(`🐾 *NOVO COMPANHEIRO ADOTADO!*\n\n` +
                     `Você adotou **${petSpec.name}**!\n` +
                     `❤️ *Felicidade:* 100%\n` +
                     `💡 Use \`/pet alimentar\` e \`/pet brincar\` para mantê-lo feliz e gerando moedas!`);
      }

      if (sub === 'alimentar') {
        if (!extraData.pet) return reply('⚠️ Você não possui um pet! Adote um com `/pet comprar cachorro`.');

        if (user.wallet < 100) return reply('⚠️ Alimentar seu pet custa **$100** em ração.');

        extraData.pet.happiness = Math.min(100, (extraData.pet.happiness || 50) + 25);
        extraData.pet.lastFed = Date.now();
        const newWallet = user.wallet - 100;

        updateUser(sender, { wallet: newWallet, extra_data: JSON.stringify(extraData) });

        return reply(`🍖 *PET ALIMENTADO!*\n\nSeu pet devorou a ração! ❤️ *Felicidade:* ${extraData.pet.happiness}%`);
      }

      if (sub === 'brincar') {
        if (!extraData.pet) return reply('⚠️ Você não possui um pet! Adote um com `/pet comprar cachorro`.');

        extraData.pet.happiness = Math.min(100, (extraData.pet.happiness || 50) + 15);
        extraData.pet.lastPlayed = Date.now();

        // Pet feliz rende moedas bônus!
        const bonusMoney = Math.floor((PETS[extraData.pet.type]?.baseIncome || 200) * (extraData.pet.happiness / 100));
        const newWallet = user.wallet + bonusMoney;

        updateUser(sender, { wallet: newWallet, extra_data: JSON.stringify(extraData) });

        return reply(`🎾 *BRINCADEIRA COM O PET!*\n\n` +
                     `Você brincou com seu pet! Ele amou a diversão!\n` +
                     `❤️ *Felicidade:* ${extraData.pet.happiness}%\n` +
                     `💰 *Renda do Pet:* +$${bonusMoney.toLocaleString('pt-BR')}`);
      }

      // Status do Pet
      if (!extraData.pet) {
        let petCatalog = Object.keys(PETS).map(k => `• *${PETS[k].name}* — $${PETS[k].price.toLocaleString('pt-BR')} (Compre com: \`/pet comprar ${k}\`)`).join('\n');
        return reply(`🐾 *SISTEMA DE PETS* 🐾\n\nVocê ainda não possui um pet companheiro!\n\n*Pets disponíveis:*\n${petCatalog}`);
      }

      const p = extraData.pet;
      return reply(`🐾 *STATUS DO SEU PET* 🐾\n\n` +
                   `🐶 *Espécie:* ${PETS[p.type]?.name || p.name}\n` +
                   `❤️ *Felicidade:* ${p.happiness || 50}%\n\n` +
                   `💡 *Comandos:* \`/pet alimentar\` | \`/pet brincar\``);
    }
  }
}
