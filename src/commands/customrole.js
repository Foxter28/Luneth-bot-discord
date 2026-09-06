const {
  SlashCommandBuilder,
  EmbedBuilder,
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
    .setDescription('Beli custom role (Gradient/Warna) yang akan dibuatkan oleh Staff')
    .addSubcommand((sub) =>
      sub
        .setName('buy')
        .setDescription(`Beli custom role (${config.specialRoles?.customRolePrice || 250000} coins)`)
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Nama role yang kamu inginkan').setRequired(true).setMaxLength(50)
        )
        .addStringOption((opt) =>
          opt.setName('color1').setDescription('Warna pertama Hex code (e.g. #FF007F)').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('color2').setDescription('Warna kedua Hex code / gradient (e.g. #00F5D4)').setRequired(true)
        )
    ),
  aliases: ['buycustomrole'],

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Command ini hanya bisa digunakan di dalam server.', flags: 64 });
    }

    const userId = interaction.user.id;
    const guild = interaction.guild;
    const price = config.specialRoles?.customRolePrice || 250000;
    const staffChannelId = config.specialRoles?.staffNotificationChannelId || '1546040608173465680';

    const roleName = interaction.options.getString('name')?.trim() || '';
    const rawColor1 = interaction.options.getString('color1')?.trim() || '';
    const rawColor2 = interaction.options.getString('color2')?.trim() || '';

    if (!roleName || !rawColor1 || !rawColor2) {
      return interaction.reply({
        content: `❌ Format salah! Gunakan: \`/customrole buy name:<nama> color1:<hex1> color2:<hex2>\`\n*Contoh prefix: \`lucustomrole buy Bayangan Malam #FF007F #00F5D4\`*`,
        flags: 64,
      });
    }

    if (!isValidHex(rawColor1) || !isValidHex(rawColor2)) {
      return interaction.reply({
        content: '❌ Salah satu kode warna hex tidak valid! Pastikan format 6 digit seperti `#FF007F` dan `#00F5D4`.',
        flags: 64,
      });
    }

    const hex1 = normalizeHex(rawColor1);
    const hex2 = normalizeHex(rawColor2);

    const user = await getUser(userId);
    if (user.balance < price) {
      return interaction.reply({
        content: `❌ Koin kamu tidak cukup! Kamu butuh **${price.toLocaleString()} ${config.currencyName}** (saldo kamu saat ini: **${user.balance.toLocaleString()} ${config.currencyName}**).`,
        flags: 64,
      });
    }

    await interaction.deferReply();

    // 1. Deduct balance
    await updateBalance(userId, -price);

    // 2. Kirim notifikasi / pesanan ke channel staff
    let staffSent = false;
    try {
      const staffChannel = await guild.channels.fetch(staffChannelId).catch(() => null);
      if (staffChannel) {
        const staffEmbed = new EmbedBuilder()
          .setTitle('📥 PESANAN CUSTOM ROLE BARU')
          .setColor(hex1)
          .setDescription(
            `Ada member yang baru saja membeli **Custom Role** dan menunggu dibuatkan oleh Staff/Owner!\n\n` +
            `👤 **Pemesan:** <@${userId}> (\`${interaction.user.tag}\` | \`${userId}\`)\n` +
            `🏷️ **Nama Role:** **${roleName}**\n` +
            `🎨 **Warna 1:** \`${hex1}\`\n` +
            `🎨 **Warna 2 (Gradient):** \`${hex2}\`\n` +
            `💰 **Status Pembayaran:** ✅ **${price.toLocaleString()} ${config.currencyName} (Lunas)**\n\n` +
            `*Mohon Staff/Owner membuatkan role dan memposisikannya di bawah role pembatas Bot paling atas!.*`
          )
          .setThumbnail(interaction.user.displayAvatarURL())
          .setTimestamp();

        await staffChannel.send({
          content: `🔔 **Pemberitahuan Staff:** @here Pesanan custom role dari <@${userId}>!`,
          embeds: [staffEmbed],
        });
        staffSent = true;
      }
    } catch (err) {
      console.error('❌ Error sending notification to staff channel:', err);
    }

    // 3. Simpan record di database
    await setCustomRole(userId, guild.id, 'PENDING_STAFF', roleName, `${hex1}|${hex2}`);

    // 4. Kirim bukti pembelian ke user
    const userEmbed = new EmbedBuilder()
      .setTitle('🎉 Pembelian Custom Role Berhasil Dikirim!')
      .setColor(hex1)
      .setDescription(
        `Form pesanan Custom Role kamu telah berhasil dikirim ke Staff/Owner Server:\n\n` +
        `🏷️ **Nama Role:** **${roleName}**\n` +
        `🎨 **Warna 1:** \`${hex1}\`\n` +
        `🎨 **Warna 2:** \`${hex2}\`\n` +
        `💰 **Biaya:** **${price.toLocaleString()} ${config.currencyName}**\n\n` +
        `⏳ *Pesananmu telah masuk antrean di channel staff. Role akan segera dibuatkan dan dipasangkan langsung ke profilmu oleh Staff/Owner!*`
      )
      .setFooter({ text: `Sisa saldo: ${(user.balance - price).toLocaleString()} ${config.currencyName}` });

    return interaction.editReply({ embeds: [userEmbed] });
  },
};
