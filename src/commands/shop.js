const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const shopItems = require('../shopItems');
const { getUser, updateBalance, addItem } = require('../database');
const config = require('../config');

const CATEGORY_ORDER = ['common_weapon', 'rare_weapon', 'legendary_weapon', 'material', 'armor', 'offhand', 'relic', 'special_role', 'crate'];
const CATEGORY_LABELS = {
  common_weapon: { label: '🟢 Common Weapons', emoji: '⚔️', role: '⚔️ Equip' },
  rare_weapon: { label: '🟣 Rare Weapons', emoji: '🗡️', role: '⚔️ Equip' },
  legendary_weapon: { label: '🔴 Legendary Weapons', emoji: '🌟', role: '⚔️ Equip' },
  material: { label: '🧱 Materials', emoji: '🧱', role: '🧪 Material' },
  armor: { label: '🛡️ Armor', emoji: '🛡️', role: '🛡️ Equip' },
  offhand: { label: '🛡️ Off-hand', emoji: '🛡️', role: '🛡️ Equip' },
  relic: { label: '💠 Relics', emoji: '💠', role: '💠 Material' },
  special_role: { label: '👑 Special Roles', emoji: '👑', role: '🏷️ Server Role' },
  crate: { label: '🎁 Crates', emoji: '📦', role: '📦 Crate' },
};

// Legend explaining what each role means, shown in the shop overview.
const ROLE_LEGEND = '**Role legend** · ⚔️ Equip = pasang di /equip · 🧪 Material = bahan /craft · 🏷️ Server Role = dapat role di Discord · 🎁 Crate = buka di /open';
const CATEGORY_DESC = {
  common_weapon: 'Beginner weapons with rising power.',
  rare_weapon: 'Mid-tier weapons, better stats.',
  legendary_weapon: 'Top-tier weapons — huge prices.',
  material: 'Raw ingredients for crafting.',
  armor: 'Protective gear to equip.',
  offhand: 'Secondary gear / shields.',
  relic: 'Precious rare relics.',
  special_role: 'Exclusive prestige roles applied directly to your server profile.',
  crate: 'Mystery boxes with random loot.',
};

const MAX_QTY = 99;
const carts = new Map(); // userId -> { itemId, qty }

// ---------- builders ----------

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

// Core categories shown compactly on the first view so the embed isn't crowded.
const CORE_CATEGORIES = ['common_weapon', 'rare_weapon', 'legendary_weapon', 'material', 'crate'];

function buildItemsEmbed(activeCat = null) {
  // If a category is selected, show only that category's items (full detail).
  if (activeCat) {
    const meta = CATEGORY_LABELS[activeCat];
    const list = shopItems.filter((i) => i.category === activeCat);
    const desc = list
      .map((i) => {
        const stats = statLine(i);
        const buyable = i.category !== 'legendary_craft';
        return (
          `${i.emoji} **${i.name}** — ${i.price} ${config.currencyName}${buyable ? '' : ' (🔒 craft-only)'}\n` +
          `${i.description}${stats ? `\n-# ${stats}` : ''} (\`${i.id}\`)`
        );
      })
      .join('\n\n');
    return new EmbedBuilder()
      .setTitle(`🛒 ${meta.emoji} ${meta.label}`)
      .setColor(0x9b59b6)
      .setDescription(`> ${CATEGORY_DESC[activeCat]}\n\n${desc}`)
      .setFooter({ text: 'Pick an item below to buy it' });
  }

  // Compact overview: only core category highlights + a note that more is in the dropdown.
  const lines = CORE_CATEGORIES.map((cat) => {
    const items = shopItems.filter((i) => i.category === cat);
    const meta = CATEGORY_LABELS[cat];
    const priceRange = items.length
      ? `${Math.min(...items.map((i) => i.price))}–${Math.max(...items.map((i) => i.price))} ${config.currencyName}`
      : '—';
    const sample = items.slice(0, 2).map((i) => i.emoji).join(' ');
    return `${meta.emoji} **${meta.label}** — ${sample}\n-# ${CATEGORY_DESC[cat]} · ${priceRange} · ${meta.role}`;
  }).join('\n\n');

  return new EmbedBuilder()
    .setTitle('🛒 Luneth Market')
    .setColor(0x9b59b6)
    .setDescription(`> *Moon & fantasy goods.* 🌙\n\n${lines}\n\n${ROLE_LEGEND}`)
    .setFooter({ text: 'Pick a category below to see all items' });
}

