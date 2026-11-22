const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getStreakSetting, setStreakSetting } = require('../database');

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
    if (!guildId) {
      return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    }

    // Handled if invoked via prefix "lustreak register"
    if (sub === 'register') {
      return interaction.reply({
        content: 'ℹ️ Registration is no longer required! Just chat in any channel daily and your streak will automatically count. 🔥',
        ephemeral: true,
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

    return interaction.reply({
      content: '🔥 **Streak system is fully automatic!** Just chat in any channel daily to build your streak.\nCheck rankings with `/streakleaderboard`.',
      ephemeral: true,
    });
  },
};
