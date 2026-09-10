/**
 * Discord widget service.
 *
 * Fetches the Discord server widget JSON from Discord's public endpoint and
 * normalizes it into a safe, predictable object. This runs SERVER-SIDE only
 * (called from the HTTP server), so the widget URL is never exposed to the
 * browser and no bot token is ever required.
 *
 * The widget endpoint is public and returns guild/member data without auth.
 * It may be rate-limited, blocked, disabled, or return incomplete data —
 * all of those cases are handled gracefully.
 */
const https = require('https');
const { URL } = require('url');
const siteConfig = require('./siteConfig');

/**
 * Luminary Roster — resolve Discord usernames/avatars for staff user IDs.
 *
 * Discord has no public endpoint to resolve a User ID to a username/avatar
 * without a bot token, so this runs SERVER-SIDE using the bot's DISCORD_TOKEN
 * (configured in .env) and caches the result for a few minutes so we don't
 * hammer the Discord API on every page visit.
 */
const ROSTER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
/** @type {{ at: number, data: Object } | null} */
let rosterCache = null;

/**
 * @typedef {Object} NormalizedDiscordData
 * @property {string} id              Guild ID
 * @property {string} name            Guild/server name
 * @property {string|null} instantInvite  Instant invite URL (if exposed)
 * @property {number|null} presenceCount   Currently-online count
 * @property {number|null} memberCount  Total approximate member count
 * @property {Array<{id,name,type,status,game}>} channels
 * @property {Array<{id,username,status,game,avatar}>} users      Online members
 * @property {boolean} available       Whether live data was successfully fetched
 * @property {string} source           'live' | 'cache' | 'fallback'
 */

/** @type {NormalizedDiscordData|null} */
let cached = null;
let cachedAt = 0;

// Canonical fallback shape — used only when the widget is unavailable.
// Values are NEVER fabricated to look live.
const FALLBACK = Object.freeze({
  id: siteConfig.discord.guildId,
  name: 'Lunera | Hang Out Server',
  instantInvite: siteConfig.discord.inviteUrlEnvFallback || null,
  presenceCount: null,
  memberCount: null,
  voiceCount: null,
  channels: [],
  users: [],
  available: false,
  source: 'fallback',
});

/**
 * Normalize the raw widget JSON into our safe shape.
 * Every field is validated; nothing is assumed to exist.
 * @param {any} raw
 * @param {string} source  'live' or 'cache'
 * @returns {NormalizedDiscordData}
 */
function normalize(raw, source = 'live') {
  if (!raw || typeof raw !== 'object') return { ...FALLBACK, source };

  const safe = (v, fallback) => (v == null ? fallback : v);
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  // members[] is the array of currently-online users the widget exposes.
  // If it's missing, we don't pretend there are online members.
  const members = Array.isArray(raw.members) ? raw.members : [];
  const users = members.map((m) => ({
    id: safe(m?.id, null),
    username: safe(m?.username, 'friend'),
    status: safe(m?.status, 'online'),
    game: m?.game ? { name: safe(m.game.name, null) } : null,
    avatar: safe(m?.avatar_url, null),
    channelId: safe(m?.channel_id, null),
  }));

  // Members with a channel_id are currently connected to a voice channel.
  const voiceCount = members.filter((m) => m?.channel_id).length;

  // channels[] on the widget endpoint is an array of {id,name,type,...}
  // (type: 0=text, 2=voice, 4=category). We only keep what exists.
  const channelsRaw = Array.isArray(raw.channels) ? raw.channels : [];
  const channels = channelsRaw.map((c) => ({
    id: safe(c?.id, null),
    name: safe(c?.name, 'general'),
    type: toNum(c?.type) ?? 0,
  }));

  // Merge known voice channel names (widget may not list occupied voice channels).
  const known = siteConfig.voiceChannelNames || {};
  Object.keys(known).forEach((id) => {
    if (!channels.some((c) => c.id === id)) {
      channels.push({ id, name: known[id], type: 2 });
    }
  });

  // member_count / presence_count are the headline numbers when present.
  const presenceCount = toNum(raw.presence_count);
  const memberCount = toNum(raw.member_count);

  // instant_invite is the authoritative invite. On some widget payloads it
  // is present; on others it may be null or absent.
  const instantInvite = raw.instant_invite || siteConfig.discord.inviteUrlEnvFallback || null;

  return {
    id: safe(raw.id, siteConfig.discord.guildId),
    name: safe(raw.name, 'Lunera | Hang Out Server'),
    instantInvite: instantInvite || null,
    presenceCount,
    memberCount,
    voiceCount,
    channels,
    users,
    available: true,
    source,
  };
}

/**
 * Fetch the widget JSON from Discord. Returns a fully-normalized object.
 * Always resolves (never throws) — failures fall back to FALLBACK.
 * @returns {Promise<NormalizedDiscordData>}
 */
