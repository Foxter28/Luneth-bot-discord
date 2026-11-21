const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('listemojis')
    .setDescription('List all custom emojis available in this server with their IDs')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  aliases: ['emojis', 'elist'],

  async execute(interaction) {
    const emojis = interaction.guild?.emojis.cache;
    if (!emojis || emojis.size === 0) {
      return interaction.reply({
        content: '<:cannot:1546422441125879818> No custom emojis found in this server. Upload some first in Server Settings -> Emoji.',
        flags: 64,
      });
    }

    const lines = emojis.map((e) => {
      const format = e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`;
      return `${format} \`\`\`${format}\`\`\``;
    });

    // Discord message limits to chunks
    const chunk = lines.slice(0, 25).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('✨ Server Custom Emojis')
      .setColor(0x3498db)
      .setDescription(`Found **${emojis.size}** emoji:\n\n${chunk}`)
      .setFooter({ text: 'Copy the text format <:name:id> to use in configs' });

    return interaction.reply({ embeds: [embed] });
  },
};
