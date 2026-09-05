const { SlashCommandBuilder } = require('discord.js');
const { getUser, updateBalance } = require('../database');
const config = require('../config');
const { formatNumber } = require('../util');

// Maximum bet allowed for slots
const MAX_BET = 150000;

// Resolve a bet from slash/prefix value: "all" → max bet (capped by balance), else parse int
function resolveBet(raw, balance) {
  if (typeof raw === 'string' && raw.toLowerCase() === 'all') {
    return Math.min(MAX_BET, balance);
  }
  const n = parseInt(raw, 10);
  return isNaN(n) ? 0 : n;
}

// Slot symbol definitions: emoji, payout multiplier (3 in a row), and drop weight.
// Higher weight = more common. Chance % shown in /gambling info is derived from these weights.
const SYMBOL_TABLE = [
  { emoji: '🍒', multiplier: 2, weight: 30 },
  { emoji: '🍋', multiplier: 3, weight: 24 },
  { emoji: '🍇', multiplier: 4, weight: 18 },
  { emoji: '⭐', multiplier: 5, weight: 13 },
  { emoji: '🌙', multiplier: 7, weight: 9 },
  { emoji: '💎', multiplier: 10, weight: 6 },
];

// Payout multiplier map, derived from SYMBOL_TABLE
const SYMBOL_MULTIPLIERS = Object.fromEntries(SYMBOL_TABLE.map((s) => [s.emoji, s.multiplier]));

function randomSymbol() {
  const totalWeight = SYMBOL_TABLE.reduce((sum, s) => sum + s.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const s of SYMBOL_TABLE) {
    roll -= s.weight;
    if (roll <= 0) return s.emoji;
  }
  return SYMBOL_TABLE[SYMBOL_TABLE.length - 1].emoji; // safety fallback
}

function randomColumn() {
  return [randomSymbol(), randomSymbol(), randomSymbol()];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Check whether the error from Discord API means the interaction "died"
// (slow connection/delay, etc.) — not a bug in our code.
function isDeadInteractionError(err) {
  return err?.code === 10062 || err?.code === 40060;
}

// Render the 3x3 grid in a ``` code block for monospace & clean layout on Discord
function renderGrid(col0, col1, col2, statusLine) {
  const row = (r) => `[ ${col0[r]} ][ ${col1[r]} ][ ${col2[r]} ]`;

  const grid = [row(0), row(1), row(2)].join('\n');

  return `🎰 **SLOT MACHINE** 🎰\n\`\`\`\n${grid}\n\`\`\`\n${statusLine}`;
}

// Define the 5 winning lines: 3 horizontal + 2 diagonal (X)
function getPaylines(col0, col1, col2) {
  const grid = [
    [col0[0], col1[0], col2[0]], // top row
    [col0[1], col1[1], col2[1]], // middle row
    [col0[2], col1[2], col2[2]], // bottom row
  ];
  return [
    { name: 'Top Row', cells: grid[0] },
    { name: 'Middle Row', cells: grid[1] },
    { name: 'Bottom Row', cells: grid[2] },
    { name: 'Diagonal \\', cells: [col0[0], col1[1], col2[2]] }, // top-left to bottom-right
    { name: 'Diagonal /', cells: [col0[2], col1[1], col2[0]] }, // bottom-left to top-right
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Play the 3x3 slot machine (win with a horizontal or diagonal X line)')
    .addStringOption((opt) =>
      opt
        .setName('bet')
        .setDescription('Bet amount, or "all" for max bet (150.000)')
        .setRequired(true)
    ),

  // Alias for prefix commands: "lus" = "lu" + "s" → slots
  aliases: ['s'],
  SYMBOL_MULTIPLIERS,
  SYMBOL_TABLE,
  MAX_BET,
  resolveBet,

  async execute(interaction) {
    const rawBet = interaction.options.getString('bet');
    const user = await getUser(interaction.user.id);
    const bet = resolveBet(rawBet, user.balance);

    if (bet <= 0) return interaction.reply({ content: '❌ Bet must be greater than 0.', flags: 64 });
    if (bet > MAX_BET) {
      return interaction.reply({
        content: `❌ Maximum bet is **${formatNumber(MAX_BET)} ${config.currencyName}**.`,
        flags: 64,
      });
    }
    if (user.balance < bet) return interaction.reply({ content: '❌ Your balance is not enough.', flags: 64 });

    // The final result of each column is decided upfront; the animation is just visual
    const finalCol0 = randomColumn();
    const finalCol1 = randomColumn();
    const finalCol2 = randomColumn();

    try {
      // Stage 1: all columns still spinning
      await interaction.reply(renderGrid(randomColumn(), randomColumn(), randomColumn(), '🔄 Rolling...'));
      await sleep(450);
      await interaction.editReply(renderGrid(randomColumn(), randomColumn(), randomColumn(), '🔄 Rolling...'));
      await sleep(450);

      // Stage 2: left column stops, middle & right still spinning
      await interaction.editReply(renderGrid(finalCol0, randomColumn(), randomColumn(), '🔄 Rolling...'));
      await sleep(450);
      await interaction.editReply(renderGrid(finalCol0, randomColumn(), randomColumn(), '🔄 Rolling...'));
      await sleep(450);

      // Stage 3: middle column stops, right still spinning
      await interaction.editReply(renderGrid(finalCol0, finalCol1, randomColumn(), '🔄 Rolling...'));
      await sleep(450);
      await interaction.editReply(renderGrid(finalCol0, finalCol1, randomColumn(), '🔄 Rolling...'));
      await sleep(450);
    } catch (err) {
      if (isDeadInteractionError(err)) {
        // Slow connection / interaction expired mid-animation.
        // No problem — the bet hasn't been deducted at all at this stage — safe to stop.
        console.warn('⚠️ /slots: interaction died mid-animation, cancelled without deducting balance.');
        return;
      }
      throw err; // re-throw other errors (not interaction-related) so index.js catches them
    }

    // Check all paylines (3 horizontal + 2 diagonal X)
    const paylines = getPaylines(finalCol0, finalCol1, finalCol2);
    const winningLines = paylines.filter((line) => line.cells[0] === line.cells[1] && line.cells[1] === line.cells[2]);

    // Each matching line pays its symbol's multiplier × the bet
    // (multiple lines can win at once — multipliers stack)
    const totalMultiplier = winningLines.reduce((sum, line) => sum + SYMBOL_MULTIPLIERS[line.cells[0]], 0);
    const winnings = Math.floor(bet * totalMultiplier) - bet;
    await updateBalance(interaction.user.id, winnings);

    let resultText;
    if (winningLines.length > 0) {
      const lineDetails = winningLines
        .map((l) => `${l.name} (${l.cells[0]} ×${SYMBOL_MULTIPLIERS[l.cells[0]]})`)
        .join(', ');
      resultText = `🎉 Won on **${lineDetails}**! You got **${formatNumber(Math.floor(bet * totalMultiplier))} ${config.currencyName}**!`;
    } else {
      resultText = `😢 You lost **${formatNumber(bet)} ${config.currencyName}**.`;
    }

    try {
      // Stage 4: right column stops, final result
      await interaction.editReply(renderGrid(finalCol0, finalCol1, finalCol2, '🛑 **Stop!**') + `\n${resultText}`);
    } catch (err) {
      if (isDeadInteractionError(err)) {
        console.warn('⚠️ /slots: failed to send the final result (interaction died), but the balance was already updated.');
        return;
      }
      throw err;
    }
  },
};