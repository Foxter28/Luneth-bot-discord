const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const db = require('../database');
const config = require('../config');
const { formatNumber } = require('../util');
const W = require('../wordleService');

const TITLE = 'LUNETHLE — DAILY WORD PUZZLE';
const BRAND = 0x5865f2;

// ── Embeds ────────────────────────────────────────────────────────────────

function buildGameEmbed(game, stats, userId) {
  const attempts = game.guesses.length;
  const done = game.status !== 'playing';
  const best = W.MAX_REWARD;

  const lines = [
    `Explore today's hidden word!`,
    ``,
    `**Date:** \`${game.date}\` (WIB)`,
    `**Attempts:** \`${attempts}/${W.MAX_GUESSES}\``,
    `**Maximum Reward:** \`${formatNumber(best)}\` ${config.currencySymbol}`,
    `**Status:** ${game.status === 'won' ? '🎉 Solved' : game.status === 'lost' ? '💀 Failed' : '⏳ In Progress'}`,
  ];

  if (game.status === 'won') {
    lines.push(`**Reward:** \`+${formatNumber(game.reward)}\` ${config.currencyName}`);
    lines.push(`🔥 **Streak:** \`${stats.current_streak}\` · Best \`${stats.best_streak}\``);
  } else if (game.status === 'lost') {
    lines.push(`**Answer was:** ||\`${game.answer.toUpperCase()}\`||`);
    lines.push(`🔥 **Streak:** \`0\` — reset`);
  } else {
    lines.push(`**Remaining:** \`${W.MAX_GUESSES - attempts}\` attempts`);
  }

  lines.push('', '**Board**', '```', W.renderBoard(game.guesses), '```');

  if (!done) {
    lines.push('🟩 right letter & spot · 🟨 right letter, wrong spot · ⬜ not in word');
  } else if (game.status === 'won' && attempts === 1) {
    lines.push('-# Flawless. Nothing left to prove.');
  }

  return new EmbedBuilder()
    .setColor(game.status === 'won' ? 0x2ecc71 : game.status === 'lost' ? 0xe74c3c : BRAND)
    .setTitle(TITLE)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Player: ${userId}` })
    .setTimestamp();
}

function buildPlayRow(game) {
  const done = game.status !== 'playing';
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      // Owner baked into the customId: a stray click can't drive someone else's game.
      .setCustomId(`wordle_guess:${game.userId}`)
      .setLabel(done ? 'Puzzle finished' : 'Make a Guess')
      .setEmoji('🔤')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(done)
  );
}

function buildStatsEmbed(stats) {
  const winRate = stats.games > 0 ? (stats.wins / stats.games) * 100 : 0;
  const avg = stats.wins > 0 ? stats.total_guesses / stats.games : 0;

  return new EmbedBuilder()
    .setColor(BRAND)
    .setTitle(`${TITLE} — STATISTICS`)
    .setDescription(
      [
        `**Total Games:** \`${stats.games}\``,
        `**Total Wins:** \`${stats.wins}\``,
        `**Total Losses:** \`${stats.losses}\``,
        `**Win Rate:** \`${winRate.toFixed(1)}%\``,
        ``,
        `🔥 **Current Streak:** \`${stats.current_streak}\``,
        `🏆 **Best Streak:** \`${stats.best_streak}\``,
        ``,
        `**Avg. Attempts:** \`${avg.toFixed(2)}\``,
        `**Coin Earned:** \`${formatNumber(stats.coins_earned)}\` ${config.currencyName}`,
      ].join('\n')
    )
    .setFooter({ text: 'Lunethle — daily word puzzle' })
    .setTimestamp();
}

function buildLeaderboardEmbed(board, viewerId) {
  if (board.length === 0) {
    return new EmbedBuilder()
      .setColor(BRAND)
      .setTitle('LUNETHLE — STREAK LEADERBOARD')
      .setDescription('No active streaks right now.\nBeat today\'s puzzle to claim the top spot.');
  }

  const medals = ['🥇', '🥈', '🥉'];
  const rows = board.slice(0, 10).map((p, i) => {
    const rank = medals[i] || `\`#${i + 1}\``;
    const me = p.userId === viewerId ? ' ←' : '';
    return `${rank} <@${p.userId}> — \`${p.current}\` 🔥 · best \`${p.best}\` · \`${p.wins}\` wins${me}`;
  });

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('LUNETHLE — STREAK LEADERBOARD')
    .setDescription(rows.join('\n'))
    .setFooter({ text: 'Ranked by current streak → best streak → total wins' })
    .setTimestamp();
}

