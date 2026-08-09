import { getUser, updateUser } from '../database/sqlite.js';
import { EXTENDED_PETS } from '../utils/bonusCalculator.js';

export const HOUSES = {
  casa: { name: '🏠 Casa de Bairro', price: 15000, dailyBonus: 1000, title: null },
  apartamento: { name: '🏢 Apartamento de Luxo', price: 50000, dailyBonus: 3500, title: null },
  mansao: { name: '🏰 Mansão de Alto Padrão', price: 200000, dailyBonus: 12000, title: null },
  vila: { name: '🏕️ Vila Pequena', price: 500000, dailyBonus: 35000, title: 'Lorde / Lady da Vila' },
  reinopequeno: { name: '🏰 Pequeno Reino', price: 1500000, dailyBonus: 120000, title: 'Rei / Rainha' },
  imperio: { name: '👑 Império Soberano', price: 5000000, dailyBonus: 450000, title: 'Imperador / Imperatriz' }
};

export const PETS = EXTENDED_PETS;

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
          return reply('⚠️ Escolha um imóvel válido: `casa`, `apartamento`, `mansao`, `vila`, `reinopequeno` ou `imperio`.\nExemplo: `/casas comprar reinopequeno`');
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
        if (house.title) {
          extraData.monarchy_title = house.title;
        }

        const newWallet = user.wallet - house.price;

        updateUser(sender, { wallet: newWallet, extra_data: JSON.stringify(extraData) });

        const titleMsg = house.title ? `\n👑 *TÍTULO NOBRE DA MONARQUIA CONCEDIDO:* Você agora é reconhecido como **${house.title}**!` : '';

        return reply(`🏡 *PARABÉNS PELA CONQUISTA REAL!* 🏰\n\n` +
                     `Você comprou ${house.name} por *$${house.price.toLocaleString('pt-BR')}*!\n` +
                     `📈 *Bônus diário de aluguel:* +$${house.dailyBonus.toLocaleString('pt-BR')} no seu \`/daily\`!${titleMsg}`);
      }

      let housesCatalog = Object.keys(HOUSES).map(k => {
        const h = HOUSES[k];
        const owned = extraData.houses?.includes(k) ? ' (✅ Adquirido)' : '';
        const titleBadge = h.title ? ` | 👑 *Monarquia:* ${h.title}` : '';
        return `• *${h.name}* ${owned}\n  💰 Preço: $${h.price.toLocaleString('pt-BR')} | 🎁 Bônus Diário: +$${h.dailyBonus.toLocaleString('pt-BR')}${titleBadge}\n  👉 Use: \`/casas comprar ${k}\``;
      }).join('\n\n');

      return reply(`🏙️ *MERCADO DE IMÓVEIS, REINOS & IMPÉRIOS* 👑\n\n${housesCatalog}`);
    }

    case 'pet':
    case 'pets': {
      const sub = args[0]?.toLowerCase();

      if (sub === 'comprar') {
        const petKey = args[1]?.toLowerCase();
        if (!petKey || !PETS[petKey]) {
          return reply('⚠️ Escolha um pet válido: `cachorro`, `gato`, `papagaio`, `raposa`, `dragao` ou `fenix`.\nExemplo: `/pet comprar dragao`');
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
          level: 1,
          happiness: 100,
          lastFed: Date.now(),
          lastPlayed: Date.now()
        };

        const newWallet = user.wallet - petSpec.price;
        updateUser(sender, { wallet: newWallet, extra_data: JSON.stringify(extraData) });

        return reply(`🐾 *NOVO COMPANHEIRO ADOTADO!*\n\n` +
                     `Você adotou **${petSpec.name}**!\n` +
                     `⭐ *Nível Inicial:* Nível 1\n` +
                     `❤️ *Felicidade:* 100%\n` +
                     `💡 Use \`/pet alimentar\`, \`/pet brincar\` e \`/pet evoluir\` (com Rare Candy da loja) para torná-lo invencível!`);
      }

      if (sub === 'evoluir' || sub === 'rare' || sub === 'candy') {
        if (!extraData.pet) return reply('⚠️ Você não possui um pet para evoluir! Adote um com `/pet comprar`.');

        let inventory = [];
        try {
          inventory = JSON.parse(user.inventory || '[]');
        } catch (_) {}

        const candyIndex = inventory.indexOf('🍬 Rare Candy');
        if (candyIndex === -1) {
          return reply('⚠️ Você não tem nenhum **🍬 Rare Candy** no seu /inventario!\nCompre na \`/loja\` por $2.500 moedas para alimentar e evoluir seu pet.');
        }

        inventory.splice(candyIndex, 1);
        extraData.pet.level = Number(extraData.pet.level || 1) + 1;
        extraData.pet.happiness = 100;

        updateUser(sender, {
          inventory: JSON.stringify(inventory),
          extra_data: JSON.stringify(extraData)
        });

        const petLvl = extraData.pet.level;
        return reply(`🍬 *EVOLUÇÃO E CRESCIMENTO DE PET!* 🐾⚡\n\n` +
                     `Seu pet **${extraData.pet.name}** devorou a **Rare Candy** e evoluiu!\n` +
                     `⭐ *Novo Nível do Pet:* **Nível ${petLvl}**\n` +
                     `❤️ *Felicidade:* 100%\n` +
                     `✨ *Buffs Incrementados:* +${(petLvl - 1) * 5}% Moedas/XP | +${(petLvl - 1) * 15} HP | +${(petLvl - 1) * 8} ATK!`);
      }

      if (sub === 'alimentar') {
        if (!extraData.pet) return reply('⚠️ Você não possui um pet! Adote um com `/pet comprar cachorro`.');

        if (args[1]?.toLowerCase() === 'candy' || args[1]?.toLowerCase() === 'rare') {
          // Redireciona para evolução com Rare Candy
          args[0] = 'evoluir';
          return handleBankMarketCommands(sock, msg, command, args, sender);
        }

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
        const petLvl = Number(extraData.pet.level || 1);
        const bonusMoney = Math.floor(((PETS[extraData.pet.type]?.baseIncome || 200) + (petLvl * 50)) * (extraData.pet.happiness / 100));
        const newWallet = user.wallet + bonusMoney;

        updateUser(sender, { wallet: newWallet, extra_data: JSON.stringify(extraData) });

        return reply(`🎾 *BRINCADEIRA COM O PET!*\n\n` +
                     `Você brincou com seu pet! Ele amou a diversão!\n` +
                     `⭐ *Nível:* ${petLvl} | ❤️ *Felicidade:* ${extraData.pet.happiness}%\n` +
                     `💰 *Renda do Pet:* +$${bonusMoney.toLocaleString('pt-BR')}`);
      }

      // Status do Pet
      if (!extraData.pet) {
        let petCatalog = Object.keys(PETS).map(k => `• *${PETS[k].name}* — $${PETS[k].price.toLocaleString('pt-BR')}\n  ✨ *Habilidade:* ${PETS[k].desc}\n  👉 Adote com: \`/pet comprar ${k}\``).join('\n\n');
        return reply(`🐾 *SISTEMA DE PETS RPG* 🐾\n\nVocê ainda não possui um pet companheiro!\n\n*Pets disponíveis com habilidades especiais:*\n\n${petCatalog}`);
      }

      const p = extraData.pet;
      const petSpec = PETS[p.type] || { name: p.name, desc: 'Pet companheiro' };
      const petLvl = Number(p.level || 1);
      return reply(`🐾 *STATUS DO SEU PET* 🐾\n\n` +
                   `🐶 *Companheiro:* ${petSpec.name}\n` +
                   `⭐ *Nível do Pet:* **Nível ${petLvl}**\n` +
                   `✨ *Habilidade Passiva:* ${petSpec.desc}\n` +
                   `⚔️ *Força de Combate do Pet:* +${(petLvl - 1) * 15} HP | +${(petLvl - 1) * 8} ATK\n` +
                   `📈 *Bônus de Ganhos:* +${(petLvl - 1) * 5}% em Moedas e XP\n` +
                   `❤️ *Felicidade:* ${p.happiness || 50}%\n\n` +
                   `💡 *Comandos:* \`/pet evoluir\` (com Rare Candy) | \`/pet alimentar\` | \`/pet brincar\``);
    }
  }
}
