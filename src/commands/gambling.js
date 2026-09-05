const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getActivePrefixes } = require('../database');
const { SYMBOL_TABLE, MAX_BET } = require('./slots');
const { formatNumber } = require('../util');

async function buildEmbed(interaction) {
  const guildId = interaction?.guild?.id;
  const [activePrefix] = await getActivePrefixes(guildId, config.prefix, config.prefixAliases);

  const totalWeight = SYMBOL_TABLE.reduce((sum, s) => sum + s.weight, 0);

  const fmtSymbol = (s) => {
    const chance = ((s.weight / totalWeight) * 100).toFixed(1).replace(/\.0$/, '');
    return `${s.emoji} **×${s.multiplier}** \`${chance}%\``;
  };

  // Split payout into 2 side-by-side columns (common / rare)
  const half = Math.ceil(SYMBOL_TABLE.length / 2);
  const common = SYMBOL_TABLE.slice(0, half).map(fmtSymbol).join('\n');
  const rare = SYMBOL_TABLE.slice(half).map(fmtSymbol).join('\n');

  // Exact per-line win chance (sum of p(symbol)^3), derived from weights
  let singleLine = 0;
  for (const s of SYMBOL_TABLE) singleLine += Math.pow(s.weight / totalWeight, 3);
  const pct = (n) => (n * 100).toFixed(2).replace(/\.?0+$/, '');
  const pJackpot = Math.pow(SYMBOL_TABLE[SYMBOL_TABLE.length - 1].weight / totalWeight, 3) * 100;

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('** 🎰 Gambling Info **')
    .setDescription(
      ` ● 🎰 Slots\n` +
      `Match **3 in a row** on any of the **5 paylines** ` +
      `(**3 rows** + **2 diagonals X**) — multipliers **stack**!`
    )
    .addFields(
      // ── Category 1: Slots ──
      { name: '🍒 Common', value: common, inline: true },
      { name: '💎 Rare', value: rare, inline: true },
      { name: '📈 Win Rates', value: `**${pct(singleLine)}%** / line\n**22.08%** any win`, inline: true },
      { name: '🎯 Exactly 1 Line', value: '**19.57%**', inline: true },
      { name: '✨ 2+ Lines', value: '**2.51%**', inline: true },
      { name: '➕ Horiz + Diag', value: '**1.74%**', inline: true },
      { name: '💎 Jackpot (💎×3)', value: `**${pJackpot.toFixed(3)}%**`, inline: true },
      { name: '🎲 Try It', value: `\`${activePrefix}slots 100\``, inline: true },
      { name: '🚫 Max Bet', value: `**${formatNumber(MAX_BET)} ${config.currencyName}**`, inline: true },

      // ── Category 2: Coinflip (full-width, bold field name = sub-title) ──
      {
        name: ' ● 🪙 Coinflip',
        value: 'Bet on **heads** or **tails** — a correct guess wins **2×** your bet.',
        inline: false,
      },
      { name: '📜 Default', value: 'If you don\'t pick a side, it\'s **heads** by default.', inline: true },
      { name: '🎲 Try It', value: `\`${activePrefix}coinflip 100\``, inline: true },
      { name: '🚫 Max Bet', value: `**${formatNumber(MAX_BET)} ${config.currencyName}**`, inline: true },

      // ── Category 3: Bomber (Mines) ──
      {
        name: ' ● 💣 Bomber (Mines)',
        value: '3x3 grid with **3 hidden bombs** 💣 and **6 diamonds** 💎. Reveal diamonds to multiply your payout and cash out anytime!',
        inline: false,
      },
      { name: '📈 Multipliers', value: '`1.4x` · `2.0x` · `3.2x` · `5.5x` · `12x` · `35x`', inline: true },
      { name: '🎲 Try It', value: `\`${activePrefix}bomber 1000\` or \`${activePrefix}bomber all\``, inline: true },
      { name: '🚫 Max Bet', value: `**10.000 ${config.currencyName}**`, inline: true }
    );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gambling')
    .setDescription('Gambling info: slot payouts, coinflip & bomber rules'),

  // Alias for prefix commands: "lug" = "lu" + "g" → gambling
  aliases: ['g'],

  // Exported so "<prefix> slots/coinflip/gambling info" can show it in index.js
  buildEmbed,

  async execute(interaction) {
    await interaction.reply({ embeds: [await buildEmbed(interaction)] });
  },
};
