// Sanity check: verify the Luminary Roster edits are structurally sound.
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

console.log('--- tag balance ---');
for (const [open, close] of [
  ['<section', '</section>'],
  ['<div', '</div>'],
  ['<ul', '</ul>'],
]) {
  const o = (html.match(new RegExp(open + '[ >]', 'g')) || []).length;
  const c = (html.match(new RegExp(close.replace('/', '\\/') + '>', 'g')) || []).length;
  console.log(`${open}  ${o}  ${close}  ${c}  ${o === c ? 'OK' : 'MISMATCH'}`);
}

console.log('\n--- roster markers ---');
for (const m of [
  'class="sec roster"',
  'roster-rule',
  'roster-path',
  'roster-line',
  'roster-pin',
  'st-filled',
  'st-open',
  'st-wild',
  'roster-apply-placeholder',
  'data-roster-name="announcer"',
  'data-roster-name="talkactive"',
  '/api/luminary-roster',
]) {
  const n = (html.match(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  console.log(`${m}: ${n}`);
}

console.log('\n--- color vars ---');
for (const v of ['--color-text-2', '--color-muted', '--color-gold', '--color-accent-2']) {
  const n = (html.match(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  console.log(`${v}: ${n}`);
}
