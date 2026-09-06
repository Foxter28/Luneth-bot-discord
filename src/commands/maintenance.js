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
    // Only administrators or bot owners can control maintenance
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ Kamu tidak memiliki izin (Administrator) untuk menggunakan command ini.',
        flags: 64,
      });
    }

    const currentStatus = (await getSetting('maintenance_mode', 'off')) === 'on';
    const chosenStatus = interaction.options.getString('status');

    if (!chosenStatus) {
      // Just check status
      const embed = new EmbedBuilder()
        .setTitle('🛠️ Status Maintenance Bot')
        .setColor(currentStatus ? 0xe74c3c : 0x2ecc71)
        .setDescription(
          `Status saat ini: **${currentStatus ? '🔴 AKTIF (Maintenance)' : '🟢 NONAKTIF (Online Normal)'}**\n\n` +
            `Channel bypass dev/testing: <#${config.maintenance.allowedChannelId}>\n\n` +
            `*Gunakan \`/maintenance status:on\` atau \`/maintenance status:off\` untuk mengubahnya.*`
        );
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    const newMode = chosenStatus === 'on' ? 'on' : 'off';
    await setSetting('maintenance_mode', newMode);

    const embed = new EmbedBuilder()
      .setTitle('🛠️ Pengaturan Maintenance Diperbarui')
      .setColor(newMode === 'on' ? 0xe74c3c : 0x2ecc71)
      .setDescription(
        newMode === 'on'
          ? `🔴 **Maintenance mode telah DIAKTIFKAN!**\n\n` +
              `Semua player umum yang menggunakan bot akan mendapatkan pesan info maintenance.\n` +
              `Bot hanya bisa digunakan secara bebas di channel: <#${config.maintenance.allowedChannelId}> dan oleh Server Administrator.`
          : `🟢 **Maintenance mode telah DINONAKTIFKAN!**\n\nBot kini dapat digunakan kembali secara normal oleh semua member di semua channel.`
      );

    return interaction.reply({ embeds: [embed] });
  },
};
