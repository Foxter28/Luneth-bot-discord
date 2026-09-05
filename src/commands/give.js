const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { updateBalance } = require('../database');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('give')
    .setDescription('[Admin] Give coins to a user')
    .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
    .addIntegerOption((opt) => opt.setName('amount').setDescription('Amount of coins').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    await updateBalance(target.id, amount);
    await interaction.reply(`✅ Successfully gave **${amount} ${config.currencyName}** to **${target.username}**.`);
  },
};
