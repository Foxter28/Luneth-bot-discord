const { SlashCommandBuilder } = require('discord.js');
const { getUser } = require('../database');
const config = require('../config');
const { formatNumber } = require('../util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coin')
    .setDescription("Check your balance or someone else's")
    .addUserOption((opt) => opt.setName('user').setDescription('The user to check').setRequired(false)),

  // Prefix aliases: "lucash" / "lucoin" / "luc" = "lu" + alias → coin (balance)
  aliases: ['cash', 'coin', 'c'],

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const user = await getUser(target.id);
    await interaction.reply(`${config.currencySymbol} **${target.username}** has **${formatNumber(user.balance)} ${config.currencyName}**`);
  },
};

