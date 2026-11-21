const { SlashCommandBuilder } = require('discord.js');
const { getOrCreateUser } = require('../database');
const { buildWelcomeEmbed, buildWelcomeSelect } = require('../onboarding');
const { buildLanguageRow, buildLanguageEmbed } = require('./language');
const { getActivePrefixes } = require('../database');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('start')
    .setDescription('🌙 Get started with Luneth — beginners guide & starter balance'),

  // For prefix: "lustart" → works automatically since name is "start".

  async execute(interaction) {
    // Ensure the player has an account (grants starting balance if brand new).
    const { isNew } = await getOrCreateUser(interaction.user.id);
    const [activePrefix] = await getActivePrefixes(interaction.guild?.id, config.prefix, config.prefixAliases);
    // Warm the i18n cache so the welcome embed uses the user's language.
    await require('../i18n').t(interaction.user.id, 'lang.name');

    await interaction.reply({
      embeds: [buildLanguageEmbed(), buildWelcomeEmbed(activePrefix, interaction.user.id)],
      components: [buildLanguageRow(interaction.user.id), buildWelcomeSelect()],
      ephemeral: false,
    });
  },
};
