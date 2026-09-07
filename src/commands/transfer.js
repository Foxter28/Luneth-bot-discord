const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, updateBalance, incrementQuest } = require('../database');
const config = require('../config');
const { formatNumber } = require('../util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfer coins from your balance to another member')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member you want to transfer coins to').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('Amount of coins to transfer')
        .setRequired(true)
        .setMinValue(1)
    ),

  aliases: ['pay', 'tf', 'send'],

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (!target) {
      return interaction.reply({
        content: '<:cannot:1546422441125879818> Please specify a valid user to transfer coins to.',
        flags: 64,
      });
    }

    if (target.id === interaction.user.id) {
      return interaction.reply({
        content: '<:cannot:1546422441125879818> You cannot transfer coins to yourself!',
        flags: 64,
      });
    }

    if (target.bot) {
      return interaction.reply({
        content: '<:cannot:1546422441125879818> You cannot transfer coins to a bot!',
        flags: 64,
      });
    }

    if (!amount || amount <= 0) {
      return interaction.reply({
        content: '<:cannot:1546422441125879818> Amount must be at least 1 coin.',
        flags: 64,
      });
    }

    const sender = await getUser(interaction.user.id);
    if (sender.balance < amount) {
      return interaction.reply({
        content: `<:cannot:1546422441125879818> You don't have enough coins! Your balance: **${formatNumber(sender.balance)} ${config.currencyName}**.`,
        flags: 64,
      });
    }

    // Deduct from sender and add to recipient
    await updateBalance(interaction.user.id, -amount);
    await updateBalance(target.id, amount);

    const questProg = await incrementQuest(interaction.user.id, 'trade');

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('💸 Transfer Successful')
      .setDescription(
        `**${interaction.user.username}** transferred **${formatNumber(amount)} ${config.currencyName}** to <@${target.id}>!\n\n` +
          `💰 **Your new balance:** ${formatNumber(sender.balance - amount)} ${config.currencyName}` +
          (questProg ? `\n\n📜 **Quest:** ${questProg.label} — **${questProg.progress}/${questProg.goal}**` : '')
      )
      .setFooter({ text: `Recipient: ${target.username}` });

    await interaction.reply({ embeds: [embed] });
  },
};
