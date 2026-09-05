const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getQuest, setQuestClaimed, updateBalance, addItem } = require('../database');
const shopItems = require('../shopItems');
const config = require('../config');
const { formatNumber } = require('../util');

// Bonus item given when claiming a daily quest (small reward).
const QUEST_BONUS_ITEM = 'silver_ingot';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quest')
    .setDescription('📜 View & claim your daily quest')
    .addStringOption((opt) =>
      opt
        .setName('action')
        .setDescription('Action: view (default) or claim reward')
        .setRequired(false)
        .addChoices(
          { name: '📜 View', value: 'view' },
          { name: '🎁 Claim', value: 'claim' }
        )
    ),

  async execute(interaction) {
    const action = interaction.options.getString('action') || 'view';
    const quest = await getQuest(interaction.user.id);

    const progressBar = (p, g) => {
      const filled = Math.round((p / g) * 10);
      return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
    };

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('📜 Daily Quest')
      .setDescription(
        `**${quest.label}**\n\n` +
          `${progressBar(quest.progress, quest.goal)} **${quest.progress}/${quest.goal}**\n\n` +
          `🎁 **Reward:** ${formatNumber(quest.reward)} ${config.currencyName} + 1x ${(() => {
            const it = shopItems.find((i) => i.id === QUEST_BONUS_ITEM);
            return it ? `${it.emoji} ${it.name}` : 'item';
          })()}\n` +
          `**Progress:** ${quest.claimed ? '✅ Completed & claimed!' : quest.progress >= quest.goal ? '✅ Goal reached — click **Claim**!' : 'Keep going to complete it!'}`
      )
      .setFooter({ text: `Resets daily · use /quest claim to collect` });

    // ── Claim logic ──
    if (action === 'claim') {
      if (quest.claimed) {
        return interaction.reply({ embeds: [embed.setFooter({ text: 'Quest already claimed today.' })], flags: 64 });
      }
      if (quest.progress < quest.goal) {
        return interaction.reply({
          content: `❌ Quest not complete yet! Progress: **${quest.progress}/${quest.goal}**.`,
          flags: 64,
        });
      }

      // Grant reward
      await updateBalance(interaction.user.id, quest.reward);
      const item = shopItems.find((i) => i.id === QUEST_BONUS_ITEM);
      if (item) await addItem(interaction.user.id, item.id, 1);
      await setQuestClaimed(interaction.user.id);

      const claimEmbed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('🎉 Quest Complete!')
        .setDescription(
          `✅ You claimed **${formatNumber(quest.reward)} ${config.currencyName}**${item ? ` and **${item.emoji} ${item.name}**` : ''}!`
        )
        .setFooter({ text: 'Come back tomorrow for a new quest!' });
      return interaction.reply({ embeds: [claimEmbed] });
    }

    // ── View defaults ──
    return interaction.reply({ embeds: [embed] });
  },

  QUEST_BONUS_ITEM,
};
