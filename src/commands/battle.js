const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, getInventory, updateBalance, addItem, setLastBattle, incrementBattleWin, incrementQuest } = require('../database');
const shopItems = require('../shopItems');
const config = require('../config');

// PvE monster pool — 8 tiers scaling with player win count.
// Tier selection is based on battleWins: the more you win, the tougher foes appear.
const MONSTERS = [
  { name: 'Feral Slime', emoji: '🟢', hp: 25, attack: 6, defense: 1, rewardMin: 40, rewardMax: 80, minWins: 0 },
  { name: 'Goblin', emoji: '👺', hp: 40, attack: 9, defense: 2, rewardMin: 60, rewardMax: 120, minWins: 3 },
  { name: 'Skeleton', emoji: '💀', hp: 60, attack: 13, defense: 4, rewardMin: 100, rewardMax: 200, minWins: 7 },
  { name: 'Moon Wraith', emoji: '👻', hp: 85, attack: 17, defense: 6, rewardMin: 160, rewardMax: 300, minWins: 12 },
  { name: 'Dire Wolf', emoji: '🐺', hp: 110, attack: 22, defense: 8, rewardMin: 220, rewardMax: 400, minWins: 18 },
  { name: 'Frost Giant', emoji: '🧊', hp: 150, attack: 28, defense: 12, rewardMin: 300, rewardMax: 550, minWins: 25 },
  { name: 'Elder Lich', emoji: '🧙', hp: 190, attack: 34, defense: 15, rewardMin: 400, rewardMax: 700, minWins: 33 },
  { name: 'Shadow Dragon', emoji: '🐉', hp: 240, attack: 42, defense: 18, rewardMin: 550, rewardMax: 950, minWins: 42 },
];

const BATTLE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const ANIM_DELAY = 800; // ms between animated steps

// Base player stats
const BASE_ATK = 10;
const BASE_HP = 100;
const BASE_DEF = 2;

