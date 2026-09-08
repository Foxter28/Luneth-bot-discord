const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { registerStreak, getStreakUser } = require('../database');
const { cacheAddUser } = require('../streakService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Register for systems')
    .addSubcommand(sub =>
      sub
        .setName('streak')
        .setDescription('Register a user for the streak system (admin only)')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User to register (defaults to yourself)').setRequired(false)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  aliases: ['reg'],

  async execute(interaction) {
    const guildId = interaction.guild?.id;
    if (!guildId) {
      return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    }

    if (interaction.options.getSubcommand() !== 'streak') {
      return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
    }

    // Only admins can register (memberPermissions covers both slash & prefix)
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only administrators can register users.', ephemeral: true });
    }

    const target = interaction.options.getUser('user') || interaction.user;
    const existing = await getStreakUser(target.id);
    if (existing) {
      return interaction.reply({
        content: `✅ <@${target.id}> is already registered in the streak system!`,
        ephemeral: true,
      });
    }

    await registerStreak(target.id, guildId);
    cacheAddUser(target.id);

    const self = target.id === interaction.user.id;
    return interaction.reply({
      content: self
        ? '🔥 You have registered for the streak system! Keep chatting to maintain your streak.'
        : `🔥 <@${target.id}> has been registered for the streak system by admin!`,
    });
  },
};
