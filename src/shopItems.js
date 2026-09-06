// 🌙 Moon/Fantasy theme — Luneth shop catalog.
// "category" groups items in /shop and /craft:
//   material         : raw crafting ingredients
//   armor/offhand    : defense gear
//   common_weapon    : beginner weapons (8)
//   rare_weapon      : mid-tier weapons (5)
//   legendary_weapon : top-tier shop weapons (3, huge price)
//   legendary_craft  : top-tier craft-only weapons (3)
//   crate            : mystery boxes
// "craft" (optional) defines how an item is made: array of { id, qty }.
//   For legendary_craft items this is the ONLY way to obtain them.
// "equip" (optional) makes an item wearable in battle:
//   { slot: 'weapon'|'armor'|'offhand', attack, defense, speed, crit }
//   Values are the bonus added to the base battle stats.
module.exports = [
  // ── Common materials (for crafting & crates) ──
  { id: 'moon_fern', name: 'Moon Fern', price: 75, emoji: '🌿', category: 'material', description: 'Glowing fern that blooms under the moon.' },
  { id: 'stardust', name: 'Stardust', price: 100, emoji: '✨', category: 'material', description: 'Fine dust that fell from the night sky.' },
  { id: 'frost_crystal', name: 'Frost Crystal', price: 120, emoji: '💠', category: 'material', description: 'A brittle crystal that stays cold forever.' },
  { id: 'moon_wood', name: 'Moonwood', price: 150, emoji: '🪵', category: 'material', description: 'Timber harvested from silver-barked trees.' },
  { id: 'lunar_stone', name: 'Lunar Stone', price: 200, emoji: '🪨', category: 'material', description: 'Stone that hums faintly with moonlight.' },
  { id: 'moon_thread', name: 'Moonthread', price: 250, emoji: '🧵', category: 'material', description: 'Silken thread woven from moonbeams.' },
  { id: 'silver_ingot', name: 'Silver Ingot', price: 300, emoji: '🔩', category: 'material', description: 'Smelted silver, ready for enchanting.' },
  { id: 'potion_base', name: 'Potion Base', price: 400, emoji: '⚗️', category: 'material', description: 'A neutral brew ready for mystical infusions.' },
  { id: 'lunar_shield', name: 'Lunar Shield', price: 500, emoji: '🛡️', category: 'offhand', description: 'A basic shield enchanted with a pale glow.',
    equip: { slot: 'offhand', attack: 0, defense: 12, speed: 0, crit: 0 } },
  { id: 'magnetite', name: 'Magnetite', price: 1200, emoji: '🧲', category: 'offhand', description: 'A stone that draws metal from afar.',
    equip: { slot: 'offhand', attack: 0, defense: 10, speed: 0, crit: 15 } },
  { id: 'pocket_astrolabe', name: 'Pocket Astrolabe', price: 1500, emoji: '🕰️', category: 'offhand', description: 'Guides its holder by the stars.',
    equip: { slot: 'offhand', attack: 5, defense: 5, speed: 8, crit: 20 } },
  { id: 'moonstone', name: 'Moonstone', price: 2000, emoji: '🌙', category: 'relic', description: 'A radiant gem — prized by every Lunarian.',
    equip: { slot: 'offhand', attack: 10, defense: 10, speed: 5, crit: 25 } },
  // crafted armor
  { id: 'lunar_armor', name: 'Lunar Armor', price: 2400, emoji: '🎽', category: 'armor', description: 'Armor woven with moonthread.',
    craft: [{ id: 'lunar_shield', qty: 1 }, { id: 'moon_thread', qty: 2 }, { id: 'silver_ingot', qty: 1 }],
    equip: { slot: 'armor', attack: 0, defense: 30, speed: 0, crit: 0 } },
  { id: 'astral_robe', name: 'Astral Robe', price: 4200, emoji: '🦺', category: 'armor', description: 'Robe woven from living starlight.',
    craft: [{ id: 'moonstone', qty: 1 }, { id: 'moon_thread', qty: 3 }, { id: 'frost_crystal', qty: 2 }],
    equip: { slot: 'armor', attack: 8, defense: 42, speed: 5, crit: 20 } },

  // ── Common weapons (8) — beginner gear, rising power ──
  { id: 'wooden_sword', name: 'Wooden Sword', price: 150, emoji: '🗡️', category: 'common_weapon', description: 'A simple practice blade for trainees.',
    equip: { slot: 'weapon', attack: 8, defense: 0, speed: 0, crit: 0 } },
  { id: 'bronze_dagger', name: 'Bronze Dagger', price: 250, emoji: '🔪', category: 'common_weapon', description: 'Light and quick — good for beginners.',
    equip: { slot: 'weapon', attack: 10, defense: 0, speed: 5, crit: 5 } },
  { id: 'iron_sword', name: 'Iron Sword', price: 350, emoji: '⚔️', category: 'common_weapon', description: 'A sturdy, dependable iron blade.',
    equip: { slot: 'weapon', attack: 13, defense: 0, speed: 0, crit: 3 } },
  { id: 'short_bow', name: 'Short Bow', price: 450, emoji: '🏹', category: 'common_weapon', description: 'A beginner bow with a quick draw.',
    equip: { slot: 'weapon', attack: 12, defense: 0, speed: 12, crit: 8 } },
  { id: 'bronze_hammer', name: 'Bronze Hammer', price: 550, emoji: '🔨', category: 'common_weapon', description: 'Slow but hits hard for its tier.',
    equip: { slot: 'weapon', attack: 16, defense: 0, speed: 0, crit: 0 } },
  { id: 'moon_dagger', name: 'Moon Dagger', price: 600, emoji: '🗡️', category: 'common_weapon', description: 'A dagger that glints under moonlight.',
    equip: { slot: 'weapon', attack: 14, defense: 0, speed: 8, crit: 12 } },
  { id: 'hunter_axe', name: 'Hunter Axe', price: 650, emoji: '🪓', category: 'common_weapon', description: 'A balanced axe favored by rangers.',
    equip: { slot: 'weapon', attack: 17, defense: 0, speed: 3, crit: 6 } },
  { id: 'long_sword', name: 'Long Sword', price: 700, emoji: '⚔️', category: 'common_weapon', description: 'The last common sword — a solid all-rounder.',
    equip: { slot: 'weapon', attack: 20, defense: 0, speed: 0, crit: 10 } },

  // ── Rare weapons (5) — mid-tier, better gear ──
  { id: 'silver_blade', name: 'Silver Blade', price: 900, emoji: '⚔️', category: 'rare_weapon', description: 'A sharp blade of forged silver.',
    equip: { slot: 'weapon', attack: 26, defense: 0, speed: 4, crit: 12 } },
  { id: 'moon_bow', name: 'Moon Bow', price: 1100, emoji: '🏹', category: 'rare_weapon', description: 'A bow that looses arrows of pale light.',
    equip: { slot: 'weapon', attack: 22, defense: 0, speed: 20, crit: 15 } },
  { id: 'frost_blade', name: 'Frost Blade', price: 1400, emoji: '❄️', category: 'rare_weapon', description: 'A blade that bites with winter cold.',
    equip: { slot: 'weapon', attack: 30, defense: 0, speed: 2, crit: 10 } },
  { id: 'starshard_spear', name: 'Starshard Spear', price: 1800, emoji: '🔱', category: 'rare_weapon', description: 'A long spear tipped with a fallen star.',
    equip: { slot: 'weapon', attack: 34, defense: 0, speed: 0, crit: 15 } },
  { id: 'silver_sword', name: 'Silver Sword', price: 2200, emoji: '🗡️', category: 'rare_weapon', description: 'Master-forged silver — the best rare blade.',
    equip: { slot: 'weapon', attack: 38, defense: 0, speed: 5, crit: 18 } },

  // ── Legendary weapons in shop (3) — huge price, best stats ──
  { id: 'lunar_blade', name: 'Lunar Blade', price: 8500, emoji: '🌙', category: 'legendary_weapon', description: 'A blade blessed by the moon itself.',
    equip: { slot: 'weapon', attack: 58, defense: 0, speed: 10, crit: 28 } },
  { id: 'eclipse_reaver', name: 'Eclipse Reaver', price: 11500, emoji: '🌑', category: 'legendary_weapon', description: 'Sword forged in a total eclipse.',
    equip: { slot: 'weapon', attack: 66, defense: 0, speed: 6, crit: 32 } },
  { id: 'starfall_guandao', name: 'Starfall Guandao', price: 14500, emoji: '🌟', category: 'legendary_weapon', description: 'Polearm that channels falling stars.',
    equip: { slot: 'weapon', attack: 72, defense: 0, speed: 8, crit: 35 } },

  // ── Legendary craft-only weapons (3) — cannot be bought, power > shop legendaries ──
  { id: 'moonlit_twinblade', name: 'Moonlit Twinblade', price: 20000, emoji: '🗡️', category: 'legendary_craft', description: 'Twin blades of pure moonlight — crafted only.',
    craft: [{ id: 'moonstone', qty: 3 }, { id: 'lunar_blade', qty: 1 }, { id: 'silver_ingot', qty: 5 }],
    equip: { slot: 'weapon', attack: 80, defense: 0, speed: 14, crit: 40 } },
  { id: 'void_shadowfury', name: 'Void Shadowfury', price: 24000, emoji: '🌌', category: 'legendary_craft', description: 'A blade from the void — craft-only.',
    craft: [{ id: 'moonstone', qty: 4 }, { id: 'eclipse_reaver', qty: 1 }, { id: 'stardust', qty: 10 }],
    equip: { slot: 'weapon', attack: 88, defense: 0, speed: 12, crit: 45 } },
  { id: 'celestial_forge', name: 'Celestial Forge', price: 30000, emoji: '☄️', category: 'legendary_craft', description: 'The ultimate Lunarian weapon — craft-only.',
    craft: [{ id: 'moonstone', qty: 5 }, { id: 'starfall_guandao', qty: 1 }, { id: 'frost_crystal', qty: 8 }],
    equip: { slot: 'weapon', attack: 95, defense: 0, speed: 15, crit: 50 } },

  // ── Special Server Roles ──
  { id: 'mythic_hero', name: '👑 Mythic Hero Role', price: 50000, emoji: '👑', category: 'special_role', roleId: '1546026397472915487', description: 'Exclusive Discord role granted directly to your server profile!' },

  // ── Crates (mystery boxes) ──
  { id: 'crate_common', name: 'Common Crate', price: 350, emoji: '📦', category: 'crate', description: 'Contains a random COMMON material or weapon.' },
  { id: 'crate_rare', name: 'Rare Crate', price: 1500, emoji: '🎁', category: 'crate', description: 'Contains a random RARE weapon or relic.' },
  { id: 'crate_legendary', name: 'Legendary Crate', price: 7500, emoji: '👑', category: 'crate', description: 'Contains a random LEGENDARY weapon.' },
];