// Drops
const DROP_TABLE = [
  { itemId: 'stardust', chance: 0.35 },
  { itemId: 'moon_fern', chance: 0.35 },
  { itemId: 'silver_ingot', chance: 0.2 },
  { itemId: 'moonstone', chance: 0.08 },
  { itemId: 'silver_blade', chance: 0.06 },
  { itemId: 'moon_bow', chance: 0.04 },
  { itemId: 'crate_rare', chance: 0.03 },
  { itemId: 'crate_legendary', chance: 0.01 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Visual HP bar using emoji blocks (10 segments)
function hpBar(percent) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((pct / 100) * 10);
  const empty = 10 - filled;
  const fill = pct > 50 ? '🟩' : pct > 25 ? '🟨' : '🟥';
  const bar = Array(filled).fill(fill).concat(Array(empty).fill('⬛')).join('');
  return `${bar} ${pct}%`;
}

function computeStats(user, invMap) {
  const stats = { attack: BASE_ATK, defense: BASE_DEF, hp: BASE_HP, speed: 0, crit: 0 };
  for (const slot of ['weapon', 'armor', 'offhand']) {
    const itemId = user[slot];
    if (!itemId) continue;
    const item = shopItems.find((i) => i.id === itemId);
    if (!item?.equip) continue;
    if ((invMap.get(itemId) || 0) < 1) continue;
    const e = item.equip;
    stats.attack += e.attack || 0;
    stats.defense += e.defense || 0;
    stats.speed += e.speed || 0;
    stats.crit += e.crit || 0;
  }
  return stats;
}

// Pick a monster scaled to player progress (battleWins), with a random +/-
// modifier so battles aren't always the same difficulty.
function pickMonster(battleWins, rng = Math.random) {
  // Base tier from wins: index of the highest monster whose minWins is satisfied.
  let tier = 0;
  for (let i = 0; i < MONSTERS.length; i++) {
    if (battleWins >= MONSTERS[i].minWins) tier = i;
  }
  tier = Math.min(tier, MONSTERS.length - 1);

  // Random modifier: -1, 0, or +1 tier
  const roll = rng();
  let shift = 0;
  if (roll < 0.15) shift = -1;     // bandit / weaker
  else if (roll < 0.75) shift = 0; // on par
  else shift = 1;                  // elite / tougher

  const idx = Math.max(0, Math.min(MONSTERS.length - 1, tier + shift));
  return { ...MONSTERS[idx], diffShift: shift };
}

// Build the battle scene embed (animates HP bars that shrink each turn)
function buildSceneEmbed({ player, monster, p, m, stats, log, phase }) {
  const playerPct = (p / stats.hp) * 100;
  const monsterPct = (m / monster.hp) * 100;

  let title;
  let color = 0xf1c40f;

  if (phase === 'search') {
    title = '🔍 Searching the wilds…';
  } else if (phase === 'encounter') {
    title = `⚔️ A wild ${monster.emoji} **${monster.name}** appeared!`;
  } else if (phase === 'end') {
    title = log.won
      ? `⚔️ **Victory!** You defeated ${monster.emoji} ${monster.name}`
      : `💀 **Defeat!** ${monster.emoji} ${monster.name} was too strong`;
    color = log.won ? 0x2ecc71 : 0xe74c3c;
  } else {
    title = `⚔️ Battle vs ${monster.emoji} **${monster.name}**`;
  }

  // Difficulty badge based on tier shift
  const diffLabel =
    monster.diffShift === 1 ? ' 🔥 ELITE' :
    monster.diffShift === -1 ? ' 🐣 Bandit' : '';

  const lines = [];
  lines.push(`**🦸 You**`);
  lines.push(`❤️ ${hpBar(playerPct)} \`${Math.max(0, p)}/${stats.hp}\``);
  lines.push('');
  lines.push(`**${monster.emoji} ${monster.name}**${diffLabel}`);
  lines.push(`❤️ ${hpBar(monsterPct)} \`${Math.max(0, m)}/${monster.hp}\``);
  lines.push('');

  // Last few action log lines
  if (log.lines && log.lines.length) {
    lines.push(log.lines.slice(-5).join('\n'));
  }

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `⚔️ Wins: ${player.battleWins || 0} · Gear: 🗡️ATK ${stats.attack} · 🛡️DEF ${stats.defense} · 💨SPD ${stats.speed} · 💥Crit ${stats.crit}%` });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('battle')
    .setDescription('Fight a random monster for coins & loot'),

  async execute(interaction) {
    const user = await getUser(interaction.user.id);
    const now = Date.now();

    // Cooldown
    const cdLeft = user.lastBattle + BATTLE_COOLDOWN_MS - now;
    if (cdLeft > 0) {
      const m = Math.ceil(cdLeft / 60000);
      return interaction.reply(`⏳ You're tired from your last battle. Wait **${m} min**.`);
    }

    const invMap = new Map((await getInventory(interaction.user.id)).map((r) => [r.itemId, r.quantity]));
    const stats = computeStats(user, invMap);
    const monster = pickMonster(user.battleWins || 0);

    // simulate full battle first to know the outcome
    const pMax = stats.hp;
    const mMax = monster.hp;
    let p = pMax;
    let m = mMax;
    const firstStrike = Math.random() < Math.min(0.9, 0.5 + stats.speed / 100);
    let playerTurn = firstStrike;
    let rounds = 0;
    const actionLog = [];
    const fightMoves = [];

    while (p > 0 && m > 0 && rounds < 60) {
      rounds++;
      if (playerTurn) {
        const dmg = Math.max(1, Math.round(stats.attack + (Math.random() * 6 - 3)) - Math.floor(monster.defense / 2));
        const crit = Math.random() * 100 < stats.crit;
        const finalDmg = crit ? Math.round(dmg * 1.5) : dmg;
        m = Math.max(0, m - finalDmg);
        playerTurn = false;
        fightMoves.push({
          by: 'player', text: `🎽 You hit ${monster.emoji} **${monster.name}** for **${finalDmg}**${crit ? ' 💥CRIT!' : ''}`,
        });
      } else {
        const dmg = Math.max(1, Math.round(monster.attack + (Math.random() * 4 - 2)) - Math.floor(stats.defense / 2));
        p = Math.max(0, p - dmg);
        playerTurn = true;
        fightMoves.push({
          by: 'monster', text: `🔥 ${monster.emoji} **${monster.name}** hits you for **${dmg}**`,
        });
      }
      // snapshot after this move for animation
      fightMoves[fightMoves.length - 1].snapshot = { p, m };
    }

    const playerWon = p > 0;

    // ---- Rewards ----
    let reward = 0;
    let droppedItem = null;
    let didDrop = false;
    let questProg = null;
    if (playerWon) {
      reward = Math.floor(Math.random() * (monster.rewardMax - monster.rewardMin + 1)) + monster.rewardMin;
      await updateBalance(interaction.user.id, reward);
      await incrementBattleWin(interaction.user.id);
      questProg = await incrementQuest(interaction.user.id, 'battle');
      for (const d of DROP_TABLE) {
        if (Math.random() < d.chance) {
          const item = shopItems.find((i) => i.id === d.itemId);
          if (item) {
            await addItem(interaction.user.id, d.itemId, 1);
            droppedItem = item;
            didDrop = true;
          }
          break;
        }
      }
    }
    await setLastBattle(interaction.user.id, now);

    // Normalize snapshots: cumulative HP after each move for the animation
    let cumP = pMax;
    let cumM = mMax;
    const steps = [];
    for (const mv of fightMoves) {
      if (mv.by === 'player') {
        cumM = mv.snapshot.m;
      } else {
        cumP = mv.snapshot.p;
      }
      steps.push({ text: mv.text, by: mv.by, p: cumP, m: cumM });
    }

    // ---- Animated presentation ----
    try {
      await interaction.deferReply();

      // Phase 1 — searching
      await interaction.editReply({
        embeds: [buildSceneEmbed({ player: user, monster, p: pMax, m: mMax, stats, log: { lines: [] }, phase: 'search' })],
      });
      await sleep(900);

      // Phase 2 — encounter
      await interaction.editReply({
        embeds: [buildSceneEmbed({ player: user, monster, p: pMax, m: mMax, stats, log: { lines: [] }, phase: 'encounter' })],
      });
      await sleep(1000);

      // Phase 3 — animate fight (cap animated steps to keep it snappy)
      const maxAnimSteps = 12;
      const animSteps = steps.slice(0, maxAnimSteps);
      const shownLog = [];

      for (let i = 0; i < animSteps.length; i++) {
        const mv = animSteps[i];
        shownLog.push(mv.text);
        await interaction.editReply({
          embeds: [buildSceneEmbed({ player: user, monster, p: mv.p, m: mv.m, stats, log: { lines: shownLog }, phase: 'fight' })],
        });
        await sleep(ANIM_DELAY);
      }

      // If battle continued past the animated cap, jump to final HP for the result
      const finalP = p;
      const finalM = m;

      // Grant XP (30 - 60 XP on win, 15 XP on defeat)
      const xpEarned = playerWon ? Math.floor(Math.random() * 31) + 30 : 15;
      const { addXp } = require('../database');
      const levelResult = await addXp(interaction.user.id, xpEarned);

      // Phase 4 — result
      const finalLog = {
        lines: [...shownLog],
        won: playerWon,
      };
      if (playerWon) {
        finalLog.lines.push('');
        finalLog.lines.push(`💰 **Reward:** +**${reward} ${config.currencyName}** · ⭐ **+${xpEarned} XP** (Lv. ${levelResult.newLevel})`);
        if (didDrop) finalLog.lines.push(`🎁 **Loot:** ${droppedItem.emoji} **${droppedItem.name}**`);
        if (questProg) finalLog.lines.push(`📜 **Quest:** ${questProg.label} — **${questProg.progress}/${questProg.goal}**`);
        if (levelResult.leveledUp) {
          finalLog.lines.push(`🎉 **LEVEL UP!** Level **${levelResult.newLevel}**! (+${levelResult.totalCoinsReward.toLocaleString()} ${config.currencyName}${levelResult.cratesReward?.length ? `, 🎁 **${levelResult.cratesReward.length}x Crate**` : ''})`);
        }
      } else {
        finalLog.lines.push('');
        finalLog.lines.push(`⭐ **+${xpEarned} XP** (Lv. ${levelResult.newLevel})`);
        finalLog.lines.push(`😵 Defeated! You have **${user.battleWins || 0} wins**. Upgrade your gear (🔨 craft / 🛒 shop) to push further!`);
        if (levelResult.leveledUp) {
          finalLog.lines.push(`🎉 **LEVEL UP!** Level **${levelResult.newLevel}**! (+${levelResult.totalCoinsReward.toLocaleString()} ${config.currencyName})`);
        }
      }

      const finalEmbed = buildSceneEmbed({
        player: user, monster, p: finalP, m: finalM, stats, log: { ...finalLog, won: playerWon }, phase: 'end',
      });
      await interaction.editReply({ embeds: [finalEmbed] });
    } catch (err) {
      console.error('❌ Battle animation error:', err);
      // Fallback: if animation fails, still reply with the result
      try {
        const lines = [`⚔️ **${playerWon ? 'Victory' : 'Defeat'}!**`, `**You:** ${Math.max(0, p)}/${stats.hp} · **${monster.name}:** ${Math.max(0, m)}/${monster.hp}`];
        if (playerWon) {
          lines.push(`💰 **Reward:** +**${reward} ${config.currencyName}**`);
          if (didDrop) lines.push(`🎁 **Loot:** ${droppedItem.emoji} **${droppedItem.name}**`);
        }
        const embed = new EmbedBuilder()
          .setColor(playerWon ? 0x2ecc71 : 0xe74c3c)
          .setTitle(playerWon ? `⚔️ Victory over ${monster.emoji} ${monster.name}` : `💀 Defeat! ${monster.emoji} ${monster.name}`)
          .setDescription(lines.join('\n'));
        await interaction.editReply({ embeds: [embed] });
      } catch { /* ignore */ }
    }
  },

  computeStats,
  pickMonster,
  MONSTERS,
  hpBar,
  buildSceneEmbed,
  DROP_TABLE,
};
