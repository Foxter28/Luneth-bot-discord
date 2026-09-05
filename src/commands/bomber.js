const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getUser, updateBalance } = require('../database');
const config = require('../config');
const { formatNumber } = require('../util');

// Active games: userId -> { bet, minesCount, minePositions: Set, revealed: Set, gameOver: boolean }
const activeGames = new Map();

// Multipliers for 3x3 grid (9 tiles total) with 3 mines (6 safe tiles)
const MULTIPLIERS_3MINES = [1.0, 1.4, 2.0, 3.2, 5.5, 12.0, 35.0];

function generateMinePositions(totalTiles = 9, numMines = 3) {
  const positions = new Set();
  while (positions.size < numMines) {
    positions.add(Math.floor(Math.random() * totalTiles));
  }
  return positions;
}

function calculatePayout(bet, safeRevealedCount) {
  const mult = MULTIPLIERS_3MINES[safeRevealedCount] || 1.0;
  return Math.floor(bet * mult);
}

function getNextPayout(bet, safeRevealedCount) {
  const nextMult = MULTIPLIERS_3MINES[safeRevealedCount + 1] || MULTIPLIERS_3MINES[safeRevealedCount];
  return {
    amount: Math.floor(bet * nextMult),
    multiplier: nextMult.toFixed(2),
  };
}

