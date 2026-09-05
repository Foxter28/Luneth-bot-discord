// Central registry of craftable items + their recipes.
// Reads directly from shopItems (items with a "craft" array).
const shopItems = require('./shopItems');

// Items that can be crafted (have a recipe)
const craftable = shopItems.filter((i) => Array.isArray(i.craft) && i.craft.length > 0);

/**
 * Pretty recipe line: "2 ⚙️ Silver Ingot + 1 🪵 Moonwood → 🗡️ Silver Sword"
 * Used by both /craft and /recipes.
 */
function formatRecipe(item) {
  const parts = item.craft.map((r) => {
    const mat = shopItems.find((m) => m.id === r.id);
    const name = mat ? `${mat.emoji} ${mat.name}` : r.id;
    return `${r.qty} ${name}`;
  });

  const totalSteps = item.craft.reduce((sum, r) => sum + r.qty, 0);
  return {
    item,
    recipe: parts.join(' + '),
    totalSteps,
  };
}

// All recipes (already mapped)
const recipes = craftable.map(formatRecipe);

module.exports = {
  craftable,
  recipes,
  formatRecipe,
  shopItems,
};
