/**
 * Adapter to run slash commands (which use interaction.options.getX)
 * from plain prefix messages, e.g. "$coinflip 100 heads".
 *
 * How it works:
 * 1. Read the option definitions from command.data (SlashCommandBuilder) → know the order & type of each argument.
 * 2. Split the message text into tokens, match them to each option by order & type.
 * 3. Wrap everything into a "fakeInteraction" object that has .options.getX(), .reply(), .editReply(), etc.
 *    exactly like a real interaction, so command.execute(fakeInteraction) works without changes.
 */

// Slash command option types (from discord.js ApplicationCommandOptionType)
const OPTION_TYPE = {
  STRING: 3,
  INTEGER: 4,
  USER: 6,
  SUB_COMMAND: 1,
};

/**
 * Commands like /give use .setDefaultMemberPermissions(Administrator) so only
 * admins see/can use the slash command on Discord. But that ONLY applies to
 * slash commands, it's not automatically enforced for prefix commands. So here
 * we check manually: if the command has default_member_permissions, the member
 * running the prefix command must have that permission too.
 */
function hasRequiredPermission(message, command) {
  const json = typeof command.data.toJSON === 'function' ? command.data.toJSON() : command.data;
  const requiredPerms = json.default_member_permissions;
  if (!requiredPerms) return true; // command has no permission restriction

  if (!message.member) return false; // admin-only commands must not run in DMs
  return message.member.permissions.has(BigInt(requiredPerms));
}

function parseArgs(message, optionDefs, rawArgs) {
  const values = {}; // name -> resolved value

  // A string option (like an item name) may contain spaces ("lunar armor").
  // To support that in prefix commands we join consecutive string tokens, while
  // letting trailing INTEGER/USER tokens be reserved for their options.
  // Count INTEGER/USER options still remaining after a given index.
  const laterNeedsToken = (from) =>
    optionDefs.slice(from + 1).filter((d) => d.type === OPTION_TYPE.INTEGER || d.type === OPTION_TYPE.USER).length;

  let cursor = 0;
  for (let i = 0; i < optionDefs.length; i++) {
    const def = optionDefs[i];
    const remaining = rawArgs.slice(cursor);

    if (def.type === OPTION_TYPE.USER) {
      const token = remaining[0];
      if (!token && def.required) {
        throw new Error(`❌ User for \`${def.name}\` not found. Mention the user, e.g. \`@username\`.`);
      }
      const mentionMatch = token ? token.match(/^<@!?(\d+)>$/u) : null;
      const userId = mentionMatch ? mentionMatch[1] : token ? token.replace(/\D/g, '') : '';
      const user =
        (message.mentions && message.mentions.users.get(userId)) ||
        (message.client && message.client.users.cache.get(userId));
      if (!user && def.required) {
        throw new Error(`❌ User for \`${def.name}\` not found. Mention the user, e.g. \`@username\`.`);
      }
      values[def.name] = user || null;
      cursor += 1;
    } else if (def.type === OPTION_TYPE.INTEGER) {
      // Prefer the next token if it's numeric; else take a trailing numeric token.
      let token = null;
      if (remaining[0] !== undefined && !Number.isNaN(parseInt(remaining[0], 10))) {
        token = remaining[0];
        cursor += 1;
      } else {
        for (let k = remaining.length - 1; k >= 0; k--) {
          if (!Number.isNaN(parseInt(remaining[k], 10))) {
            token = remaining[k];
            // remove this trailing token so a prior STRING join won't include it
            rawArgs.splice(cursor + k, 1);
            break;
          }
        }
      }
      const num = parseInt(token, 10);
      values[def.name] = Number.isNaN(num) ? null : num;
    } else {
      // STRING: join remaining tokens. We may reserve trailing tokens for later
      // INTEGER/USER options — but only when those trailing tokens are actually
      // numeric. This way "lubuy moonfern" and "lubuy lunar armor" (no quantity)
      // still capture the full name, while "lubuy lunar armor 5" results in
      // item="lunar armor" and quantity=5.
      const reserve = laterNeedsToken(i);
      let joinEnd = remaining.length;
      if (reserve > 0) {
        let allNumeric = true;
        for (let r = 0; r < reserve; r++) {
          const idx = remaining.length - 1 - r;
          if (idx < 0 || Number.isNaN(parseInt(remaining[idx], 10))) {
            allNumeric = false;
            break;
          }
        }
        if (allNumeric) joinEnd = Math.max(0, remaining.length - reserve);
      }
      values[def.name] = remaining.slice(0, joinEnd).join(' ');
      cursor += joinEnd;
    }
  }

  return values;
}

function normalizeReplyPayload(payload) {
  // interaction.reply/editReply can be called with a string or an object { content, flags/ephemeral }.
  // Message.reply/edit doesn't know flags/ephemeral, so strip them.
  if (typeof payload === 'string') return { content: payload };
  const { flags, ephemeral, ...rest } = payload;
  return rest;
}

/**
 * Build a fake interaction from a Message + the command to run.
 */
function buildFakeInteraction(message, command, parsedArgs = null) {
  const optionDefs = (command.data.options || []).map((opt) => {
    const json = typeof opt.toJSON === 'function' ? opt.toJSON() : opt;
    return json;
  });

  const rawArgs = parsedArgs || message.content.trim().split(/\s+/).slice(1); // strip prefix+command name

  // Detect whether this command has subcommands (e.g. /trade create|list|cancel).
  const hasSubcommands = optionDefs.some((o) => o && o.type === OPTION_TYPE.SUB_COMMAND);

  let getSubcommand = () => null;
  let values;

  if (hasSubcommands) {
    // First token is the subcommand name, e.g. "lutrade create moon_fern 100".
    const subName = (rawArgs[0] || '').toLowerCase();
    getSubcommand = () => subName;

    // Parse the remaining tokens against the matching subcommand's options.
    const subDef = optionDefs.find((o) => o && o.name === subName);
    const subOptions = (subDef && subDef.options) || [];
    values = parseArgs(message, subOptions, rawArgs.slice(1));
  } else {
    values = parseArgs(message, optionDefs, rawArgs);
  }

  let sentMessage = null;

  const fakeInteraction = {
    user: message.author,
    member: message.member,
    memberPermissions: message.member?.permissions,
    guild: message.guild,
    channel: message.channel,
    replied: false,
    deferred: false,

    options: {
      getSubcommand,
      getInteger: (name) => (values[name] === undefined ? null : values[name]),
      getString: (name) => (values[name] === undefined ? null : values[name]),
      getUser: (name) => (values[name] === undefined ? null : values[name]),
    },

    reply: async (payload) => {
      sentMessage = await message.reply(normalizeReplyPayload(payload));
      fakeInteraction.replied = true;
      return sentMessage;
    },

    deferReply: async (payload) => {
      // For prefix commands, "defer" = post a placeholder with zero-width space
      // so subsequent editReply() calls can animate over it (like real defer+edit).
      // Using '\u200B' (zero-width space) so nothing visible shows up.
      if (!sentMessage) {
        sentMessage = await message.reply('\u200B');
        fakeInteraction.deferred = true;
      }
      return sentMessage;
    },

    editReply: async (payload) => {
      if (!sentMessage) {
        sentMessage = await message.reply(normalizeReplyPayload(payload));
        return sentMessage;
      }
      return sentMessage.edit(normalizeReplyPayload(payload));
    },

    followUp: async (payload) => {
      return message.channel.send(normalizeReplyPayload(payload));
    },
  };

  return fakeInteraction;
}

module.exports = { buildFakeInteraction, hasRequiredPermission, OPTION_TYPE };
