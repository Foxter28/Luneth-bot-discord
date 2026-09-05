const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const config = require('./config');

// Build the welcome/tutorial embed shown to brand-new players on their first command.
function buildWelcomeEmbed(activePrefix, userId) {
  const steps = [
    `**1.** 💰 **Check Wallet**\n> Type \`/coin\` or \`${activePrefix}coin\` (Starter balance: **${config.startingBalance} ${config.currencyName}** 🪙)`,
    `**2.** 🎁 **Daily Reward**\n> Claim daily bonus with \`/daily\` (**500 ${config.currencyName}**)`,
    `**3.** 🧭 **Expedition / Work**\n> Explore dungeons via \`/work\` (**60–700 ${config.currencyName}** + loot)`,
    `**4.** ⛏️ **Mining & Gathering**\n> Mine materials via \`/mine\` for \`/craft\``,
    `**5.** 🛒 **Shop & Equip**\n> Buy equipment in \`/shop\`, then wear it with \`/equip\``,
    `**6.** ⚔️ **Battle & Boss**\n> Fight monsters via \`/battle\` for rare drops & coins`,
    `**7.** 📜 **Daily Quest**\n> Complete daily missions with \`/quest\` for extra rewards`,
  ];

  const mention = userId ? `<@${userId}>` : 'there';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🌙 Welcome to Luneth!')
    .setDescription(
      `# 🌟 Adventure Begins!\n` +
      `> *A Moon & Fantasy economy adventure.*\n\n` +
      `Hello ${mention}! You received a starter balance of **${config.startingBalance} ${config.currencyName} 🪙**.\n\n` +
      `## 📖 Getting Started Guide\n\n` +
      steps.join('\n\n') +
      `\n\n` +
      `## 💡 Need Help?\n` +
      `> Type \`/help\` or \`${activePrefix}help\` to see all commands.`
    )
    .setFooter({ text: `Tip: You can use slash /commands or prefix '${activePrefix}'` });

  return embed;
}

function buildWelcomeSelect() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('help_category_select')
    .setPlaceholder('📂 Browse commands by category…')
    .addOptions([
      { label: 'Economy', value: 'economy', emoji: '💰' },
      { label: 'Shop', value: 'shop', emoji: '🛒' },
      { label: 'Gambling', value: 'gambling', emoji: '🎰' },
      { label: 'Admin', value: 'admin', emoji: '⚙️' },
    ]);
  return new ActionRowBuilder().addComponents(menu);
}

module.exports = { buildWelcomeEmbed, buildWelcomeSelect };
