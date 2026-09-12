const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getInventory, removeItem, addItem } = require('../database');
const craftRecipes = require('../craftRecipes');
const { resolveItem, formatSuggestions } = require('../resolveItem');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('craft')
    .setDescription('Craft an item from materials (see /recipes)')
    .addStringOption((opt) =>
      opt.setName('item').setDescription('Item to craft (name or ID, e.g. lunar armor)').setRequired(true)
    ),

  async execute(interaction) {
    const query = interaction.options.getString('item');
    const item = resolveItem(query);
    const recipe = item ? craftRecipes.recipes.find((r) => r.item.id === item.id) : null;

    if (!recipe) {
      const craftable = craftRecipes.recipes.map((r) => `**${r.item.name}** (\`${r.item.id}\`)`).join(', ');
      return interaction.reply({
        content:
          `❌ **${query}** is not craftable.` +
          formatSuggestions(query) +
          `\nCraftable items: ${craftable}`,
        flags: 64,
      });
    }

    const inv = await getInventory(interaction.user.id);
    const invMap = new Map(inv.map((r) => [r.itemId, r.quantity]));

    // Check materials
    let missing = null;
    for (const r of recipe.item.craft) {
      const owned = invMap.get(r.id) || 0;
      if (owned < r.qty) {
        const mat = craftRecipes.shopItems.find((m) => m.id === r.id);
        missing = `${mat ? mat.emoji + ' ' + mat.name : r.id} (need ${r.qty}, have ${owned})`;
        break;
      }
    }

    if (missing) {
      return interaction.reply({
        content: `❌ Not enough materials. Missing: **${missing}**.`,
        flags: 64,
      });
    }

    // Consume materials + grant result
    for (const r of recipe.item.craft) {
      await removeItem(interaction.user.id, r.id, r.qty);
    }
    await addItem(interaction.user.id, recipe.item.id, 1);

    const path = require('path');
    const fs = require('fs');
    const { AttachmentBuilder } = require('discord.js');

    const embed = new EmbedBuilder()
      .setTitle(`⚒️ Craft Successful!`)
      .setColor(0x95a5a6)
      .setDescription(
        `${recipe.item.emoji} You crafted **${recipe.item.name}**!\n` +
          `Consumed: ${recipe.recipe}\n\n` +
          `It was added to your inventory. 🎒`
      );

    const files = [];
    if (recipe.item.assetPath && fs.existsSync(recipe.item.assetPath)) {
      const fileName = path.basename(recipe.item.assetPath);
      files.push(new AttachmentBuilder(recipe.item.assetPath, { name: fileName }));
      embed.setThumbnail(`attachment://${fileName}`);
    }

    await interaction.reply({ embeds: [embed], files });
  },
};
