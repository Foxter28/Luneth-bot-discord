// Shared helper to resolve a user-typed item name/ID into a shop item.
// Intent: player should NEVER need to type an underscore (or remember exact IDs).
// "moon_fern", "moonfern", "moon fern", "legendary crate", "crate legendary crate" all resolve correctly.
const shopItems = require('./shopItems');

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[\s_\-]+/g, '');
}

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[\s_\-]+/)
    .filter(Boolean);
}

/**
 * Find a shop item from a fuzzy query.
 * Priority:
 *  1. Exact ID or name match
 *  2. Normalized (no spaces/underscores) exact match
 *  3. Token set match (e.g. "legendary crate" or "crate legendary" matches "crate_legendary")
 *  4. Normalized partial match (id or name contains query, or query contains id/name)
 *  5. Best token overlap match
 * Returns the matched item object, or null if not found.
 */
function resolveItem(query) {
  if (!query) return null;
  const raw = String(query).trim().toLowerCase();
  const q = normalize(raw);
  const qTokens = tokenize(raw);

  // 1) Exact ID or name
  let item = shopItems.find(
    (i) => i.id.toLowerCase() === raw || i.name.toLowerCase() === raw
  );
  if (item) return item;

  // 2) Normalized exact (ignores underscores/spaces/case)
  item = shopItems.find((i) => normalize(i.id) === q || normalize(i.name) === q);
  if (item) return item;

  // 3) Token set match (all tokens match, regardless of word order)
  // e.g. "crate legendary" or "legendary crate" matches "crate_legendary" or "Legendary Crate"
  item = shopItems.find((i) => {
    const idTokens = tokenize(i.id);
    const nameTokens = tokenize(i.name);
    const hasAllInId = qTokens.every((t) => idTokens.includes(t));
    const hasAllInName = qTokens.every((t) => nameTokens.includes(t));
    return hasAllInId || hasAllInName;
  });
  if (item) return item;

  // 4) Normalized substring match (either query in item, or item in query)
  item = shopItems.find(
    (i) =>
      normalize(i.id).includes(q) ||
      normalize(i.name).includes(q) ||
      q.includes(normalize(i.id)) ||
      q.includes(normalize(i.name))
  );
  if (item) return item;

  // 5) Substring token matching (e.g. "legendary" -> "crate_legendary" or "legendary_sword")
  let bestMatch = null;
  let maxOverlap = 0;
  for (const i of shopItems) {
    const itemTokens = [...tokenize(i.id), ...tokenize(i.name)];
    let overlap = 0;
    for (const qt of qTokens) {
      if (itemTokens.some((it) => it.includes(qt) || qt.includes(it))) {
        overlap += 1;
      }
    }
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      bestMatch = i;
    }
  }

  return bestMatch || null;
}

/**
 * Suggest up to `limit` items similar to a (possibly misspelled) query, ranked by
 * token overlap. Used to make "item not found" errors actionable for users.
 */
function suggestItems(query, limit = 5) {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];
  const scored = shopItems
    .map((i) => {
      const itemTokens = [...tokenize(i.id), ...tokenize(i.name)];
      let score = 0;
      for (const qt of qTokens) {
        if (itemTokens.some((it) => it.includes(qt) || qt.includes(it))) score += 1;
      }
      return { item: i, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((s) => s.item);
}

/**
 * A friendly "did you mean" hint for error messages, e.g.
 *   Did you mean: Moon Fern (`moon_fern`), Moonstone (`moonstone`)?
 * Returns '' when nothing is close enough.
 */
function formatSuggestions(query) {
  const near = suggestItems(query, 5);
  if (near.length === 0) return '';
  return `\n• Did you mean: ${near.map((i) => `**${i.name}** (\`${i.id}\`)`).join(', ')}?`;
}

module.exports = { resolveItem, normalize, tokenize, suggestItems, formatSuggestions };
