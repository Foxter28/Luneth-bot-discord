/**
 * Lunethle — daily word puzzle core logic.
 *
 * Pure, dependency-free helpers (evaluation, rewards, dates) plus the weekly
 * salary scheduler. All persistence goes through ./database.
 */
const { ANSWERS, isValidWord } = require('./wordleWords');

const MAX_GUESSES = 6;
const WORD_LENGTH = 5;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Reward per winning guess count (1..6). Failure pays nothing.
const REWARDS = { 1: 500, 2: 400, 3: 350, 4: 300, 5: 250, 6: 200 };
const MAX_REWARD = REWARDS[1];

// Weekly salary, configurable.
const SALARY = { 1: 5000, 2: 3000, 3: 1500 };
const SALARY_MIN_PUZZLES = 5; // must have played this many puzzles in the week

function wibDate(ts = Date.now()) {
  return new Date(ts + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

// Whole days between two YYYY-MM-DD date strings (b - a).
function dateDiff(a, b) {
  return Math.round(
    (new Date(b + 'T00:00:00+07:00').getTime() - new Date(a + 'T00:00:00+07:00').getTime()) / DAY_MS
  );
}

// Shift a WIB date string by n days. Reparsed at WIB midnight and re-rendered in
// WIB, so a DST-free fixed-offset round trip stays on the same calendar day.
function addDays(dateStr, n) {
  const ms = new Date(dateStr + 'T00:00:00+07:00').getTime() + n * DAY_MS;
  return new Date(ms + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

// Monday-based weekly period key for a WIB date (the period's first day).
// The date string is treated as a plain calendar date, so no offset drift.
function weekStart(dateStr) {
  const dow = (new Date(dateStr + 'T00:00:00Z').getUTCDay() + 6) % 7; // Monday = 0
  return addDays(dateStr, -dow);
}

// The most recent period that has fully ended: the week before the current one.
function lastCompletedPeriod(ts = Date.now()) {
  return addDays(weekStart(wibDate(ts)), -7);
}

/**
 * Two-pass Wordle evaluation of `guess` against `answer`.
 * Returns an array of 'green' | 'yellow' | 'gray', one per letter.
 */
function evaluate(answer, guess) {
  const a = String(answer).toLowerCase();
  const g = String(guess).toLowerCase();
  const result = new Array(a.length).fill('gray');
  const remaining = {};

  // Pass 1: exact matches claim their letter first.
  for (let i = 0; i < a.length; i++) {
    if (g[i] === a[i]) result[i] = 'green';
    else remaining[a[i]] = (remaining[a[i]] || 0) + 1;
  }
  // Pass 2: leftovers become yellow only while unmatched copies remain.
  for (let i = 0; i < g.length; i++) {
    if (result[i] === 'green') continue;
    if (remaining[g[i]] > 0) {
      result[i] = 'yellow';
      remaining[g[i]] -= 1;
    }
  }
  return result;
}

const SQUARES = { green: '🟩', yellow: '🟨', gray: '⬜' };

function renderRow(colors) {
  return colors.map((c) => SQUARES[c]).join(' ');
}

function renderBoard(guesses) {
  const lines = [];
  for (let i = 0; i < MAX_GUESSES; i++) {
    const g = guesses[i];
    lines.push(g ? renderRow(g.colors) : '⬜ ⬜ ⬜ ⬜ ⬜');
  }
  return lines.join('\n');
}

// Random pick from the answer pool. The chosen word is persisted per date, so
// randomness here only decides *which* word a new day gets — never a reshuffle.
function pickWordForDate() {
  return ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
}

/**
 * Ranked, non-expired leaderboard. A streak is "active" while the player has
 * played on today or yesterday (WIB): a missed full day expires it.
 */
async function buildLeaderboard(liveDb, today = wibDate()) {
  const all = await liveDb.getWordleStatsAll();
  return all
    .filter((s) => s.current_streak > 0 && s.last_won_date && dateDiff(s.last_won_date, today) <= 1)
    .map((s) => ({
      userId: s.userId,
      current: s.current_streak,
      best: s.best_streak,
      wins: s.wins,
    }));
}

/**
 * Pay the weekly salary for the last completed period, exactly once.
 *
 * Idempotency strategy (survives restarts, safe with concurrent callers):
 *   1. The `wordle_salary_last_period` marker short-circuits repeat runs.
 *   2. Each payment is an INSERT into wordle_salary whose PK is
 *      (period, userId) — a second attempt can never insert the same row.
 *   3. Balance credit happens only for the call that actually inserted the row,
 *      so no double credit is possible.
 */
async function runWeeklySalary(db) {
  const period = lastCompletedPeriod();
  const marker = await db.getLastWordleSalaryPeriod();
  if (marker === period) return { period, paid: [] };

  const periodEnd = addDays(period, 7); // exclusive
  const periodLastDay = addDays(periodEnd, -1);
  const all = await db.getWordleStatsAll();

  const eligible = [];
  for (const s of all) {
    if (!s.current_streak || !s.last_won_date) continue;
    // The streak must still have been alive on the period's last day.
    if (dateDiff(s.last_won_date, periodLastDay) > 1) continue;
    // ponytail: qualifying uses puzzles actually played inside the period; a
    // player who quit mid-week still keeps the current streak value.
    const played = await db.countWordleGamesBetween(s.userId, period, periodEnd);
    if (played < SALARY_MIN_PUZZLES) continue;
    eligible.push(s);
  }

  eligible.sort((a, b) =>
    b.current_streak - a.current_streak ||
    b.best_streak - a.best_streak ||
    b.wins - a.wins
  );

  const paid = [];
  for (let i = 0; i < Math.min(3, eligible.length); i++) {
    const rank = i + 1;
    const amount = SALARY[rank];
    if (!amount) continue;
    const row = eligible[i];
    const claimed = await db.claimWordleSalary(period, row.userId, rank, amount);
    if (claimed) {
      await db.updateBalance(row.userId, amount);
      paid.push({ userId: row.userId, rank, amount });
    }
  }

  await db.setLastWordleSalaryPeriod(period);
  return { period, paid };
}

module.exports = {
  MAX_GUESSES,
  WORD_LENGTH,
  REWARDS,
  MAX_REWARD,
  SALARY,
  SALARY_MIN_PUZZLES,
  wibDate,
  dateDiff,
  addDays,
  weekStart,
  lastCompletedPeriod,
  evaluate,
  renderRow,
  renderBoard,
  SQUARES,
  isValidWord,
  ANSWERS,
  pickWordForDate,
  buildLeaderboard,
  runWeeklySalary,
};
