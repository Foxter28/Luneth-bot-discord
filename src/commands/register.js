const { SlashCommandBuilder } = require('discord.js');
const { registerStreak, getStreakUser } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Register for systems')
    .addSubcommand(sub =>
      sub.setName('streak').setDescription('Register for the streak system')),
  aliases: ['luregister'],

  async execute(interaction) {
    if (interaction.options.getSubcommand() !== 'streak') {
      return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
    }
    const userId = interaction.user.id;
    const existing = await getStreakUser(userId);
    if (existing) {
      return interaction.reply({
        content: '✅ You are already registered in the streak system!',
        ephemeral: true,
      });
    }
    const guildId = interaction.guild?.id;
    if (!guildId) {
      return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    }
    const channelId = interaction.channel.id;
    await registerStreak(userId, guildId, channelId);
    return interaction.reply({
      content: '🔥 You have registered for the streak system! Keep chatting to maintain your streak.',
    });
  },
};
