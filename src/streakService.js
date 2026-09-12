/**
 * Streak service — calendar-day streak with WIB (Asia/Jakarta, UTC+7) dates.
 *
 * - Every chat message in ANY channel calls heartbeatIfActive(userId, guildId):
 *     * reads the user's row straight from the database (never an in-memory cache)
 *     * today = WIB calendar date (YYYY-MM-DD)
 *     * last_chat_date == today        -> already active, no-op (no double count)
 *     * last_chat_date == yesterday    -> streak +1, longest updated, written now
 *     * older / never                  -> streak resets to 1, written now
 *   Every qualifying write is real-time (awaited before returning).
 * - sendStreakMessage() posts to the guild's configured streak channel:
 *     "🔥 [Username] streak-nya sekarang: X hari!"
 * - sendReminder() is invoked by node-cron at 12:00 & 18:00 Asia/Jakarta (see index.js).
 * - No interval maintenance: a missed day is detected lazily on the next chat
 *   (the date math is stateless), so there is nothing periodic to lose on restart.
 */
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const STREAK_IMAGE = path.join(__dirname, '..', 'public', 'asset', 'streak.png');

// ---------------------------------------------------------------------------
// WIB helpers — single source of truth for "what day is it" (00:00 WIB)
// ---------------------------------------------------------------------------
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function wibDateStr(ts = Date.now()) {
  return new Date(ts + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

// Calendar-day difference in WIB: 0 = same day, 1 = yesterday, 2+ = missed days.
function dayDiffWIB(fromDateStr, toTs = Date.now()) {
  const from = new Date(fromDateStr + 'T00:00:00+07:00').getTime();
  const to = new Date(wibDateStr(toTs) + 'T00:00:00+07:00').getTime();
  return Math.round((to - from) / DAY_MS);
}

/** Yesterday's WIB date string (YYYY-MM-DD). */
function yesterdayWIB(ts = Date.now()) {
  return wibDateStr(ts - DAY_MS);
}

function isRegistered(row) {
  return !!row && !!row.last_chat_date;
}

// ---------------------------------------------------------------------------
// Milestone roles (kept for /register, /set, /restore)
// ---------------------------------------------------------------------------

// Roles a member currently holds from the milestone list
function heldMilestoneRoles(member, config) {
  const out = [];
  for (const m of config.streak.milestoneRoles) {
    if (member.roles.cache.has(m.roleId)) out.push(m);
  }
  return out;
}

// Highest reached milestone <= current streak
function milestoneForStreak(streak, config) {
  let best = null;
  for (const m of config.streak.milestoneRoles) {
    if (streak >= m.days && (!best || m.days > best.days)) best = m;
  }
  return best;
}

async function stripAllMilestoneRoles(member, config) {
  const toRemove = heldMilestoneRoles(member, config);
  if (toRemove.length === 0) return;
  try {
    await member.roles.remove(toRemove.map((m) => m.roleId), 'Streak expired');
  } catch (err) {
    console.error(`⚠️ Streak: failed to remove roles from ${member.id}:`, err.message);
  }
}

// milestoneRoles are cumulative: at streak 7 the member also keeps the 3-day
// role, so reminders (`reminderRoleIds`) still reach them.
async function syncMilestoneRoles(member, streak, config) {
  const best = milestoneForStreak(streak, config);
  const toAdd = config.streak.milestoneRoles.filter(
    (m) => best && streak >= m.days && !member.roles.cache.has(m.roleId)
  );
  const toRemove = config.streak.milestoneRoles.filter(
    (m) => !best || streak < m.days
  );
  try {
    if (toAdd.length) await member.roles.add(toAdd.map((m) => m.roleId), 'Streak milestone');
    if (toRemove.length) await member.roles.remove(toRemove.map((m) => m.roleId), 'Streak rollback');
  } catch (err) {
    console.error(`⚠️ Streak: failed to sync roles for ${member.id}:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Reminder channel
// ---------------------------------------------------------------------------

// Returns [channel|null] for a guild's configured streak/reminder channel.
async function getReminderChannel(client, guildId) {
  const { getStreakSetting } = require('./database');
  const raw = await getStreakSetting(`reminder_channel:${guildId}`);
  if (!raw) return null;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  return guild.channels.cache.get(raw) || null;
}

// "🔥 [Username] streak-nya sekarang: X hari!" — sent to the streak channel,
// not the channel where the user chatted. At most once per user per WIB day.
async function sendStreakMessage(client, guildId, userId, streak, username) {
  const channel = await getReminderChannel(client, guildId);
  if (!channel) return false;
  const name = username || `<@${userId}>`;
  try {
    await channel.send(`🔥 **${name}** streak-nya sekarang: **${streak} hari**!`);
    return true;
  } catch (err) {
    console.error(`⚠️ Streak message failed in guild ${guildId}:`, err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Core: called on every chat message
// ---------------------------------------------------------------------------

/**
 * Processes a chat event for a user (in any channel). Reads the user from the
 * database, applies WIB-date logic, and writes real-time.
 *
 * Returns `{ counted, streak, shouldNotify, row }`:
 *  - counted: true when this message advanced the streak (or started a new one)
 *  - streak:  the current streak after the update
 *  - shouldNotify: true when the streak channel should be told (1x/day)
 *  - row:     the fresh DB row (null if the user isn't registered)
 */
async function heartbeatIfActive(userId, guildId) {
  const { getStreakUser, upsertStreak } = require('./database');
  const row = await getStreakUser(userId);
  if (!isRegistered(row) || row.frozen) {
    return { counted: false, streak: 0, shouldNotify: false, row: null };
  }

  const today = wibDateStr();
  const diff = dayDiffWIB(row.last_chat_date, Date.now());

  // Already active today — no change, never double count.
  if (diff <= 0) {
    return { counted: false, streak: row.current_streak, shouldNotify: false, row };
  }

  // Chat yesterday -> streak +1. Missed one+ days -> restart at 1.
  const nextStreak = diff === 1 ? row.current_streak + 1 : 1;
  const fresh = await upsertStreak(userId, guildId || row.guildId, nextStreak, today);

  return {
    counted: true,
    streak: fresh.current_streak,
    shouldNotify: true,
    row: fresh,
  };
}

// ---------------------------------------------------------------------------
// Reminder (node-cron at 12:00 & 18:00 Asia/Jakarta)
// ---------------------------------------------------------------------------

/**
 * Sends the streak reminder to every configured guild's streak channel:
 * reminds users who haven't chatted today (last_chat_date != today WIB) and
 * tags the configured reminder role(s).
 */
async function sendReminder(client, config) {
  const { getAllStreakUsers } = require('./database');
  const users = await getAllStreakUsers();
  const today = wibDateStr();

  // Group "not chatted today" users by guild (all registered users — the
  // reminder role is what catches eyeballs; we also mention offenders).
  const byGuild = new Map();
  for (const row of users) {
    if (!row.guildId) continue;
    if (row.last_chat_date === today) continue; // already chatted today
    const list = byGuild.get(row.guildId) || [];
    list.push(row);
    byGuild.set(row.guildId, list);
  }

  const roleMention = (config.streak.reminderRoleIds || [])
    .map((id) => `<@&${id}>`)
    .join(' ');

  for (const [guildId, rows] of byGuild) {
    const channel = await getReminderChannel(client, guildId);
    if (!channel) continue; // not configured -> don't spam random channels

    const mentions = rows.slice(0, 5).map((r) => `<@${r.userId}>`).join(' ');
    const text =
      `⏰ **Reminder Streak!** Hai ${roleMention}, jangan lupa chat hari ini biar streak-mu tetap hidup! 🔥` +
      (mentions ? `\nBelum chat hari ini: ${mentions}` : '') +
      `\nCek status: \`/streak register\``;

    try {
      await channel.send({
        content: text,
        files: [{ attachment: STREAK_IMAGE, name: 'streak.png' }],
      });
    } catch (err) {
      console.error(`⚠️ Streak reminder failed in guild ${guildId}:`, err.message);
    }
  }
}

module.exports = {
  heartbeatIfActive,
  sendStreakMessage,
  sendReminder,
  syncMilestoneRoles,
  stripAllMilestoneRoles,
  wibDateStr,
  yesterdayWIB,
  dayDiffWIB,
};
