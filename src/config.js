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

  // DEFAULT prefix for plain text commands. "prefix" is the main one,
  // "prefixAliases" is a list of other short forms that ALSO work for the same commands.
  // Example: "lunecoin" and "lucoin" both run the /coin command.
  // This runs ALONGSIDE slash commands "/", it doesn't replace them.
  // Each server can set its own custom prefix with "/prefix symbol:<...>" (see commands/prefix.js) —
  // once customized, only that custom prefix works in that server (default aliases are no longer used).
  prefix: "lune",
  prefixAliases: ["lu"],
};