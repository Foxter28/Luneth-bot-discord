const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    PermissionFlagsBits,
} = require('discord.js');
const config = require('../config');
const { getActivePrefixes } = require('../database');

// Metadata for all commands to display in /help.
// When adding a new command, just add one line here.
// "note" is extra info (cooldown, admin-only, etc.) shown in italic & separated.
const COMMAND_INFO = [
    {
        name: 'start',
        category: 'economy',
        emoji: '🚀',
        usage: 'start',
        desc: '🌙 **Start here** — beginner guide, how to play, and your starter balance.',
    },
    {
        name: 'coin',
        category: 'economy',
        emoji: '💰',
        usage: 'coin [user]',
        desc: 'Check your balance, or someone else\'s if mentioned.',
    },
    {
        name: 'daily',
        category: 'economy',
        emoji: '🎁',
        usage: 'daily',
        desc: `Claim a daily reward of **${config.dailyAmount} ${config.currencyName}**.`,
        note: `Cooldown ${config.dailyCooldownHours} hours`,
    },
    {
        name: 'work',
        category: 'economy',
        emoji: '🧭',
        usage: 'work [dungeon:forest|mine|ruins|abyss]',
        desc: '🧭 **Expedition** — explore a dungeon for steady coins + loot. Your reliable daily income (no fighting).',
        note: `Cooldown ${config.workCooldownMinutes} minutes`,
    },
    {
        name: 'leaderboard',
        category: 'economy',
        emoji: '🏆',
        usage: 'leaderboard',
        desc: 'See the top 10 users with the highest balance in the server.',
    },
    {
        name: 'level',
        category: 'economy',
        emoji: '⭐',
        usage: 'level [user]',
        desc: 'View your RPG level, XP progress card, and milestone crate rewards.',
    },
    {
        name: 'transfer',
        category: 'economy',
        emoji: '💸',
        usage: 'transfer user:<@user> amount:<n>',
        desc: 'Transfer coins from your balance to another member.',
        note: 'Aliases: "pay", "tf", "send"',
    },
    {
        name: 'shop',
        category: 'shop',
        emoji: '🛒',
        usage: 'shop',
        desc: 'See all items available to buy and their prices.',
    },
    {
        name: 'inventory',
        category: 'shop',
        emoji: '🎒',
        usage: 'inventory',
        desc: 'See all the items you own.',
    },
    {
        name: 'iteminfo',
        category: 'shop',
        emoji: '🔍',
        usage: 'iteminfo item:<name_or_id>',
        desc: 'Look up an item to see its stats and where it drops from.',
    },
    {
        name: 'buy',
        category: 'shop',
        emoji: '🛒',
        usage: 'buy item:<name_or_id> [quantity]',
        desc: 'Buy an item instantly without opening the shop menu.',
    },
    {
        name: 'customrole',
        category: 'shop',
        emoji: '✨',
        usage: 'customrole buy name:<name> color1:<hex> color2:<hex>',
        desc: 'Order your custom server role (gradient/solid) for **250,000 Coins**.',
        note: 'Prefix: lucustomrole buy <name> <#color1> <#color2>',
    },
    {
        name: 'coinflip',
        category: 'gambling',
        emoji: '🪙',
        usage: 'coinflip bet:<n> choice:<heads/tails>',
        desc: 'Coin flip bet. Guess the side, win **2x** your bet.',
    },
    {
        name: 'bomber',
        category: 'gambling',
        emoji: '💣',
        usage: 'bomber amount:<bet>',
        desc: '3x3 Mines game — reveal diamonds to multiply coins, avoid bombs, and cash out anytime.',
    },
    {
        name: 'slots',
        category: 'gambling',
        emoji: '🎰',
        usage: 'slots bet:<n>',
        desc: '3x3 slot machine. Win by matching on any of **5 paylines** — each symbol pays its own multiplier (see `/gambling`).',
    },
    {
        name: 'give',
        category: 'admin',
        emoji: '🎟️',
        usage: 'give user:<u> amount:<n>',
        desc: 'Give coins directly to a specific user.',
        note: 'Admin only',
    },
    {
        name: 'giveaway',
        category: 'admin',
        emoji: '🎉',
        usage: 'giveaway create | list | cancel',
        desc: 'Adakan giveaway berhadiah Coin — pilih hadiah, durasi, dan jumlah pemenang.',
        note: 'Admin only',
    },
    {
        name: 'gambling',
        category: 'gambling',
        emoji: '🎲',
        usage: 'gambling',
        desc: 'Show slot payout table & coinflip rules.',
        note: 'Alias: "g" (prefix); also try "<prefix> slots info"',
    },
    {
        name: 'prefix',
        category: 'admin',
        emoji: '⚙️',
        usage: 'prefix symbol:<...>',
        desc: 'Change the text command prefix specifically for this server.',
        note: 'Admin only',
    },
    {
        name: 'maintenance',
        category: 'admin',
        emoji: '🛠️',
        usage: 'maintenance [status:on|off]',
        desc: 'Toggle bot maintenance mode on or off.',
        note: 'Admin only',
    },
    {
        name: 'panel',
        category: 'admin',
        emoji: '🎛️',
        usage: 'panel send | list | preview | reload',
        desc: 'Kirim dan kelola panel interaktif dinamis dengan tombol ephemeral.',
        note: 'Admin only',
    },
    {
        name: 'open',
        category: 'shop',
        emoji: '🗝️',
        usage: 'open crate:<crate_id>',
        desc: 'Open a crate from your inventory to reveal a random item.',
        note: 'Also via prefix: luopen crate_common',
    },
    {
        name: 'craft',
        category: 'shop',
        emoji: '⚒️',
        usage: 'craft item:<id>',
        desc: 'Craft an item from materials (see /recipes).',
    },
    {
        name: 'scramble',
        category: 'economy',
        emoji: '🔤',
        usage: 'scramble',
        desc: '🔤 **Scramble Game** — Unscramble the word to win Coin rewards.',
    },
    {
        name: 'recipes',
        category: 'shop',
        emoji: '📜',
        usage: 'recipes',
        desc: 'List all crafting recipes and their materials.',
    },
    {
        name: 'equip',
        category: 'shop',
        emoji: '🎽',
        usage: 'equip',
        desc: 'View your equipped gear and pick weapons/armor from your inventory.',
    },
    {
        name: 'battle',
        category: 'shop',
        emoji: '⚔️',
        usage: 'battle',
        desc: '⚔️ **PvE Combat** — actively fight monsters for big coin rewards + rare gear drops. Harder foes as you win more.',
        note: 'Cooldown 5 minutes',
    },
    {
        name: 'mine',
        category: 'shop',
        emoji: '⛏️',
        usage: 'mine [ore] | mine status',
        desc: '⛏️ **Farming** — mine ores & materials using your own stamina. Materials feed /craft.',
        note: 'Uses stamina (regen 1 per 2 min)',
    },
    {
        name: 'quest',
        category: 'economy',
        emoji: '📜',
        usage: 'quest [view|claim]',
        desc: '📜 **Daily Quest** — complete a daily mission (battle/mine/work/sell/trade) for bonus coins & items.',
        note: 'Resets daily',
    },
    {
        name: 'sell',
        category: 'shop',
        emoji: '💰',
        usage: 'sell item:<id> [quantity] | sell category:all',
        desc: 'Sell items to the shop for 50% value. Use category:all to bulk-sell everything.',
    },
    {
        name: 'trade',
        category: 'shop',
        emoji: '🔄',
        usage: 'trade create | list | cancel | offer',
        desc: 'Marketplace pemain: jual beli item ke player lain, pasang listing, atau tawarkan item langsung.',
    },
    {
        name: 'streakleaderboard',
        category: 'economy',
        emoji: '🏆',
        usage: 'streakleaderboard',
        desc: '🏆 **Streak Leaderboard** — lihat 10 pemegang streak terpanjang di server.',
        note: 'Alias prefix: luslb',
    },
    {
        name: 'register',
        category: 'admin',
        emoji: '🛡️',
        usage: 'register streak user:<@member>',
        desc: '🛡️ **(ADMIN)** — daftarkan member lain ke sistem streak.',
        note: 'Admin only · Alias: lureg streak / lu reg streak',
    },
    {
        name: 'restore',
        category: 'economy',
        emoji: '💸',
        usage: 'restore streak',
        desc: `💸 Tebus streak yang hangus seharga **${config.streak.restoreCost.toLocaleString()} ${config.currencyName}** — streak balik, role dikembalikan.`,
        note: 'Alias prefix: lurestore streak / lu restore streak',
    },
    {
        name: 'streak',
        category: 'economy',
        emoji: '🔥',
        usage: 'streak register | setchannel | channel',
        desc: '🔥 Sistem streak.\n> • **register** — daftar sendiri (semua member)\n> • **setchannel** — **(ADMIN)** pilih channel reminder\n> • **channel** — **(ADMIN)** lihat channel aktif',
        note: 'Alias prefix: lustreak / lu streak',
    },
];

