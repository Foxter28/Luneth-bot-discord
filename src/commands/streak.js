const path = require('path');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getStreakSetting, setStreakSetting, registerStreak, getStreakUser } = require('../database');
const { cacheAddUser } = require('../streakService');

const SETTING_KEY = (guildId) => `reminder_channel:${guildId}`;
const STREAK_IMAGE = path.join(__dirname, '..', '..', 'public', 'asset', 'streak.png');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('streak')
    .setDescription('🔥 Streak system — register, manage channel, and more')
    // ── register (everyone) ──────────────────────────────────────────
    .addSubcommand(sub =>
      sub
        .setName('register')
        .setDescription('Register yourself for the streak system')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Register another user (admin only)').setRequired(false)))
    // ── admin commands ───────────────────────────────────────────────
    .addSubcommand(sub =>
      sub
        .setName('setchannel')
        .setDescription('[ADMIN] Set this channel as the streak reminder channel'))
    .addSubcommand(sub =>
      sub.setName('channel').setDescription('[ADMIN] Show the current streak reminder channel')),
  aliases: ['streak'],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild?.id;
    if (!guildId) {
      return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    }

    // ── /streak register ──────────────────────────────────────────────
    if (sub === 'register') {
      const target = interaction.options.getUser('user');
      const isRegisteringOther = !!target;
      const isAdmin = !!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

      // Admin can register other users; non-admin can only self-register
      if (isRegisteringOther && !isAdmin) {
        return interaction.reply({ content: '❌ Only administrators can register other users.', ephemeral: true });
      }

      const userId = target ? target.id : interaction.user.id;
      const existing = await getStreakUser(userId);
      if (existing) {
        return interaction.reply({
          content: isRegisteringOther
            ? `✅ <@${userId}> is already registered in the streak system!`
            : '✅ You are already registered in the streak system!',
          ephemeral: true,
        });
      }

      await registerStreak(userId, guildId);
      cacheAddUser(userId);

      return interaction.reply({
        content: isRegisteringOther
          ? `🔥 <@${userId}> has been registered for the streak system by admin!`
          : '🔥 You have registered for the streak system! Keep chatting to maintain your streak.',
        files: [{ attachment: STREAK_IMAGE, name: 'streak.png' }],
      });
    }

    // ── /streak setchannel (admin) ────────────────────────────────────
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
