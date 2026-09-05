const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLeaderboard } = require('../database');
const config = require('../config');

// Emoji ranks: top 3 get medals, the rest use solid number emojis for consistency
// with the "chip" style of owo.gg (not rigid plain "4." numbers).
const RANK_EMOJI = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

function formatAmount(n) {
  return n.toLocaleString('en-US');
}

module.exports = {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('See the 10 richest users'),
  // Alias for prefix commands, so you don't have to type the long "lu leaderboard".
  // "lu" + "lb" = "lulb". Doesn't affect slash commands (still "/leaderboard").
  aliases: ['lb'],

  async execute(interaction) {
    const top = await getLeaderboard(10);
    if (top.length === 0) {
      return interaction.reply('📊 No data yet.');
    }

    // Use <@id> mentions directly, NOT manual username fetching.
    // This is the main fix for the "raw ID on leaderboard" bug: mentions are always
    // resolved to display names by Discord on the client side, so it doesn't
    // depend on whether `client.users.fetch()` succeeds or not.
    const lines = top.map((u, i) => {
      const rank = RANK_EMOJI[i] ?? `\`#${i + 1}\``;
      const amount = `**${formatAmount(u.balance)}** ${config.currencySymbol}`;

      // Top 3 get a bit of extra "visual emphasis" (bigger/underlined name)
      // so the eyes go straight to the champions, like game leaderboards.
      if (i === 0) return `${rank}  __<@${u.userId}>__\n╰ ${amount}`;
      if (i < 3) return `${rank}  <@${u.userId}>\n╰ ${amount}`;
      return `${rank}  <@${u.userId}> — ${amount}`;
    });

    // Always show the position of the caller, whether they're in the top 10 or not,
    // so anyone who runs the command knows their position without scrolling.
    let selfLine = null;
    const selfIndexInTop = top.findIndex((u) => u.userId === interaction.user.id);
    if (selfIndexInTop !== -1) {
      selfLine = `-# Your position: #${selfIndexInTop + 1} (top 10! 🎉)`;
    } else {
      const wider = await getLeaderboard(100);
      const selfIndex = wider.findIndex((u) => u.userId === interaction.user.id);
      if (selfIndex !== -1) {
        const selfData = wider[selfIndex];
        selfLine = `-# Your position: #${selfIndex + 1} • ${formatAmount(selfData.balance)} ${config.currencySymbol}`;
      } else {
        selfLine = `-# You're not in the data yet. Try \`/daily\` or \`/work\` first!`;
      }
    }

    const description = [
      `# 🏆 Richest Leaderboard`,
      `Player rankings by ${config.currencyName} balance`,
      '',
      lines.join('\n\n'),
      ...(selfLine ? ['', selfLine] : []),
    ].join('\n');

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setDescription(description)
      .setFooter({ text: `Requested by ${interaction.user.username}` })
      .setTimestamp();

    // Thumbnail of the #1 champion's avatar so the embed feels more "alive", not just text.
    try {
      const champion = await interaction.client.users.fetch(top[0].userId);
      embed.setThumbnail(champion.displayAvatarURL({ size: 256 }));
    } catch {
      // if fetching the avatar fails, the embed still renders normally without a thumbnail
    }

    // allowedMentions: parse [] -> <@id> mentions still render as clickable names,
    // but don't send notifications/pings. Important because this command can be spammed
    // (leaderboard called many times), so people in the top 10 shouldn't get ping spam.
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};