const CATEGORIES = {
    all: { label: 'All Commands', emoji: '✦', letter: '' },
    economy: { label: 'Economy', emoji: '**E.**', letter: 'E' },
    shop: { label: 'Shop', emoji: '**S.**', letter: 'S' },
    gambling: { label: 'Gambling', emoji: '**G.**', letter: 'G' },
    admin: { label: 'Admin', emoji: '**A.**', letter: 'A' },
};

// Adapter so we can filter while keeping the original list unchanged.
function visibleCommands(isAdmin) {
    if (isAdmin) return COMMAND_INFO;
    return COMMAND_INFO.filter((c) => c.category !== 'admin');
}
function visibleCategories(isAdmin) {
    const cats = Object.entries(CATEGORIES).filter(([key]) => key !== 'all');
    if (!isAdmin) return cats.filter(([key]) => key !== 'admin');
    return cats;
}

const ESSENTIAL_COMMANDS = [
    { emoji: '🚀', usage: 'start', desc: 'New player tutorial, guide & starter balance.' },
    { emoji: '💰', usage: 'coin', desc: 'Check your current coin balance.' },
    { emoji: '🎁', usage: 'daily', desc: `Claim your daily reward (**${config.dailyAmount} ${config.currencyName}**).` },
    { emoji: '🧭', usage: 'work', desc: 'Expedition for coins and crafting materials.' },
    { emoji: '⛏️', usage: 'mine', desc: 'Mine ores & raw ingredients with stamina.' },
    { emoji: '🛒', usage: 'shop', desc: 'Browse weapons, armor, relics & crates.' },
    { emoji: '🎽', usage: 'equip', desc: 'Equip or unequip weapons and armor.' },
    { emoji: '⚔️', usage: 'battle', desc: 'Fight monsters for large bounties & loot.' },
    { emoji: '🪙', usage: 'coinflip <bet> <choice>', desc: 'Double your coins with a quick 50/50 flip.' },
];