function buildCategorySelect() {
  const options = CATEGORY_ORDER.map((cat) => {
    const meta = CATEGORY_LABELS[cat];
    const count = shopItems.filter((i) => i.category === cat).length;
    return {
      label: `${meta.label} (${count})`,
      value: cat,
      emoji: meta.emoji,
      description: CATEGORY_DESC[cat].slice(0, 100),
    };
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId('shop_cat_select')
    .setPlaceholder('Choose a category…')
    .addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}

function buildItemSelect(category) {
  const items = shopItems.filter((i) => i.category === category && i.category !== 'legendary_craft');
  const options = items.map((i) => ({
    label: `${i.name} — ${i.price} ${config.currencyName}`.slice(0, 100),
    value: i.id,
    emoji: i.emoji || undefined,
    description: `${statLine(i) || i.description}`.slice(0, 100),
  }));
  const menu = new StringSelectMenuBuilder()
    .setCustomId('shop_buy_select')
    .setPlaceholder('Select an item to buy…')
    .addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}

function buildBackButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('shop_back').setLabel('⬅️ Back to categories').setStyle(ButtonStyle.Secondary)
  );
}

function buildControlRow(qty = 1) {
  const minus = new ButtonBuilder()
    .setCustomId('shop_qty_dec')
    .setLabel('➖')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(qty <= 1);
  const label = new ButtonBuilder()
    .setCustomId('shop_qty_label')
    .setLabel(`Qty: ${qty}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);
  const plus = new ButtonBuilder()
    .setCustomId('shop_qty_inc')
    .setLabel('➕')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(qty >= MAX_QTY);
  const buy = new ButtonBuilder()
    .setCustomId('shop_confirm_buy')
    .setLabel('✅ Buy')
    .setStyle(ButtonStyle.Success);
  const cancel = new ButtonBuilder()
    .setCustomId('shop_cancel')
    .setLabel('❌ Cancel')
    .setStyle(ButtonStyle.Danger);
  return new ActionRowBuilder().addComponents(minus, label, plus, buy, cancel);
}

function disableAllRows(components) {
  return components.map((row) =>
    new ActionRowBuilder().addComponents(
      row.components.map((c) =>
        c.data.type === 2
          ? ButtonBuilder.from(c).setDisabled(true)
          : StringSelectMenuBuilder.from(c).setDisabled(true)
      )
    )
  );
}

// ---------- component handler ----------

async function handleComponent(interaction) {
  const customId = interaction.customId;
  if (!customId || !customId.startsWith('shop_')) return false;

  const userId = interaction.user.id;
  try {
    await interaction.deferUpdate();
  } catch (err) {
    console.error('❌ Failed to defer shop component:', err);
    return true;
  }

  try {
    let cart = carts.get(userId);

    // Category dropdown → show item dropdown for that category
    if (customId === 'shop_cat_select') {
      const cat = interaction.values?.[0];
      if (!cat) return true;
      const embed = buildItemsEmbed(cat);
      await interaction.editReply({
        embeds: [embed],
        components: [buildCategorySelect(), buildItemSelect(cat), buildBackButton()],
      });
      return true;
    }

    // Back button → return to category overview
    if (customId === 'shop_back') {
      carts.delete(userId);
      await interaction.editReply({
        embeds: [buildItemsEmbed()],
        components: [buildCategorySelect()],
      });
      return true;
    }

    // Item dropdown → select item to buy
    if (customId === 'shop_buy_select') {
      const itemId = interaction.values?.[0];
      const item = shopItems.find((i) => i.id === itemId);
      if (!item) return true;
      cart = { itemId, qty: 1 };
      carts.set(userId, cart);
      const user = await getUser(userId);
      const embed = buildBoughtEmbed(item, cart.qty, user.balance);
      await interaction.editReply({
        embeds: [embed],
        components: [buildCategorySelect(), buildItemSelect(item.category), buildControlRow(cart.qty)],
      });
      return true;
    }

    if (!cart) {
      await interaction.editReply({ embeds: [buildItemsEmbed()], components: [buildCategorySelect()] });
      return true;
    }
    const item = shopItems.find((i) => i.id === cart.itemId);
    if (!item) {
      carts.delete(userId);
      await interaction.editReply({ embeds: [buildItemsEmbed()], components: [buildCategorySelect()] });
      return true;
    }

    // Qty buttons
    if (customId === 'shop_qty_inc') {
      cart.qty = Math.min(cart.qty + 1, MAX_QTY);
      carts.set(userId, cart);
      const user = await getUser(userId);
      await interaction.editReply({
        embeds: [buildBoughtEmbed(item, cart.qty, user.balance)],
        components: [buildCategorySelect(), buildItemSelect(item.category), buildControlRow(cart.qty)],
      });
      return true;
    }

    if (customId === 'shop_qty_dec') {
      cart.qty = Math.max(cart.qty - 1, 1);
      carts.set(userId, cart);
      const user = await getUser(userId);
      await interaction.editReply({
        embeds: [buildBoughtEmbed(item, cart.qty, user.balance)],
        components: [buildCategorySelect(), buildItemSelect(item.category), buildControlRow(cart.qty)],
      });
      return true;
    }

    if (customId === 'shop_cancel') {
      carts.delete(userId);
      const embed = buildItemsEmbed().setFooter({ text: '🛒 Cancelled — pick again to buy something.' });
      await interaction.editReply({ embeds: [embed], components: [buildCategorySelect()] });
      return true;
    }

    if (customId === 'shop_confirm_buy') {
      const user = await getUser(userId);
      const total = item.price * cart.qty;
      if (user.balance < total) {
        await interaction.editReply({
          embeds: [buildBoughtEmbed(item, cart.qty, user.balance)],
          components: [buildCategorySelect(), buildItemSelect(item.category), buildControlRow(cart.qty)],
        });
        return true;
      }

      // Check if item is a special role and already owned
      if (item.category === 'special_role' && item.roleId) {
        if (interaction.member?.roles?.cache?.has(item.roleId)) {
          await interaction.editReply({
            content: `❌ You already have the <@&${item.roleId}> role!`,
          });
          return true;
        }
      }

      await updateBalance(userId, -total);
      await addItem(userId, item.id, cart.qty);

      let roleNotice = '';
      if (item.category === 'special_role' && item.roleId && interaction.guild) {
        try {
          const member = await interaction.guild.members.fetch(userId);
          if (member) {
            await member.roles.add(item.roleId);
            roleNotice = `\n🎉 **The <@&${item.roleId}> role has been assigned to your profile!**`;
          }
        } catch (rErr) {
          console.error('❌ Failed to assign role on purchase:', rErr);
          roleNotice = `\n⚠️ Failed to assign role automatically (ensure bot has Manage Roles permission & role hierarchy). Please contact an admin.`;
        }
      }

      const purchasedQty = cart.qty;
      const purchasedName = item.name;
      const purchasedEmoji = item.emoji;
      carts.delete(userId);

      const doneEmbed = new EmbedBuilder()
        .setTitle('✅ Purchase Successful!')
        .setColor(0x2ecc71)
        .setDescription(
          `You bought **${purchasedQty}x ${purchasedEmoji} ${purchasedName}** for **${total} ${config.currencyName}**!\n\n` +
            `It was added to your inventory. 🎒${roleNotice}`
        );
      await interaction.editReply({
        embeds: [doneEmbed],
        components: [buildCategorySelect(), buildItemSelect(item.category)],
      });
      return true;
    }
  } catch (err) {
    console.error('❌ Error in shop component handler:', err);
    try {
      await interaction.editReply({ content: '❌ An error occurred.' });
    } catch { /* ignore */ }
  }

  return true;
}

function buildBoughtEmbed(item, qty, balance) {
  const total = item.price * qty;
  const stats = statLine(item);
  const lines = [
    `${item.description}`,
    stats ? `-# ${stats}` : '',
    '',
    `**Price:** ${item.price} ${config.currencyName} each`,
    `**Quantity:** ${qty}`,
    `**Total:** ${total} ${config.currencyName}`,
    `**Your balance:** ${balance} ${config.currencyName}`,
  ];
  const cat = CATEGORY_LABELS[item.category];
  lines.unshift(`${cat ? cat.emoji + ' ' + cat.label : item.category}`);
  if (balance < total) lines.push('', '⚠️ **Insufficient balance!**');
  return new EmbedBuilder()
    .setTitle(`🛒 ${item.emoji} ${item.name}`)
    .setColor(0x9b59b6)
    .setDescription(lines.join('\n'));
}

// ---------- command ----------

module.exports = {
  data: new SlashCommandBuilder().setName('shop').setDescription('View items available to buy'),

  async execute(interaction) {
    await interaction.reply({
      embeds: [buildItemsEmbed()],
      components: [buildCategorySelect()],
    });
  },

  handleComponent,
  carts,
};