// ── Shared helpers ────────────────────────────────────────────────────────

// Load today's puzzle + this user's game. Creates the game row on first play.
async function loadSession(userId) {
  const date = W.wibDate();
  const answer = await db.getOrCreatePuzzle(date, W.pickWordForDate);
  let game = await db.getWordleGame(userId, date);
  if (!game) game = await db.createWordleGame(userId, date);
  if (!game) return { date, answer, game: null };
  return { date, answer, game: { ...game, date, answer } };
}

// Apply one validated guess. Returns { game, invalid? }.
async function applyGuess(userId, rawGuess) {
  const guess = String(rawGuess || '').trim().toLowerCase();

  if (guess.length !== W.WORD_LENGTH || !/^[a-z]+$/.test(guess)) {
    return { error: `Words are exactly **${W.WORD_LENGTH}** letters, A–Z.` };
  }
  if (!W.isValidWord(guess)) {
    return { error: `**${guess.toUpperCase()}** is not in the word list. Your attempts are untouched.` };
  }

  const { date, answer, game } = await loadSession(userId);
  if (!game) return { error: 'Could not open a game session. Try again.' };
  if (game.status !== 'playing') {
    return { game, already: true };
  }
  if (game.guesses.some((g) => g.word === guess)) {
    return { error: `You already guessed **${guess.toUpperCase()}**.`, game };
  }

  const colors = W.evaluate(answer, guess);
  const guesses = [...game.guesses, { word: guess, colors }];
  const won = guess === answer.toLowerCase();
  const over = guesses.length >= W.MAX_GUESSES;

  if (won || over) {
    const status = won ? 'won' : 'lost';
    const reward = won ? W.REWARDS[guesses.length] || 0 : 0;
    // Compare-and-swap first: only the winning call flips the row, so the
    // balance credit below can never run twice for the same game.
    const claimed = await db.finishWordleGame(userId, date, status, reward, guesses);
    if (claimed) {
      if (reward > 0) await db.updateBalance(userId, reward);
      await db.recordWordleResult(userId, date, won, guesses.length, reward);
    }
    const fresh = await db.getWordleGame(userId, date);
    return { game: { ...fresh, date, answer } };
  }

  await db.saveWordleGuesses(userId, date, guesses);
  return { game: { ...game, guesses, date, answer } };
}