function formatCommandBlock(c, i) {
    const note = c.note ? `\n> *${c.note}*` : '';
    return `**${i + 1}.** ${c.emoji} **/${c.usage}**\n> ${c.desc}${note}`;
}

function buildEmbed(category, activePrefix, isAdmin = false) {
    const catMeta = CATEGORIES[category];

    const intro =
        `> Use slash commands \`/\` or prefix \`${activePrefix}\`, e.g. \`${activePrefix}coin\`.\n` +
        `> *Select a category from the dropdown below to explore all commands.*`;

    const commands = visibleCommands(isAdmin);
    const categories = visibleCategories(isAdmin);
    let body;
    let totalCount;

    if (category === 'all') {
        const essentialsBlock = ESSENTIAL_COMMANDS.map(
            (c, i) => `**${i + 1}.** ${c.emoji} **/${c.usage}**\n> ${c.desc}`
        ).join('\n\n');

        const catOverview = categories
            .map(([key, meta]) => {
                const count = commands.filter((c) => c.category === key).length;
                return `> ${meta.emoji} **${meta.label}** — \`${count} commands\` (choose in dropdown)`;
            })
            .join('\n');

        body =
            `## ⚡ Essential Commands\n\n` +
            essentialsBlock +
            `\n\n## 📂 Browse Categories\n` +
            catOverview;

        totalCount = commands.length;
    } else {
        const items = commands.filter((c) => c.category === category);
        body = `## ${catMeta.emoji} ${catMeta.label}\n\n` + items.map((c, i) => formatCommandBlock(c, i)).join('\n\n');
        totalCount = items.length;
    }

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🌙 Luneth Commands')
        .setDescription(`# 📖 Bot Commands Directory\n${intro}\n\n${body}`)
        .setFooter({ text: `${totalCount} commands available · Filter via dropdown below` });

    return embed;
}

function buildSelectRow(selectedCategory, isAdmin = true) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('Filter by category (E = Economy · S = Shop · G = Gambling)...')
        .addOptions(
            visibleCategories(isAdmin).map(([value, meta]) => ({
                label: meta.letter ? `${meta.letter}. ${meta.label}` : meta.label,
                value,
                default: value === selectedCategory,
            }))
        );

    return new ActionRowBuilder().addComponents(menu);
}

module.exports = {
    data: new SlashCommandBuilder().setName('help').setDescription('See all available commands'),

    // Exported so the dropdown listener in index.js can use it
    buildEmbed,
    buildSelectRow,

    async execute(interaction) {
        const isAdmin = !!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
        const [activePrefix] = await getActivePrefixes(interaction.guild?.id, config.prefix, config.prefixAliases);
        await interaction.reply({
            embeds: [buildEmbed('all', activePrefix, isAdmin)],
            components: [buildSelectRow('all', isAdmin)],
        });
    },
};