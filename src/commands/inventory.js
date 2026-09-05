const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getInventory } = require('../database');
const shopItems = require('../shopItems');

module.exports = {
  data: new SlashCommandBuilder().setName('inventory').setDescription('View your inventory'),

  // Alias for prefix commands: "luinv" = "lu" + "inv" → inventory
  aliases: ['inv'],

  async execute(interaction) {
    const inv = await getInventory(interaction.user.id);
    if (inv.length === 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`🎒 Inventory — ${interaction.user.username}`)
            .setDescription('> *Your inventory is empty.*\n\n> Start exploring with \`/work\` or mining via \`/mine\`!')
        ]
      });
    }

    const totalItems = inv.reduce((sum, r) => sum + r.quantity, 0);

    const itemsList = inv
      .map((row) => {
        const item = shopItems.find((i) => i.id === row.itemId);
        const name = item?.name || row.itemId;
        const emoji = item?.emoji || '📦';
        return `> ${emoji} **${name}** \`x${row.quantity}\``;
      })
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🎒 Inventory — ${interaction.user.username}`)
      .setDescription(
        `### 📦 Stored Items\n` +
        itemsList +
        `\n\n` +
        `-# 💡 Use \`/equip\` to wear gear or \`/sell\` to sell items.`
      )
      .setFooter({ text: `${inv.length} item types · Total: ${totalItems} items` });

    await interaction.reply({ embeds: [embed] });
  },
};
