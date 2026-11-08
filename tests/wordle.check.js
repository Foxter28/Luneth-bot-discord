// Lunethle self-check: `npm run test:wordle`
// Pure logic + DB integration + command flow. Asserts only, one throwaway DB.
const path = require('path');
const fs = require('fs');
const assert = require('node:assert');

const dbPath = path.join(__dirname, 'wordle-check.db');
for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath + s); } catch {} }
process.env.STREAK_DB_PATH = dbPath;
delete process.env.TURSO_DATABASE_URL;

const db = require('../src/database');
const W = require('../src/wordleService');
const cmd = require('../src/commands/wordle');

// ── 1. Pure logic ─────────────────────────────────────────────────────────
// Correct letters win their copy first, leftovers go yellow only while copies remain.
assert.deepStrictEqual(W.evaluate('alloy', 'lolly'), ['yellow', 'yellow', 'green', 'gray', 'green']);
assert.deepStrictEqual(W.evaluate('abbey', 'bobby'), ['yellow', 'gray', 'green', 'gray', 'green']);
assert.deepStrictEqual(W.evaluate('speed', 'erase'), ['yellow', 'gray', 'gray', 'yellow', 'yellow']);
assert.deepStrictEqual(W.evaluate('crane', 'would'), ['gray', 'gray', 'gray', 'gray', 'gray']);
assert.deepStrictEqual(W.evaluate('abide', 'abide'), Array(5).fill('green'));

for (const w of W.ANSWERS) assert.match(w, /^[a-z]{5}$/);
assert.ok(W.isValidWord('crane'));
assert.ok(!W.isValidWord('zzzzz'));
assert.ok(!W.isValidWord('toolong'));

assert.strictEqual(W.dateDiff('2026-01-01', '2026-01-02'), 1);
assert.strictEqual(W.addDays('2026-02-28', 1), '2026-03-01');
assert.strictEqual(W.weekStart('2026-01-01'), '2025-12-29'); // Thursday -> Monday
assert.strictEqual(W.weekStart('2026-01-05'), '2026-01-05'); // Monday -> itself

assert.strictEqual(W.wibDate(Date.parse('2026-01-05T16:59:00Z')), '2026-01-05');
assert.strictEqual(W.wibDate(Date.parse('2026-01-05T17:00:00Z')), '2026-01-06'); // 00:00 WIB

assert.strictEqual(W.REWARDS[1], 500);
assert.strictEqual(W.REWARDS[6], 200);
assert.strictEqual(W.MAX_REWARD, 500);
assert.strictEqual(W.renderBoard([{ word: 'crane', colors: W.evaluate('crane', 'slate') }]).split('\n').length, 6);

// ── 2. Fake interaction helper ────────────────────────────────────────────
function fakeInteraction(userId, input) {
  const out = { replies: [], edits: [] };
  const mk = (store) => async (p) => { store.push(p); return {}; };
  return {
    user: { id: userId, username: 'tester' },
    options: { getString: (n) => (n === 'input' ? input : null) },
    reply: mk(out.replies),
    followUp: mk(out.replies),
    deferUpdate: async () => {},
    message: { edit: mk(out.edits) },
    fields: { getTextInputValue: () => input },
    customId: 'x',
    out,
  };
}

