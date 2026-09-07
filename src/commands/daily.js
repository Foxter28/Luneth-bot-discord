const { SlashCommandBuilder } = require('discord.js');
const { getUser, updateBalance, setLastDaily, setDailyStreak, setLastDailyDate } = require('../database');
const config = require('../config');

const STREAK_DAYS = 7;

// Date key in YYYY-MM-DD (local time, so a new day starts at midnight)
function dateKey(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Yesterday's key
function yesterdayKey() {
  return dateKey(Date.now() - 24 * 60 * 60 * 1000);
}

// Builds a pretty 7-day progress row: ✔ for claimed days, ❌ for remaining.
// Uses one-based day labels so it reads like a calendar.
function buildStreakDisplay(streak) {
  const progress = Math.min(Math.max(streak, 0), STREAK_DAYS);
  const cells = [];
  for (let i = 1; i <= STREAK_DAYS; i++) {
    cells.push(`${i <= progress ? '✔' : '❌'} \`${i}\``);
  }
  return cells.join('   ');
}

module.exports = {
  data: new SlashCommandBuilder().setName('daily').setDescription('Claim your daily reward'),

  // Static so tests can read it
  STREAK_DAYS,

  async execute(interaction) {
    const user = await getUser(interaction.user.id);
    const now = Date.now();
    const cooldown = config.dailyCooldownHours * 60 * 60 * 1000;
    const remaining = user.lastDaily + cooldown - now;

    if (remaining > 0) {
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      return interaction.reply(
        `⏳ You already claimed your daily. Try again in **${hours}h ${minutes}m**.\n\n` +
          `**📅 Daily Streak — ${user.dailyStreak || 0}/${STREAK_DAYS}** 🔥\n` +
          buildStreakDisplay(user.dailyStreak || 0)
      );
    }

    // --- Streak logic ---
    const today = dateKey(now);
    let streak = user.dailyStreak || 0;

    if (user.lastDailyDate === today) {
      // Claimed earlier today (cooldown expired): keep current streak
    } else if (user.lastDailyDate === yesterdayKey()) {
      // Claimed yesterday: streak continues
      streak += 1;
    } else {
      // Gap: streak resets
      streak = 1;
    }

    // Base daily reward
    await updateBalance(interaction.user.id, config.dailyAmount);

    // Streak bonus on every 7th day: random 50–150
    let bonus = 0;
    let reached = false;
    if (streak >= STREAK_DAYS) {
      reached = true;
      bonus = Math.floor(Math.random() * (150 - 50 + 1)) + 50; // 50..150
      await updateBalance(interaction.user.id, bonus);
      streak = 0; // cycle restarts
    }

    await setDailyStreak(interaction.user.id, streak);
    await setLastDailyDate(interaction.user.id, today);
    await setLastDaily(interaction.user.id, now);

    // XP Reward (50 - 100 XP)
    const xpGain = Math.floor(Math.random() * 51) + 50;
    const { addXp } = require('../database');
    const { createLevelUpEmbed } = require('../levelHelper');
    const levelResult = await addXp(interaction.user.id, xpGain);

    let content;
    if (reached) {
      content =
        `🎉 **Streak complete!** You claimed your daily **7 days in a row** and earned a bonus of **${bonus} ${config.currencyName}**!\n` +
        `(Base **${config.dailyAmount}** + bonus **${bonus}**)\n` +
        `⭐ **+${xpGain} XP** (Level ${levelResult.newLevel})\n` +
        `Your streak restarts — keep it going! 🔥\n\n` +
        `**📅 7-Day Streak — COMPLETE** 🏆\n` +
        buildStreakDisplay(STREAK_DAYS);
    } else {
      content =
        `✅ You received **${config.dailyAmount} ${config.currencyName}**!\n` +
        `⭐ **+${xpGain} XP** (Level ${levelResult.newLevel})\n\n` +
        `**📅 Daily Streak — ${streak}/${STREAK_DAYS}** 🔥\n` +
        buildStreakDisplay(streak);
    }

    const replyPayload = { content };
    const levelUp = createLevelUpEmbed(levelResult);
    if (levelUp) {
      replyPayload.embeds = [levelUp.embed];
      if (levelUp.file) replyPayload.files = [levelUp.file];
    }

    return interaction.reply(replyPayload);
  },
};
