const { SlashCommandBuilder } = require('discord.js');
const { getUser, updateBalance } = require('../database');
const config = require('../config');
const { MAX_BET, resolveBet } = require('./slots');
const { formatNumber } = require('../util');

// Normalize a coin-side choice to its canonical value. Supports short forms
// t/h and full words tails/heads (case-insensitive).
function normalizeChoice(raw) {
  const c = String(raw || '').trim().toLowerCase();
  if (c === 't' || c === 'tail' || c === 'tails') return 'tails';
  if (c === 'h' || c === 'head' || c === 'heads') return 'heads';
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Coin flip bet')
    .addStringOption((opt) =>
      opt
        .setName('bet')
        .setDescription('Bet amount, or "all" for max bet (150.000)')
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('choice')
        .setDescription('Choose a coin side (defaults to heads)')
        .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })
    ),

  // Alias for prefix commands: "lucf" = "lu" + "cf" → coinflip
  aliases: ['cf'],
  MAX_BET,

  async execute(interaction) {
    let rawBet = interaction.options.getString('bet');
    let choice = interaction.options.getString('choice') || 'heads';

    // Prefix commands can join bet+choice into a single token
    // (e.g. "all tails", "100 heads"). If the last token is a valid coin
    // side, split it out so bet and choice are parsed correctly.
    const joined = String(rawBet || '').match(/^(.*?)\s+(\S+)$/);
    if (joined) {
      const tailChoice = normalizeChoice(joined[2]);
      if (tailChoice) {
        rawBet = joined[1].trim();
        choice = tailChoice;
      }
    }

    // Also accept short forms t/h for the choice option itself.
    choice = normalizeChoice(choice) || choice;

    const user = await getUser(interaction.user.id);
    const bet = resolveBet(rawBet, user.balance);

    if (bet <= 0) return interaction.reply({ content: '❌ Bet must be greater than 0.', flags: 64 });
    if (bet > MAX_BET) {
      return interaction.reply({
        content: `❌ Maximum bet is **${formatNumber(MAX_BET)} ${config.currencyName}**.`,
        flags: 64,
      });
    }
    if (user.balance < bet) {
      return interaction.reply({ content: `❌ Your balance is not enough. You need **${formatNumber(bet)} ${config.currencyName}**.`, flags: 64 });
    }

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const win = result === choice;

    // First reply: just show the spinning coin emote
    await interaction.reply(`${config.coinSpinEmote} Flipping the coin...`);

    // Delay & reveal the result non-blocking (fire-and-forget),
    // so this command handler doesn't block the event loop / other interactions.
    setTimeout(async () => {
      await updateBalance(interaction.user.id, win ? bet : -bet);

      const payout = bet * 2;
      interaction
        .editReply(
          `${config.coinResultEmote} You picked **${choice}**! The coin landed on **${result}**! ${
            win
              ? `You won **${formatNumber(payout)} ${config.currencyName}**! 🎉`
              : `You lost **${formatNumber(bet)} ${config.currencyName}**. 😢`
          }${rawBet === 'all' ? ` (all-in: **${formatNumber(bet)}** ${config.currencyName})` : ''}`
        )
        .catch((err) => {
          // The interaction can "die" if the connection is slow (code 10062/40060)
          if (err.code === 10062 || err.code === 40060) {
            console.warn(`⚠️ Coinflip interaction expired before reveal (user: ${interaction.user.id})`);
          } else {
            console.error('❌ Error while editing coinflip reply:', err);
          }
        });
    }, config.coinflipAnimationDelay);
  },
};