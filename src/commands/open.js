const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, removeItem, addItem, getInventory } = require('../database');
const shopItems = require('../shopItems');
const config = require('../config');
const { resolveItem } = require('../resolveItem');

// Map crate id -> what it can drop (pools of shop categories)
const CRATE_CONTENTS = {
  crate_common: { categories: ['material', 'common_weapon'], emoji: '📦', label: 'Common' },
  crate_rare: { categories: ['rare_weapon', 'relic', 'offhand'], emoji: '🎁', label: 'Rare' },
  crate_legendary: { categories: ['legendary_weapon'], emoji: '👑', label: 'Legendary' },
};

function resolveCrateId(query) {
  if (!query) return null;
  const raw = String(query).toLowerCase().trim();
  if (CRATE_CONTENTS[raw]) return raw;

  // Check if resolveItem matches a crate
  const item = resolveItem(raw);
  if (item && CRATE_CONTENTS[item.id]) return item.id;

  // Check aliases like "legendary", "rare", "common"
  if (raw.includes('leg')) return 'crate_legendary';
  if (raw.includes('rar')) return 'crate_rare';
  if (raw.includes('com')) return 'crate_common';

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('open')
    .setDescription('Open a crate from your inventory')
    .addStringOption((opt) => opt.setName('crate').setDescription('Crate ID (from /shop)').setRequired(true)),

  async execute(interaction) {
    const rawInput = interaction.options.getString('crate');
    const crateId = resolveCrateId(rawInput);
    const crate = crateId ? CRATE_CONTENTS[crateId] : null;

    if (!crate) {
      return interaction.reply({
        content: '❌ Not a valid crate. Try `crate_common`, `crate_rare`, or `crate_legendary`.',
        flags: 64,
      });
    }

    const inv = await getInventory(interaction.user.id);
    const crateRow = inv.find((r) => r.itemId === crateId);

    if (!crateRow || crateRow.quantity < 1) {
      return interaction.reply({
        content: `❌ You don't have a **${crate.label} Crate**. Buy one from /shop first.`,
        flags: 64,
      });
    }

    // Choose a random item from the crate's drop pools (multiple categories)
    const pool = shopItems.filter((i) => crate.categories.includes(i.category));
    if (pool.length === 0) {
      return interaction.reply({ content: '❌ No items in this crate pool yet.', flags: 64 });
    }
    const reward = pool[Math.floor(Math.random() * pool.length)];

    // Consume one crate + grant the reward
    await removeItem(interaction.user.id, crateId, 1);
    await addItem(interaction.user.id, reward.id, 1);

    const path = require('path');
    const fs = require('fs');
    const { AttachmentBuilder } = require('discord.js');

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`${crate.emoji} ${crate.label} Crate Opened!`)
      .setDescription(
        `You opened a **${crate.label} Crate** and found…\n\n` +
          `${reward.emoji} **${reward.name}** ✨\n` +
          `(worth **${reward.price} ${config.currencyName}**)\n\n` +
          `It was added to your inventory! 🎒`
      )
      .setFooter({ text: `Use ${config.prefixAliases[0] || 'lu'}open ${crateId} to open more` });

    const files = [];
    if (reward.assetPath && fs.existsSync(reward.assetPath)) {
      const fileName = path.basename(reward.assetPath);
      files.push(new AttachmentBuilder(reward.assetPath, { name: fileName }));
      embed.setThumbnail(`attachment://${fileName}`);
    }

    await interaction.reply({ embeds: [embed], files });
  },
};
