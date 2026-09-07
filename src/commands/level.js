const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getUser, getXpForLevel, MAX_LEVEL } = require('../database');
const { renderLevelCard } = require('../cardGenerator');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('⭐ View your RPG level, XP progress card, and rewards')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Player to check (leave empty for yourself)').setRequired(false)
    ),
  aliases: ['lvl', 'rank', 'xp'],

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const user = await getUser(targetUser.id);

    const level = Math.max(1, user.level || 1);
    const currentXp = Math.max(0, user.xp || 0);
    const neededXp = getXpForLevel(level);

    const avatarUrl = targetUser.displayAvatarURL({ extension: 'png', size: 512, forceStatic: true });

    // Render dynamic level card
    const cardBuffer = await renderLevelCard({
      username: targetUser.username,
      avatarUrl,
      level,
      currentXp,
      neededXp,
    });

    const file = new AttachmentBuilder(cardBuffer, { name: 'level-card.png' });

    // Calculate next milestone
    const nextMilestone = Math.ceil((level + 0.1) / 10) * 10;
    const milestoneText = level >= MAX_LEVEL
      ? '🏆 **MAX LEVEL REACHED!**'
      : `Next Milestone: **Lv. ${nextMilestone}** (🎁 **1x Legendary Crate** + Big Coins!)`;

    const embed = new EmbedBuilder()
      .setColor(0x8e44ad)
      .setTitle(`⭐ Level Card — ${targetUser.username}`)
      .setImage('attachment://level-card.png')
      .setDescription(
        `**Level:** \`${level}/${MAX_LEVEL}\` · **XP:** \`${currentXp.toLocaleString()} / ${neededXp.toLocaleString()}\`\n` +
          `-# ${milestoneText}`
      )
      .setFooter({ text: `Requested by ${interaction.user.username}` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], files: [file] });
  },
};