// ── Command ───────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wordle')
    .setDescription('Lunethle — daily 5-letter word puzzle (WIB reset)')
    .addStringOption((opt) =>
      opt
        .setName('input')
        .setDescription('A 5-letter guess, or: stats | leaderboard | salary')
        .setRequired(false)
    ),
  aliases: ['wordle', 'lunethle'],

  async execute(interaction) {
    const input = String(interaction.options?.getString?.('input') || '').trim().toLowerCase();
    const userId = interaction.user.id;

    if (input === 'stats') {
      const stats = await db.getWordleStats(userId);
      return interaction.reply({ embeds: [buildStatsEmbed(stats)] });
    }

    if (input === 'leaderboard' || input === 'lb') {
      const board = await W.buildLeaderboard(db);
      return interaction.reply({
        embeds: [buildLeaderboardEmbed(board, userId)],
        allowedMentions: { parse: [] },
      });
    }

    if (input === 'salary') {
      return interaction.reply({ embeds: [await buildSalaryEmbed(userId)], allowedMentions: { parse: [] } });
    }

    // A word was passed inline: treat it as a guess.
    if (input) {
      const res = await applyGuess(userId, input);
      const stats = await db.getWordleStats(userId);
      if (res.error) {
        return interaction.reply({ content: `❌ ${res.error}`, flags: 64 });
      }
      return interaction.reply({
        embeds: [buildGameEmbed(res.game, stats, userId)],
        components: [buildPlayRow(res.game)],
      });
    }

    const { game } = await loadSession(userId);
    if (!game) {
      return interaction.reply({ content: '❌ Could not open the puzzle. Try again.', flags: 64 });
    }
    const stats = await db.getWordleStats(userId);
    return interaction.reply({
      embeds: [buildGameEmbed(game, stats, userId)],
      components: [buildPlayRow(game)],
    });
  },

  // Button → modal (only the session owner can open it, enforced by customId check
  // in the modal submit: the userId is baked in and compared).
  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.customId.startsWith('wordle_guess')) return false;

    const ownerId = interaction.customId.split(':')[1];
    if (ownerId && interaction.user.id !== ownerId) {
      await interaction.reply({ content: '❌ This puzzle belongs to someone else. Run `luwordle` to start your own.', flags: 64 });
      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId(`wordle_modal:${interaction.user.id}`)
      .setTitle('LUNETHLE — Your Guess');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('wordle_input')
          .setLabel('Enter a 5-letter English word')
          .setStyle(TextInputStyle.Short)
          .setMinLength(5)
          .setMaxLength(5)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
    return true;
  },

  async handleModal(interaction) {
    if (!interaction.customId.startsWith('wordle_modal:')) return false;

    const ownerId = interaction.customId.split(':')[1];
    // A modal can only be opened by the button's owner, but re-check anyway —
    // it costs one comparison and rules out a replayed customId.
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: '❌ This puzzle belongs to someone else.', flags: 64 });
      return true;
    }

    // Acknowledge immediately: the DB round-trip may exceed Discord's 3s window.
    await interaction.deferUpdate().catch(() => {});

    const userId = interaction.user.id;
    const guess = interaction.fields.getTextInputValue('wordle_input');
    const res = await applyGuess(userId, guess);
    const stats = await db.getWordleStats(userId);

    if (res.error) {
      await interaction.followUp({ content: `❌ ${res.error}`, flags: 64 }).catch(() => {});
      return true;
    }

    const payload = {
      embeds: [buildGameEmbed(res.game, stats, userId)],
      components: [buildPlayRow(res.game)],
    };

    // Update the public puzzle message; fall back to a fresh reply if it's gone.
    const edited = interaction.message
      ? await interaction.message.edit(payload).then(() => true).catch(() => false)
      : false;
    if (!edited) await interaction.followUp(payload).catch(() => {});
    return true;
  },
};

// ── Salary view ───────────────────────────────────────────────────────────

async function buildSalaryEmbed(userId) {
  const today = W.wibDate();
  const period = W.weekStart(today);
  const periodEnd = W.addDays(period, 7);
  const nextDate = W.addDays(periodEnd, 0); // paid at the close of this period

  const board = await W.buildLeaderboard(db, today);
  await Promise.all(board.map(async (p) => {
    p.played = await db.countWordleGamesBetween(p.userId, period, periodEnd);
  }));
  const eligible = board.filter((p) => p.played >= W.SALARY_MIN_PUZZLES);

  const rows = eligible.slice(0, 3).map((p, i) => {
    const amount = W.SALARY[i + 1];
    return `${['🥇', '🥈', '🥉'][i]} <@${p.userId}> — \`${p.current}\` 🔥 · \`${formatNumber(amount)}\` ${config.currencyName}`;
  });

  const mine = board.find((p) => p.userId === userId);
  const played = await db.countWordleGamesBetween(userId, period, periodEnd);
  const qualified = played >= W.SALARY_MIN_PUZZLES;

  const history = await db.getWordleSalaryForUser(userId, 3);
  const historyLines = history.length
    ? history.map((h) => `\`${h.period}\` — rank \`#${h.rank}\` · \`+${formatNumber(h.amount)}\` ${config.currencyName}`)
    : ['*No salary received yet.*'];

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('LUNETHLE — WEEKLY SALARY')
    .setDescription(
      [
        `**Period:** \`${period}\` → \`${W.addDays(periodEnd, -1)}\` (WIB)`,
        `**Next distribution:** \`${nextDate}\` 00:00 WIB`,
        ``,
        '**Projected Top 3**',
        rows.length ? rows.join('\n') : '*Nobody qualifies yet.*',
        ``,
        `**Your status:** \`${played}/${W.SALARY_MIN_PUZZLES}\` puzzles played — ${qualified ? '✅ qualified' : '❌ not yet qualified'}`,
        mine ? `**Your active streak:** \`${mine.current}\` 🔥` : '**Your active streak:** `0`',
        ``,
        '**Salary history**',
        ...historyLines,
      ].join('\n')
    )
    .setFooter({ text: 'Rank 1 · 5.000 · Rank 2 · 3.000 · Rank 3 · 1.500' })
    .setTimestamp();
}
