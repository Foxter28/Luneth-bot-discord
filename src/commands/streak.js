const path = require('path');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getStreakSetting, setStreakSetting, registerStreak, getStreakUser } = require('../database');

const SETTING_KEY = (guildId) => `reminder_channel:${guildId}`;
const STREAK_IMAGE = path.join(__dirname, '..', '..', 'public', 'asset', 'streak.png');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('streak')
    .setDescription('🔥 Streak system — register, manage, and more')
    .addSubcommand(sub =>
      sub
        .setName('register')
        .setDescription('Register yourself for the streak system'))
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
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild?.id;
    if (!guildId) {
      return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    }

    // ── /streak register (everyone) ───────────────────────────────────
    if (sub === 'register') {
      const userId = interaction.user.id;
      const existing = await getStreakUser(userId);
      if (existing) {
        return interaction.reply({
          content: '✅ You are already registered in the streak system!',
          ephemeral: true,
        });
      }

      await registerStreak(userId, guildId);

      return interaction.reply({
        content: '🔥 You have registered for the streak system! Keep chatting to maintain your streak.',
        files: [{ attachment: STREAK_IMAGE, name: 'streak.png' }],
      });
    }

    // ── /streak setchannel (admin) ────────────────────────────────────
    if (sub === 'setchannel') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Only administrators can set the streak channel.', ephemeral: true });
      }
      await setStreakSetting(SETTING_KEY(guildId), interaction.channel.id);
      return interaction.reply({
        content: `✅ Streak reminder channel set to <#${interaction.channel.id}>.`,
      });
    }

    // ── /streak channel (admin) ──────────────────────────────────────
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
