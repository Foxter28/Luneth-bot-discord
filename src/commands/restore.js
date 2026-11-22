const { SlashCommandBuilder } = require('discord.js');
const { getStreakUser, unfreezeStreak, getUser, updateBalance } = require('../database');
const { syncMilestoneRoles, dayDiffWIB } = require('../streakService');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restore')
    .setDescription('Restore your expired streak for 5,000 coins')
    .addSubcommand(sub =>
      sub.setName('streak').setDescription('Restore your expired streak for 5,000 coins')),
  aliases: ['restore'],

  async execute(interaction) {
    const sub = interaction.options?.getSubcommand ? interaction.options.getSubcommand(false) : null;
    // Allow /restore, /restore streak, lurestore, or lurestore streak
    if (sub && sub !== 'streak') {
      return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
    }

    const userId = interaction.user.id;
    const user = await getStreakUser(userId);
    if (!user) {
      return interaction.reply({
        content: '❌ You do not have an active streak record to restore. Chat in any channel to start your streak! 🔥',
        ephemeral: true,
      });
    }

    const diff = user.last_chat_date ? dayDiffWIB(user.last_chat_date, Date.now()) : 0;
    const isExpired = user.frozen === 1 || (diff > 1 && user.current_streak > 0);

    if (!isExpired) {
      return interaction.reply({
        content: '❌ Your streak is not expired! Keep it alive by chatting daily.',
        ephemeral: true,
      });
    }

    const account = await getUser(userId);
    const cost = config.streak?.restoreCost || 5000;
    if (account.balance < cost) {
      return interaction.reply({
        content: `❌ You need **${cost.toLocaleString()}** ${config.currencyName} to restore your streak. You have **${account.balance.toLocaleString()}** ${config.currencyName}.`,
        ephemeral: true,
      });
    }

    await updateBalance(userId, -cost);
    await unfreezeStreak(userId);

    // Re-grant milestone roles for the restored streak
    const guild = interaction.guild;
    if (guild) {
      try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member && !member.user.bot) {
          await syncMilestoneRoles(member, user.current_streak, config);
        }
      } catch (err) {
        console.error('⚠️ Could not sync milestone roles on restore:', err.message);
      }
    }

    return interaction.reply({
      content: `🔥 Your streak of **${user.current_streak} day(s)** has been restored! You spent **${cost.toLocaleString()}** ${config.currencyName}. Keep chatting to maintain it!`,
    });
  },
};