const run = async () => {
  const date = W.wibDate();

  // Puzzle answer is persisted, never regenerated.
  const a1 = await db.getOrCreatePuzzle(date, () => 'crane');
  const a2 = await db.getOrCreatePuzzle(date, () => 'other');
  assert.strictEqual(a1, 'crane');
  assert.strictEqual(a2, 'crane');

  // Opening the puzzle: six empty rows, answer stays hidden.
  let i = fakeInteraction('u1');
  await cmd.execute(i);
  const desc = i.out.replies[0].embeds[0].data.description;
  assert.ok(desc.includes('Attempts:** `0/6`'));
  assert.strictEqual(desc.split('```')[1].trim().split('\n').length, 6);
  assert.ok(!desc.includes('CRANE'), 'answer must not be exposed');

  // Invalid word: rejected, no attempt consumed.
  i = fakeInteraction('u1', 'zzzzz');
  await cmd.execute(i);
  assert.ok(i.out.replies[0].content.includes('not in the word list'));
  assert.strictEqual((await db.getWordleGame('u1', date)).guesses.length, 0);

  // Valid wrong guess is consumed; repeating it is rejected.
  i = fakeInteraction('u1', 'slate');
  await cmd.execute(i);
  assert.strictEqual((await db.getWordleGame('u1', date)).guesses.length, 1);
  i = fakeInteraction('u1', 'slate');
  await cmd.execute(i);
  assert.ok(i.out.replies[0].content.includes('already guessed'));

  // Winning pays exactly once; a replay pays nothing.
  const before = (await db.getUser('u1')).balance;
  i = fakeInteraction('u1', a1);
  await cmd.execute(i);
  const afterWin = (await db.getUser('u1')).balance;
  const attempts = (await db.getWordleGame('u1', date)).guesses.length;
  assert.strictEqual(afterWin - before, W.REWARDS[attempts]);
  i = fakeInteraction('u1', a1);
  await cmd.execute(i);
  assert.strictEqual((await db.getUser('u1')).balance, afterWin, 'replay must not pay twice');

  // Second player: same word, own session.
  i = fakeInteraction('u2', 'slate');
  await cmd.execute(i);
  assert.strictEqual((await db.getWordleGame('u2', date)).guesses.length, 1);
  assert.strictEqual((await db.getWordleGame('u1', date)).guesses.length, attempts);

  // Six misses = loss, no reward, answer revealed only as a spoiler.
  for (const g of ['pilot', 'mural', 'bison', 'yacht', 'wheat', 'plumb']) {
    i = fakeInteraction('u2', g);
    await cmd.execute(i);
  }
  const lost = await db.getWordleGame('u2', date);
  assert.strictEqual(lost.status, 'lost');
  assert.strictEqual(lost.reward, 0);
  assert.ok(i.out.replies[0].embeds[0].data.description.includes('||'));

  // Finished games are locked.
  i = fakeInteraction('u2', a1);
  await cmd.execute(i);
  assert.ok(i.out.replies[0].embeds[0].data.description.includes('Failed'));

  // Sub-views render.
  i = fakeInteraction('u1', 'stats');
  await cmd.execute(i);
  assert.ok(i.out.replies[0].embeds[0].data.description.includes('Total Wins'));
  i = fakeInteraction('u1', 'leaderboard');
  await cmd.execute(i);
  assert.ok(i.out.replies[0].embeds[0].data.title.includes('STREAK LEADERBOARD'));
  i = fakeInteraction('u1', 'salary');
  await cmd.execute(i);
  assert.ok(i.out.replies[0].embeds[0].data.description.includes('Next distribution'));

  // ── 3. Persistence / atomicity / streak rules ───────────────────────────
  // A finished game can only flip once (no double reward).
  await db.createWordleGame('u3', date);
  assert.strictEqual(await db.finishWordleGame('u3', date, 'won', 500, []), true);
  assert.strictEqual(await db.finishWordleGame('u3', date, 'won', 500, []), false);

  // Streak: consecutive-day win extends, loss resets, best is kept.
  const u = 'u3';
  await db.recordWordleResult(u, date, true, 2, 500);
  let s = await db.getWordleStats(u);
  assert.strictEqual(s.current_streak, 1);
  await db.recordWordleResult(u, W.addDays(date, 1), true, 4, 300);
  s = await db.getWordleStats(u);
  assert.strictEqual(s.current_streak, 2);
  assert.strictEqual(s.best_streak, 2);
  await db.recordWordleResult(u, W.addDays(date, 2), false, 6, 0);
  s = await db.getWordleStats(u);
  assert.strictEqual(s.current_streak, 0);
  assert.strictEqual(s.best_streak, 2);
  assert.strictEqual(s.losses, 1);
  // A win after a gap restarts at 1.
  await db.recordWordleResult(u, W.addDays(date, 5), true, 3, 350);
  assert.strictEqual((await db.getWordleStats(u)).current_streak, 1);

  // Salary ledger: PK makes duplicate payment impossible.
  assert.strictEqual(await db.claimWordleSalary('2026-W01', 'u3', 1, 5000), true);
  assert.strictEqual(await db.claimWordleSalary('2026-W01', 'u3', 1, 5000), false);
  assert.strictEqual((await db.getWordleSalaryForUser('u3')).length, 1);

  // Leaderboard: an active streak ranks, a full missed day expires it.
  assert.ok((await W.buildLeaderboard(db, W.addDays(date, 5))).some((p) => p.userId === u));
  assert.ok(!(await W.buildLeaderboard(db, W.addDays(date, 8))).some((p) => p.userId === u));

  // Weekly salary runner is idempotent.
  await W.runWeeklySalary(db);
  assert.strictEqual((await W.runWeeklySalary(db)).paid.length, 0);

  console.log('✅ Lunethle checks passed');
  process.exit(0);
};

run().catch((e) => { console.error(e); process.exit(1); });
