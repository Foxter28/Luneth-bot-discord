const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const config = require('./config');

// Build the welcome/tutorial embed shown to brand-new players on their first command.
function buildWelcomeEmbed(activePrefix, userId) {
  const steps = [
    `**1.** ${config.coinResultEmote} **Check Wallet**\n> Type \`/coin\` or \`${activePrefix}coin\` (Starter balance: **${config.startingBalance} ${config.currencyName}** ${config.coinResultEmote})`,
    `**2.** <:economy:1547167467896307733> **Daily Reward**\n> Claim daily bonus with \`/daily\` (**500 ${config.currencyName}**)`,
    `**3.** <:economy:1547167467896307733> **Expedition / Work**\n> Explore dungeons via \`/work\` (**60–700 ${config.currencyName}** + loot)`,
    `**4.** <:adventure:1547167417887752192> **Mining & Gathering**\n> Mine materials via \`/mine\` for \`/craft\``,
    `**5.** <:shop:1547167662658953306> **Shop & Equip**\n> Buy equipment in \`/shop\`, then wear it with \`/equip\``,
    `**6.** <:adventure:1547167417887752192> **Battle & Boss**\n> Fight monsters via \`/battle\` for rare drops & coins`,
    `**7.** <:quest:1546426070771834880> **Daily Quest**\n> Complete daily missions with \`/quest\` for extra rewards`,
  ];

  const mention = userId ? `<@${userId}>` : 'there';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🌙 Welcome to Luneth!')
    .setDescription(
      `# 🌟 Adventure Begins!\n` +
      `> *A Moon & Fantasy economy adventure.*\n\n` +
      `Hello ${mention}! You received a starter balance of **${config.startingBalance} ${config.currencyName} ${config.coinResultEmote}**.\n\n` +
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
      { label: 'Economy', value: 'economy', emoji: '<:economy:1547167467896307733>' },
      { label: 'Shop', value: 'shop', emoji: '<:shop:1547167662658953306>' },
      { label: 'Adventure', value: 'adventure', emoji: '<:adventure:1547167417887752192>' },
      { label: 'Gambling', value: 'gambling', emoji: '<:gambling:1547167541791563797>' },
      { label: 'Games', value: 'games', emoji: '<:games:1547167596741398528>' },
      { label: 'Admin', value: 'admin', emoji: '<:admin:1547167312757399552>' },
    ]);
  return new ActionRowBuilder().addComponents(menu);
}

module.exports = { buildWelcomeEmbed, buildWelcomeSelect };
