const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, getInventory, updateBalance, setLastWork, addItem, incrementQuest } = require('../database');
const shopItems = require('../shopItems');
const config = require('../config');
const { formatNumber } = require('../util');

// Dungeon pool — each is a themed "expedition" with its own reward range.
// rewardMin/Max are base before gear bonus.
const DUNGEONS = [
  {
    id: 'forest',
    name: '🌿 Whispering Forest',
    desc: 'Feral slimes and overgrown ruins guard scattered moonfern.',
    rewardMin: 60,
    rewardMax: 180,
    dropChance: 0.4,
    drops: ['moon_fern', 'moon_wood', 'stardust'],
  },
  {
    id: 'mine',
    name: '⛏️ Crystal Mines',
    desc: 'Dusty tunnels packed with frost crystals and silver ore.',
    rewardMin: 100,
    rewardMax: 300,
    dropChance: 0.45,
    drops: ['frost_crystal', 'silver_ingot', 'lunar_stone'],
  },
  {
    id: 'ruins',
    name: '🏛️ Moonlit Ruins',
    desc: 'Ancient Lunarian vaults — relics and silver blades await.',
    rewardMin: 160,
    rewardMax: 450,
    dropChance: 0.5,
    drops: ['moonstone', 'silver_blade', 'pocket_astrolabe', 'moon_bow'],
  },
  {
    id: 'abyss',
    name: '🌑 Silent Abyss',
    desc: 'Deep beyond the veil — high risk, the richest spoils.',
    rewardMin: 260,
    rewardMax: 700,
    dropChance: 0.55,
    drops: ['moonstone', 'magnetite', 'moon_bow', 'silver_blade', 'phoenix_plume'],
  },
];

function getStats(user, invMap) {
  const stats = { attack: 10, defense: 2 };
  for (const slot of ['weapon', 'armor', 'offhand']) {
    const itemId = user[slot];
    if (!itemId) continue;
    const item = shopItems.find((i) => i.id === itemId);
    if (!item?.equip) continue;
    if ((invMap.get(itemId) || 0) < 1) continue;
    stats.attack += item.equip.attack || 0;
    stats.defense += item.equip.defense || 0;
  }
  return stats;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Embark on a dungeon expedition to earn coins')
    .addStringOption((opt) =>
      opt
        .setName('dungeon')
        .setDescription('Choose a dungeon (default: random)')
        .setRequired(false)
        .addChoices(
          { name: '🌿 Whispering Forest', value: 'forest' },
          { name: '⛏️ Crystal Mines', value: 'mine' },
          { name: '🏛️ Moonlit Ruins', value: 'ruins' },
          { name: '🌑 Silent Abyss', value: 'abyss' }
        )
    ),

  async execute(interaction) {
    const user = await getUser(interaction.user.id);
    const now = Date.now();
    const cooldown = config.workCooldownMinutes * 60 * 1000;
    const remaining = user.lastWork + cooldown - now;

    if (remaining > 0) {
      const minutes = Math.ceil(remaining / 60000);
      return interaction.reply(`⏳ You're still recovering from your last expedition. Try again in **${minutes} minutes**.`);
    }

    // Pick dungeon (requested or random)
    const rawDungeon = (interaction.options.getString('dungeon') || '').toLowerCase().trim();
    let dungeon = null;
    if (rawDungeon) {
      dungeon = DUNGEONS.find(
        (d) =>
          d.id.toLowerCase() === rawDungeon ||
          d.name.toLowerCase().includes(rawDungeon) ||
          rawDungeon.includes(d.id)
      );
    }
    if (!dungeon) {
      dungeon = DUNGEONS[Math.floor(Math.random() * DUNGEONS.length)];
    }

    // Gear bonus: each point of ATK+DEF gives +0.5 coin, capped at +40%
    const invMap = new Map((await getInventory(interaction.user.id)).map((r) => [r.itemId, r.quantity]));
    const stats = getStats(user, invMap);
    const gearPower = stats.attack + stats.defense;
    const bonusPct = Math.min(0.4, gearPower * 0.005); // up to +40%
    const base = Math.floor(Math.random() * (dungeon.rewardMax - dungeon.rewardMin + 1)) + dungeon.rewardMin;
    const earned = Math.floor(base * (1 + bonusPct));

    // Chance to find a monster drop (item)
    let droppedItem = null;
    if (Math.random() < dungeon.dropChance) {
      const dropId = dungeon.drops[Math.floor(Math.random() * dungeon.drops.length)];
      const item = shopItems.find((i) => i.id === dropId);
      if (item) {
        await addItem(interaction.user.id, dropId, 1);
        droppedItem = item;
      }
    }

    await updateBalance(interaction.user.id, earned);
    await setLastWork(interaction.user.id, now);
    const questProg = await incrementQuest(interaction.user.id, 'work');

    // Grant XP (15 - 35 XP)
    const xpEarned = Math.floor(Math.random() * 21) + 15;
    const { addXp } = require('../database');
    const { createLevelUpEmbed } = require('../levelHelper');
    const levelResult = await addXp(interaction.user.id, xpEarned);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🧭 Expedition: ${dungeon.name}`)
      .setDescription(
        `> ${dungeon.desc}\n\n` +
          `🧑‍🚀 You explored and gathered **${formatNumber(earned)} ${config.currencyName}**${bonusPct > 0 ? ` _(incl. **+${Math.round(bonusPct * 100)}%** gear bonus)_` : ''}!\n` +
          `⭐ **+${xpEarned} XP** (Level ${levelResult.newLevel})\n\n` +
          (droppedItem ? `🎁 **Loot:** ${droppedItem.emoji} **${droppedItem.name}**\n` : '') +
          (questProg ? `📜 **Quest:** ${questProg.label} — **${questProg.progress}/${questProg.goal}**\n` : '') +
          `⚔️ Gear: 🗡️ATK ${stats.attack} · 🛡️DEF ${stats.defense}`
      )
      .setFooter({ text: `💼 Daily income expedition · Cooldown ${config.workCooldownMinutes} min · Check level: /level` });

    const embeds = [embed];
    const files = [];
    const levelUp = createLevelUpEmbed(levelResult);
    if (levelUp) {
      embeds.push(levelUp.embed);
      if (levelUp.file) files.push(levelUp.file);
    }

    await interaction.reply({ embeds, files });
  },

  DUNGEONS,
  getStats,
};
