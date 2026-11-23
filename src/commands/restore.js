const { SlashCommandBuilder } = require('discord.js');
const { getStreakUser, unfreezeStreak, getUser, updateBalance } = require('../database');
const { syncMilestoneRoles, dayDiffWIB } = require('../streakService');
const { tSync: T, fmtNum } = require('../i18n');
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
    const userId = interaction.user.id;
    // Allow /restore, /restore streak, lurestore, or lurestore streak
    if (sub && sub !== 'streak') {
      return interaction.reply({ content: T(userId, 'restore.unknown'), flags: 64 });
    }

    const user = await getStreakUser(userId);
    if (!user) {
      return interaction.reply({
        content: T(userId, 'restore.noRecord'),
        flags: 64,
      });
    }

    const diff = user.last_chat_date ? dayDiffWIB(user.last_chat_date, Date.now()) : 0;
    const isExpired = user.frozen === 1 || (diff > 1 && user.current_streak > 0);

    if (!isExpired) {
      return interaction.reply({
        content: T(userId, 'restore.notExpired'),
        flags: 64,
      });
    }

    const account = await getUser(userId);
    const cost = config.streak?.restoreCost || 5000;
    if (account.balance < cost) {
      return interaction.reply({
        content: T(userId, 'restore.needCoins', {
          cost: fmtNum(userId, cost),
          coin: config.currencyName,
          bal: fmtNum(userId, account.balance),
        }),
        flags: 64,
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
      content: T(userId, 'restore.success', {
        days: user.current_streak,
        cost: fmtNum(userId, cost),
        coin: config.currencyName,
      }),
    });
  },
};
