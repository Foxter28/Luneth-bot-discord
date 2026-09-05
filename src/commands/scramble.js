const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { updateBalance } = require('../database');
const config = require('../config');

const WORDS = [
    'computer', 'discord', 'economy', 'luneth', 'scramble', 'giveaway', 'balance',
    'inventory', 'mountain', 'keyboard', 'sword', 'shield', 'dragon', 'potion',
    'dungeon', 'monster', 'diamond', 'emerald', 'sapphire', 'crystal', 'warrior',
    'wizard', 'magic', 'kingdom', 'village', 'quest', 'journey', 'treasure',
    'gold', 'silver', 'bronze', 'iron', 'steel', 'wood', 'stone', 'water',
    'fire', 'earth', 'wind', 'light', 'dark', 'sun', 'moon', 'star', 'planet'
];

function getDifficultyAndReward(word) {
    if (word.length <= 5) return { difficulty: 'Easy', reward: 50 };
    if (word.length <= 8) return { difficulty: 'Normal', reward: 100 };
    return { difficulty: 'Hard', reward: 200 };
}

function scrambleWord(word) {
    const arr = word.toUpperCase().split('');
    let scrambled;
    do {
        scrambled = [...arr];
        for (let i = scrambled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [scrambled[i], scrambled[j]] = [scrambled[j], scrambled[i]];
        }
    } while (scrambled.join('') === arr.join('') && arr.length > 1);
    
    // Return with spaces between characters
    return scrambled.join(' ');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('scramble')
        .setDescription('Unscramble the letters to guess the word and win coins!'),

    async execute(interaction) {
        const word = WORDS[Math.floor(Math.random() * WORDS.length)];
        // Mengubah "S Y R L T C A" menjadi "`S` `Y` `R` `L` `T` `C` `A`"
        const scrambledChars = scrambleWord(word).split(' ').map(l => `\`${l}\``).join(' ');
        const { difficulty, reward } = getDifficultyAndReward(word);
        
        // Huruf aslinya untuk ditampilkan saat game selesai
        const solvedChars = word.toUpperCase().split('').map(l => `\`${l}\``).join(' ');

        const initialDesc = `Unscramble the following letters to form a word:\n\n${scrambledChars}\n\nType your answer in the chat.\n\n⏳ Time: 15 seconds`;
        
        // Deskripsi akhir tanpa prompt untuk chat
        const solvedDesc = `Unscramble the following letters to form a word:\n\n${solvedChars}`;

        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('Scramble!')
            .setDescription(initialDesc);

        await interaction.reply({ embeds: [embed] });

        const filter = (m) => m.author.id === interaction.user.id;
        try {
            const collected = await interaction.channel.awaitMessages({
                filter,
                max: 1,
                time: 15000,
                errors: ['time'],
            });

            const response = collected.first();
            const guess = response.content.trim().toLowerCase();

            if (guess === word.toLowerCase()) {
                await updateBalance(interaction.user.id, reward);
                embed.setColor(0x2ecc71) // Hijau
                     .setDescription(`${solvedDesc}\n\n✅ **Correct!** You earned **${reward} ${config.currencyName || 'Luneth Coins'}**.`);
                await interaction.editReply({ embeds: [embed] });
            } else {
                embed.setColor(0xe74c3c) // Merah
                     .setDescription(`${solvedDesc}\n\n❌ **Wrong!** You didn't earn any reward.`);
                await interaction.editReply({ embeds: [embed] });
            }

            // Hapus pesan jawaban user di chat agar tidak nyampah (jika bot punya izin)
            try { await response.delete(); } catch(err) {} 
        } catch (e) {
            embed.setColor(0xe67e22) // Oranye
                 .setDescription(`${solvedDesc}\n\n**⌛ Time's Up!**`);
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
