const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const shopItems = require('../shopItems');
const { getUser, updateBalance, addItem, incrementQuest } = require('../database');
const config = require('../config');
const { resolveItem, normalize } = require('../resolveItem');

const MAX_DROPDOWN_OPTIONS = 25; // Discord hard limit for select menu options

function findItem(query) {
  return resolveItem(query);
}

function statLine(item) {
  if (!item.equip) return '';
  const e = item.equip;
  const parts = [];
  if (e.attack) parts.push(`🗡️+${e.attack}`);
  if (e.defense) parts.push(`🛡️+${e.defense}`);
  if (e.speed) parts.push(`💨+${e.speed}`);
  if (e.crit) parts.push(`💥${e.crit}%`);
  return parts.join(' ');
}

function buildListEmbed() {
  const buyable = shopItems.filter((i) => i.category !== 'legendary_craft');
  const itemDesc = buyable
    .slice(0, MAX_DROPDOWN_OPTIONS)
    .map((i) => `${i.emoji} **${i.name}** — ${i.price} ${config.currencyName} (\`${i.id}\`)`)
    .join('\n');
  const total = buyable.length;
  const extra = total > MAX_DROPDOWN_OPTIONS
    ? `…${total - MAX_DROPDOWN_OPTIONS} more items. Type \`/buy <name>\` to search any item directly.`
    : '';
  return new EmbedBuilder()
    .setTitle('🛒 Quick Buy — pick an item below')
    .setColor(0x9b59b6)
    .setDescription(`${itemDesc}\n\n${extra}`)
    .setFooter({ text: `Or type /buy <item> [quantity] to buy instantly` });
}


function buildItemSelect() {
  const options = shopItems
    .filter((i) => i.category !== 'legendary_craft')
    .slice(0, MAX_DROPDOWN_OPTIONS)
    .map((i) => ({
      label: `${i.name} — ${i.price} ${config.currencyName}`.slice(0, 100),
      value: i.id,
      emoji: i.emoji || undefined,
      description: (statLine(i) || i.description || '').slice(0, 100),
    }));
  const menu = new StringSelectMenuBuilder()
    .setCustomId('buy_select')
    .setPlaceholder('Select an item to buy…')
    .addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy an item instantly from the shop')
    .addStringOption((opt) =>
      opt.setName('item').setDescription('Item name or ID (e.g. moon_fern). Leave empty to browse.').setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName('quantity').setDescription('Quantity to buy (default 1)').setRequired(false)
    ),

  async execute(interaction) {
    const query = (interaction.options.getString('item') || '').trim();
    const qty = Math.max(1, parseInt(interaction.options.getInteger('quantity'), 10) || 1);

    // No query → show browse list + dropdown (same flow as /shop, but for quick buying)
    if (!query) {
      return interaction.reply({
        embeds: [buildListEmbed()],
        components: [buildItemSelect()],
      });
    }

    const item = findItem(query);
    if (!item) {
      return interaction.reply({
        content: `❌ Could not find item **${query}**. Try \`/buy\` to browse, or check \`/shop\`.`,
        flags: 64,
      });
    }

    // Legendary craft items can't be bought
    if (item.category === 'legendary_craft') {
      return interaction.reply({
        content: `❌ **${item.name}** is a craft-only item — it cannot be bought. Use \`/craft\`.`,
        flags: 64,
      });
    }

    const total = item.price * qty;
    const user = await getUser(interaction.user.id);

    if (user.balance < total) {
      return interaction.reply({
        content: `❌ You need **${total} ${config.currencyName}** to buy **${qty}x ${item.emoji} ${item.name}** (you have **${user.balance}**).`,
        flags: 64,
      });
    }

    await updateBalance(interaction.user.id, -total);
    await addItem(interaction.user.id, item.id, qty);
    const questProg = await incrementQuest(interaction.user.id, 'buy');

    const embed = new EmbedBuilder()
      .setTitle('✅ Purchase Successful!')
      .setColor(0x2ecc71)
      .setDescription(
        `You bought **${qty}x ${item.emoji} ${item.name}** for **${total} ${config.currencyName}**!\n\n` +
          `It was added to your inventory. 🎒` +
          (questProg ? `\n📜 **Quest:** ${questProg.label} — **${questProg.progress}/${questProg.goal}**` : '')
      )
      .setFooter({ text: `New balance: ${user.balance - total} ${config.currencyName}` });

    await interaction.reply({ embeds: [embed] });
  },

  // Dropdown handler (choosing an item from the browse list)
  async handleComponent(interaction) {
    if (!interaction.customId || interaction.customId !== 'buy_select') return false;

    const itemId = interaction.values?.[0];
    const item = shopItems.find((i) => i.id === itemId);
    if (!item) return true;

    try {
      await interaction.deferUpdate();
    } catch (err) {
      console.error('❌ Failed to defer buy component:', err);
      return true;
    }

    const user = await getUser(interaction.user.id);
    const price = item.price;

    if (user.balance < price) {
      await interaction.editReply({
        content: `❌ You need **${price} ${config.currencyName}** to buy **${item.emoji} ${item.name}** (you have **${user.balance}**).`,
      });
      return true;
    }

    await updateBalance(interaction.user.id, -price);
    await addItem(interaction.user.id, item.id, 1);
    const questProg = await incrementQuest(interaction.user.id, 'buy');

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ Purchase Successful!')
          .setColor(0x2ecc71)
          .setDescription(
            `You bought **1x ${item.emoji} ${item.name}** for **${price} ${config.currencyName}**!` +
              (questProg ? `\n📜 **Quest:** ${questProg.label} — **${questProg.progress}/${questProg.goal}**` : '')
          ),
      ],
      components: [],
    });
    return true;
  },

  findItem,
  normalize,
};
