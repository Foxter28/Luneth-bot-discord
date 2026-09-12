module.exports = {
  // Adjust to your server's theme, e.g. "Moondust" + "🌙" for Luneth
  currencyName: "Coin",
  currencySymbol: "🪙",

  startingBalance: 100,

  dailyAmount: 500,
  dailyCooldownHours: 24,

  workMin: 50,
  workMax: 200,
  workCooldownMinutes: 60,

  // Spinning coin gif emote for the coinflip animation ("being flipped" phase).
  // Custom animated emote format: "<a:emoteName:ID>"
  // How to get the ID: type \:emoteName: in a chat on your server (one that has the emote), and Discord shows the full code.
  coinSpinEmote: "<a:lunera_coinflip:1543131921276608522>",

  // Coin emote for the final result message (reveal) — static version.
  coinResultEmote: "<:LegoCoinStatic:1543125664012439552>",

  // Animation delay before revealing the result (ms)
  coinflipAnimationDelay: 1500,

  // Custom emotes
  emojis: {
    warning: '<:warning:1546422653420830842>',
    crown: '<:crown:1546422532117102593>',
    cannot: '<:cannot:1546422441125879818>',
    quest: '<:quest:1546426070771834880>',
  },

  // DEFAULT prefix for plain text commands. "prefix" is the main one,
  // "prefixAliases" is a list of other short forms that ALSO work for the same commands.
  // Example: "lunecoin" and "lucoin" both run the /coin command.
  // This runs ALONGSIDE slash commands "/", it doesn't replace them.
  // Each server can set its own custom prefix with "/prefix symbol:<...>" (see commands/prefix.js) —
  // once customized, only that custom prefix works in that server (default aliases are no longer used).
  prefix: "lune",
  prefixAliases: ["lu"],

  // Maintenance configuration
  maintenance: {
    // Only commands executed in this testing/dev channel bypass maintenance mode for regular users
    allowedChannelId: "1546029883652837476",
  },

  // Special Server Roles configuration
  specialRoles: {
    // 👑 Mythic Hero role (buyable in shop for 50,000 coins)
    mythicHeroRoleId: "1546026397472915487",
    mythicHeroPrice: 50000,

    // ⚜️ Luneth Patron role (automatically granted to Leaderboard #1 richest user)
    lunethPatronRoleId: "1546025783682666539",

    // Custom Role creation settings
    customRolePrice: 250000,
    staffNotificationChannelId: "1546040608173465680",
    // Role boundary anchors (custom roles are placed under topDivider and above bottomDivider)
    topDividerRoleId: "1539641300125491322", // 🧁
    bottomDividerRoleId: "1540916755520553060", // ༎ຶ‿༎ຶ
  },

  // Streak system
  streak: {
    restoreCost: 5000,
    // Reminder times (WIB / UTC+7). index.js schedules node-cron at these,
    // always with timezone 'Asia/Jakarta'.
    reminderCron: [
      { hour: 12, minute: 0 },
      { hour: 18, minute: 0 },
    ],
    reminderRoleIds: ['1521728913376804955'], // <- isi role ID yang ingin di-tag saat reminder
    milestoneRoles: [
      { days: 3,  roleId: '1521728913376804955' },
      { days: 7,  roleId: '1521728955047084162' },
      { days: 14, roleId: '1521728999548780714' },
      { days: 21, roleId: '1521729045614694420' },
      { days: 30, roleId: '1521725050447724604' },
    ],
  },
};