const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getUser, getInventory, updateBalance, removeItem, setEquip, incrementQuest } = require('../database');
const shopItems = require('../shopItems');
const { resolveItem, formatSuggestions } = require('../resolveItem');
const config = require('../config');

// Items sell back at 50% of shop price
function sellPrice(item) {
  return Math.max(1, Math.round(item.price * 0.5));
}

// Pending confirmations for bulk sells: userId -> { items: [{itemId, qty, value}], total }
const pendingSells = new Map();

function buildConfirmEmbed(sellItems, total) {
  const lines = sellItems
    .slice(0, 15)
    .map((s) => `${s.emoji} **${s.name}** ×${s.qty} — **${s.value} ${config.currencyName}**`)
    .join('\n');
  const extra = sellItems.length > 15 ? `\n…and ${sellItems.length - 15} more` : '';
  return new EmbedBuilder()
    .setTitle('💰 Bulk Sell Confirmation')
    .setColor(0xf1c40f)
    .setDescription(
      `You are about to sell **${sellItems.reduce((a, s) => a + s.qty, 0)} items** (${sellItems.length} types).\n\n${lines}${extra}\n\n**Total:** **${total} ${config.currencyName}**\n\n⚠️ This cannot be undone!`
    )
    .setFooter({ text: 'Click ✅ to confirm or ❌ to cancel' });
}

function buildConfirmRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sell_confirm').setLabel('✅ Confirm').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('sell_cancel').setLabel('❌ Cancel').setStyle(ButtonStyle.Danger)
  );
}

