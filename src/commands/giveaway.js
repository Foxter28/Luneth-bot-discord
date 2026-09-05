const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { userExists, updateBalance } = require('../database');
const config = require('../config');

// In-memory giveaways. Map<giveawayId, { id, prize, winnersCount, endsAt, entrants:Set, messageId, channelId, guildId, timeoutId, finished }>
const giveaways = new Map();
let nextId = 1;

const MIN_PRIZE = 100;
const MIN_DURATION_MIN = 1;
const MAX_DURATION_MIN = 1440; // 24h
const MAX_WINNERS = 50;

// Small deterministic-ish shuffle (Fisher-Yates).
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatDuration(ms) {
  const totalMin = Math.max(1, Math.round(ms / 60000));
  if (totalMin < 60) return `${totalMin} minutes`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function buildEmbed(gw) {
  const entries = gw.entrants.size;

  // Safe mention of the latest entrant (last one added). Using Array.from keeps
  // this simple & avoids the old `[...set][size-1]` index crash (Set is not an
  // array — that used to yield `undefined` and break the whole embed).
  let latestMention = '';
  if (entries > 0) {
    const all = Array.from(gw.entrants);
    const latest = all[all.length - 1];
    if (latest) latestMention = ` — including <@${latest}>`;
  }

  const desc =
    `**Prize:** ${config.currencySymbol} **${gw.prize.toLocaleString('id-ID')} ${config.currencyName}**\n` +
    `**Winners:** ${gw.winnersCount} (each receives the full prize)\n` +
    `**Ends:** <t:${Math.floor(gw.endsAt / 1000)}:R>\n` +
    `**Entrants:** ${entries}${latestMention}\n\n` +
    `> Click **🎉 Join** to enter! (Only registered players can enter.)`;

  return new EmbedBuilder()
    .setTitle('🎉 GIVEAWAY')
    .setColor(0x9b59b6)
    .setDescription(desc)
    .setFooter({ text: `Giveaway #${gw.id} · ${gw.finished ? 'Ended' : 'Active'}` });
}

function buildJoinButton(gwId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_join_${gwId}`)
      .setLabel('Join')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎉')
  );
}

function isAdmin(interaction) {
  return !!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

async function finishGiveaway(gw) {
  if (gw.finished) return;
  gw.finished = true;
  clearTimeout(gw.timeoutId);

  const entrants = [...gw.entrants];
  const winners = shuffle(entrants).slice(0, gw.winnersCount);

  // Pay each winner the FULL prize. (Decision B — each winner gets the full amount.)
  for (const id of winners) {
    try {
      await updateBalance(id, gw.prize);
    } catch (err) {
      console.error(`❌ Giveaway #${gw.id}: failed to pay <@${id}>:`, err.message);
    }
  }

  // Update the message.
  const parts = [
    `**Prize:** ${config.currencySymbol} **${gw.prize.toLocaleString('id-ID')} ${config.currencyName}** per winner`,
    `**Winners:** ${winners.length ? winners.map((id) => `<@${id}>`).join(', ') : 'None — giveaway cancelled'}`,
    `**Total Entrants:** ${entrants.length}`,
  ];
  const desc =
    winners.length > 0
      ? parts.join('\n') + `\n\n🎉 Congratulations to the winners! **${config.currencySymbol}${gw.prize.toLocaleString('id-ID')} ${config.currencyName}** has been transferred to each!`
      : parts.join('\n');

  const embed = new EmbedBuilder()
    .setTitle('🎉 GIVEAWAY ENDED')
    .setColor(0x2ecc71)
    .setDescription(desc)
    .setFooter({ text: `Giveaway #${gw.id} · Ended` });

  try {
    await gw.updateMessage(embed);
  } catch (err) {
    console.warn(`⚠️ Could not update giveaway #${gw.id} finish message:`, err.message);
  }
  giveaways.delete(gw.id);
  console.log(`✅ Giveaway #${gw.id} finished. Winners: ${winners.length}`);
}

// Cancel a giveaway (admin).
async function cancelGiveaway(gw) {
  if (gw.finished) return;
  gw.finished = true;
  clearTimeout(gw.timeoutId);

  const embed = new EmbedBuilder()
    .setTitle('🎉 GIVEAWAY CANCELLED')
    .setColor(0xe74c3c)
    .setDescription(
      `Giveaway #${gw.id} was cancelled by an administrator.\n` +
        `**Prize:** ${config.currencySymbol} **${gw.prize.toLocaleString('id-ID')} ${config.currencyName}**\n` +
        `**Entrants:** ${gw.entrants.size}`
    )
    .setFooter({ text: `Giveaway #${gw.id} · Cancelled` });

  try {
    await gw.updateMessage(embed);
  } catch (err) {
    console.warn(`⚠️ Could not update giveaway #${gw.id} cancel message:`, err.message);
  }
  giveaways.delete(gw.id);
}

