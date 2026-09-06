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
          opt.setName('color').setDescription('Hex color code (e.g. #FF007F or #00F5D4)').setRequired(true)
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
          opt.setName('color').setDescription('New hex color code (e.g. #FF007F)').setRequired(false)
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

      if (!isValidHex(rawColor)) {
        return interaction.reply({
          content: '❌ Format warna hex tidak valid! Gunakan format 6 digit seperti `#FF007F`, `#00F5D4`, atau `9B5DE5`.',
          flags: 64,
        });
      }
      const hexColor = normalizeHex(rawColor);

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
        const createdRole = await guild.roles.create({
          name: roleName,
          color: hexColor,
          hoist: false,
          mentionable: false,
          reason: `Luneth Custom Role for ${interaction.user.tag} (${userId})`,
        });

        // Position role below 🧁 and above ༎ຶ‿༎ຶ
        await positionRoleProperly(guild, createdRole);

        // Assign to user
        const member = await guild.members.fetch(userId);
        if (member) {
          await member.roles.add(createdRole.id);
        }

        // Deduct coins & save in database
        await updateBalance(userId, -price);
        await setCustomRole(userId, guild.id, createdRole.id, roleName, hexColor);

        const embed = new EmbedBuilder()
          .setTitle('✨ Custom Role Berhasil Dibuat!')
          .setColor(hexColor)
          .setDescription(
            `Selamat! Custom role kamu telah resmi dibuat dan dipasang ke profilmu:\n\n` +
            `🏷️ **Role:** <@&${createdRole.id}>\n` +
            `🎨 **Color:** \`${hexColor}\`\n` +
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

      if (!newName && !rawColor) {
        return interaction.reply({
          content: `❌ Berikan setidaknya satu opsi (\`name\` atau \`color\`) untuk diedit.`,
          flags: 64,
        });
      }

      let newColor = record.roleColor;
      if (rawColor) {
        if (!isValidHex(rawColor)) {
          return interaction.reply({
            content: '❌ Format warna hex tidak valid! Gunakan format seperti `#FF007F`.',
            flags: 64,
          });
        }
        newColor = normalizeHex(rawColor);
      }

      const finalName = newName || record.roleName;

      await interaction.deferReply();
      try {
        await role.edit({
          name: finalName,
          color: newColor,
        });

        await positionRoleProperly(guild, role);
        await setCustomRole(userId, guild.id, role.id, finalName, newColor);

        const embed = new EmbedBuilder()
          .setTitle('🎨 Custom Role Diperbarui!')
          .setColor(newColor)
          .setDescription(
            `Custom role kamu berhasil diperbarui:\n\n` +
            `🏷️ **Role:** <@&${role.id}>\n` +
            `📝 **Nama:** **${finalName}**\n` +
            `🎨 **Warna:** \`${newColor}\``
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
