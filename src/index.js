const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Events, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();
const config = require('./config');
const { getActivePrefixes, getOrCreateUser, getSetting, deleteUser, getAllUserIds } = require('./database');
const { buildFakeInteraction, hasRequiredPermission } = require('./prefixAdapter');
const { buildEmbed: buildHelpEmbed, buildSelectRow: buildHelpSelectRow } = require('./commands/help');
const { buildWelcomeEmbed, buildWelcomeSelect } = require('./onboarding');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // required to detect member leave and sync roster
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // required to read prefix command message content
  ],
});
client.commands = new Collection();

// --- MAINTENANCE CHECK HELPER ---
async function isMaintenanceBlocked(userId, channelId, memberPermissions, guild, commandName) {
  // Never block the maintenance toggle command itself
  if (commandName === 'maintenance') return false;

  const mode = await getSetting('maintenance_mode', 'off');
  if (mode !== 'on') return false;

  // Server owners or administrators can always run commands
  if (guild && guild.ownerId === userId) return false;
  if (memberPermissions?.has(PermissionFlagsBits.Administrator)) return false;

  // Whitelisted dev/testing channel can always run commands
  if (channelId && String(channelId) === String(config.maintenance?.allowedChannelId)) return false;

  return true;
}
const MAINTENANCE_MESSAGE = '<:warning:1546422653420830842> **Luneth is currently under maintenance.**\nPlease check back shortly once maintenance is complete.';
// ---------------------------------

// --- SISTEM ANTI-SPAM COOLDOWN ---
const cooldowns = new Collection();
function checkCooldown(userId, commandName, cooldownSeconds = 3) {
  if (!cooldowns.has(commandName)) {
    cooldowns.set(commandName, new Collection());
  }
  const now = Date.now();
  const timestamps = cooldowns.get(commandName);
  const cooldownAmount = cooldownSeconds * 1000;
  
  if (timestamps.has(userId)) {
    const expirationTime = timestamps.get(userId) + cooldownAmount;
    if (now < expirationTime) {
      const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
      return `⏳ Please don't spam! Wait **${timeLeft} seconds** before using this feature again.`;
    }
  }
  timestamps.set(userId, now);
  setTimeout(() => timestamps.delete(userId), cooldownAmount);
  return null;
}
// ---------------------------------

