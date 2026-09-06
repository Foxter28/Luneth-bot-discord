const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getSetting, setSetting } = require('../database');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('maintenance')
    .setDescription('Toggle maintenance mode on or off (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName('status')
        .setDescription('Turn maintenance on or off')
        .setRequired(false)
        .addChoices(
          { name: '🟢 OFF (Normal / Public)', value: 'off' },
          { name: '🔴 ON (Maintenance Mode)', value: 'on' }
        )
    ),

  async execute(interaction) {
    const isGuildOwner = interaction.guild && interaction.guild.ownerId === interaction.user.id;
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || isGuildOwner;

    // Only administrators or server owners can control maintenance
    if (!isAdmin) {
      return interaction.reply({
        content: '❌ You do not have permission (Administrator) to use this command.',
        flags: 64,
      });
    }

    const currentStatus = (await getSetting('maintenance_mode', 'off')) === 'on';
    const chosenStatus = interaction.options.getString('status');

    if (!chosenStatus) {
      // Just check status
      const embed = new EmbedBuilder()
        .setTitle('🛠️ Bot Maintenance Status')
        .setColor(currentStatus ? 0xe74c3c : 0x2ecc71)
        .setDescription(
          `Current Status: **${currentStatus ? '🔴 ACTIVE (Maintenance)' : '🟢 INACTIVE (Online Normal)'}**\n\n` +
            `Bypass testing channel: <#${config.maintenance.allowedChannelId}>\n\n` +
            `*Use \`/maintenance status:on\` or \`/maintenance status:off\` to toggle.*`
        );
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    const newMode = chosenStatus === 'on' ? 'on' : 'off';
    await setSetting('maintenance_mode', newMode);

    const embed = new EmbedBuilder()
      .setTitle('🛠️ Maintenance Settings Updated')
      .setColor(newMode === 'on' ? 0xe74c3c : 0x2ecc71)
      .setDescription(
        newMode === 'on'
          ? `🔴 **Maintenance mode has been ENABLED!**\n\n` +
              `All regular players will see a maintenance notice when attempting to use the bot.\n` +
              `Commands can only be run in the testing channel: <#${config.maintenance.allowedChannelId}> and by Server Administrators.`
          : `🟢 **Maintenance mode has been DISABLED!**\n\nBot is now online and available for everyone in all channels.`
      );

    return interaction.reply({ embeds: [embed] });
  },
};
