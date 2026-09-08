const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

// ---------------------------------------------------------------------------
// Choose storage backend:
//   - If TURSO_DATABASE_URL is set (e.g. on Render), use Turso cloud SQLite.
//   - Otherwise fall back to the local file (economy.db) — dev/local behavior.
//
// This keeps the bot runnable locally without any cloud setup, while letting it
// store data durably in the cloud (surviving deploys/restarts) when deployed.
// ---------------------------------------------------------------------------
const DB_PATH = path.join(__dirname, '..', 'economy.db');
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

let isTurso = false;
let libsql = null; // Turso client
let nodeDb = null; // node:sqlite DatabaseSync (file mode)

if (TURSO_URL) {
  isTurso = true;
  if (!TURSO_TOKEN) {
    console.warn('⚠️ TURSO_DATABASE_URL is set but TURSO_AUTH_TOKEN is missing — connection may fail for cloud DBs.');
  }
  const { createClient } = require('@libsql/client');
  libsql = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  console.log(`✅ Using Turso cloud database (${TURSO_URL}).`);
} else {
  nodeDb = new DatabaseSync(DB_PATH);
  // SQLite concurrency setup (only relevant to the file backend).
  // node:sqlite's DatabaseSync has no built-in busy-wait, so overlapping writes
  // on the single shared connection can throw "database is locked". We mitigate
  // with WAL + busy timeout + a serialization queue (see dbQueue below).
  nodeDb.exec('PRAGMA journal_mode = WAL;');
  nodeDb.exec('PRAGMA busy_timeout = 5000;');
  nodeDb.exec('PRAGMA synchronous = NORMAL;');
  console.log('✅ Using local SQLite database (economy.db). Set TURSO_DATABASE_URL to use Turso cloud instead.');
}

// ---------------------------------------------------------------------------
// Uniform async DB helpers. They return values with the SAME shape as
// node:sqlite, so the internal functions below work in both modes.
// ---------------------------------------------------------------------------

// Run one or more SQL statements (DDL / multi-statement).
async function dbExec(sql) {
  if (isTurso) {
    await libsql.executeMultiple(sql);
  } else {
    nodeDb.exec(sql);
  }
}

// Run a write statement. Returns { changes, lastInsertRowid }.
async function dbRun(sql, ...params) {
  if (isTurso) {
    const r = await libsql.execute({ sql, args: params });
    return {
      changes: Number(r.rowsAffected),
      lastInsertRowid: r.lastInsertRowid == null ? undefined : Number(r.lastInsertRowid),
    };
  }
  return nodeDb.prepare(sql).run(...params);
}

// Return a single row (object) or null.
async function dbGet(sql, ...params) {
  if (isTurso) {
    const r = await libsql.execute({ sql, args: params });
    return r.rows[0] || null;
  }
  return nodeDb.prepare(sql).get(...params);
}

// Return an array of rows.
async function dbAll(sql, ...params) {
  if (isTurso) {
    const r = await libsql.execute({ sql, args: params });
    return r.rows;
  }
  return nodeDb.prepare(sql).all(...params);
}

