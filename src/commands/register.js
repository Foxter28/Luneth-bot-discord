const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { registerStreak, getStreakUser } = require('../database');
const { cacheAddUser } = require('../streakService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('[ADMIN] Register another user for the streak system')
    .addSubcommand(sub =>
      sub
        .setName('streak')
        .setDescription('Register a user for the streak system')
        .addUserOption(opt =>
          opt.setName('user').setDescription('The user to register').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  aliases: ['reg'],

  async execute(interaction) {
    const guildId = interaction.guild?.id;
    if (!guildId) {
      return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    }

    // Double-check admin (covers prefix path too)
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only administrators can use this command.', ephemeral: true });
    }

    if (interaction.options.getSubcommand() !== 'streak') {
      return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const existing = await getStreakUser(target.id);
    if (existing) {
      return interaction.reply({
        content: `✅ <@${target.id}> is already registered in the streak system!`,
        ephemeral: true,
      });
    }

    await registerStreak(target.id, guildId);
    cacheAddUser(target.id);

    return interaction.reply({
      content: `🔥 <@${target.id}> has been registered for the streak system by admin!`,
    });
  },
};
