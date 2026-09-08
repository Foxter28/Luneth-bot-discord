/**
 * Streak service — heartbeat tracking, 24h expiry, daily rollover and reminders.
 *
 * - Every chat message in a guild calls heartbeatIfActive(userId) to keep the
 *   member's "fire" alive (rolling 24h window).
 * - runStreakMaintenance(client) is invoked on an interval (15 min):
 *    1. EXPIRY  : lastHeartbeat older than 24h  -> freeze, strip milestone roles,
 *                 notify in the guild's reminder channel + suggest /restore.
 *    2. ROLLOVER: streakUpdatedAt older than 24h -> streak +1, grant milestone
 *                 roles (cumulative).
 *    3. REMINDER: every reminderIntervalMs, ping the 3-day role in every guild's
 *                 reminder channel.
 * - Reminder channel is per-guild, set with /streak setchannel.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

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

async function sendReminder(client, config) {
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
      `${roleMention} — Jangan sampai api streakmu padam! Chat di channel mana pun dalam 24 jam terakhir untuk menjaga streakmu tetap hidup.\n` +
      (mentions ? `\nBeberapa bear yang masih aktif: ${mentions}` : '') +
      `\n\nCek status: \`/register streak\` · Pulihkan yang hangus: \`/restore streak\` (5.000 🪙)`;

    try {
      await channel.send(text);
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
      `Kamu tidak chat selama 24 jam. Tenang, kamu bisa **pulihkan** dengan \`/restore streak\` seharga **5.000 🪙**!`
    );
  } catch (err) {
    console.error(`⚠️ Streak expiry notification failed for ${userId}:`, err.message);
  }
}

async function runStreakMaintenance(client, config) {
  const {
    getAllStreakUsers, freezeStreak,
    bumpStreak,
  } = require('./database');

  const users = await getAllStreakUsers();
  const now = Date.now();

  for (const row of users) {
    // 1. Expiry
    if (now - row.lastHeartbeat >= DAY_MS) {
      await freezeStreak(row.userId);
      const guild = client.guilds.cache.get(row.guildId);
      if (guild) {
        const member = await guild.members.fetch(row.userId).catch(() => null);
        if (member && !member.user.bot) {
          await stripAllMilestoneRoles(member, config);
          await notifyExpired(client, row.guildId, row.userId, row.streak);
        }
      }
      continue; // frozen; don't rollover
    }

    // 2. Rollover (24h since last +1). Fire is fed purely by chat, so the
    //    heartbeat is NOT reset here — only the day counter stamps.
    if (now - row.streakUpdatedAt >= DAY_MS) {
      await bumpStreak(row.userId);
      const guild = client.guilds.cache.get(row.guildId);
      if (guild) {
        const member = await guild.members.fetch(row.userId).catch(() => null);
        if (member && !member.user.bot) {
          await syncMilestoneRoles(member, row.streak + 1, config);
        }
      }
    }
  }

  // 3. Reminder to the 3-day role, at most once per reminderIntervalMs
  const { getStreakSetting, setStreakSetting } = require('./database');
  const last = Number(await getStreakSetting('streak_last_reminder', 0)) || 0;
  if (now - last >= config.streak.reminderIntervalMs) {
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

// Called on every message; cheap in-memory check first.
async function heartbeatIfActive(userId) {
  if (!activeUserIds) return; // cache not ready yet
  if (!activeUserIds.has(userId)) return;

  const { getStreakUser } = require('./database');
  const row = await getStreakUser(userId);
  if (!isRegistered(row) || row.frozen) return;

  const now = Date.now();
  const elapsed = now - row.lastHeartbeat;
  if (elapsed < 60 * 1000) return; // already within 1 minute, skip DB write

  await heartbeatStreak(userId);
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
};
