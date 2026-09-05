const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { getGuildPrefix, setGuildPrefix } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('prefix')
    .setDescription('[Admin] Change the text command prefix for this server')
    .addStringOption((opt) =>
      opt.setName('symbol').setDescription('New prefix, e.g. $ or !').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const newPrefix = interaction.options.getString('symbol');

    if (!interaction.guild) {
      return interaction.reply({ content: '❌ This command can only be used in a server, not DMs.', flags: 64 });
    }
    if (!newPrefix || newPrefix.includes(' ') || newPrefix.length > 5) {
      return interaction.reply({
        content: '❌ Invalid prefix. Max 5 characters and no spaces allowed, e.g. `$`, `!`, `>>`.',
        flags: 64,
      });
    }

    await setGuildPrefix(interaction.guild.id, newPrefix);
    await interaction.reply(
      `✅ The text command prefix for this server is now **${newPrefix}**. Example: \`${newPrefix}coin\`.`
    );
  },
};
