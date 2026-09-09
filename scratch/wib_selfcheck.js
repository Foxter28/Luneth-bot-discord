// Self-check for WIB calendar-day streak logic.
// Day math must use WIB (UTC+7) boundaries, not server-local/UTC.
const DAY = 24 * 60 * 60 * 1000;
const WIB = 7 * 60 * 60 * 1000;
const wibDay = (t) => Math.floor((t + WIB) / DAY);
const d = (t0, t1) => wibDay(t1) - wibDay(t0);

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } };

// Base time = a WIB noon (12:00 UTC+7 = 05:00 UTC). Day N.
const noonWIB_dayN = Date.UTC(2026, 8, 9, 5, 0); // 12:00 WIB
assert(d(noonWIB_dayN, noonWIB_dayN) === 0, 'same WIB day = 0');

// Yesterday at same WIB noon.
const noonWIB_dayNminus1 = Date.UTC(2026, 8, 8, 5, 0);
assert(d(noonWIB_dayNminus1, noonWIB_dayN) === 1, 'yesterday = 1');

// Chat 10 min BEFORE midnight WIB (23:50 WIB) then 10 min AFTER (00:10 WIB next day).
// 23:50 WIB = 16:50 UTC on day N.
const beforeMidnight = Date.UTC(2026, 8, 9, 16, 50); // 23:50 WIB, day N
const afterMidnight = Date.UTC(2026, 8, 9, 17, 10);  // 00:10 WIB, day N+1
assert(new Date(beforeMidnight).getUTCDay() === new Date(afterMidnight).getUTCDay(), 'sanity: same UTC day must be adjacent');
assert(d(beforeMidnight, afterMidnight) === 1, '10min across WIB midnight = +1 day (server is UTC, no reset)');

// Missed exactly one full calendar day (today vs day before yesterday).
const twoDaysAgo = Date.UTC(2026, 8, 7, 5, 0);
assert(d(twoDaysAgo, noonWIB_dayN) === 2, 'two calendar days gap = 2 (expiry)');

// 00:00 UTC is NOT a new day in WIB (it's 07:00 WIB same day) — must NOT rollover.
const utcMidnight = Date.UTC(2026, 8, 9, 0, 0); // 07:00 WIB, still day N
assert(d(noonWIB_dayN, utcMidnight) === 0, 'UTC midnight is still the same WIB day (no false rollover)');

console.log(process.exitCode ? 'SELF-CHECK FAILED' : 'SELF-CHECK PASSED');
