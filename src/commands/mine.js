const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, updateBalance, addItem, getStamina, spendStamina, getInventory, incrementQuest, STAMINA_MAX, STAMINA_START, STAMINA_REGEN_MS } = require('../database');
const shopItems = require('../shopItems');
const config = require('../config');
const { formatNumber } = require('../util');
const { resolveItem } = require('../resolveItem');

const STAMINA_COST = 10; // stamina per mine

// Ores you can target (material items that "feel" like mining drops).
const ORE_TARGETS = {
  lunar_stone: { id: 'lunar_stone', label: '🪨 Lunar Stone', chance: 0.5, bonus: 0 },
  silver_ingot: { id: 'silver_ingot', label: '🔩 Silver Ingot', chance: 0.35, bonus: 0 },
  frost_crystal: { id: 'frost_crystal', label: '💠 Frost Crystal', chance: 0.4, bonus: 0 },
  moon_thread: { id: 'moon_thread', label: '🧵 Moonthread', chance: 0.3, bonus: 0 },
  magnetite: { id: 'magnetite', label: '🧲 Magnetite', chance: 0.25, bonus: 0 },
  moonstone: { id: 'moonstone', label: '🌙 Moonstone', chance: 0.2, bonus: 0 },
};

// Generic random drops (any material).
const GEN_DROPS = ['lunar_stone', 'silver_ingot', 'frost_crystal', 'moon_thread', 'magnetite', 'moonstone', 'potion_base'];

function getOreList() {
  return Object.values(ORE_TARGETS)
    .map((o) => {
      const item = shopItems.find((i) => i.id === o.id);
      return item ? `${o.label} (${item.price} ${config.currencyName})` : o.label;
    })
    .join(' · ');
}

function fmtStamina(stamina) {
  const mins = Math.ceil(Math.max(0, (STAMINA_MAX - stamina) * STAMINA_REGEN_MS) / 60000);
  return `${stamina}/${STAMINA_MAX}${mins > 0 ? ` (full in ~${mins} min)` : ' (full)'}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mine')
    .setDescription('⛏️ Mine ores & materials using stamina')
    .addStringOption((opt) =>
      opt
        .setName('ore')
        .setDescription('Target a specific ore (default: random)')
        .setRequired(false)
        .addChoices(
          { name: '🪨 Lunar Stone', value: 'lunar_stone' },
          { name: '🔩 Silver Ingot', value: 'silver_ingot' },
          { name: '💠 Frost Crystal', value: 'frost_crystal' },
          { name: '🧵 Moonthread', value: 'moon_thread' },
          { name: '🧲 Magnetite', value: 'magnetite' },
          { name: '🌙 Moonstone', value: 'moonstone' }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName('mode')
        .setDescription('Action: mine (default), or status to check stamina')
        .setRequired(false)
        .addChoices({ name: '⛏️ Mine', value: 'mine' }, { name: '📊 Status', value: 'status' })
    ),

  async execute(interaction) {
    const mode = interaction.options.getString('mode') || 'mine';
    const oreChoice = interaction.options.getString('ore');

    // ── Status view ──
    if (mode === 'status') {
      const stamina = await getStamina(interaction.user.id);
      const inv = await getInventory(interaction.user.id);
      const embed = new EmbedBuilder()
        .setColor(0x8b5a2b)
        .setTitle('⛏️ Mining Status')
        .setDescription(
          `⛽ **Stamina:** ${fmtStamina(stamina)}\n> Regen: **+1** per 2 min · Cost: **${STAMINA_COST}** per mine\n\n` +
            `**Ore you can mine:**\n${getOreList()}\n\n` +
            (oreChoice ? '' : `🧑‍🚀 Tip: \`/mine ore:silver_ingot\` to target a specific ore.`)
        )
        .setFooter({ text: 'Mined ores are crafting materials — sell or trade them!' });
      return interaction.reply({ embeds: [embed] });
    }

    // ── Mine action ──
    const spend = await spendStamina(interaction.user.id, STAMINA_COST);
    if (!spend.ok) {
      return interaction.reply({
        content: `❌ Not enough stamina! You have **${spend.stamina}/${STAMINA_MAX}**. Check \`/mine status\` and wait for regen.`,
        flags: 64,
      });
    }

    // Determine drop: targeted ore or random
    let dropId;
    let targetInfo = null;
    let targetKey = oreChoice;
    if (oreChoice) {
      const resolved = resolveItem(oreChoice);
      if (resolved && ORE_TARGETS[resolved.id]) {
        targetKey = resolved.id;
      }
    }
    if (targetKey && ORE_TARGETS[targetKey]) {
      const t = ORE_TARGETS[targetKey];
      dropId = t.id;
      targetInfo = t;
    } else {
      dropId = GEN_DROPS[Math.floor(Math.random() * GEN_DROPS.length)];
    }
    const dropItem = shopItems.find((i) => i.id === dropId);

    // Small coin find while digging
    const coins = Math.floor(Math.random() * 31) + 10; // 10-40
    await updateBalance(interaction.user.id, coins);

    // Add ore drop (targeted ores drop 1-2)
    const dropQty = oreChoice ? (Math.random() < 0.3 ? 2 : 1) : 1;
    if (dropItem) await addItem(interaction.user.id, dropItem.id, dropQty);

    // Progress quest if today's quest is mining
    const quest = await incrementQuest(interaction.user.id, 'mine');

    // Grant XP (20 - 40 XP)
    const xpGain = Math.floor(Math.random() * 21) + 20;
    const { addXp } = require('../database');
    const { createLevelUpEmbed } = require('../levelHelper');
    const levelResult = await addXp(interaction.user.id, xpGain);

    const stamina = await getStamina(interaction.user.id);
    const embed = new EmbedBuilder()
      .setColor(0x8b5a2b)
      .setTitle('⛏️ You mine the Vein!')
      .setDescription(
        `🗻 You swung your pick and found **${coins} ${config.currencyName}**!\n` +
          `⭐ **+${xpGain} XP** (Level ${levelResult.newLevel})\n` +
          (targetInfo ? `🎯 Targeted: **${targetInfo.label}** — ` : '💎 Found: ') +
          (dropItem ? `**${dropQty}x ${dropItem.emoji} ${dropItem.name}**\n` : 'nothing else...\n') +
          `\n⛽ **Stamina left:** ${fmtStamina(stamina)}\n` +
          (quest ? `📜 **Quest progress:** ${quest.label} — **${quest.progress}/${quest.goal}**\n` : '') +
          `\n> Mined materials are crafting ingredients — use \`/craft\` or \`/sell\`.`
      );

    const embeds = [embed];
    const files = [];
    const levelUp = createLevelUpEmbed(levelResult);
    if (levelUp) {
      embeds.push(levelUp.embed);
      if (levelUp.file) files.push(levelUp.file);
    }

    await interaction.reply({ embeds, files });
  },

  STAMINA_COST,
  ORE_TARGETS,
  GEN_DROPS,
};