// Send the giveaway embed + button to a channel and store the message for later update.
async function postGiveaway(gw, channelId, client) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return null;

  const msg = await channel.send({
    content: `🎉 **GIVEAWAY!** 👋 @everyone — klik tombol di bawah!`,
    embeds: [buildEmbed(gw)],
    components: [buildJoinButton(gw.id)],
  });
  gw.messageId = msg.id;
  gw.channelId = channelId;

  // updater used by finish/cancel
  gw.updateMessage = async (embed, components = []) => {
    await msg.edit({ embeds: [embed], components }).catch(() => {});
  };

  gw.timeoutId = setTimeout(() => finishGiveaway(gw), gw.endsAt - Date.now());
  return msg;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('[Admin] Adakan giveaway berhadiah Koin')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Mulai giveaway baru')
        .addIntegerOption((opt) => opt.setName('prize').setDescription('Total hadiah Koin untuk tiap pemenang').setRequired(true).setMinValue(MIN_PRIZE))
        .addIntegerOption((opt) => opt.setName('duration').setDescription('Durasi dalam menit').setRequired(true).setMinValue(MIN_DURATION_MIN).setMaxValue(MAX_DURATION_MIN))
        .addIntegerOption((opt) => opt.setName('winners').setDescription('Jumlah pemenang').setRequired(true).setMinValue(1).setMaxValue(MAX_WINNERS))
        .addChannelOption((opt) => opt.setName('channel').setDescription('Channel tujuan (default: channel ini)').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName('cancel')
        .setDescription('Batalkan giveaway yang berjalan')
        .addStringOption((opt) => opt.setName('id').setDescription('ID giveaway (lihat /giveaway list)').setRequired(true))
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Lihat giveaway yang sedang berjalan')),

  async execute(interaction) {
    // Extra guard (also covers the prefix path where slash permissions don't apply).
    if (!isAdmin(interaction)) {
      return interaction.reply({ content: '❌ Command ini khusus admin.', flags: 64 });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const prize = interaction.options.getInteger('prize');
      const durationMin = interaction.options.getInteger('duration');
      const winnersCount = interaction.options.getInteger('winners');
      const channel = interaction.options.getChannel('channel') || interaction.channel;

      const id = nextId++;
      const endsAt = Date.now() + durationMin * 60000;
      const gw = {
        id,
        prize,
        winnersCount,
        endsAt,
        entrants: new Set(),
        finished: false,
        messageId: null,
        channelId: channel.id,
        guildId: interaction.guild?.id || '',
        updateMessage: null,
        timeoutId: null,
      };
      giveaways.set(id, gw);

      try {
        const msg = await postGiveaway(gw, channel.id, interaction.client);
        if (!msg) {
          giveaways.delete(id);
          return interaction.reply({ content: '❌ Tidak bisa kirim ke channel itu.', flags: 64 });
        }
        return interaction.reply({
          content: `✅ Giveaway **#${id}** dimulai! Hadiah ${config.currencySymbol} **${prize.toLocaleString('id-ID')} ${config.currencyName}** × ${winnersCount} pemenang, berakhir dalam **${durationMin} menit**.`,
          flags: 64,
        });
      } catch (err) {
        giveaways.delete(id);
        console.error('❌ Error creating giveaway:', err);
        return interaction.reply({ content: '❌ Gagal membuat giveaway.', flags: 64 });
      }
    }

    if (sub === 'list') {
      const list = [...giveaways.values()].filter((g) => !g.finished);
      if (!list.length) {
        return interaction.reply({ content: '📭 Tidak ada giveaway yang sedang berjalan.', flags: 64 });
      }
      const lines = list.map(
        (g) => `**#${g.id}** — ${config.currencySymbol}${g.prize.toLocaleString('id-ID')} × ${g.winnersCount} pemenang · sisa <t:${Math.floor(g.endsAt / 1000)}:R> · ${g.entrants.size} peserta`
      );
      return interaction.reply({ content: `📋 **Giveaway aktif:**\n${lines.join('\n')}`, flags: 64 });
    }

    if (sub === 'cancel') {
      const idStr = interaction.options.getString('id');
      const id = Number(idStr);
      const gw = giveaways.get(id);
      if (!gw || gw.finished) {
        return interaction.reply({ content: '❌ Giveaway itu tidak ditemukan / sudah selesai.', flags: 64 });
      }
      await cancelGiveaway(gw);
      return interaction.reply({ content: `✅ Giveaway **#${id}** dibatalkan.`, flags: 64 });
    }
  },

  // Called from index.js for any message component interaction.
  async handleComponent(interaction) {
    if (!interaction.isButton()) return false;
    if (!interaction.customId.startsWith('giveaway_join_')) return false;

    const gwId = Number(interaction.customId.slice('giveaway_join_'.length));
    const gw = giveaways.get(gwId);
    if (!gw || gw.finished) {
      await interaction.reply({ content: '❌ Giveaway tidak ditemukan / sudah selesai.', flags: 64 });
      return true;
    }

    const userId = interaction.user.id;

    // Only users who already /start-ed can enter.
    const exists = await userExists(userId);
    if (!exists) {
      await interaction.reply({
        content: `❌ Kamu belum **/start**! Ketik \`/start\` dulu untuk membuat akun, lalu klik 🎉 lagi.`,
        flags: 64,
      });
      return true;
    }

    if (gw.entrants.has(userId)) {
      await interaction.reply({ content: '⚠️ Kamu sudah ikut giveaway ini!', flags: 64 });
      return true;
    }

    gw.entrants.add(userId);
    await interaction.reply({ content: '🎉 Kamu berhasil masuk giveaway! Semoga beruntung!', flags: 64 });

    // Refresh the participant count on the embed.
    try {
      await gw.updateMessage(buildEmbed(gw), [buildJoinButton(gw.id)]);
    } catch (err) {
      console.warn('⚠️ Could not refresh giveaway embed:', err.message);
    }
    return true;
  },

  // Exported for tests
  _internal: { giveaways, shuffle, finishGiveaway, cancelGiveaway },
};
