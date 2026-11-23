const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getStreakSetting, setStreakSetting } = require('../database');
const { tSync: T } = require('../i18n');

const SETTING_KEY = (guildId) => `reminder_channel:${guildId}`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('streak')
    .setDescription('🔥 Streak system — channel & settings')
    .addSubcommand(sub =>
      sub
        .setName('setchannel')
        .setDescription('[ADMIN] Set this channel as the streak reminder channel'))
    .addSubcommand(sub =>
      sub
        .setName('channel')
        .setDescription('[ADMIN] Show the current streak reminder channel')),
  aliases: ['streak'],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand(false);
    const guildId = interaction.guild?.id;
    const userId = interaction.user.id;
    if (!guildId) {
      return interaction.reply({ content: T(userId, 'streak.guildOnly'), flags: 64 });
    }

    // Handled if invoked via prefix "lustreak register"
    if (sub === 'register') {
      return interaction.reply({
        content: T(userId, 'streak.regNotNeeded'),
        flags: 64,
      });
    }

    // ── /streak setchannel (admin) ────────────────────────────────────
    if (sub === 'setchannel') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: T(userId, 'streak.adminOnly'), flags: 64 });
      }
      await setStreakSetting(SETTING_KEY(guildId), interaction.channel.id);
      return interaction.reply({
        content: T(userId, 'streak.setSuccess', { channel: interaction.channel.id }),
      });
    }

    // ── /streak channel (admin) ──────────────────────────────────────
    if (sub === 'channel') {
      const raw = await getStreakSetting(SETTING_KEY(guildId));
      if (!raw) {
        return interaction.reply({
          content: T(userId, 'streak.noChannel'),
          flags: 64,
        });
      }
      return interaction.reply({ content: T(userId, 'streak.channelInfo', { channel: raw }), flags: 64 });
    }

    return interaction.reply({
      content: T(userId, 'streak.autoInfo'),
      flags: 64,
    });
  },
};
