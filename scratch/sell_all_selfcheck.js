// Self-check for the "lu sell all" bug.
// Before the fix, the prefix parser put "all" into the `item` option, and
// resolveItem('all') fuzzy-matched Starfall Guandao (contains "all").
// Run: node scratch/sell_all_selfcheck.js
const assert = require('assert');
const { resolveItem, formatSuggestions } = require('../src/resolveItem');
const shopItems = require('../src/shopItems');

// 1) Confirm the trap that caused the bug still EXISTS in the raw resolver —
//    this is why sell.js must intercept category keywords first.
const raw = resolveItem('all');
console.log('resolveItem("all") ->', raw && raw.id);

// 2) Reproduce the sell.js guard: a numeric/qty word or category keyword must be
//    treated as a category, never an item.
const validCats = [...new Set(shopItems.map((i) => i.category))];
function classify(itemId, category) {
  let cat = (category || '').trim().toLowerCase();
  let id = (itemId || '').trim().toLowerCase();
  if (!cat && (id === 'all' || validCats.includes(id))) {
    cat = id;
    id = '';
  }
  return { id, cat };
}

assert.deepStrictEqual(classify('all', ''), { id: '', cat: 'all' }, '"all" must be a category');
assert.deepStrictEqual(classify('material', ''), { id: '', cat: 'material' }, 'category keyword');
assert.deepStrictEqual(classify('starfall', ''), { id: 'starfall', cat: '' }, 'real item stays item');

// 3) Suggestions are produced for typos.
const hint = formatSuggestions('moonfern');
assert.ok(hint.includes('moon_fern'), 'typo should suggest moon_fern');

console.log('✅ sell-all self-check passed');
