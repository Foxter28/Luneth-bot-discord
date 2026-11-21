const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { t, setUserLang, LANG_LABELS } = require('../i18n');

const LANG_BUTTON_ID = 'lang_select:';

/** Build the onboarding language picker row (used by /start). */
function buildLanguageRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${LANG_BUTTON_ID}${userId}:id`).setLabel('🇮🇩 Indonesia').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${LANG_BUTTON_ID}${userId}:en`).setLabel('🇬🇧 English').setStyle(ButtonStyle.Secondary),
  );
}

function buildLanguageEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🌐 Choose Your Language / Pilih Bahasamu')
    .setDescription(
      'Pick the language you want Luneth to use for you. You can change it anytime with `/language`.\n\n' +
      'Pilih bahasa yang mau Luneth pakai untukmu. Bisa diganti kapan saja dengan `/language`.'
    );
}

module.exports = {
  buildLanguageRow,
  buildLanguageEmbed,

  data: new SlashCommandBuilder()
    .setName('language')
    .setDescription('🌐 Set your preferred language')
    .addStringOption((opt) =>
      opt.setName('set')
        .setDescription('en / id')
        .setRequired(false)
        .addChoices(
          { name: '🇬🇧 English', value: 'en' },
          { name: '🇮🇩 Bahasa Indonesia', value: 'id' },
        )
    ),

  async execute(interaction) {
    const choice = interaction.options.getString('set');
    if (choice) {
      await setUserLang(interaction.user.id, choice);
      return interaction.reply({ content: await t(interaction.user.id, 'lang.set', { lang: LANG_LABELS[choice] }), flags: 64 });
    }
    const langName = await t(interaction.user.id, 'lang.name');
    const label = Object.values(LANG_LABELS).find((v) => v.includes(langName)) || LANG_LABELS.en;
    return interaction.reply({ content: await t(interaction.user.id, 'lang.current', { lang: label }), flags: 64 });
  },

  // Onboarding picker. Returns true if handled.
  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.customId.startsWith(LANG_BUTTON_ID)) return false;
    const [_, userId, lang] = interaction.customId.split(':');
    if (interaction.user.id !== userId) {
      return interaction.reply({ content: await t(interaction.user.id, 'wordle.notOwner'), flags: 64 });
    }
    await setUserLang(userId, lang);
    return interaction.reply({ content: await t(userId, 'lang.set', { lang: LANG_LABELS[lang] }), flags: 64 });
  },
};
