const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getStreakUser, setStreakForUser } = require('../database');
const { syncMilestoneRoles } = require('../streakService');
const config = require('../config');
const { tSync: T } = require('../i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set')
    .setDescription('[ADMIN] Set a user\'s streak value')
    .addSubcommand(sub =>
      sub
        .setName('streak')
        .setDescription('Set a user\'s streak to a specific number')
        .addUserOption(opt =>
          opt.setName('user').setDescription('The target user').setRequired(true))
        .addIntegerOption(opt =>
          opt.setName('value').setDescription('Streak number to set (e.g. 64)').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  aliases: ['luset'],

  async execute(interaction) {
    const guildId = interaction.guild?.id;
    if (!guildId) {
      return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only administrators can use this command.', ephemeral: true });
    }

    if (interaction.options.getSubcommand() !== 'streak') {
      return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const value = interaction.options.getInteger('value');

    if (!target || target.bot) {
      return interaction.reply({ content: '❌ Please mention a valid non-bot user.', ephemeral: true });
    }
    if (value < 0 || value > 9999) {
      return interaction.reply({ content: '❌ Streak value must be between **0** and **9999**.', ephemeral: true });
    }

    const old = await getStreakUser(target.id);

    // Set the streak + reset clock (immediately active, not frozen)
    await setStreakForUser(target.id, value, guildId);

    // Sync milestone roles
    const guild = interaction.guild;
    if (guild) {
      const member = await guild.members.fetch(target.id).catch(() => null);
      if (member && !member.user.bot) {
        await syncMilestoneRoles(member, value, config);
      }
    }

    const oldLabel = old
      ? T(interaction.user.id, 'set.oldLabel', { n: old.current_streak, extra: old.frozen ? ' (frozen)' : '' })
      : T(interaction.user.id, 'set.notRegistered');

    const embed = {
      color: 0x2ecc71,
      title: T(interaction.user.id, 'set.title'),
      description: T(interaction.user.id, 'set.desc', { user: target.id, value }),
      fields: [
        { name: T(interaction.user.id, 'set.previous'), value: oldLabel, inline: true },
        { name: T(interaction.user.id, 'set.now'), value: T(interaction.user.id, 'set.days', { n: value }), inline: true },
      ],
      footer: { text: `Diset oleh ${interaction.user.tag}` },
      timestamp: new Date().toISOString(),
    };

    return interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: ['users'] },
    });
  },
};
