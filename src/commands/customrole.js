const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { getUser, updateBalance, getCustomRole, setCustomRole, deleteCustomRole } = require('../database');
const config = require('../config');

// Helper to validate and normalize hex colors (#RRGGBB or RRGGBB)
function isValidHex(hex) {
  return /^#?[0-9A-Fa-f]{6}$/.test(hex);
}

function normalizeHex(hex) {
  return hex.startsWith('#') ? hex : `#${hex}`;
}

// Generate simple SVG linear gradient badge buffer for role icon
function createGradientSvgBuffer(c1, c2) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}" />
      <stop offset="100%" stop-color="${c2}" />
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="28" fill="url(#grad)" />
</svg>`;
  return Buffer.from(svg, 'utf-8');
}

// Position custom role safely between 🧁 (top anchor) and ༎ຶ‿༎ຶ (bottom anchor)
async function positionRoleProperly(guild, role) {
  try {
    const topId = config.specialRoles?.topDividerRoleId;
    const bottomId = config.specialRoles?.bottomDividerRoleId;

    const topRole = topId ? guild.roles.cache.get(topId) : null;
    const bottomRole = bottomId ? guild.roles.cache.get(bottomId) : null;

    if (topRole) {
      // Put directly below topDivider (position = topRole.position - 1)
      const targetPos = Math.max(1, topRole.position - 1);
      await role.setPosition(targetPos);
    } else if (bottomRole) {
      // Fallback: put directly above bottomDivider
      const targetPos = bottomRole.position + 1;
      await role.setPosition(targetPos);
    }
  } catch (err) {
    console.warn('⚠️ Could not set custom role position (hierarchy limit or missing permissions):', err.message);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('customrole')
    .setDescription('Create or customize your own server role with Luneth coins')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription(`Buy and create a custom role (${config.specialRoles?.customRolePrice || 250000} coins)`)
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Name for your custom role').setRequired(true).setMaxLength(50)
        )
        .addStringOption((opt) =>
          opt.setName('color').setDescription('Hex color code (e.g. #FF007F)').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('color2').setDescription('Second color for gradient badge (optional, e.g. #00F5D4)').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('Edit your existing custom role name or color (Free)')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('New name for your custom role').setRequired(false).setMaxLength(50)
        )
        .addStringOption((opt) =>
          opt.setName('color').setDescription('New primary hex color code (e.g. #FF007F)').setRequired(false)
        )
        .addStringOption((opt) =>
          opt.setName('color2').setDescription('New second color for gradient badge (e.g. #00F5D4)').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription('View info about your custom role')
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete your custom role (Irreversible, no refund)')
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Command ini hanya bisa digunakan di dalam server.', flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guild = interaction.guild;
    const price = config.specialRoles?.customRolePrice || 250000;

    // --- CREATE ---
    if (sub === 'create') {
      const existing = await getCustomRole(userId, guild.id);
      if (existing) {
        return interaction.reply({
          content: `❌ Kamu sudah memiliki custom role: <@&${existing.roleId}>! Gunakan \`/customrole edit\` jika ingin mengubah nama atau warna.`,
          flags: 64,
        });
      }

      const roleName = interaction.options.getString('name').trim();
      const rawColor = interaction.options.getString('color').trim();
      const rawColor2 = interaction.options.getString('color2')?.trim();

      if (!isValidHex(rawColor)) {
        return interaction.reply({
          content: '❌ Format warna hex tidak valid! Gunakan format 6 digit seperti `#FF007F`, `#00F5D4`, atau `9B5DE5`.',
          flags: 64,
        });
      }
      if (rawColor2 && !isValidHex(rawColor2)) {
        return interaction.reply({
          content: '❌ Format warna ke-2 (gradient) tidak valid! Gunakan format seperti `#00F5D4`.',
          flags: 64,
        });
      }
      const hexColor = normalizeHex(rawColor);
      const hexColor2 = rawColor2 ? normalizeHex(rawColor2) : null;

      const user = await getUser(userId);
      if (user.balance < price) {
        return interaction.reply({
          content: `❌ Koin kamu tidak cukup! Kamu butuh **${price.toLocaleString()} ${config.currencyName}** (saldo kamu saat ini: **${user.balance.toLocaleString()} ${config.currencyName}**).`,
          flags: 64,
        });
      }

      await interaction.deferReply();

      // Check bot permissions
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.editReply({
          content: '❌ Bot memerlukan izin **Manage Roles** di server ini untuk membuat custom role.',
        });
      }

      try {
        // Create role without extra permissions/settings
        const roleData = {
          name: roleName,
          color: hexColor,
          hoist: false,
          mentionable: false,
          reason: `Luneth Custom Role for ${interaction.user.tag} (${userId})`,
        };

        if (hexColor2) {
          roleData.icon = createGradientSvgBuffer(hexColor, hexColor2);
        }

        const createdRole = await guild.roles.create(roleData);

        // Position role below 🧁 and above ༎ຶ‿༎ຶ
        await positionRoleProperly(guild, createdRole);

        // Assign to user
        const member = await guild.members.fetch(userId);
        if (member) {
          await member.roles.add(createdRole.id);
        }

        // Deduct coins & save in database
        const savedColor = hexColor2 ? `${hexColor}|${hexColor2}` : hexColor;
        await updateBalance(userId, -price);
        await setCustomRole(userId, guild.id, createdRole.id, roleName, savedColor);

        const embed = new EmbedBuilder()
          .setTitle('✨ Custom Role Berhasil Dibuat!')
          .setColor(hexColor)
          .setDescription(
            `Selamat! Custom role kamu telah resmi dibuat dan dipasang ke profilmu:\n\n` +
            `🏷️ **Role:** <@&${createdRole.id}>\n` +
            `🎨 **Color:** \`${hexColor}\`${hexColor2 ? ` ➔ \`${hexColor2}\` *(Gradient Badge)*` : ''}\n` +
            `💰 **Biaya:** **${price.toLocaleString()} ${config.currencyName}**\n\n` +
            `*Role diposisikan secara eksklusif!.*`
          )
          .setFooter({ text: `Sisa saldo: ${(user.balance - price).toLocaleString()} ${config.currencyName}` });

        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error('❌ Error creating custom role:', err);
        return interaction.editReply({
          content: `❌ Gagal membuat role. Error: \`${err.message}\`. Pastikan role bot berada di hierarki tinggi server!`,
        });
      }
    }

    // --- EDIT ---
    if (sub === 'edit') {
      const record = await getCustomRole(userId, guild.id);
      if (!record) {
        return interaction.reply({
          content: `❌ Kamu belum memiliki custom role. Buat role baru dengan \`/customrole create\`.`,
          flags: 64,
        });
      }

      const role = guild.roles.cache.get(record.roleId);
      if (!role) {
        await deleteCustomRole(userId, guild.id);
        return interaction.reply({
          content: `❌ Role Discord custom kamu tidak ditemukan (mungkin telah dihapus dari server). Data telah direset, kamu dapat membuat role baru.`,
          flags: 64,
        });
      }

      const newName = interaction.options.getString('name')?.trim();
      const rawColor = interaction.options.getString('color')?.trim();
      const rawColor2 = interaction.options.getString('color2')?.trim();

      if (!newName && !rawColor && !rawColor2) {
        return interaction.reply({
          content: `❌ Berikan setidaknya satu opsi (\`name\`, \`color\`, atau \`color2\`) untuk diedit.`,
          flags: 64,
        });
      }

      const [storedC1, storedC2] = (record.roleColor || '#ffffff').split('|');
      let newColor = storedC1 || '#ffffff';
      let newColor2 = storedC2 || null;

      if (rawColor) {
        if (!isValidHex(rawColor)) {
          return interaction.reply({
            content: '❌ Format warna hex tidak valid! Gunakan format seperti `#FF007F`.',
            flags: 64,
          });
        }
        newColor = normalizeHex(rawColor);
      }
      if (rawColor2) {
        if (!isValidHex(rawColor2)) {
          return interaction.reply({
            content: '❌ Format warna ke-2 hex tidak valid! Gunakan format seperti `#00F5D4`.',
            flags: 64,
          });
        }
        newColor2 = normalizeHex(rawColor2);
      }

      const finalName = newName || record.roleName;

      await interaction.deferReply();
      try {
        const editData = {
          name: finalName,
          color: newColor,
        };

        if (newColor2) {
          editData.icon = createGradientSvgBuffer(newColor, newColor2);
        }

        await role.edit(editData);

        await positionRoleProperly(guild, role);
        const savedColor = newColor2 ? `${newColor}|${newColor2}` : newColor;
        await setCustomRole(userId, guild.id, role.id, finalName, savedColor);

        const embed = new EmbedBuilder()
          .setTitle('🎨 Custom Role Diperbarui!')
          .setColor(newColor)
          .setDescription(
            `Custom role kamu berhasil diperbarui:\n\n` +
            `🏷️ **Role:** <@&${role.id}>\n` +
            `📝 **Nama:** **${finalName}**\n` +
            `🎨 **Warna:** \`${newColor}\`${newColor2 ? ` ➔ \`${newColor2}\` *(Gradient Badge)*` : ''}`
          );

        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error('❌ Error editing custom role:', err);
        return interaction.editReply({
          content: `❌ Gagal mengedit custom role: \`${err.message}\``,
        });
      }
    }

    // --- INFO ---
    if (sub === 'info') {
      const record = await getCustomRole(userId, guild.id);
      if (!record) {
        return interaction.reply({
          content: `ℹ️ Kamu belum memiliki custom role. Gunakan \`/customrole create\` untuk membuatnya seharga **${price.toLocaleString()} ${config.currencyName}**.`,
          flags: 64,
        });
      }

      const role = guild.roles.cache.get(record.roleId);
      const embed = new EmbedBuilder()
        .setTitle('🏷️ Custom Role Info')
        .setColor(role ? role.hexColor : 0x9b59b6)
        .addFields(
          { name: 'Role', value: role ? `<@&${role.id}>` : `*(Role terhapus: ID ${record.roleId})*`, inline: true },
          { name: 'Color', value: `\`${record.roleColor}\``, inline: true },
          { name: 'Created At', value: `<t:${Math.floor(record.createdAt / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: 'Gunakan /customrole edit untuk mengganti nama atau warna gratis kapan saja.' });

      return interaction.reply({ embeds: [embed] });
    }

    // --- DELETE ---
    if (sub === 'delete') {
      const record = await getCustomRole(userId, guild.id);
      if (!record) {
        return interaction.reply({ content: `❌ Kamu tidak memiliki custom role.`, flags: 64 });
      }

      await interaction.deferReply();
      try {
        const role = guild.roles.cache.get(record.roleId);
        if (role) {
          await role.delete('Custom role deleted by owner via /customrole delete');
        }
        await deleteCustomRole(userId, guild.id);

        return interaction.editReply({
          content: `🗑️ Custom role kamu telah berhasil dihapus.`,
        });
      } catch (err) {
        console.error('❌ Error deleting custom role:', err);
        return interaction.editReply({
          content: `❌ Gagal menghapus role: \`${err.message}\``,
        });
      }
    }
  },
};
