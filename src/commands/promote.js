const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  GuildMember,
} = require('discord.js');
const { tSync: T } = require('../i18n');

const BUTTON_ID = 'promote_voice_join';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Voice promotion panel')
    .addSubcommand((sub) =>
      sub
        .setName('voice')
        .setDescription('[ADMIN] Kirim ajakan voice dengan tombol Click Here (random voice join)')
        .addStringOption((opt) =>
          opt.setName('message').setDescription('Pesan kustom ajakan (opsional)').setRequired(false)
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel tujuan (opsional, default: channel saat ini)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  aliases: ['promotevoice', 'promote-voice'],

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Command ini hanya bisa digunakan di server.', flags: 64 });
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Hanya administrator yang dapat menggunakan command ini.', flags: 64 });
    }

    const targetChannel =
      (interaction.options?.getChannel ? interaction.options.getChannel('channel') : null) || interaction.channel;
    const customMsg = interaction.options?.getString ? interaction.options.getString('message') : null;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎙️ Voice Channel Hub')
      .setDescription(
        customMsg ||
          'Ingin mengobrol atau mencari teman bicara? Masuk ke voice channel sekarang!\n\n' +
          '👉 Klik tombol **Click Here** di bawah untuk langsung terhubung ke voice channel yang aktif!'
      )
      .setFooter({ text: 'Klik tombol di bawah untuk join / cari voice' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(BUTTON_ID)
        .setLabel('Click Here')
        .setEmoji('🎙️')
        .setStyle(ButtonStyle.Primary)
    );

    if (targetChannel.id === interaction.channelId) {
      await interaction.reply({ embeds: [embed], components: [row] });
    } else {
      await targetChannel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: `✅ Panel promosi voice berhasil dikirim ke <#${targetChannel.id}>!`, flags: 64 });
    }
  },

  async handleComponent(interaction) {
    if (!interaction.isButton() || interaction.customId !== BUTTON_ID) return false;

    const guild = interaction.guild;
    const userId = interaction.user.id;
    if (!guild) {
      await interaction.reply({ content: '❌ Fitur ini hanya bisa digunakan di server.', flags: 64 });
      return true;
    }

    // Ambil full member agar perms & voice state lengkap
    const member =
      interaction.member instanceof GuildMember
        ? interaction.member
        : await guild.members.fetch(userId).catch(() => interaction.member);

    const channels = guild.channels.cache.size ? guild.channels.cache : await guild.channels.fetch();

    // Voice channels yang bisa diakses & dihubungkan oleh member
    const voiceChannels = channels.filter((c) => {
      if (!c || !c.isVoiceBased() || c.type === ChannelType.GuildStageVoice) return false;
      const perms = c.permissionsFor(member);
      return perms && perms.has(PermissionFlagsBits.Connect);
    });

    // Voice channels yang aktif (memiliki member non-bot dan belum penuh)
    // Cek voiceStates guild + c.members untuk deteksi akurat
    const activeVoices = voiceChannels.filter((c) => {
      let voiceMembersCount = 0;
      for (const vs of guild.voiceStates.cache.values()) {
        if (vs.channelId === c.id && !vs.member?.user?.bot) {
          voiceMembersCount++;
        }
      }
      const channelMembersCount = c.members ? c.members.filter((m) => !m.user?.bot).size : 0;
      const humanCount = Math.max(voiceMembersCount, channelMembersCount);
      const isFull = c.userLimit > 0 && humanCount >= c.userLimit;
      return humanCount > 0 && !isFull;
    });

    if (activeVoices.size > 0) {
      const targetVoice = activeVoices.random();
      const currentVoiceId = member.voice?.channelId || guild.voiceStates.cache.get(userId)?.channelId;

      // Jika user sudah berada di dalam voice channel di server
      if (currentVoiceId) {
        if (currentVoiceId === targetVoice.id) {
          await interaction.reply({
            content: T(userId, 'promote.alreadyThere', { channel: targetVoice.id }),
            flags: 64,
          });
          return true;
        }

        try {
          if (member.voice?.setChannel) {
            await member.voice.setChannel(targetVoice.id);
            await interaction.reply({
              content: T(userId, 'promote.moved', { channel: targetVoice.id }),
              flags: 64,
            });
            return true;
          }
        } catch {
          // Fallback jika bot kekurangan permission Move Members
          await interaction.reply({
            content: T(userId, 'promote.activeFound', { channel: targetVoice.id }),
            flags: 64,
          });
          return true;
        }
      }

      // Jika user belum connect ke voice
      await interaction.reply({
        content: T(userId, 'promote.activeFound', { channel: targetVoice.id }),
        flags: 64,
      });
      return true;
    }

    // Jika tidak ada seorang pun di voice channel mana pun
    const emptyVoice = voiceChannels.find((c) => !c.userLimit || (c.members?.size || 0) < c.userLimit);
    const suggestion = emptyVoice ? T(userId, 'promote.suggestTarget', { channel: emptyVoice.id }) : '';

    await interaction.reply({
      content: T(userId, 'promote.emptyVoice', { target: suggestion }),
      flags: 64,
    });
    return true;
  },
};

