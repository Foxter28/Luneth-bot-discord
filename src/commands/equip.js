const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getUser, getInventory, setEquip } = require('../database');
const shopItems = require('../shopItems');

const SLOT_LABELS = {
  weapon: '⚔️ Weapon',
  armor: '🛡️ Armor',
  offhand: '🛡️ Off-hand',
};
const SLOTS = ['weapon', 'armor', 'offhand'];

// Stat summary of an item's equip bonus
function statLine(item) {
  const e = item.equip;
  const parts = [];
  if (e.attack) parts.push(`🗡️ ATK **+${e.attack}**`);
  if (e.defense) parts.push(`🛡️ DEF **+${e.defense}**`);
  if (e.speed) parts.push(`💨 SPD **+${e.speed}**`);
  if (e.crit) parts.push(`💥 Crit **+${e.crit}%**`);
  return parts.join(' · ') || 'No stats';
}

// Current equipment summary embed
function buildEquippedEmbed(user, invMap) {
  const lines = [];

  for (const slot of SLOTS) {
    const itemId = user[slot];
    const item = itemId ? shopItems.find((i) => i.id === itemId) : null;
    const qty = itemId ? invMap.get(itemId) || 0 : 0;

    if (!item || qty < 1) {
      lines.push(`${SLOT_LABELS[slot]}: **Empty** _(nothing equipped)_`);
    } else {
      lines.push(`${SLOT_LABELS[slot]}: ${item.emoji} **${item.name}**\n-# ${statLine(item)}`);
    }
  }

  return new EmbedBuilder()
    .setTitle('🎽 Equipment')
    .setColor(0x3498db)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: 'Click a category button below to equip or unequip gear' });
}

// Build category tab buttons (Weapon, Armor, Off-hand, and Overview)
function buildSlotButtons(activeSlot = null, unequipSlot = null) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('equip_tab_weapon')
      .setLabel('Weapons')
      .setEmoji('⚔️')
      .setStyle(activeSlot === 'weapon' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('equip_tab_armor')
      .setLabel('Armor')
      .setEmoji('🛡️')
      .setStyle(activeSlot === 'armor' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('equip_tab_offhand')
      .setLabel('Off-hand')
      .setEmoji('🪓')
      .setStyle(activeSlot === 'offhand' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('equip_tab_overview')
      .setLabel('Overview')
      .setEmoji('📋')
      .setStyle(!activeSlot ? ButtonStyle.Success : ButtonStyle.Secondary)
  );
  return row;
}

// Build item select menu filtered for the active slot
function buildSlotItemSelect(slot, invMap) {
  if (!slot) return null;
  const owned = shopItems
    .filter((i) => i.equip && i.equip.slot === slot && (invMap.get(i.id) || 0) > 0);

  if (owned.length === 0) return null;

  const options = owned.map((it) => ({
    label: `${it.name}`,
    value: it.id,
    emoji: it.emoji || undefined,
    description: statLine(it).slice(0, 100),
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`equip_pick_${slot}`)
    .setPlaceholder(`Choose a ${SLOT_LABELS[slot]} to equip…`)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(menu);
}

function buildSlotView(user, invMap, slot = null) {
  const components = [buildSlotButtons(slot)];

  let embed;
  if (!slot) {
    // Overview embed — no unequip button clutter here, clean tab view
    embed = buildEquippedEmbed(user, invMap);
  } else {
    // Specific slot inventory view
    const owned = shopItems.filter((i) => i.equip && i.equip.slot === slot && (invMap.get(i.id) || 0) > 0);
    const currentEquippedId = user[slot];
    const currentEquipped = currentEquippedId ? shopItems.find((i) => i.id === currentEquippedId) : null;

    let itemsDesc = '';
    if (owned.length === 0) {
      itemsDesc = `> *You have no ${SLOT_LABELS[slot].toLowerCase()} in your inventory.*\n> Buy from \`/shop\` or craft via \`/craft\`!`;
    } else {
      itemsDesc = owned
        .map((i) => {
          const isWorn = i.id === currentEquippedId;
          const badge = isWorn ? ' `[EQUIPPED]`' : '';
          return `> ${i.emoji} **${i.name}**${badge} \`x${invMap.get(i.id)}\`\n> -# ${statLine(i)}`;
        })
        .join('\n\n');
    }

    embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`${SLOT_LABELS[slot]} Inventory`)
      .setDescription(
        `### Current: ${currentEquipped ? `${currentEquipped.emoji} **${currentEquipped.name}**` : '*None*'}\n\n` +
        `### 🎒 Available in Bag\n` +
        itemsDesc
      )
      .setFooter({ text: 'Select an item from the menu below to equip it' });

    const selectRow = buildSlotItemSelect(slot, invMap);
    if (selectRow) components.push(selectRow);

    if (currentEquipped) {
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`equip_unequip_${slot}`)
            .setLabel(`Unequip ${SLOT_LABELS[slot]}`)
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
        )
      );
    }
  }

  return { embed, components };
}

