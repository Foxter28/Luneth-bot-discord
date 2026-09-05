const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const craftRecipes = require('../craftRecipes');
const shopItems = require('../shopItems');
const config = require('../config');
const { formatNumber } = require('../util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recipes')
    .setDescription('List all available crafting recipes'),

  async execute(interaction) {
    const blocks = craftRecipes.recipes.map((r, i) => {
      const item = r.item;
      // List each material on its own clean bullet
      const matLines = item.craft.map((c) => {
        const mat = shopItems.find((m) => m.id === c.id);
        const emoji = mat?.emoji || '📦';
        const name = mat?.name || c.id;
        return `> • ${emoji} **${name}** \`x${c.qty}\``;
      }).join('\n');

      return (
        `### **${i + 1}.** ${item.emoji} **${item.name}**\n` +
        matLines +
        `\n> -# 🔨 Command: \`/craft item:${item.id}\` · Value: **${formatNumber(item.price)} ${config.currencyName}**`
      );
    });

    const embed = new EmbedBuilder()
      .setTitle('⚒️ Forging Table & Crafting Recipes')
      .setColor(0x5865f2)
      .setDescription(
        `# 📜 Luneth Recipe Book\n` +
        `> Gather the materials below to craft legendary gear and weapons.\n\n` +
        blocks.join('\n\n') +
        `\n\n` +
        `## 💡 How to Craft\n` +
        `> Type \`/craft item:<item_name>\` or \`${config.prefixAliases[0] || 'lu'}craft <item_name>\` once you have all required materials!`
      )
      .setFooter({ text: `${craftRecipes.recipes.length} recipes available` });

    await interaction.reply({ embeds: [embed] });
  },
};
