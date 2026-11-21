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

function buildEmbedsList(data) {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.map(buildEmbedFromData).filter(Boolean);
  }
  const single = buildEmbedFromData(data);
  return single ? [single] : [];
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
        .setDescription('Send an interactive panel to a channel')
        .addStringOption((opt) =>
          opt
            .setName('panel_id')
            .setDescription('Panel ID from the panels.json config')
            .setAutocomplete(true)
            .setRequired(true)
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Target channel to send the panel to (default: this channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List available panel IDs from the config')
    )
    .addSubcommand((sub) =>
      sub
        .setName('preview')
        .setDescription('Preview a panel (only visible to you)')
        .addStringOption((opt) =>
          opt
            .setName('panel_id')
            .setDescription('The panel ID to preview')
            .setAutocomplete(true)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('attach')
        .setDescription('Attach panel buttons to an existing message (Foxhook/Webhook embeds)')
        .addStringOption((opt) =>
          opt
            .setName('message_id')
            .setDescription('The Discord message ID to attach buttons to (Copy Message ID)')
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('panel_id')
            .setDescription('The button/panel ID from panels.json to attach')
            .setAutocomplete(true)
            .setRequired(true)
        )
        .addBooleanOption((opt) =>
          opt
            .setName('delete_original')
            .setDescription('Delete the old message after replacing it? (Default: false)')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('reload')
        .setDescription('Reload the panel config from panels.json')
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const panels = loadPanels();
    const choices = Object.entries(panels).map(([key, p]) => ({
      name: `${key} — ${p.title || p.public?.title || 'No Title'}`.slice(0, 100),
      value: key,
    }));
    const filtered = choices.filter(
      (c) => c.name.toLowerCase().includes(focusedValue) || c.value.toLowerCase().includes(focusedValue)
    );
    await interaction.respond(filtered.slice(0, 25)).catch(() => {});
  },

  // Component handler triggered when a user clicks a panel button
  async handleComponent(interaction) {
    if (!interaction.isButton()) return false;

    const matched = findButtonConfig(interaction.customId);
    if (!matched) return false; // Not a panel button, let other handlers process

    const { button } = matched;

    if (!button.reply) {
      await interaction.reply({
        content: 'ℹ️ No reply message is configured for this button.',
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
        content: '❌ You need Administrator permission to use this command.',
        flags: 64,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const panels = loadPanels();

    if (subcommand === 'reload') {
      loadPanels();
      const count = Object.keys(panelsCache).length;
      return interaction.reply({
        content: `✅ Panel config reloaded! Found **${count}** panel(s).`,
        flags: 64,
      });
    }

    if (subcommand === 'list') {
      const keys = Object.keys(panels);
      if (keys.length === 0) {
        return interaction.reply({
          content: '⚠️ No panels are registered in `src/panels.json` yet.',
          flags: 64,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Interactive Panel List')
        .setColor(0x5865f2)
        .setDescription(
          keys
            .map((k) => {
              const p = panels[k];
              const btnCount = p.buttons?.length || 0;
              const title = p.public?.title || '(Untitled)';
              return `• **\`${k}\`** — ${title} (*${btnCount} button(s)*)`;
            })
            .join('\n') +
            '\n\n*Use `/panel send panel_id:<id>` to send a panel to a channel.*'
        );

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (subcommand === 'preview') {
      const panelId = interaction.options.getString('panel_id');
      const panel = panels[panelId];

      if (!panel) {
        return interaction.reply({
          content: `❌ Panel **\`${panelId}\`** not found in \`src/panels.json\`.\nUse \`/panel list\` to see available panels.`,
          flags: 64,
        });
      }

      const rows = buildActionRows(panel.buttons);
      let replyPayload = { flags: 64 };

      if (panel.components || panel.rawComponents) {
        const rawComps = panel.components || panel.rawComponents;
        replyPayload.flags = panel.flags || 32768;
        replyPayload.components = [...rawComps, ...rows.map((r) => r.toJSON())];
      } else {
        const embeds = buildEmbedsList(panel.public);
        replyPayload.embeds = embeds;
        replyPayload.components = rows;
      }

      return interaction.reply(replyPayload);
    }

    if (subcommand === 'send') {
      const panelId = interaction.options.getString('panel_id');
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      const panel = panels[panelId];

      if (!panel) {
        return interaction.reply({
          content: `❌ Panel **\`${panelId}\`** not found in \`src/panels.json\`.\nUse \`/panel list\` to see available panels.`,
          flags: 64,
        });
      }

      const rows = buildActionRows(panel.buttons);

      // Support multi-message Components V2 panels (e.g. Message 1 = Part 1, Message 2 = Part 2 + Buttons)
      if (Array.isArray(panel.messages)) {
        try {
          for (let i = 0; i < panel.messages.length; i++) {
            const msg = panel.messages[i];
            const isLast = i === panel.messages.length - 1;
            const msgComponents = [...(msg.components || [])];
            if (isLast && rows.length > 0) {
              msgComponents.push(...rows.map((r) => r.toJSON()));
            }
            await targetChannel.send({
              flags: msg.flags || 32768,
              content: msg.content || undefined,
              components: msgComponents,
            });
          }

          return interaction.reply({
            content: `✅ Panel **\`${panelId}\`** (Components V2) sent to <#${targetChannel.id}>!`,
            flags: 64,
          });
        } catch (err) {
          return interaction.reply({
            content: `❌ Failed to send the panel to <#${targetChannel.id}>: ${err.message}`,
            flags: 64,
          });
        }
      }

      let sendPayload = {};
      if (panel.components || panel.rawComponents) {
        const rawComps = panel.components || panel.rawComponents;
        sendPayload = {
          flags: panel.flags || 32768,
          components: [...rawComps, ...rows.map((r) => r.toJSON())],
        };
      } else {
        const embeds = buildEmbedsList(panel.public);
        if (embeds.length === 0 && rows.length === 0) {
          return interaction.reply({
            content: `❌ Panel **\`${panelId}\`** has no public embed content or valid buttons.`,
            flags: 64,
          });
        }
        sendPayload = {
          embeds,
          components: rows,
        };
      }

      try {
        await targetChannel.send(sendPayload);

        return interaction.reply({
          content: `✅ Panel **\`${panelId}\`** sent to <#${targetChannel.id}>!`,
          flags: 64,
        });
      } catch (err) {
        return interaction.reply({
          content: `❌ Failed to send the panel to <#${targetChannel.id}>: ${err.message}`,
          flags: 64,
        });
      }
    }

    if (subcommand === 'attach') {
      const messageId = interaction.options.getString('message_id').trim();
      const panelId = interaction.options.getString('panel_id');
      const deleteOriginal = interaction.options.getBoolean('delete_original') || false;
      const panel = panels[panelId];

      if (!panel) {
        return interaction.reply({
          content: `❌ Button panel **\`${panelId}\`** not found in \`src/panels.json\`.\nUse \`/panel list\` to see available button panels.`,
          flags: 64,
        });
      }

      let targetMessage;
      try {
        targetMessage = await interaction.channel.messages.fetch(messageId);
      } catch (e) {
        return interaction.reply({
          content: `❌ Could not find a message with ID **\`${messageId}\`** in this channel.\nMake sure you run the command in the same channel as the message.`,
          flags: 64,
        });
      }

      const rows = buildActionRows(panel.buttons);
      if (rows.length === 0) {
        return interaction.reply({
          content: `❌ Panel **\`${panelId}\`** has no buttons configured in \`src/panels.json\`.`,
          flags: 64,
        });
      }

      // Jika pesan tersebut dibuat oleh bot ini sendiri, bot bisa langsung edit pesannya
      if (targetMessage.author.id === interaction.client.user.id) {
        try {
          await targetMessage.edit({ components: rows });
          return interaction.reply({
            content: `✅ Buttons from panel **\`${panelId}\`** attached directly to the bot message!`,
            flags: 64,
          });
        } catch (err) {
          return interaction.reply({
            content: `❌ Failed to edit the bot message: ${err.message}`,
            flags: 64,
          });
        }
      }

      // Jika pesan dibuat oleh Webhook (Foxhook/Discohook), clone embednya & tempelkan tombolnya
      try {
        const payload = {
          content: targetMessage.content || undefined,
          embeds: targetMessage.embeds.map((emb) => EmbedBuilder.from(emb)),
          components: rows,
          files: targetMessage.attachments.map((a) => a.url),
        };

        if (!payload.content && payload.embeds.length === 0 && payload.files.length === 0) {
          return interaction.reply({
            content: `❌ That message has no content or embed to duplicate.`,
            flags: 64,
          });
        }

        await interaction.channel.send(payload);

        if (deleteOriginal) {
          await targetMessage.delete().catch(() => {});
        }

        return interaction.reply({
          content: `✅ Embed fetched from the Foxhook message and resent with interactive buttons!${deleteOriginal ? ' *(Old message deleted)*' : ''}`,
          flags: 64,
        });
      } catch (err) {
        return interaction.reply({
          content: `❌ Failed to process the message: ${err.message}`,
          flags: 64,
        });
      }
    }
  },
};