// Build unequip buttons for each equipped slot
function buildUnequipButtons(user, invMap) {
  const buttons = [];
  for (const slot of SLOTS) {
    const itemId = user[slot];
    const item = itemId ? shopItems.find((i) => i.id === itemId) : null;
    const qty = itemId ? invMap.get(itemId) || 0 : 0;
    if (!item || qty < 1) continue;

    buttons.push(
      new ButtonBuilder()
        .setCustomId(`equip_unequip_${slot}`)
        .setLabel(`Unequip ${SLOT_LABELS[slot]}`)
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );
  }
  if (buttons.length === 0) return null;
  return new ActionRowBuilder().addComponents(buttons);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('equip')
    .setDescription('View or equip battle gear from your inventory'),

  async execute(interaction) {
    const user = await getUser(interaction.user.id);
    const invMap = new Map((await getInventory(interaction.user.id)).map((r) => [r.itemId, r.quantity]));
    const { embed, components } = buildSlotView(user, invMap, null);

    await interaction.reply({ embeds: [embed], components });
  },

  // Called from index.js for equip tab buttons, pick dropdown & unequip buttons
  async handleComponent(interaction) {
    const customId = interaction.customId;
    const isTab = customId?.startsWith('equip_tab_');
    const isPick = customId?.startsWith('equip_pick_');
    const isUnequip = customId?.startsWith('equip_unequip_');

    if (!isTab && !isPick && !isUnequip) return false;

    try {
      await interaction.deferUpdate();
    } catch (err) {
      console.error('❌ Failed to defer equip:', err);
      return true;
    }

    const user = await getUser(interaction.user.id);
    const invMap = new Map((await getInventory(interaction.user.id)).map((r) => [r.itemId, r.quantity]));

    // ── Tab switching ──
    if (isTab) {
      const tab = customId.replace('equip_tab_', '');
      const activeSlot = tab === 'overview' ? null : tab;
      const { embed, components } = buildSlotView(user, invMap, activeSlot);
      await interaction.editReply({ embeds: [embed], components, content: null });
      return true;
    }

    // ── Unequip a slot ──
    if (isUnequip) {
      const slot = customId.replace('equip_unequip_', '');
      if (!SLOTS.includes(slot)) return true;
      await setEquip(interaction.user.id, slot, null);

      const freshUser = await getUser(interaction.user.id);
      const freshInv = new Map((await getInventory(interaction.user.id)).map((r) => [r.itemId, r.quantity]));
      const { embed, components } = buildSlotView(freshUser, freshInv, slot);

      await interaction.editReply({
        embeds: [embed],
        components,
        content: `✅ Unequipped **${SLOT_LABELS[slot]}**.`,
      });
      return true;
    }

    // ── Equip an item from slot picker ──
    if (isPick) {
      const slot = customId.replace('equip_pick_', '');
      const itemId = interaction.values?.[0];
      const item = shopItems.find((i) => i.id === itemId);

      if (!item?.equip || (invMap.get(itemId) || 0) < 1) {
        const { embed, components } = buildSlotView(user, invMap, slot);
        await interaction.editReply({ embeds: [embed], components, content: '❌ You no longer own that item.' });
        return true;
      }

      await setEquip(interaction.user.id, slot, itemId);

      const freshUser = await getUser(interaction.user.id);
      const freshInv = new Map((await getInventory(interaction.user.id)).map((r) => [r.itemId, r.quantity]));
      const { embed, components } = buildSlotView(freshUser, freshInv, slot);

      await interaction.editReply({
        embeds: [embed],
        components,
        content: `✅ Equipped **${item.emoji} ${item.name}**!`,
      });
      return true;
    }

    return true;
  },

  buildEquippedEmbed,
  buildSlotButtons,
  buildUnequipButtons,
  SLOT_LABELS,
  statLine,
};
