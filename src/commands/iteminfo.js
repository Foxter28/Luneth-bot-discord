const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const shopItems = require('../shopItems');
const { craftable } = require('../craftRecipes');
const { DUNGEONS } = require('./work');
const { ORE_TARGETS, GEN_DROPS } = require('./mine');
const { DROP_TABLE } = require('./battle');
const config = require('../config');
const { resolveItem } = require('../resolveItem');

// Crate contents map (mirrored from open.js)
const CRATE_CONTENTS = {
  crate_common: { categories: ['material', 'common_weapon'], label: 'Common Crate' },
  crate_rare: { categories: ['rare_weapon', 'relic', 'offhand'], label: 'Rare Crate' },
  crate_legendary: { categories: ['legendary_weapon'], label: 'Legendary Crate' },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('iteminfo')
    .setDescription('Look up item details and how to obtain it')
    .addStringOption((opt) =>
      opt.setName('item')
        .setDescription('Item name or ID (e.g. moonfern, iron sword)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const query = interaction.options.getString('item').toLowerCase().trim();

    // Fuzzy search — user can type the name with or without underscores/spaces
    const item = resolveItem(query);

    if (!item) {
      return interaction.reply({
        content: `❌ Could not find any item matching **${query}**. Check \`/shop\` or \`/inventory\` for correct names.`,
        flags: 64
      });
    }

    const sources = [];

    // 1. Shop
    if (item.price && item.category !== 'legendary_craft' && item.category !== 'crate') {
      sources.push(`🛒 **Shop:** Buy for **${item.price} ${config.currencyName}** (\`/shop\`)`);
    } else if (item.category === 'crate') {
      sources.push(`🛒 **Shop:** Buy for **${item.price} ${config.currencyName}** (\`/shop\`)`);
    }

    // 2. Crafting
    const recipe = craftable.find(r => r.id === item.id);
    if (recipe) {
      const parts = recipe.craft.map(c => {
         const mat = shopItems.find(m => m.id === c.id);
         return `${c.qty}x ${mat ? mat.emoji + ' ' + mat.name : c.id}`;
      });
      sources.push(`⚒️ **Craft:** Needs ${parts.join(', ')} (\`/craft\`)`);
    }

    // 3. Work / Expedition
    const workDungeons = DUNGEONS.filter(d => d.drops.includes(item.id));
    if (workDungeons.length > 0) {
      const dungeonNames = workDungeons.map(d => d.name).join(', ');
      sources.push(`🧭 **Expedition:** Drops from **${dungeonNames}** (\`/work\`)`);
    }

    // 4. Mine
    let isMineDrop = false;
    if (GEN_DROPS.includes(item.id)) isMineDrop = true;
    if (Object.values(ORE_TARGETS).some(o => o.id === item.id)) isMineDrop = true;
    if (isMineDrop) {
      sources.push(`⛏️ **Mining:** Drops from ores (\`/mine\`)`);
    }

    // 5. Battle
    const battleDrop = DROP_TABLE.find(d => d.itemId === item.id);
    if (battleDrop) {
      sources.push(`⚔️ **Battle:** Drops from monsters (\`/battle\`)`);
    }

    // 6. Crates
    const matchingCrates = [];
    if (item.category) {
      for (const [cId, cData] of Object.entries(CRATE_CONTENTS)) {
        if (cData.categories.includes(item.category)) {
          matchingCrates.push(cData.label);
        }
      }
      if (matchingCrates.length > 0) {
        sources.push(`📦 **Crate:** Can be opened from **${matchingCrates.join(', ')}** (\`/open\`)`);
      }
    }

    // Sell Price
    const sellPrice = Math.floor((item.price || 0) * 0.5);

    // Stats
    let statsStr = '';
    if (item.equip) {
      const e = item.equip;
      const parts = [];
      if (e.attack) parts.push(`🗡️ +${e.attack} ATK`);
      if (e.defense) parts.push(`🛡️ +${e.defense} DEF`);
      if (e.speed) parts.push(`💨 +${e.speed} SPD`);
      if (e.crit) parts.push(`💥 +${e.crit}% CRIT`);
      statsStr = parts.join(' · ');
    }

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`${item.emoji || '📦'} ${item.name}`)
      .setDescription(
        `**ID:** \`${item.id}\`\n` +
        `**Category:** ${item.category.toUpperCase().replace('_', ' ')}\n` +
        `**Sell Price:** ${sellPrice > 0 ? `${sellPrice} ${config.currencyName}` : 'Cannot be sold'}\n\n` +
        `📖 **Description:**\n_${item.description}_\n\n` +
        (statsStr ? `🛡️ **Gear Stats:**\n${statsStr}\n\n` : '') +
        `📍 **How to get:**\n${sources.length > 0 ? sources.join('\n') : '- Unknown origin'}`
      );

    await interaction.reply({ embeds: [embed] });
  }
};
