const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { getUser, updateBalance, setCustomRole } = require('../database');
const config = require('../config');

// Helper to validate and normalize hex colors (#RRGGBB or RRGGBB)
function isValidHex(hex) {
  return /^#?[0-9A-Fa-f]{6}$/.test(hex);
}

function normalizeHex(hex) {
  return hex.startsWith('#') ? hex : `#${hex}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('customrole')
    .setDescription('Order a custom server role (Gradient/Solid) created by Server Staff')
    .addSubcommand((sub) =>
      sub
        .setName('buy')
        .setDescription(`Order a custom role (${config.specialRoles?.customRolePrice || 250000} coins)`)
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Desired role name').setRequired(true).setMaxLength(50)
        )
        .addStringOption((opt) =>
          opt.setName('color1').setDescription('First hex color code (e.g. #FF007F)').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('color2').setDescription('Second hex color code / gradient (e.g. #00F5D4)').setRequired(true)
        )
    ),
  aliases: ['buycustomrole'],

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ This command can only be used inside a server.', flags: 64 });
    }

    const userId = interaction.user.id;
    const guild = interaction.guild;
    const price = config.specialRoles?.customRolePrice || 250000;
    const staffChannelId = config.specialRoles?.staffNotificationChannelId || '1546040608173465680';
    const originalChannelId = interaction.channelId;

    const roleName = interaction.options.getString('name')?.trim() || '';
    const rawColor1 = interaction.options.getString('color1')?.trim() || '';
    const rawColor2 = interaction.options.getString('color2')?.trim() || '';

    if (!roleName || !rawColor1 || !rawColor2) {
      return interaction.reply({
        content: `❌ Invalid format! Use: \`/customrole buy name:<name> color1:<hex1> color2:<hex2>\`\n*Prefix example: \`lucustomrole buy Shadow Knight #FF007F #00F5D4\`*`,
        flags: 64,
      });
    }

    if (!isValidHex(rawColor1) || !isValidHex(rawColor2)) {
      return interaction.reply({
        content: '❌ Invalid hex color code! Please provide valid 6-digit hex codes like `#FF007F` and `#00F5D4`.',
        flags: 64,
      });
    }

    const hex1 = normalizeHex(rawColor1);
    const hex2 = normalizeHex(rawColor2);

    const user = await getUser(userId);
    if (user.balance < price) {
      return interaction.reply({
        content: `❌ Insufficient balance! You need **${price.toLocaleString()} ${config.currencyName}** (Your balance: **${user.balance.toLocaleString()} ${config.currencyName}**).`,
        flags: 64,
      });
    }

    await interaction.deferReply();

    // 1. Deduct balance
    await updateBalance(userId, -price);

    // 2. Send order notification to staff channel with Accept Button
    try {
      const staffChannel = await guild.channels.fetch(staffChannelId).catch(() => null);
      if (staffChannel) {
        const staffEmbed = new EmbedBuilder()
          .setTitle('📥 NEW CUSTOM ROLE ORDER')
          .setColor(hex1)
          .setDescription(
            `A member has purchased a **Custom Role** and is awaiting manual creation by Staff/Owner!\n\n` +
              `👤 **Buyer:** <@${userId}> (\`${interaction.user.tag}\` | \`${userId}\`)\n` +
              `🏷️ **Role Name:** **${roleName}**\n` +
              `🎨 **Color 1:** \`${hex1}\`\n` +
              `🎨 **Color 2 (Gradient):** \`${hex2}\`\n` +
              `📍 **Ordered in Channel:** <#${originalChannelId}>\n` +
              `💰 **Payment Status:** ✅ **${price.toLocaleString()} ${config.currencyName} (Paid)**\n\n` +
              `*Staff: Once you have created and assigned the role, click the **Accept & Notify** button below!*`
          )
          .setThumbnail(interaction.user.displayAvatarURL())
          .setTimestamp();

        // CustomId encodes: buyerId, channelId, roleName (truncated if needed)
        const safeRoleName = roleName.slice(0, 30).replace(/[:|]/g, '');
        const acceptBtn = new ButtonBuilder()
          .setCustomId(`customrole_accept:${userId}:${originalChannelId}:${encodeURIComponent(safeRoleName)}`)
          .setLabel('✅ Accept & Notify Member')
          .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(acceptBtn);

        await staffChannel.send({
          content: `🔔 **Staff Alert:** @here Custom role order from <@${userId}>!`,
          embeds: [staffEmbed],
          components: [row],
        });
      }
    } catch (err) {
      console.error('❌ Error sending notification to staff channel:', err);
    }

    // 3. Save pending record in database
    await setCustomRole(userId, guild.id, 'PENDING_STAFF', roleName, `${hex1}|${hex2}`);

    // 4. Send receipt to buyer
    const userEmbed = new EmbedBuilder()
      .setTitle('🎉 Custom Role Order Submitted!')
      .setColor(hex1)
      .setDescription(
        `Your Custom Role order has been successfully sent to the Server Staff/Owner:\n\n` +
          `🏷️ **Role Name:** **${roleName}**\n` +
          `🎨 **Color 1:** \`${hex1}\`\n` +
          `🎨 **Color 2:** \`${hex2}\`\n` +
          `💰 **Cost:** **${price.toLocaleString()} ${config.currencyName}**\n\n` +
          `⏳ *Your request is now queued. Once Staff creates your role, you will receive an instant notification here!*`
      )
      .setFooter({ text: `Remaining balance: ${(user.balance - price).toLocaleString()} ${config.currencyName}` });

    return interaction.editReply({ embeds: [userEmbed] });
  },

  // Component interaction handler for the Staff Accept button
  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.customId.startsWith('customrole_accept:')) {
      return false;
    }

    const isGuildOwner = interaction.guild && interaction.guild.ownerId === interaction.user.id;
    const isStaff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles) ||
                    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
                    isGuildOwner;

    if (!isStaff) {
      await interaction.reply({
        content: '❌ Only Server Staff/Admins can accept this order.',
        flags: 64,
      });
      return true;
    }

    const parts = interaction.customId.split(':');
    const buyerId = parts[1];
    const originalChannelId = parts[2];
    const roleName = decodeURIComponent(parts[3] || 'Custom Role');

    // 1. Notify the original channel where user ordered
    try {
      const targetChannel = await interaction.guild.channels.fetch(originalChannelId).catch(() => null);
      if (targetChannel) {
        const notifyEmbed = new EmbedBuilder()
          .setTitle('✨ Your Custom Role is Ready!')
          .setColor(0x2ecc71)
          .setDescription(
            `Hey <@${buyerId}>! 🎉\n\n` +
              `Your **Custom Role** (**${roleName}**) has been created and approved by Staff (<@${interaction.user.id}>)!\n` +
              `The role is now active on your Discord profile. Enjoy! 👑`
          )
          .setTimestamp();

        await targetChannel.send({
          content: `🎉 <@${buyerId}>, your custom role is ready!`,
          embeds: [notifyEmbed],
        });
      }
    } catch (err) {
      console.error('❌ Failed to send notification to buyer channel:', err);
    }

    // 2. Update the staff embed & disable the button
    const oldEmbed = interaction.message.embeds[0];
    const updatedEmbed = EmbedBuilder.from(oldEmbed)
      .setColor(0x2ecc71)
      .setDescription(
        oldEmbed.description + `\n\n✅ **ACCEPTED & COMPLETED** by <@${interaction.user.id}> at <t:${Math.floor(Date.now() / 1000)}:R>`
      );

    const disabledBtn = new ButtonBuilder()
      .setCustomId('customrole_done')
      .setLabel(`✅ Completed by ${interaction.user.username}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const row = new ActionRowBuilder().addComponents(disabledBtn);

    await interaction.update({
      embeds: [updatedEmbed],
      components: [row],
    });

    return true;
  },
};
