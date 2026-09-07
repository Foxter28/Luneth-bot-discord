const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const TEMPLATE_PATH = path.resolve(__dirname, '../public/asset/blank-levelup.png');
let cachedTemplate = null;

// Warm-up cache on startup
if (fs.existsSync(TEMPLATE_PATH)) {
  loadImage(TEMPLATE_PATH)
    .then((img) => {
      cachedTemplate = img;
    })
    .catch(() => {});
}

async function getTemplateImage() {
  if (!cachedTemplate) {
    if (fs.existsSync(TEMPLATE_PATH)) {
      cachedTemplate = await loadImage(TEMPLATE_PATH);
    }
  }
  return cachedTemplate;
}

/**
 * Render a dynamic RPG level card buffer
 * @param {Object} options
 * @param {string} options.username - Display name of the user
 * @param {string} [options.avatarUrl] - User avatar image URL
 * @param {number} options.level - Current user level (1 - 999)
 * @param {number} options.currentXp - Current XP in current level
 * @param {number} options.neededXp - XP needed to reach next level
 * @returns {Promise<Buffer>}
 */
async function renderLevelCard({ username, avatarUrl, level, currentXp, neededXp }) {
  const template = await getTemplateImage();
  const width = template ? template.width : 2048;
  const height = template ? template.height : 768;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#06040a';
  ctx.fillRect(0, 0, width, height);

  // 1. Draw avatar inside circle
  const circleCenterX = 422;
  const circleCenterY = 360;
  const circleRadius = 136;

  ctx.save();
  ctx.beginPath();
  ctx.arc(circleCenterX, circleCenterY, circleRadius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  let avatarLoaded = false;
  if (avatarUrl) {
    try {
      const avatarImg = await loadImage(avatarUrl);
      ctx.drawImage(
        avatarImg,
        circleCenterX - circleRadius,
        circleCenterY - circleRadius,
        circleRadius * 2,
        circleRadius * 2
      );
      avatarLoaded = true;
    } catch {
      avatarLoaded = false;
    }
  }

  if (!avatarLoaded) {
    // Fallback avatar with celestial theme
    ctx.fillStyle = '#1c1232';
    ctx.fillRect(
      circleCenterX - circleRadius,
      circleCenterY - circleRadius,
      circleRadius * 2,
      circleRadius * 2
    );
    ctx.fillStyle = '#c5a3ff';
    ctx.font = 'bold 80px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌙', circleCenterX, circleCenterY);
  }
  ctx.restore();

  // 2. Draw Progress Bar (Layer underneath the semi-transparent frame)
  const isMaxLevel = level >= 999;
  const safeNeeded = isMaxLevel ? currentXp : Math.max(1, neededXp);
  const ratio = isMaxLevel ? 1 : Math.min(1, Math.max(0, currentXp / safeNeeded));

  const barStartX = 645;
  const barStartY = 366;
  const barMaxW = 825;
  const barH = 44;
  const currentW = Math.max(12, Math.min(barMaxW, barMaxW * ratio));

  ctx.save();
  const grad = ctx.createLinearGradient(barStartX, 0, barStartX + currentW, 0);
  grad.addColorStop(0, '#6c32e0');
  grad.addColorStop(0.5, '#9d68ff');
  grad.addColorStop(1, '#c59dff');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(barStartX + 10, barStartY);
  ctx.lineTo(barStartX + currentW, barStartY);
  ctx.lineTo(barStartX + currentW - 8, barStartY + barH);
  ctx.lineTo(barStartX, barStartY + barH);
  ctx.lineTo(barStartX + 10, barStartY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 3. Draw Template Frame
  if (template) {
    ctx.drawImage(template, 0, 0);
  }

  // 4. Draw Typography
  // Level Text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`Lv. ${level}`, 660, 325);

  // Separator
  ctx.fillStyle = '#6b5594';
  ctx.font = 'normal 44px sans-serif';
  const levelTextWidth = ctx.measureText(`Lv. ${level}`).width;
  const sepX = 660 + levelTextWidth + 20;
  ctx.fillText('|', sepX, 325);

  // Username (truncated if needed)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  let displayName = username || 'Player';
  if (displayName.length > 18) displayName = displayName.slice(0, 16) + '…';
  ctx.fillText(displayName, sepX + 30, 325);

  // XP Counter on the right side of the bar
  ctx.fillStyle = '#d2c0f9';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  const xpString = isMaxLevel ? 'MAX LEVEL' : `${currentXp.toLocaleString()} / ${neededXp.toLocaleString()}`;
  ctx.fillText(xpString, 1640, 400);

  return canvas.toBuffer('image/png');
}

module.exports = {
  renderLevelCard,
};