// ---------------------------------------------------------------------------
// Schema & migrations (idempotent; safe to run on every boot)
// ---------------------------------------------------------------------------
async function ensureSchema() {
  await dbExec(`
    CREATE TABLE IF NOT EXISTS users (
      userId TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      lastDaily INTEGER NOT NULL DEFAULT 0,
      lastWork INTEGER NOT NULL DEFAULT 0,
      dailyStreak INTEGER NOT NULL DEFAULT 0,
      lastDailyDate TEXT,
      weapon TEXT,
      armor TEXT,
      offhand TEXT,
      lastBattle INTEGER NOT NULL DEFAULT 0,
      battleWins INTEGER NOT NULL DEFAULT 0,
      stamina INTEGER NOT NULL DEFAULT 60,
      lastMine INTEGER NOT NULL DEFAULT 0,
      questProgress INTEGER NOT NULL DEFAULT 0,
      questGoal INTEGER NOT NULL DEFAULT 0,
      questClaimed TEXT,
      lastQuestReset INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS inventory (
      userId TEXT NOT NULL,
      itemId TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (userId, itemId)
    );

    CREATE TABLE IF NOT EXISTS guild_prefixes (
      guildId TEXT PRIMARY KEY,
      prefix TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS custom_roles (
      userId TEXT NOT NULL,
      guildId TEXT NOT NULL,
      roleId TEXT NOT NULL,
      roleName TEXT NOT NULL,
      roleColor TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      PRIMARY KEY (userId, guildId)
    );

    CREATE TABLE IF NOT EXISTS global_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS streak_registered (
      userId TEXT PRIMARY KEY,
      streak INTEGER NOT NULL DEFAULT 1,
      lastHeartbeat INTEGER NOT NULL DEFAULT 0,
      streakUpdatedAt INTEGER NOT NULL DEFAULT 0,
      guildId TEXT,
      frozen INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS streak_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Guarded column migrations (only act when a column is missing). Harmless on
  // a freshly created table; needed if a pre-existing file database is opened.
  const userCols = (await dbAll("SELECT name FROM pragma_table_info('users')")).map((r) => r.name);

  const addIfMissing = (col, ddl) => {
    if (!userCols.includes(col)) {
      return dbExec(`ALTER TABLE users ADD COLUMN ${ddl};`);
    }
    return Promise.resolve();
  };

  await addIfMissing('dailyStreak', 'dailyStreak INTEGER NOT NULL DEFAULT 0');
  await addIfMissing('lastDailyDate', 'lastDailyDate TEXT');
  await addIfMissing('weapon', 'weapon TEXT');
  await addIfMissing('armor', 'armor TEXT');
  await addIfMissing('offhand', 'offhand TEXT');
  await addIfMissing('lastBattle', 'lastBattle INTEGER NOT NULL DEFAULT 0');
  await addIfMissing('battleWins', 'battleWins INTEGER NOT NULL DEFAULT 0');
  await addIfMissing('stamina', 'stamina INTEGER NOT NULL DEFAULT 60');
  await addIfMissing('lastMine', 'lastMine INTEGER NOT NULL DEFAULT 0');
  await addIfMissing('questProgress', 'questProgress INTEGER NOT NULL DEFAULT 0');
  await addIfMissing('questGoal', 'questGoal INTEGER NOT NULL DEFAULT 0');
  await addIfMissing('questClaimed', 'questClaimed TEXT');
  await addIfMissing('lastQuestReset', 'lastQuestReset INTEGER NOT NULL DEFAULT 0');
  await addIfMissing('level', 'level INTEGER NOT NULL DEFAULT 1');
  await addIfMissing('xp', 'xp INTEGER NOT NULL DEFAULT 0');

  // Streak table migration: ensure all columns exist on pre-existing tables.
  const streakCols = (await dbAll("SELECT name FROM pragma_table_info('streak_registered')")).map((r) => r.name);
  const addIfMissingStreak = (col, ddl) => {
    if (!streakCols.includes(col)) {
      return dbExec(`ALTER TABLE streak_registered ADD COLUMN ${ddl};`);
    }
    return Promise.resolve();
  };
  await addIfMissingStreak('streakUpdatedAt', 'streakUpdatedAt INTEGER NOT NULL DEFAULT 0');
  await addIfMissingStreak('frozen', 'frozen INTEGER NOT NULL DEFAULT 0');
  await addIfMissingStreak('guildId', 'guildId TEXT');
}

// Kick off schema creation. Every dbQueue operation awaits this, so no query
// runs before the tables exist (important in async Turso mode).
const initReady = ensureSchema().catch((err) => {
  console.error('❌ Database initialization failed:', err.message);
  throw err;
});

// ---------------------------------------------------------------------------
// Serialization queue
// ---------------------------------------------------------------------------
// Serialize all DB access so operations never overlap on the connection.
// In file mode this prevents "database is locked"; in Turso mode it keeps the
// single client's reads/writes ordered. Also waits for schema init first.
let dbChain = Promise.resolve();
function dbQueue(fn) {
  // IMPORTANT: capture the OLD chain eagerly. If we read `dbChain` inside the
  // deferred callback instead, it would already point to `next.catch(...)`
  // (set below), creating a self-reference that deadlocks the queue.
  const prev = dbChain;
  const next = initReady.then(() => prev.then(fn, fn));
  dbChain = next.catch(() => {});
  return next;
}

// ---------------------------------------------------------------------------
// Automatic migration from the old economy.json (if present & not yet migrated)
// ---------------------------------------------------------------------------
async function migrateFromJsonIfNeeded() {
  const fs = require('fs');
  const oldPath = path.join(__dirname, '..', 'economy.json');
  if (!fs.existsSync(oldPath)) return;

  const countRow = await dbGet('SELECT COUNT(*) AS c FROM users');
  if (countRow.c > 0) return; // already has data, don't migrate again

  try {
    const raw = JSON.parse(fs.readFileSync(oldPath, 'utf-8'));
    for (const [userId, u] of Object.entries(raw.users || {})) {
      await dbRun(
        'INSERT OR REPLACE INTO users (userId, balance, lastDaily, lastWork) VALUES (?, ?, ?, ?)',
        userId,
        u.balance || 0,
        u.lastDaily || 0,
        u.lastWork || 0
      );
    }
    for (const [userId, items] of Object.entries(raw.inventory || {})) {
      for (const [itemId, qty] of Object.entries(items)) {
        await dbRun('INSERT OR REPLACE INTO inventory (userId, itemId, quantity) VALUES (?, ?, ?)', userId, itemId, qty);
      }
    }
    for (const [guildId, prefix] of Object.entries(raw.guildPrefixes || {})) {
      await dbRun('INSERT OR REPLACE INTO guild_prefixes (guildId, prefix) VALUES (?, ?)', guildId, prefix);
    }
    console.log('✅ Successfully migrated data from economy.json.');
  } catch (err) {
    console.error('⚠️ Failed to migrate economy.json:', err.message);
  }
}
initReady.then(() => migrateFromJsonIfNeeded());

// ---------------------------------------------------------------------------
// User / balance helpers
// ---------------------------------------------------------------------------
async function getUser(userId) {
  let row = await dbGet('SELECT * FROM users WHERE userId = ?', userId);
  if (!row) {
    const now = Date.now();
    await dbRun(
      'INSERT INTO users (userId, balance, lastDaily, lastWork, dailyStreak, lastDailyDate, weapon, armor, offhand, lastBattle, battleWins, stamina, lastMine, questProgress, questGoal, questClaimed, lastQuestReset) VALUES (?, ?, 0, 0, 0, NULL, NULL, NULL, NULL, 0, 0, 60, ?, 0, 0, NULL, ?)',
      userId,
      config.startingBalance,
      now,
      0
    );
    row = await dbGet('SELECT * FROM users WHERE userId = ?', userId);
  }
  return row;
}

// Returns { user, isNew } — isNew is true only on the very first interaction that creates the account.
async function getOrCreateUser(userId) {
  const existing = await dbGet('SELECT userId FROM users WHERE userId = ?', userId);
  if (existing) {
    return { user: await getUser(userId), isNew: false };
  }
  return { user: await getUser(userId), isNew: true };
}

// Read-only check: has this user already /start-ed (i.e. exists in the users table)?
// Unlike getOrCreateUser, this never creates a row.
async function userExists(userId) {
  const row = await dbGet('SELECT userId FROM users WHERE userId = ?', userId);
  return !!row;
}

async function updateBalance(userId, amount) {
  await getUser(userId); // make sure the row exists
  await dbRun('UPDATE users SET balance = balance + ? WHERE userId = ?', amount, userId);
}

async function setLastDaily(userId, timestamp) {
  await getUser(userId);
  await dbRun('UPDATE users SET lastDaily = ? WHERE userId = ?', timestamp, userId);
}

async function setLastWork(userId, timestamp) {
  await getUser(userId);
  await dbRun('UPDATE users SET lastWork = ? WHERE userId = ?', timestamp, userId);
}

async function setDailyStreak(userId, streak) {
  await getUser(userId);
  await dbRun('UPDATE users SET dailyStreak = ? WHERE userId = ?', streak, userId);
}

async function setEquip(userId, slot, itemIdOrNull) {
  await getUser(userId);
  await dbRun(`UPDATE users SET ${slot} = ? WHERE userId = ?`, itemIdOrNull, userId);
}

async function setLastBattle(userId, timestamp) {
  await getUser(userId);
  await dbRun('UPDATE users SET lastBattle = ? WHERE userId = ?', timestamp, userId);
}

async function incrementBattleWin(userId) {
  await getUser(userId);
  await dbRun('UPDATE users SET battleWins = battleWins + 1 WHERE userId = ?', userId);
}

async function setLastDailyDate(userId, dateString) {
  await getUser(userId);
  await dbRun('UPDATE users SET lastDailyDate = ? WHERE userId = ?', dateString, userId);
}

async function getLeaderboard(limit = 10) {
  return dbAll('SELECT * FROM users ORDER BY balance DESC LIMIT ?', limit);
}

async function deleteUser(userId) {
  await dbRun('DELETE FROM users WHERE userId = ?', userId);
  await dbRun('DELETE FROM inventory WHERE userId = ?', userId);
  await dbRun('DELETE FROM custom_roles WHERE userId = ?', userId);
  return true;
}

async function getAllUserIds() {
  return dbAll('SELECT userId FROM users');
}

// ---------------------------------------------------------------------------
// Inventory helpers
// ---------------------------------------------------------------------------
async function addItem(userId, itemId, qty = 1) {
  const existing = await dbGet('SELECT quantity FROM inventory WHERE userId = ? AND itemId = ?', userId, itemId);
  if (existing) {
    await dbRun('UPDATE inventory SET quantity = quantity + ? WHERE userId = ? AND itemId = ?', qty, userId, itemId);
  } else {
    await dbRun('INSERT INTO inventory (userId, itemId, quantity) VALUES (?, ?, ?)', userId, itemId, qty);
  }
}

async function getInventory(userId) {
  return dbAll('SELECT * FROM inventory WHERE userId = ? AND quantity > 0', userId);
}

async function removeItem(userId, itemId, qty = 1) {
  const existing = await dbGet('SELECT quantity FROM inventory WHERE userId = ? AND itemId = ?', userId, itemId);
  if (!existing) return;

  const newQty = existing.quantity - qty;
  if (newQty <= 0) {
    await dbRun('DELETE FROM inventory WHERE userId = ? AND itemId = ?', userId, itemId);
  } else {
    await dbRun('UPDATE inventory SET quantity = ? WHERE userId = ? AND itemId = ?', newQty, userId, itemId);
  }
}

// ---------------------------------------------------------------------------
// Mining stamina
// ---------------------------------------------------------------------------
const STAMINA_MAX = 100;
const STAMINA_START = 60;
const STAMINA_REGEN_MS = 2 * 60 * 1000; // 1 stamina per 2 minutes

// Recompute & persist a user's current stamina based on elapsed time since lastMine.
// Returns the user object with an up-to-date .stamina.
async function refreshStamina(userId) {
  const user = await getUser(userId);
  const now = Date.now();
  const elapsed = Math.max(0, now - user.lastMine);
  const regen = Math.floor(elapsed / STAMINA_REGEN_MS);
  if (regen > 0) {
    const newStamina = Math.min(STAMINA_MAX, user.stamina + regen);
    await dbRun('UPDATE users SET stamina = ?, lastMine = ? WHERE userId = ?', newStamina, now, userId);
    user.stamina = newStamina;
    user.lastMine = now;
  }
  return user;
}

// Try to spend `cost` stamina. Returns { ok, stamina } — ok=false if insufficient.
async function spendStamina(userId, cost) {
  const user = await refreshStamina(userId);
  if (user.stamina < cost) {
    return { ok: false, stamina: user.stamina };
  }
  await dbRun('UPDATE users SET stamina = ? WHERE userId = ?', user.stamina - cost, userId);
  return { ok: true, stamina: user.stamina - cost };
}

// Current stamina value (regen applied) without consuming.
async function getStamina(userId) {
  return (await refreshStamina(userId)).stamina;
}

// ---------------------------------------------------------------------------
// Daily Quest
// ---------------------------------------------------------------------------
const DAILY_QUESTS = [
  { type: 'battle', label: '⚔️ Win battles', goal: 3, reward: 800 },
  { type: 'mine', label: '⛏️ Mine', goal: 5, reward: 600 },
  { type: 'work', label: '🧭 Explore dungeons via /work', goal: 2, reward: 700 },
  { type: 'sell', label: '💰 Sell items to the shop', goal: 3, reward: 500 },
  { type: 'trade', label: '🔄 Complete a trade', goal: 1, reward: 900 },
];

// Return the quest definition for a given day offset (0 = today).
function questForDay(dayIndex) {
  return DAILY_QUESTS[((dayIndex % DAILY_QUESTS.length) + DAILY_QUESTS.length) % DAILY_QUESTS.length];
}

// Reset the user's daily quest if the day changed. Returns the active quest row.
async function getQuest(userId) {
  const user = await getUser(userId);
  const now = Date.now();
  const dayIndex = Math.floor(now / 86400000); // days since epoch

  if (user.lastQuestReset !== dayIndex) {
    const q = questForDay(dayIndex);
    await dbRun('UPDATE users SET questProgress = 0, questGoal = ?, questClaimed = NULL, lastQuestReset = ? WHERE userId = ?', q.goal, dayIndex, userId);
    user.questProgress = 0;
    user.questGoal = q.goal;
    user.questClaimed = null;
    user.lastQuestReset = dayIndex;
    return { ...q, progress: 0, claimed: false, dayIndex };
  }

  const q = questForDay(dayIndex);
  return { ...q, progress: user.questProgress, claimed: !!user.questClaimed, dayIndex };
}

// Increment the active quest's progress for the given action type.
async function incrementQuest(userId, actionType) {
  const user = await getUser(userId);
  const now = Date.now();
  const dayIndex = Math.floor(now / 86400000);

  if (user.lastQuestReset !== dayIndex) {
    await getQuest(userId);
    user.questProgress = 0;
  }

  const q = questForDay(dayIndex);
  if (q.type !== actionType) return null;
  if (user.questClaimed) return null; // already claimed

  const newProgress = Math.min(q.goal, user.questProgress + 1);
  await dbRun('UPDATE users SET questProgress = ? WHERE userId = ?', newProgress, userId);
  user.questProgress = newProgress;
  return { ...q, progress: newProgress, goal: q.goal, claimed: false };
}

// Mark today's quest as claimed.
async function setQuestClaimed(userId) {
  await getUser(userId);
  const today = new Date().toISOString().slice(0, 10);
  await dbRun('UPDATE users SET questClaimed = ? WHERE userId = ?', today, userId);
}

// ---------------------------------------------------------------------------
// Prefix helpers
// ---------------------------------------------------------------------------
async function getGuildPrefix(guildId, fallback) {
  if (!guildId) return fallback;
  const row = await dbGet('SELECT prefix FROM guild_prefixes WHERE guildId = ?', guildId);
  return row ? row.prefix : fallback;
}

async function getActivePrefixes(guildId, defaultPrefix, defaultAliases = []) {
  const customPrefix = guildId ? await dbGet('SELECT prefix FROM guild_prefixes WHERE guildId = ?', guildId) : null;
  const list = customPrefix ? [customPrefix.prefix] : [defaultPrefix, ...defaultAliases];
  return list.sort((a, b) => b.length - a.length);
}

async function setGuildPrefix(guildId, prefix) {
  await dbRun('INSERT OR REPLACE INTO guild_prefixes (guildId, prefix) VALUES (?, ?)', guildId, prefix);
}

// ---------------------------------------------------------------------------
// Custom role helpers
// ---------------------------------------------------------------------------
async function getCustomRole(userId, guildId) {
  return await dbGet('SELECT * FROM custom_roles WHERE userId = ? AND guildId = ?', userId, guildId);
}

async function setCustomRole(userId, guildId, roleId, roleName, roleColor) {
  const now = Date.now();
  await dbRun(
    'INSERT OR REPLACE INTO custom_roles (userId, guildId, roleId, roleName, roleColor, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    userId,
    guildId,
    roleId,
    roleName,
    roleColor,
    now
  );
}

async function deleteCustomRole(userId, guildId) {
  await dbRun('DELETE FROM custom_roles WHERE userId = ? AND guildId = ?', userId, guildId);
}

// ---------------------------------------------------------------------------
// Global settings (e.g. maintenance)
// ---------------------------------------------------------------------------
async function getSetting(key, fallback = null) {
  const row = await dbGet('SELECT value FROM global_settings WHERE key = ?', key);
  return row ? row.value : fallback;
}

async function setSetting(key, value) {
  await dbRun('INSERT OR REPLACE INTO global_settings (key, value) VALUES (?, ?)', key, String(value));
}

// ---------------------------------------------------------------------------
// RPG Leveling & XP Progression
// ---------------------------------------------------------------------------
const MAX_LEVEL = 999;

function getXpForLevel(level) {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.floor(100 * Math.pow(level, 1.6));
}

async function getLevelLeaderboard(limit = 10) {
  return dbAll('SELECT userId, level, xp FROM users ORDER BY level DESC, xp DESC LIMIT ?', limit);
}

async function addXp(userId, amount) {
  const user = await getUser(userId);
  let currentLevel = Math.max(1, user.level || 1);
  let currentXp = Math.max(0, user.xp || 0);

  if (currentLevel >= MAX_LEVEL) {
    return {
      leveledUp: false,
      oldLevel: MAX_LEVEL,
      newLevel: MAX_LEVEL,
      currentXp: 0,
      neededXp: getXpForLevel(MAX_LEVEL),
      totalCoinsReward: 0,
      cratesReward: [],
    };
  }

  const oldLevel = currentLevel;
  let remainingXp = currentXp + amount;
  let neededXp = getXpForLevel(currentLevel);
  let totalCoinsReward = 0;
  const cratesReward = [];

  while (currentLevel < MAX_LEVEL && remainingXp >= neededXp) {
    remainingXp -= neededXp;
    currentLevel += 1;

    // Coins reward: (1,000 * level) + random (200 - 500 * level)
    const baseCoins = 1000 * currentLevel;
    const randomBonus = Math.floor(Math.random() * (300 * currentLevel) + (200 * currentLevel));
    const levelCoins = baseCoins + randomBonus;
    totalCoinsReward += levelCoins;

    // Crate reward per level:
    // Kelipatan 100 (Level 100, 200, 300, ...) -> crate_legendary
    // Kelipatan 10 (Level 10, 20, 30, ...) -> crate_rare
    // Level biasa (Level 2, 3, 4, 5, ...) -> crate_common
    let crateId = 'crate_common';
    if (currentLevel % 100 === 0) {
      crateId = 'crate_legendary';
    } else if (currentLevel % 10 === 0) {
      crateId = 'crate_rare';
    }
    cratesReward.push(crateId);
    await addItem(userId, crateId, 1);

    neededXp = getXpForLevel(currentLevel);
  }

  if (currentLevel >= MAX_LEVEL) {
    remainingXp = 0;
  }

  if (totalCoinsReward > 0) {
    await updateBalance(userId, totalCoinsReward);
  }

  await dbRun('UPDATE users SET level = ?, xp = ? WHERE userId = ?', currentLevel, remainingXp, userId);

  return {
    leveledUp: currentLevel > oldLevel,
    oldLevel,
    newLevel: currentLevel,
    currentXp: remainingXp,
    neededXp: getXpForLevel(currentLevel),
    totalCoinsReward,
    cratesReward,
  };
}

// -------------------------------------------------------------------
// Streak system helpers
// -------------------------------------------------------------------
async function registerStreak(userId, guildId) {
  const now = Date.now();
  await dbRun(
    'INSERT OR REPLACE INTO streak_registered (userId, streak, lastHeartbeat, streakUpdatedAt, guildId, frozen) VALUES (?, 1, ?, ?, ?, 0)',
    userId, now, now, guildId
  );
  return { userId, streak: 1, lastHeartbeat: now, streakUpdatedAt: now, guildId, frozen: 0 };
}

async function getStreakUser(userId) {
  return dbGet('SELECT * FROM streak_registered WHERE userId = ?', userId);
}

async function heartbeatStreak(userId) {
  const now = Date.now();
  await dbRun('UPDATE streak_registered SET lastHeartbeat = ? WHERE userId = ?', now, userId);
}

// Streak +1 day, then stamp the +1 so the next rollover waits for the next full day.
async function bumpStreak(userId) {
  const now = Date.now();
  await dbRun(
    'UPDATE streak_registered SET streak = streak + 1, streakUpdatedAt = ? WHERE userId = ?',
    now, userId
  );
}

// Restore: clear frozen AND re-light the fire (reset 24h window + day counter)
// so the user isn't instantly re-frozen/rolled-over next maintenance cycle.
async function unfreezeStreak(userId) {
  const now = Date.now();
  await dbRun(
    'UPDATE streak_registered SET frozen = 0, lastHeartbeat = ?, streakUpdatedAt = ? WHERE userId = ?',
    now, now, userId
  );
}

async function freezeStreak(userId) {
  await dbRun('UPDATE streak_registered SET frozen = 1 WHERE userId = ?', userId);
}

async function getAllStreakUsers() {
  return dbAll('SELECT * FROM streak_registered WHERE frozen = 0');
}

// Top streak holders (active, not frozen)
async function getStreakLeaderboard(limit = 10) {
  return dbAll(
    'SELECT * FROM streak_registered WHERE frozen = 0 ORDER BY streak DESC, lastHeartbeat ASC LIMIT ?',
    limit
  );
}

async function getStreakSetting(key, fallback = null) {
  const row = await dbGet('SELECT value FROM streak_settings WHERE key = ?', key);
  return row ? row.value : fallback;
}

async function setStreakSetting(key, value) {
  await dbRun('INSERT OR REPLACE INTO streak_settings (key, value) VALUES (?, ?)', key, String(value));
}

async function deleteStreakUser(userId) {
  await dbRun('DELETE FROM streak_registered WHERE userId = ?', userId);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
// Every public function runs inside dbQueue() so that concurrent command
// handlers never touch the connection at overlapping times, AND so every call
// waits for schema init. Callers `await` these (they are all async).
module.exports = {
  getUser: (userId) => dbQueue(() => getUser(userId)),
  getOrCreateUser: (userId) => dbQueue(() => getOrCreateUser(userId)),
  userExists: (userId) => dbQueue(() => userExists(userId)),
  updateBalance: (userId, amount) => dbQueue(() => updateBalance(userId, amount)),
  setLastDaily: (userId, ts) => dbQueue(() => setLastDaily(userId, ts)),
  setLastWork: (userId, ts) => dbQueue(() => setLastWork(userId, ts)),
  setDailyStreak: (userId, s) => dbQueue(() => setDailyStreak(userId, s)),
  setLastDailyDate: (userId, d) => dbQueue(() => setLastDailyDate(userId, d)),
  setEquip: (userId, slot, item) => dbQueue(() => setEquip(userId, slot, item)),
  setLastBattle: (userId, ts) => dbQueue(() => setLastBattle(userId, ts)),
  incrementBattleWin: (userId) => dbQueue(() => incrementBattleWin(userId)),
  getLeaderboard: (limit = 10) => dbQueue(() => getLeaderboard(limit)),
  deleteUser: (userId) => dbQueue(() => deleteUser(userId)),
  getAllUserIds: () => dbQueue(() => getAllUserIds()),
  addItem: (userId, itemId, qty = 1) => dbQueue(() => addItem(userId, itemId, qty)),
  getInventory: (userId) => dbQueue(() => getInventory(userId)),
  removeItem: (userId, itemId, qty = 1) => dbQueue(() => removeItem(userId, itemId, qty)),
  getGuildPrefix: (guildId, fallback) => dbQueue(() => getGuildPrefix(guildId, fallback)),
  getActivePrefixes: (guildId, p, aliases) => dbQueue(() => getActivePrefixes(guildId, p, aliases)),
  setGuildPrefix: (guildId, prefix) => dbQueue(() => setGuildPrefix(guildId, prefix)),
  getCustomRole: (userId, guildId) => dbQueue(() => getCustomRole(userId, guildId)),
  setCustomRole: (userId, guildId, roleId, roleName, roleColor) => dbQueue(() => setCustomRole(userId, guildId, roleId, roleName, roleColor)),
  deleteCustomRole: (userId, guildId) => dbQueue(() => deleteCustomRole(userId, guildId)),
  getSetting: (key, fallback) => dbQueue(() => getSetting(key, fallback)),
  setSetting: (key, value) => dbQueue(() => setSetting(key, value)),
  // mining
  STAMINA_MAX,
  STAMINA_START,
  STAMINA_REGEN_MS,
  getStamina: (userId) => dbQueue(() => getStamina(userId)),
  spendStamina: (userId, cost) => dbQueue(() => spendStamina(userId, cost)),
  // quest
  getQuest: (userId) => dbQueue(() => getQuest(userId)),
  incrementQuest: (userId, actionType) => dbQueue(() => incrementQuest(userId, actionType)),
  setQuestClaimed: (userId) => dbQueue(() => setQuestClaimed(userId)),
  DAILY_QUESTS,
  questForDay: (dayIndex) => dbQueue(() => questForDay(dayIndex)),
  // leveling
  MAX_LEVEL,
  getXpForLevel,
  getLevelLeaderboard: (limit = 10) => dbQueue(() => getLevelLeaderboard(limit)),
  addXp: (userId, amount) => dbQueue(() => addXp(userId, amount)),
  // streak
  registerStreak: (userId, guildId) => dbQueue(() => registerStreak(userId, guildId)),
  getStreakUser: (userId) => dbQueue(() => getStreakUser(userId)),
  heartbeatStreak: (userId) => dbQueue(() => heartbeatStreak(userId)),
  bumpStreak: (userId) => dbQueue(() => bumpStreak(userId)),
  unfreezeStreak: (userId) => dbQueue(() => unfreezeStreak(userId)),
  freezeStreak: (userId) => dbQueue(() => freezeStreak(userId)),
  getAllStreakUsers: () => dbQueue(() => getAllStreakUsers()),
  getStreakLeaderboard: (limit = 10) => dbQueue(() => getStreakLeaderboard(limit)),
  getStreakSetting: (key, fallback) => dbQueue(() => getStreakSetting(key, fallback)),
  setStreakSetting: (key, value) => dbQueue(() => setStreakSetting(key, value)),
  deleteStreakUser: (userId) => dbQueue(() => deleteStreakUser(userId)),
};