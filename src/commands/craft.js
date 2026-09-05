const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getInventory, removeItem, addItem } = require('../database');
const craftRecipes = require('../craftRecipes');
const { resolveItem } = require('../resolveItem');
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
      return interaction.reply({
        content: '❌ Not a craftable item. Check `/recipes` for the list.',
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

    const embed = new EmbedBuilder()
      .setTitle(`⚒️ Craft Successful!`)
      .setColor(0x95a5a6)
      .setDescription(
        `${recipe.item.emoji} You crafted **${recipe.item.name}**!\n` +
          `Consumed: ${recipe.recipe}\n\n` +
          `It was added to your inventory. 🎒`
      );

    await interaction.reply({ embeds: [embed] });
  },
};
