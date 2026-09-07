const fs = require('fs');
const path = require('path');
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');

const PANELS_FILE = path.join(__dirname, '..', 'panels.json');

// In-memory cache of panels loaded from panels.json
let panelsCache = {};

function loadPanels() {
  try {
    if (fs.existsSync(PANELS_FILE)) {
      const data = fs.readFileSync(PANELS_FILE, 'utf8');
      panelsCache = JSON.parse(data);
    } else {
      panelsCache = {};
    }
  } catch (err) {
    console.error('❌ Failed to load panels.json:', err.message);
  }
  return panelsCache;
}

// Initial load
loadPanels();

function parseButtonStyle(style) {
  if (!style) return ButtonStyle.Primary;
  const s = String(style).toLowerCase();
  if (s === 'primary' || s === 'blue' || s === 'blurple') return ButtonStyle.Primary;
  if (s === 'secondary' || s === 'gray' || s === 'grey') return ButtonStyle.Secondary;
  if (s === 'success' || s === 'green') return ButtonStyle.Success;
  if (s === 'danger' || s === 'red') return ButtonStyle.Danger;
  if (s === 'link' || s === 'url') return ButtonStyle.Link;
  return ButtonStyle.Primary;
}

function parseColor(color) {
  if (!color) return 0x5865f2;
  if (typeof color === 'number') return color;
  if (typeof color === 'string') {
    const clean = color.replace('#', '');
    const parsed = parseInt(clean, 16);
    if (!isNaN(parsed)) return parsed;
  }
  return 0x5865f2;
}

function buildEmbedFromData(data) {
  if (!data) return null;
  const embed = new EmbedBuilder();

  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.color) embed.setColor(parseColor(data.color));
  if (data.image) embed.setImage(data.image);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (data.footer) embed.setFooter(typeof data.footer === 'string' ? { text: data.footer } : data.footer);
  if (data.author) embed.setAuthor(typeof data.author === 'string' ? { name: data.author } : data.author);
  if (data.url) embed.setURL(data.url);
  if (data.timestamp) embed.setTimestamp(data.timestamp === true ? new Date() : new Date(data.timestamp));

  if (Array.isArray(data.fields)) {
    embed.addFields(
      data.fields.map((f) => ({
        name: f.name || 'Field',
        value: f.value || '-',
        inline: !!f.inline,
      }))
    );
  }

  return embed;
}

function buildActionRows(buttons) {
  if (!Array.isArray(buttons) || buttons.length === 0) return [];

  const rows = [];
  let currentRow = new ActionRowBuilder();

  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    const button = new ButtonBuilder()
      .setLabel(btn.label || 'Click Here')
      .setStyle(parseButtonStyle(btn.style));

    if (btn.emoji) button.setEmoji(btn.emoji);

    if (parseButtonStyle(btn.style) === ButtonStyle.Link) {
      if (btn.url) button.setURL(btn.url);
    } else {
      button.setCustomId(btn.custom_id || `panel_btn_${i}`);
    }

    currentRow.addComponents(button);

    // Max 5 buttons per row
    if (currentRow.components.length === 5 || i === buttons.length - 1) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  }

  return rows;
}