function buildGridComponents(game, showAll = false) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const isRevealed = game.revealed.has(idx);
      const isMine = game.minePositions.has(idx);

      const btn = new ButtonBuilder().setCustomId(`bomber_tile_${idx}`);

      if (showAll) {
        btn.setDisabled(true);
        if (isMine) {
          btn.setEmoji('💣').setStyle(ButtonStyle.Danger);
        } else if (isRevealed) {
          btn.setEmoji('💎').setStyle(ButtonStyle.Success);
        } else {
          btn.setEmoji('🪙').setStyle(ButtonStyle.Secondary);
        }
      } else {
        if (isRevealed) {
          btn.setEmoji('💎').setStyle(ButtonStyle.Success).setDisabled(true);
        } else {
          btn.setLabel('?').setStyle(ButtonStyle.Secondary);
        }
      }
      row.addComponents(btn);
    }
    rows.push(row);
  }

  // Cash Out button row
  const cashOutDisabled = showAll || game.revealed.size === 0;
  const currentPayout = calculatePayout(game.bet, game.revealed.size);
  const cashRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bomber_cashout')
      .setLabel(`💵 Cash Out (${formatNumber(currentPayout)} ${config.currencyName})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(cashOutDisabled)
  );

  rows.push(cashRow);
  return rows;
}

function buildGameEmbed(username, game, status = 'playing') {
  const currentPayout = calculatePayout(game.bet, game.revealed.size);
  const currentMult = (MULTIPLIERS_3MINES[game.revealed.size] || 0.0).toFixed(2);
  const next = getNextPayout(game.bet, game.revealed.size);

  let title = `💣 ${username} started a mines game.`;
  let color = 0x5865f2;

  if (status === 'win') {
    title = `🎉 ${username} cashed out ${formatNumber(currentPayout)} ${config.currencyName}!`;
    color = 0x2ecc71;
  } else if (status === 'lose') {
    title = `💥 BOOM! ${username} hit a mine and lost ${formatNumber(game.bet)} ${config.currencyName}!`;
    color = 0xe74c3c;
  }

  const desc =
    `**Bet:** \`${formatNumber(game.bet)}\` · **Mines:** \`3\`\n` +
    `**Cash Out:** \`${formatNumber(currentPayout)}\` \`(${currentMult}x)\`\n` +
    (status === 'playing' ? `**Next:** \`${formatNumber(next.amount)}\` \`(${next.multiplier}x)\`` : '');

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(desc);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bomber')
    .setDescription('💣 Mines game — find diamonds, avoid bombs, and cash out anytime!')
    .addStringOption((opt) =>
      opt.setName('amount').setDescription('Amount of coins to bet (or "all")').setRequired(true)
    ),

  aliases: ['mines', 'minegame', 'bomb'],
  MAX_BET: 10000,

  async execute(interaction) {
    const userId = interaction.user.id;
    if (activeGames.has(userId)) {
      return interaction.reply({
        content: '⚠️ You already have an active mines game! Finish it before starting a new one.',
        flags: 64,
      });
    }

    const rawBet = String(
      interaction.options.getString('amount') ||
      interaction.options.getString('bet') ||
      ''
    ).trim();

    const user = await getUser(userId);
    const MAX_BET = 10000;

    let bet = 0;
    if (rawBet.toLowerCase() === 'all') {
      bet = Math.min(MAX_BET, user.balance);
    } else {
      bet = parseInt(rawBet.replace(/\./g, ''), 10);
    }

    if (Number.isNaN(bet) || bet <= 0) {
      return interaction.reply({
        content: `❌ Please enter a valid positive bet amount (e.g. \`/bomber amount:1000\` or \`${config.prefixAliases[0] || 'lu'}bomber 1000\`).`,
        flags: 64,
      });
    }

    if (bet > MAX_BET) {
      return interaction.reply({
        content: `❌ The maximum bet for Bomber is **${formatNumber(MAX_BET)} ${config.currencyName}**.`,
        flags: 64,
      });
    }

    if (user.balance < bet) {
      return interaction.reply({
        content: `❌ You only have **${formatNumber(user.balance)} ${config.currencyName}** (bet was **${formatNumber(bet)}**).`,
        flags: 64,
      });
    }

    // Deduct bet initially
    await updateBalance(userId, -bet);

    const game = {
      userId,
      bet,
      minesCount: 3,
      minePositions: generateMinePositions(9, 3),
      revealed: new Set(),
      gameOver: false,
    };

    activeGames.set(userId, game);

    const embed = buildGameEmbed(interaction.user.username, game, 'playing');
    const components = buildGridComponents(game, false);

    await interaction.reply({ embeds: [embed], components });
  },

  async handleComponent(interaction) {
    const customId = interaction.customId;
    if (!customId.startsWith('bomber_')) return false;

    const userId = interaction.user.id;
    const game = activeGames.get(userId);

    if (!game) {
      return interaction.reply({ content: '❌ This game has ended or belongs to someone else.', flags: 64 });
    }

    try {
      await interaction.deferUpdate();
    } catch (err) {
      console.error('❌ Failed to defer bomber component:', err);
      return true;
    }

    // ── Cash Out ──
    if (customId === 'bomber_cashout') {
      if (game.revealed.size === 0) return true;
      activeGames.delete(userId);

      const winnings = calculatePayout(game.bet, game.revealed.size);
      await updateBalance(userId, winnings);

      const embed = buildGameEmbed(interaction.user.username, game, 'win');
      const components = buildGridComponents(game, true);

      await interaction.editReply({ embeds: [embed], components });
      return true;
    }

    // ── Click Tile ──
    if (customId.startsWith('bomber_tile_')) {
      const tileIdx = parseInt(customId.replace('bomber_tile_', ''), 10);
      if (game.revealed.has(tileIdx)) return true;

      // Hit a mine!
      if (game.minePositions.has(tileIdx)) {
        activeGames.delete(userId);

        const embed = buildGameEmbed(interaction.user.username, game, 'lose');
        const components = buildGridComponents(game, true);

        await interaction.editReply({ embeds: [embed], components });
        return true;
      }

      // Safe diamond!
      game.revealed.add(tileIdx);

      // Cleared all 6 safe tiles -> Auto cash out max reward
      if (game.revealed.size === 6) {
        activeGames.delete(userId);
        const winnings = calculatePayout(game.bet, 6);
        await updateBalance(userId, winnings);

        const embed = buildGameEmbed(interaction.user.username, game, 'win');
        const components = buildGridComponents(game, true);

        await interaction.editReply({ embeds: [embed], components });
        return true;
      }

      // Still in progress
      const embed = buildGameEmbed(interaction.user.username, game, 'playing');
      const components = buildGridComponents(game, false);

      await interaction.editReply({ embeds: [embed], components });
      return true;
    }

    return true;
  },
};
