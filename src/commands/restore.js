const { SlashCommandBuilder } = require('discord.js');
const { getStreakUser, unfreezeStreak, getUser, updateBalance } = require('../database');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restore')
    .setDescription('Restore your streak for 5,000 coins'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const user = await getStreakUser(userId);
    if (!user) {
      return interaction.reply({
        content: '❌ You are not registered in the streak system. Use `/register streak` first.',
        ephemeral: true,
      });
    }
    if (!user.frozen) {
      return interaction.reply({
        content: '❌ Your streak is not frozen! Keep it alive by chatting.',
        ephemeral: true,
      });
    }
    const account = await getUser(userId);
    if (account.balance < config.streak.restoreCost) {
      return interaction.reply({
        content: `❌ You need **${config.streak.restoreCost.toLocaleString()}** ${config.currencyName} to restore your streak. You have **${account.balance.toLocaleString()}** ${config.currencyName}.`,
        ephemeral: true,
      });
    }
    await updateBalance(userId, -config.streak.restoreCost);
    await unfreezeStreak(userId);
    return interaction.reply({
      content: `🔥 Your streak has been restored! You spent **${config.streak.restoreCost.toLocaleString()}** ${config.currencyName}. Keep chatting to maintain it!`,
    });
  },
};
