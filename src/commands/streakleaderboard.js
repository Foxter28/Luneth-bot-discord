const path = require('path');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getStreakLeaderboard } = require('../database');
const { tSync: T } = require('../i18n');

const RANK_EMOJI = ['<:crown:1546422532117102593>', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const STREAK_IMAGE = path.join(__dirname, '..', '..', 'public', 'asset', 'streak.png');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('streakleaderboard')
    .setDescription('🔥 See the top streak holders (admin: manage with /streak)'),
  // Prefix aliases — these all work with the main prefix (e.g. "lulbs", "luslb",
  // "lustreaklb", "lustreakleaderboard"):
  //   "lulbs"  = lu + lbs
  //   "luslb"  = lu + slb
  //   "lustreaklb" = lu + streaklb
  //   "lustreakleaderboard" = lu + streakleaderboard
  //   "lustreakboard" = lu + streakboard
  aliases: ['slb', 'lbs', 'streaklb', 'streakleaderboard', 'streakboard'],

  async execute(interaction) {
    const top = await getStreakLeaderboard(10);
    if (top.length === 0) {
      return interaction.reply('🔥 No active streaks yet. Chat in any channel to start one! 🔥');
    }

    const lines = top.map((u, i) => {
      const rank = RANK_EMOJI[i] ?? `\`#${i + 1}\``;
      const days = T(interaction.user.id, 'streakboard.days', { n: u.current_streak });
      if (i === 0) return `${rank}  __<@${u.userId}>__\n╰ ${days}`;
      if (i < 3) return `${rank}  <@${u.userId}>\n╰ ${days}`;
      return `${rank}  <@${u.userId}> — ${days}`;
    });

    // Caller's own position
    let selfLine = null;
    const selfIndexInTop = top.findIndex((u) => u.userId === interaction.user.id);
    if (selfIndexInTop !== -1) {
      selfLine = `-# Your position: #${selfIndexInTop + 1} (top 10! 🎉)`;
    } else {
      const wider = await getStreakLeaderboard(100);
      const selfIndex = wider.findIndex((u) => u.userId === interaction.user.id);
      selfLine =
        selfIndex !== -1
          ? T(interaction.user.id, 'streakboard.selfPos', { rank: selfIndex + 1, n: wider[selfIndex].current_streak })
          : `-# You don't have an active streak yet. Chat anywhere to start! 🔥`;
    }

    const description = [
      '# 🔥 Streak Leaderboard',
      'Player rankings by streak days (24h chat per day)',
      '',
      lines.join('\n\n'),
      ...(selfLine ? ['', selfLine] : []),
    ].join('\n');

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setDescription(description)
      .setThumbnail('attachment://streak.png')
      .setFooter({ text: `Requested by ${interaction.user.username}` })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      files: [{ attachment: STREAK_IMAGE, name: 'streak.png' }],
      allowedMentions: { parse: [] },
    });
  },
};
