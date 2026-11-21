const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const config = require('./config');
const { tSync: T } = require('./i18n');

// Build the welcome/tutorial embed shown to brand-new players on their first command.
function buildWelcomeEmbed(activePrefix, userId) {
  const coin = config.currencyName;
  const steps = [
    T(userId, 'welcome.step1', { emote: config.coinResultEmote, prefix: activePrefix, balance: config.startingBalance, coin }),
    T(userId, 'welcome.step2', { emote: '<:economy:1547167467896307733>', coin }),
    T(userId, 'welcome.step3', { emote: '<:economy:1547167467896307733>', coin }),
    T(userId, 'welcome.step4', { emote: '<:adventure:1547167417887752192>' }),
    T(userId, 'welcome.step5', { emote: '<:shop:1547167662658953306>' }),
    T(userId, 'welcome.step6', { emote: '<:adventure:1547167417887752192>' }),
    T(userId, 'welcome.step7', { emote: '<:quest:1546426070771834880>' }),
  ];

  const mention = userId ? `<@${userId}>` : 'there';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(T(userId, 'welcome.title'))
    .setDescription(
      T(userId, 'welcome.header', { mention, balance: config.startingBalance, coin, steps: steps.join('\n\n'), prefix: activePrefix })
    )
    .setFooter({ text: T(userId, 'welcome.footer', { prefix: activePrefix }) });

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