function fetchWidget() {
  return new Promise((resolve) => {
    const now = Date.now();

    // Serve cache while it's fresh to keep the page fast and avoid
    // hammering Discord on every request.
    if (cached && now - cachedAt < siteConfig.widgetCacheTtl) {
      resolve(normalize(cached, 'cache'));
      return; // don't ALSO fire a Discord request — that caused duplicate fetches
    }

    const url = new URL(siteConfig.discord.widgetUrl);

    const req = https
      .request(
        { method: 'GET', hostname: url.hostname, path: url.pathname + url.search, headers: { 'User-Agent': 'Lunera-Site/1.0' } },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
            // Guard against absurd response sizes.
            if (data.length > 1_000_000) res.destroy();
          });
          res.on('end', () => {
            if (res.statusCode !== 200) {
              console.warn(`[discord] widget returned HTTP ${res.statusCode}`);
              cached = null; // invalidate stale cache on non-200
              resolve({ ...FALLBACK, source: 'fallback' });
              return;
            }
            try {
              const parsed = JSON.parse(data);
              cached = parsed;
              cachedAt = Date.now();
              resolve(normalize(parsed, 'live'));
            } catch (err) {
              console.warn('[discord] widget JSON parse failed:', err.message);
              cached = null;
              resolve({ ...FALLBACK, source: 'fallback' });
            }
          });
        }
      )
      .on('error', (err) => {
        console.warn('[discord] widget fetch failed:', err.message);
        // Stale cache is still better than nothing, but only briefly.
        if (cached && now - cachedAt < siteConfig.widgetCacheTtl * 4) {
          resolve(normalize(cached, 'cache'));
        } else {
          resolve({ ...FALLBACK, source: 'fallback' });
        }
      });

    req.setTimeout(15_000, () => {
      req.destroy();
      console.warn('[discord] widget fetch timed out');
      resolve({ ...FALLBACK, source: 'fallback' });
    });

    req.end();
  });
}

/**
 * Fetch a single Discord user by ID using the bot token.
 * Resolves { id, username, avatar, banner, accentColor } or null on any failure.
 * @param {string} userId
 * @returns {Promise<{id:string, username:string, avatar:string|null, banner:string|null, accentColor:string|null}|null>}
 */
function fetchDiscordUser(userId) {
  return new Promise((resolve) => {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      console.warn('[roster] DISCORD_TOKEN missing — cannot resolve usernames');
      resolve(null);
      return;
    }
    const req = https.request(
      {
        method: 'GET',
        hostname: 'discord.com',
        path: `/api/v10/users/${encodeURIComponent(userId)}`,
        headers: { Authorization: `Bot ${token}`, 'User-Agent': 'Lunera-Site/1.0' },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
          if (data.length > 1_000_000) res.destroy();
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            console.warn(`[roster] user ${userId} returned HTTP ${res.statusCode}`);
            resolve(null);
            return;
          }
          try {
            const u = JSON.parse(data);
            const bannerHash = u.banner || null;
            resolve({
              id: String(u.id),
              username: u.global_name || u.username || `Lunarian`, // prefer display name, fall back to username
              avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null,
              banner: bannerHash ? `https://cdn.discordapp.com/banners/${u.id}/${bannerHash}.png?size=600` : null,
              accentColor: u.accent_color ? `#${u.accent_color.toString(16).padStart(6, '0')}` : null,
            });
          } catch (err) {
            console.warn('[roster] user JSON parse failed:', err.message);
            resolve(null);
          }
        });
      }
    );
    req.on('error', (err) => {
      console.warn('[roster] user fetch failed:', err.message);
      resolve(null);
    });
    req.setTimeout(8_000, () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

/**
 * Resolve the roster's filled roles. Cached for 5 minutes.
 * Returns { roles: [...] } where filled roles carry {id, username, avatar}
 * (or null user on failure), and open roles carry no user info at all.
 * Always resolves (never throws).
 */
async function fetchRoster() {
  const now = Date.now();
  if (rosterCache && now - rosterCache.at < ROSTER_CACHE_TTL) {
    return rosterCache.data;
  }

  const roles = [
    { id: 'announcer', name: 'Announcer', status: 'filled', userId: '1000279810569928724' },
    { id: 'talkactive', name: 'TalkActive', status: 'filled', userId: '1483991203312697456' },
    { id: 'watcher', name: 'Watcher', status: 'open' },
    { id: 'creator', name: 'Creator', status: 'open' },
    { id: 'wildcard', name: 'Wildcard', status: 'wildcard' },
  ];

  const data = await Promise.all(
    roles.map(async (role) => {
      if (role.status === 'filled' && role.userId) {
        const user = await fetchDiscordUser(role.userId);
        return { ...role, user: user || { id: role.userId, username: 'Lunarian', avatar: null } };
      }
      return role;
    })
  );

  rosterCache = { at: now, data: { roles: data } };
  return { roles: data };
}

/**
 * Check if a username belongs to an online member of the Discord server.
 * Uses the public widget JSON (online members only) with fuzzy matching
 * to handle prefixed names like '! Staly4n'.
 * @param {string} name
 * @returns {Promise<boolean>}
 */
async function isGuildMember(name) {
  try {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return false;

    const widget = await fetchWidget();
    if (!widget || !widget.available) return false;

    // Widget names often carry prefixes like '! ' or custom status.
    // Strip leading non-alphanumeric chars before comparing.
    const strip = s => String(s || '').toLowerCase().replace(/^[^a-z0-9]+/i, '').trim();
    return widget.users.some(u => {
      const wName = strip(u.username);
      return wName === n || wName.includes(n) || n.includes(wName);
    });
  } catch {
    return false;
  }
}

module.exports = { fetchWidget, normalize, FALLBACK, fetchRoster, isGuildMember };