function findButtonConfig(customId) {
  const panels = loadPanels();
  for (const [panelKey, panel] of Object.entries(panels)) {
    if (Array.isArray(panel.buttons)) {
      const match = panel.buttons.find((b) => b.custom_id === customId);
      if (match) return { panelKey, button: match };
    }
  }
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Kelola & kirim panel interaktif dinamis (Admin Only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('send')
        .setDescription('Kirim panel interaktif ke channel tertentu')
        .addStringOption((opt) =>
          opt
            .setName('panel_id')
            .setDescription('ID panel dari konfigurasi panels.json')
            .setRequired(true)
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel tujuan pengiriman panel (default: channel ini)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Lihat daftar ID panel yang tersedia di konfigurasi')
    )
    .addSubcommand((sub) =>
      sub
        .setName('preview')
        .setDescription('Preview tampilan panel (hanya bisa dilihat oleh Anda)')
        .addStringOption((opt) =>
          opt
            .setName('panel_id')
            .setDescription('ID panel yang ingin di-preview')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('reload')
        .setDescription('Muat ulang konfigurasi panel dari panels.json')
    ),

  // Component handler triggered when a user clicks a panel button
  async handleComponent(interaction) {
    if (!interaction.isButton()) return false;

    const matched = findButtonConfig(interaction.customId);
    if (!matched) return false; // Not a panel button, let other handlers process

    const { button } = matched;

    if (!button.reply) {
      await interaction.reply({
        content: 'ℹ️ Tidak ada pesan balasan yang dikonfigurasi untuk tombol ini.',
        flags: 64,
      });
      return true;
    }

    // Build reply embed
    const replyEmbed = buildEmbedFromData(button.reply);
    const replyContent = typeof button.reply === 'string' ? button.reply : (button.reply.content || null);

    const replyOptions = { flags: 64 };
    if (replyContent) replyOptions.content = replyContent;
    if (replyEmbed) replyOptions.embeds = [replyEmbed];

    await interaction.reply(replyOptions);
    return true;
  },

  async execute(interaction) {
    const isOwner = interaction.guild && interaction.guild.ownerId === interaction.user.id;
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || isOwner;

    if (!isAdmin) {
      return interaction.reply({
        content: '❌ Anda tidak memiliki izin Administrator untuk menggunakan command ini.',
        flags: 64,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const panels = loadPanels();

    if (subcommand === 'reload') {
      loadPanels();
      const count = Object.keys(panelsCache).length;
      return interaction.reply({
        content: `✅ Konfigurasi panel berhasil dimuat ulang! Terdeteksi **${count}** panel.`,
        flags: 64,
      });
    }

    if (subcommand === 'list') {
      const keys = Object.keys(panels);
      if (keys.length === 0) {
        return interaction.reply({
          content: '⚠️ Belum ada panel yang terdaftar di `src/panels.json`.',
          flags: 64,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Daftar Panel Interaktif')
        .setColor(0x5865f2)
        .setDescription(
          keys
            .map((k) => {
              const p = panels[k];
              const btnCount = p.buttons?.length || 0;
              const title = p.public?.title || '(Tanpa Judul)';
              return `• **\`${k}\`** — ${title} (*${btnCount} tombol*)`;
            })
            .join('\n') +
            '\n\n*Gunakan `/panel send panel_id:<id>` untuk mengirim ke channel.*'
        );

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (subcommand === 'preview') {
      const panelId = interaction.options.getString('panel_id');
      const panel = panels[panelId];

      if (!panel) {
        return interaction.reply({
          content: `❌ Panel dengan ID **\`${panelId}\`** tidak ditemukan di \`src/panels.json\`.\nGunakan \`/panel list\` untuk melihat daftar panel.`,
          flags: 64,
        });
      }

      const embed = buildEmbedFromData(panel.public);
      const rows = buildActionRows(panel.buttons);

      return interaction.reply({
        content: `👁️ **Preview Panel: \`${panelId}\`** *(Hanya terlihat oleh Anda)*`,
        embeds: embed ? [embed] : [],
        components: rows,
        flags: 64,
      });
    }

    if (subcommand === 'send') {
      const panelId = interaction.options.getString('panel_id');
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      const panel = panels[panelId];

      if (!panel) {
        return interaction.reply({
          content: `❌ Panel dengan ID **\`${panelId}\`** tidak ditemukan di \`src/panels.json\`.\nGunakan \`/panel list\` untuk melihat daftar panel.`,
          flags: 64,
        });
      }

      const embed = buildEmbedFromData(panel.public);
      const rows = buildActionRows(panel.buttons);

      if (!embed && rows.length === 0) {
        return interaction.reply({
          content: `❌ Panel **\`${panelId}\`** tidak memiliki konten embed publik atau tombol yang valid.`,
          flags: 64,
        });
      }

      try {
        await targetChannel.send({
          embeds: embed ? [embed] : [],
          components: rows,
        });

        return interaction.reply({
          content: `✅ Panel **\`${panelId}\`** berhasil dikirim ke <#${targetChannel.id}>!`,
          flags: 64,
        });
      } catch (err) {
        return interaction.reply({
          content: `❌ Gagal mengirim panel ke <#${targetChannel.id}>: ${err.message}`,
          flags: 64,
        });
      }
    }
  },
};
