/**
 * Streak service — calendar-day streak (WIB, deadline midnight WIB for all).
 *
 * - Every chat message calls heartbeatIfActive(userId):
 *     * first chat of a new WIB day -> streak +1 (was active yesterday),
 *       or restart at 1 (missed one or more calendar days).
 *     * otherwise just refresh lastHeartbeat.
 * - runStreakMaintenance(client) is invoked on an interval (15 min):
 *    1. EXPIRY  : last chat was 2+ WIB calendar days ago -> freeze, strip
 *                 milestone roles, notify in the guild's reminder channel.
 *    2. REMINDER: at fixed WIB hours (config.streak.reminderHours), ping the
 *                 3-day role in every guild's reminder channel.
 * - Reminder channel is per-guild, set with /streak setchannel.
 * - All day math uses WIB (UTC+7): a day starts at 00:00 WIB for everyone.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000; // Indonesia (UTC+7)
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const STREAK_IMAGE = path.join(__dirname, '..', 'public', 'asset', 'streak.png');

// WIB calendar helpers — day boundaries at 00:00 WIB, not per-user elapsed time.
function wibDayNumber(ts) {
  return Math.floor((ts + WIB_OFFSET_MS) / DAY_MS);
}

// Calendar-day difference in WIB: 0 = same day, 1 = yesterday, 2+ = missed days.
function dayDiffWIB(fromTs, toTs) {
  return wibDayNumber(toTs) - wibDayNumber(fromTs);
}

function isRegistered(row) {
  return !!row && row.lastHeartbeat > 0;
}

// ---------------------------------------------------------------------------
// Role helpers (all no-throw)
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
// Reminder
// ---------------------------------------------------------------------------

// Returns [channel|null] for a guild's configured reminder channel
async function getReminderChannel(client, guildId) {
  const { getStreakSetting } = require('./database');
  const raw = await getStreakSetting(`reminder_channel:${guildId}`);
  if (!raw) return null;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  const channel = guild.channels.cache.get(raw);
  return channel || null;
}

// Send the per-user "streak day" message to the guild's streak channel.
// Called when a registered user chats anywhere; at most once per 24h per user.
async function sendStreakMessage(client, guildId, userId, streak) {
  const channel = await getReminderChannel(client, guildId);
  if (!channel) return;
  try {
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🔥 Streak Active!')
      .setDescription(`<@${userId}> — kamu sudah streak **hari ke-${streak}**! 🔥\nJangan lupa chat setiap hari untuk menjaga streakmu terus menyala!`)
      .setThumbnail('attachment://streak.png')
      .setFooter({ text: 'Streak system' })
      .setTimestamp();
    await channel.send({
      embeds: [embed],
      files: [{ attachment: STREAK_IMAGE, name: 'streak.png' }],
      allowedMentions: { parse: ['users'] },
    });
  } catch (err) {
    console.error(`⚠️ Streak message failed in guild ${guildId}:`, err.message);
  }
}

async function sendReminder(client, config) {
  const path = require('path');
  const { getAllStreakUsers } = require('./database');
  const users = await getAllStreakUsers();

  // Group active members (streak >= 3, not frozen) by guild
  const byGuild = new Map();
  for (const row of users) {
    if (row.streak < 3) continue;
    if (!row.guildId) continue;
    const list = byGuild.get(row.guildId) || [];
    list.push(row);
    byGuild.set(row.guildId, list);
  }

  for (const [guildId, rows] of byGuild) {
    const channel = await getReminderChannel(client, guildId);
    if (!channel) continue; // not configured -> skip, don't spam random channels

    const mentions = rows.slice(0, 5).map((r) => `<@${r.userId}>`).join(' ');
    const roleMention = config.streak.reminderRoleIds.map((id) => `<@&${id}>`).join(' ');
    const text =
      `🔥 **REMINDER STREAK** 🔥\n` +
      `${roleMention} — Jangan sampai api streakmu padam! Chat minimal sekali tiap hari kalender sebelum **tengah malam (00:00 WIB)** untuk menjaga streakmu tetap hidup.\n` +
      (mentions ? `\nBeberapa bear yang masih aktif: ${mentions}` : '') +
      `\n\nCek status: \`/streak register\` · Pulihkan yang hangus: \`/restore streak\` (5.000 🪙)`;

    try {
      await channel.send({
        content: text,
        files: [{ attachment: path.join(__dirname, '..', 'public', 'asset', 'streak.png'), name: 'streak.png' }],
      });
    } catch (err) {
      console.error(`⚠️ Streak reminder failed in guild ${guildId}:`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

async function notifyExpired(client, guildId, userId, streak) {
  const channel = await getReminderChannel(client, guildId);
  if (!channel) return;
  try {
    await channel.send(
      `🔥 <@${userId}> — **streak ${streak} hari kamu BATAL (hangus)!** 🥀\n` +
      `Kamu tidak chat kemarin sampai tengah malam WIB. Tenang, kamu bisa **pulihkan** dengan \`/restore streak\` seharga **5.000 🪙**!`
    );
  } catch (err) {
    console.error(`⚠️ Streak expiry notification failed for ${userId}:`, err.message);
  }
}

async function runStreakMaintenance(client, config) {
  const {
    getAllStreakUsers, freezeStreak,
  } = require('./database');

  const users = await getAllStreakUsers();
  const now = Date.now();

  for (const row of users) {
    // 1. Expiry: no chat yesterday AND none today -> streak broken.
    //    Calendar deadline is midnight WIB shared by everyone.
    if (dayDiffWIB(row.lastHeartbeat, now) >= 2) {
      await freezeStreak(row.userId);
      const guild = client.guilds.cache.get(row.guildId);
      if (guild) {
        const member = await guild.members.fetch(row.userId).catch(() => null);
        if (member && !member.user.bot) {
          await stripAllMilestoneRoles(member, config);
          await notifyExpired(client, row.guildId, row.userId, row.streak);
        }
      }
      continue; // frozen; nothing else to do
    }
  }

  // 3. Reminder to the 3-day role at fixed local hours (e.g. 12:00 & 18:00).
  //    Fires on the first maintenance tick after each scheduled hour passes,
  //    at most once per hour per schedule.
  const { getStreakSetting, setStreakSetting } = require('./database');
  const last = Number(await getStreakSetting('streak_last_reminder', 0)) || 0;
  const hour = new Date().getHours();
  if (config.streak.reminderHours.includes(hour) && now - last >= 60 * 60 * 1000) {
    await setStreakSetting('streak_last_reminder', String(now));
    await sendReminder(client, config);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let activeUserIds = null; // lazy cache: Set of registered user ids

async function refreshCache() {
  const { getAllStreakUsers } = require('./database');
  const users = await getAllStreakUsers();
  activeUserIds = new Set(users.map((u) => u.userId));
}

// Called on every message; cheap in-memory check first. Returns the fresh
// streak row when this message counted for a new day (so the caller can send
// the streak notification), otherwise null/undefined.
async function heartbeatIfActive(userId) {
  if (!activeUserIds) return; // cache not ready yet
  if (!activeUserIds.has(userId)) return;

  const { getStreakUser, registerStreak } = require('./database');
  const row = await getStreakUser(userId);
  if (!isRegistered(row) || row.frozen) return;

  const now = Date.now();
  const elapsed = now - row.lastHeartbeat;
  const dayDiff = dayDiffWIB(row.lastHeartbeat, now);

  // Skip the DB write within the same minute, unless the WIB day changed — a
  // chat right after midnight must still count for the new day.
  if (elapsed < 60 * 1000 && dayDiff === 0) return;

  if (dayDiff >= 1) {
    // Active yesterday -> streak +1; missed a calendar day -> restart at 1.
    if (dayDiff === 1) await bumpStreak(userId);
    else await registerStreak(userId, row.guildId);
  }

  await heartbeatStreak(userId);
  return getStreakUser(userId);
}

// Add a freshly registered user to the heartbeat cache
function cacheAddUser(userId) {
  if (activeUserIds) activeUserIds.add(userId);
}

module.exports = {
  heartbeatIfActive,
  refreshCache,
  runStreakMaintenance,
  syncMilestoneRoles,
  cacheAddUser,
  sendStreakMessage,
  dayDiffWIB,
};
