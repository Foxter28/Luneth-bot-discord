const path = require('path');
const fs = require('fs');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const config = require('./config');
const { formatNumber } = require('./util');

const LEVELUP_IMAGE_PATH = path.resolve(__dirname, '../public/asset/levelup.png');

/**
 * Creates a separate Level Up Embed and Attachment if the user leveled up.
 * @param {Object} levelResult - The result returned from addXp()
 * @returns {{ embed: EmbedBuilder, file: AttachmentBuilder | null } | null}
 */
function createLevelUpEmbed(levelResult) {
  if (!levelResult || !levelResult.leveledUp) return null;

  const hasImage = fs.existsSync(LEVELUP_IMAGE_PATH);
  const file = hasImage ? new AttachmentBuilder(LEVELUP_IMAGE_PATH, { name: 'levelup.png' }) : null;

  const lines = [
    `🎉 You reached **Level ${levelResult.newLevel}**!\n`,
    `🎁 **Level Up Rewards:**`,
    `╰ 💰 **+${formatNumber(levelResult.totalCoinsReward)} ${config.currencyName}**`,
  ];

  if (levelResult.cratesReward && levelResult.cratesReward.length > 0) {
    const shopItems = require('./shopItems');
    const crateDesc = levelResult.cratesReward
      .map((cId) => {
        const it = shopItems.find((i) => i.id === cId);
        return `${it ? it.emoji : '🎁'} **${it ? it.name : 'Crate'}**`;
      })
      .join(', ');
    lines.push(`╰ ${crateDesc}`);
  }

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🎉 LEVEL UP!')
    .setDescription(lines.join('\n'));

  if (hasImage) {
    embed.setThumbnail('attachment://levelup.png');
  }

  return { embed, file };
}

module.exports = {
  LEVELUP_IMAGE_PATH,
  createLevelUpEmbed,
};
