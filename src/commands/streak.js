const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getStreakSetting, setStreakSetting } = require('../database');

const SETTING_KEY = (guildId) => `reminder_channel:${guildId}`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('streak')
    .setDescription('[ADMIN] Streak system management')
    .addSubcommand(sub =>
      sub
        .setName('setchannel')
        .setDescription('Set this channel as the streak reminder channel (admin only)'))
    .addSubcommand(sub =>
      sub.setName('channel').setDescription('Show the current streak reminder channel')),
  aliases: ['streak'],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild?.id;
    if (!guildId) {
      return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    }

    if (sub === 'setchannel') {
      const isAdmin = !!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (!isAdmin) {
        return interaction.reply({ content: '❌ Only administrators can set the streak channel.', ephemeral: true });
      }
      await setStreakSetting(SETTING_KEY(guildId), interaction.channel.id);
      return interaction.reply({
        content: `✅ Streak reminder channel set to <#${interaction.channel.id}>.`,
      });
    }

    if (sub === 'channel') {
      const raw = await getStreakSetting(SETTING_KEY(guildId));
      if (!raw) {
        return interaction.reply({
          content: '❌ No streak reminder channel set yet. Use `/streak setchannel` in the target channel.',
          ephemeral: true,
        });
      }
      return interaction.reply({ content: `🔔 Streak reminder channel: <#${raw}>`, ephemeral: true });
    }

    return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
  },
};