// Auto-unequip any slot currently holding a sold item
async function unequipIfSold(userId, itemId) {
  const user = await getUser(userId);
  for (const slot of ['weapon', 'armor', 'offhand']) {
    if (user[slot] === itemId) await setEquip(userId, slot, null);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sell')
    .setDescription('Sell items from your inventory to the shop')
    .addStringOption((opt) => opt.setName('item').setDescription('Item name or ID to sell (see /inventory)').setRequired(false))
    .addIntegerOption((opt) => opt.setName('quantity').setDescription('Quantity to sell (default 1)').setRequired(false))
    .addStringOption((opt) =>
      opt
        .setName('category')
        .setDescription('Sell ALL items in a category, or "all" for everything')
        .setRequired(false)
    ),

  async execute(interaction) {
    let itemId = (interaction.options.getString('item') || '').trim().toLowerCase();
    const qty = interaction.options.getInteger('quantity') || 1;
    let category = (interaction.options.getString('category') || '').trim().toLowerCase();

    // The prefix parser drops an unlabeled word into the first string option
    // (`item`), so "lu sell all" / "lu sell weapon" arrive as itemId, not
    // category. Treat a category keyword as a category — otherwise "all" would
    // fuzzy-match an item containing those letters (e.g. Starfall Guandao).
    const validCats = [...new Set(shopItems.map((i) => i.category))];
    if (!category && (itemId === 'all' || validCats.includes(itemId))) {
      category = itemId;
      itemId = '';
    }

    const inv = await getInventory(interaction.user.id);
    if (inv.length === 0) {
      return interaction.reply({ content: '📭 Your inventory is empty.', flags: 64 });
    }

    // ── Bulk sell (category=all or a valid category) ──
    if (!itemId && category) {
      let sellItems;
      if (category === 'all') {
        sellItems = inv.map((r) => {
          const item = shopItems.find((i) => i.id === r.itemId);
          return item ? { itemId: r.itemId, qty: r.quantity, name: item.name, emoji: item.emoji, value: sellPrice(item) * r.quantity } : null;
        }).filter(Boolean);
      } else {
        if (!validCats.includes(category)) {
          return interaction.reply({
            content: `❌ Category **${category}** not found. Use \`all\` or one of: ${validCats.join(', ')}.`,
            flags: 64,
          });
        }
        sellItems = inv
          .map((r) => {
            const item = shopItems.find((i) => i.id === r.itemId && i.category === category);
            return item ? { itemId: r.itemId, qty: r.quantity, name: item.name, emoji: item.emoji, value: sellPrice(item) * r.quantity } : null;
          })
          .filter(Boolean);
      }

      if (sellItems.length === 0) {
        return interaction.reply({ content: `❌ Nothing to sell in that category.`, flags: 64 });
      }

      const total = sellItems.reduce((a, s) => a + s.value, 0);
      pendingSells.set(interaction.user.id, { sellItems, total });

      await interaction.reply({
        embeds: [buildConfirmEmbed(sellItems, total)],
        components: [buildConfirmRow()],
        flags: 64,
      });
      return;
    }

    // ── Single item sell ──
    if (!itemId) {
      return interaction.reply({
        content: '❌ Specify an `item` (e.g. /sell item:moon_fern) or a `category` (e.g. /sell category:all).',
        flags: 64,
      });
    }

    const item = resolveItem(itemId);
    if (!item) {
      return interaction.reply({
        content:
          `❌ Item **${itemId}** not found.` +
          formatSuggestions(itemId) +
          `\nTip: sell a whole group with \`/sell category:all\` or \`/sell category:material\`.`,
        flags: 64,
      });
    }
    itemId = item.id;

    const owned = inv.find((r) => r.itemId === itemId);
    if (!owned || owned.quantity < qty) {
      const have = owned ? owned.quantity : 0;
      return interaction.reply({
        content: `❌ You only have **${have}x ${item.name}** — can't sell **${qty}x**.`,
        flags: 64,
      });
    }

    const price = sellPrice(item) * qty;
    await removeItem(interaction.user.id, itemId, qty);
    await updateBalance(interaction.user.id, price);
    await unequipIfSold(interaction.user.id, itemId);
    const questProg = await incrementQuest(interaction.user.id, 'sell');

    await interaction.reply(
      `✅ Sold **${qty}x ${item.emoji} ${item.name}** for **${price} ${config.currencyName}** (${sellPrice(item)} each).` +
        (questProg ? `\n📜 **Quest:** ${questProg.label} — **${questProg.progress}/${questProg.goal}**` : '')
    );
  },

  // Called from index.js for bulk-sell confirmation buttons
  async handleComponent(interaction) {
    if (!interaction.customId || (interaction.customId !== 'sell_confirm' && interaction.customId !== 'sell_cancel')) {
      return false;
    }

    const pending = pendingSells.get(interaction.user.id);

    try {
      await interaction.deferUpdate();
    } catch (err) {
      console.error('❌ Failed to defer sell component:', err);
      return true;
    }

    if (!pending) {
      await interaction.editReply({ content: '❌ This sale expired or was already processed.', flags: 64 });
      return true;
    }

    if (interaction.customId === 'sell_cancel') {
      pendingSells.delete(interaction.user.id);
      await interaction.editReply({ content: '❌ Cancelled — nothing was sold.', flags: 64 });
      return true;
    }

    // Confirm: execute the bulk sale
    for (const s of pending.sellItems) {
      const owned = (await getInventory(interaction.user.id)).find((r) => r.itemId === s.itemId);
      if (owned && owned.quantity >= s.qty) {
        await removeItem(interaction.user.id, s.itemId, s.qty);
        await unequipIfSold(interaction.user.id, s.itemId);
      }
    }
    await updateBalance(interaction.user.id, pending.total);
    pendingSells.delete(interaction.user.id);
    const questProgSell = await incrementQuest(interaction.user.id, 'sell');

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ Bulk Sale Complete!')
          .setColor(0x2ecc71)
          .setDescription(
            `You sold **${pending.sellItems.reduce((a, s) => a + s.qty, 0)} items** for **${pending.total} ${config.currencyName}**!` +
              (questProgSell ? `\n📜 **Quest:** ${questProgSell.label} — **${questProgSell.progress}/${questProgSell.goal}**` : '')
          ),
      ],
      components: [],
    });
    return true;
  },

  sellPrice,
  pendingSells,
  buildConfirmEmbed,
  buildConfirmRow,
};