// Prevent the bot from crashing entirely on unhandled rejections/exceptions anywhere.
// Just log to the terminal, bot keeps running.
process.on('unhandledRejection', (err) => {
  console.error('⚠️ Unhandled rejection (bot keeps running):', err);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught exception (bot keeps running):', err);
});

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);

  // Commands can have `aliases: [...]` (optional) for short names via prefix,
  // e.g. leaderboard has alias "lb" -> "luleaderboard" can also be called "lulb".
  // These aliases ONLY work for prefix commands, not slash commands (slash has one official name).
  for (const alias of command.aliases || []) {
    client.commands.set(alias, command);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot online as ${c.user.tag}`);
  console.log(`✅ Guilds: ${c.guilds.cache.size}`);

  // Periodic check to keep Top 1 Leaderboard role synced
  const { getLeaderboard } = require('./database');
  const { syncTopRole } = require('./commands/leaderboard');

  async function checkTop1() {
    try {
      const top = await getLeaderboard(1);
      if (top.length > 0 && top[0]?.userId) {
        for (const guild of c.guilds.cache.values()) {
          await syncTopRole(guild, top[0].userId);
        }
      }
    } catch (e) {
      console.error('⚠️ Top role background sync error:', e.message);
    }
  }

  // Cleanup any members in the database who are no longer in any server
  async function cleanupDepartedMembers() {
    try {
      const allUsers = await getAllUserIds();
      let purged = 0;
      for (const row of allUsers) {
        let isPresent = false;
        for (const guild of c.guilds.cache.values()) {
          const member = await guild.members.fetch(row.userId).catch(() => null);
          if (member) {
            isPresent = true;
            break;
          }
        }
        if (!isPresent) {
          await deleteUser(row.userId);
          purged++;
        }
      }
      if (purged > 0) {
        console.log(`🧹 Auto-cleaned ${purged} departed member(s) from database.`);
      }
    } catch (err) {
      console.error('⚠️ Error during departed members cleanup:', err.message);
    }
  }

  // Sync booster list into boosterStore for the website (/api/boosters)
  async function syncBoosters() {
    try {
      const { setBoosters } = require('./boosterStore');
      const collected = [];
      for (const guild of c.guilds.cache.values()) {
        // fetch to ensure cache is populated
        await guild.members.fetch().catch(() => {});
        for (const m of guild.members.cache.values()) {
          if (m.premiumSince != null) {
            collected.push({
              id: m.id,
              tag: m.user?.tag || m.user?.username || m.id,
              displayName: m.displayName || m.user?.username || m.id,
              avatar: m.user?.displayAvatarURL({ size: 128, extension: 'png' }) || null,
              premiumSince: m.premiumSince ? m.premiumSince.toISOString() : null,
              guildName: guild.name,
            });
          }
        }
      }
      // deduplicate by id
      const seen = new Set();
      const unique = collected.filter(b => { if (seen.has(b.id)) return false; seen.add(b.id); return true; });
      require('./boosterStore').setBoosters(unique);
    } catch (e) {
      console.error('⚠️ Booster sync error:', e.message);
    }
  }

  cleanupDepartedMembers();

  // Streak system: daily rollover + 24h expiry + reminders
  const { heartbeatIfActive, refreshCache, runStreakMaintenance } = require('./streakService');
  refreshCache();
  runStreakMaintenance(c, config).catch(() => {});
  setInterval(() => runStreakMaintenance(c, config).catch(() => {}), config.streak.checkIntervalMs);

  // Initial sync & intervals
  checkTop1();
  syncBoosters();
  setInterval(checkTop1, 5 * 60 * 1000);
  setInterval(syncBoosters, 10 * 60 * 1000);
});

// Auto-delete user from database when they leave the server
client.on(Events.GuildMemberRemove, async (member) => {
  try {
    const userId = member.id || member.user?.id;
    if (!userId) return;

    // Check if the user is still in any other guild the bot is in
    let inOtherGuild = false;
    for (const guild of client.guilds.cache.values()) {
      if (guild.id === member.guild?.id) continue;
      const otherMember = await guild.members.fetch(userId).catch(() => null);
      if (otherMember) {
        inOtherGuild = true;
        break;
      }
    }

    if (!inOtherGuild) {
      await deleteUser(userId);
      console.log(`🗑️ Member left (${member.guild?.name || 'server'}): Purged user ${userId} (${member.user?.tag || 'unknown'}) from database.`);
    }
  } catch (err) {
    console.error('❌ Failed to auto-delete departed member from database:', err);
  }
});

// Keep website booster list in sync in real time
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (oldMember?.premiumSince === newMember?.premiumSince) return;
  // re-run full scan (cheap vs complex delta logic)
  try {
    const collected = [];
    for (const guild of client.guilds.cache.values()) {
      for (const m of guild.members.cache.values()) {
        if (m.premiumSince != null) {
          collected.push({ id: m.id, tag: m.user?.tag || m.user?.username || m.id, displayName: m.displayName || m.user?.username || m.id, avatar: m.user?.displayAvatarURL({ size: 128, extension: 'png' }) || null, premiumSince: m.premiumSince.toISOString(), guildName: guild.name });
        }
      }
    }
    const seen = new Set();
    require('./boosterStore').setBoosters(collected.filter(b => { if (seen.has(b.id)) return false; seen.add(b.id); return true; }));
  } catch {}
});

client.on(Events.Error, (err) => {
  console.error('❌ Discord client error:', err.message);
});

client.on(Events.ShardDisconnect, (id, event) => {
  console.warn(`⚠️ Shard ${id} disconnected. Code: ${event.code}, Reason: ${event.reason}`);
});

client.on(Events.ShardReconnecting, (id) => {
  console.log(`🔄 Shard ${id} reconnecting...`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  // /help category filter dropdown — anyone viewing the message can use it.
  if (interaction.isStringSelectMenu() && interaction.customId === 'help_category_select') {
    const selected = interaction.values[0];
    const [activePrefix] = await getActivePrefixes(interaction.guild?.id, config.prefix, config.prefixAliases);
    const isAdmin = !!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

    try {
      await interaction.update({
        embeds: [buildHelpEmbed(selected, activePrefix, isAdmin)],
        components: [buildHelpSelectRow(selected, isAdmin)],
      });
    } catch (err) {
      console.error('❌ Error updating /help dropdown:', err);
    }
    return;
  }

  // Component interactions: equip / sell / trade / shop / giveaway handlers.
  // Each one is wrapped in its own try/catch so a failure in one handler can
  // never break the others (previously an error in any handler aborted the
  // whole block and made every button/menu unresponsive).
  if (interaction.isMessageComponent()) {
    // Maintenance check for components
    const blocked = await isMaintenanceBlocked(
      interaction.user.id,
      interaction.channelId,
      interaction.memberPermissions,
      interaction.guild,
      interaction.customId
    );
    if (blocked) {
      return interaction.reply({ content: MAINTENANCE_MESSAGE, flags: 64 }).catch(() => {});
    }

    // Cegah user spam klik tombol/menu (cooldown 1.5 detik)
    const btnCdError = checkCooldown(interaction.user.id, 'component_interaction', 1.5);
    if (btnCdError) {
      return interaction.reply({ content: "⏳ Please don't click too fast!", flags: 64 }).catch(() => {});
    }

    const componentHandlers = ['equip', 'sell', 'trade', 'shop', 'giveaway', 'buy', 'bomber', 'customrole', 'panel'];
    for (const name of componentHandlers) {
      const cmd = client.commands.get(name);
      if (!cmd?.handleComponent) continue;
      try {
        const handled = await cmd.handleComponent(interaction);
        if (handled) return;
      } catch (err) {
        console.error(`❌ Error in ${name} component handler:`, err);
      }
    }
  }

  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        console.error(`❌ Error in autocomplete /${interaction.commandName}:`, err);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  // Maintenance check for slash commands
  const isBlocked = await isMaintenanceBlocked(
    interaction.user.id,
    interaction.channelId,
    interaction.memberPermissions,
    interaction.guild,
    interaction.commandName
  );
  if (isBlocked) {
    return interaction.reply({ content: MAINTENANCE_MESSAGE, flags: 64 }).catch(() => {});
  }

  // Cegah spam slash command (cooldown 3 detik)
  const cdError = checkCooldown(interaction.user.id, command.data.name, 3);
  if (cdError) {
    return interaction.reply({ content: cdError, flags: 64 }).catch(() => {});
  }

  // On a brand-new player's first slash command, greet them with a tutorial.
  // (/start already shows the guide itself, so it's exempt.)
  try {
    const mightBeNew = interaction.commandName !== 'start';
    if (mightBeNew) {
      const { isNew } = await getOrCreateUser(interaction.user.id);
      if (isNew) {
        const [activePrefix] = await getActivePrefixes(interaction.guild?.id, config.prefix, config.prefixAliases);
        await command.execute(interaction);
        await interaction
          .followUp({ embeds: [buildWelcomeEmbed(activePrefix, interaction.user.id)], components: [buildWelcomeSelect()], flags: 64 })
          .catch((e) => console.warn('⚠️ Welcome follow-up failed:', e.message));
        return;
      }
    }
  } catch (e) {
    // If onboarding check fails, just run the command normally.
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`❌ Error in command /${interaction.commandName}:`, err);

    // The interaction might already be "dead" (expired / unknown) if the response was too slow.
    // If so, don't try to reply again — just log it so the bot doesn't crash.
    const isDeadInteraction = err?.code === 10062 || err?.code === 40060;
    if (isDeadInteraction) {
      console.warn('⚠️ Interaction is no longer valid (possibly slow connection / late response), skipped.');
      return;
    }

    try {
      const reply = { content: '<:cannot:1546422441125879818> An error occurred while running this command.', flags: 64 };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    } catch (followUpErr) {
      console.error('⚠️ Failed to send error message to user:', followUpErr);
    }
  }
});

// Prefix command handler (e.g. "lunecoin", "lucoinflip 100 heads").
// Runs alongside slash commands, using the same commands via prefixAdapter.
// By default there are 2 prefixes running together: "lune" (main) and "lu" (short) — see config.js.
// If an admin has set a custom prefix via "/prefix", only that custom prefix is active in that server.
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Streak: any chat feeds the fire (rolling 24h)
  const { heartbeatIfActive } = require('./streakService');
  heartbeatIfActive(message.author.id).catch(() => {});

  const activePrefixes = await getActivePrefixes(message.guild?.id, config.prefix, config.prefixAliases);
  const matchedPrefix = activePrefixes.find((p) => message.content.toLowerCase().startsWith(p.toLowerCase()));
  if (!matchedPrefix) return;

  const withoutPrefix = message.content.slice(matchedPrefix.length).trim();
  const commandName = withoutPrefix.split(/\s+/)[0]?.toLowerCase();
  if (!commandName) return;

  // "lus info", "lucf info", "lugambling info" → show gambling info
  const restArgs = withoutPrefix.split(/\s+/).slice(1);
  if (restArgs[0]?.toLowerCase() === 'info' && ['s', 'cf', 'g', 'slots', 'coinflip', 'gambling'].includes(commandName)) {
    const gamblingCmd = client.commands.get('gambling');
    if (gamblingCmd) {
      const fakeInteraction = buildFakeInteraction(message, gamblingCmd);
      await gamblingCmd.execute(fakeInteraction);
    }
    return;
  }

  const command = client.commands.get(commandName);
  if (!command) return; // not a recognized command, stay quiet (don't spam errors)

  // Maintenance check for prefix commands
  const isPrefixBlocked = await isMaintenanceBlocked(
    message.author.id,
    message.channel?.id,
    message.member?.permissions,
    message.guild,
    command.data.name
  );
  if (isPrefixBlocked) {
    return message.reply({ content: MAINTENANCE_MESSAGE }).catch(() => {});
  }

  // Cegah spam prefix command (cooldown 3 detik)
  const cdError = checkCooldown(message.author.id, command.data.name, 3);
  if (cdError) {
    return message.reply({ content: cdError }).catch(() => {});
  }

  if (!hasRequiredPermission(message, command)) {
    await message.reply('<:cannot:1546422441125879818> You don\'t have permission to use this command.').catch(() => { });
    return;
  }

  try {
    const fakeInteraction = buildFakeInteraction(message, command, restArgs);
    await command.execute(fakeInteraction);
  } catch (err) {
    // Argument validation errors (from prefixAdapter) are sent back as-is to the user.
    if (err instanceof Error && (err.message.startsWith('❌') || err.message.startsWith('<:cannot:') || err.message.startsWith(':cannot:'))) {
      await message.reply(err.message).catch(() => { });
      return;
    }
    console.error(`❌ Error in prefix command ${matchedPrefix}${commandName}:`, err);
    await message.reply('<:cannot:1546422441125879818> An error occurred while running this command.').catch(() => { });
  }

  // On a brand-new player's first prefix command, greet them with a tutorial.
  try {
    const { isNew } = await getOrCreateUser(message.author.id);
    if (isNew) {
      const [activePrefix] = await getActivePrefixes(message.guild?.id, config.prefix, config.prefixAliases);
      await message
        .reply({ embeds: [buildWelcomeEmbed(activePrefix, message.author.id)], components: [buildWelcomeSelect()] })
        .catch((e) => console.warn('⚠️ Welcome message failed:', e.message));
    }
  } catch (e) {
    // Ignore onboarding failures — the command already ran.
  }
});

// Start the status page web server first (Render requires an open HTTP port),
// then log the bot in.
const { startHttpServer } = require('./httpServer');
startHttpServer()
  .then(() => {
    const token = process.env.DISCORD_TOKEN;
    console.log(`🔑 Token present: ${!!token} (length: ${token?.length || 0})`);
    if (!token) {
      console.error('❌ DISCORD_TOKEN is missing! Bot cannot connect.');
      return;
    }
    return client.login(token);
  })
  .catch((err) => {
    console.error('❌ Failed to start web server or login:', err.message);
    const token = process.env.DISCORD_TOKEN;
    console.log(`🔑 Retry login - Token present: ${!!token} (length: ${token?.length || 0})`);
    client.login(token).catch((loginErr) => {
      console.error('❌ Login retry also failed:', loginErr.message);
    });
  });
