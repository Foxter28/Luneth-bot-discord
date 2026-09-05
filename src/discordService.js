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
  }));

  // channels[] on the widget endpoint is an array of {id,name,type,...}
  // (type: 0=text, 2=voice, 4=category). We only keep what exists.
  const channelsRaw = Array.isArray(raw.channels) ? raw.channels : [];
  const channels = channelsRaw.map((c) => ({
    id: safe(c?.id, null),
    name: safe(c?.name, 'general'),
    type: toNum(c?.type) ?? 0,
  }));

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

    req.setTimeout(8_000, () => {
      req.destroy();
      console.warn('[discord] widget fetch timed out');
      resolve({ ...FALLBACK, source: 'fallback' });
    });

    req.end();
  });
}

module.exports = { fetchWidget, normalize, FALLBACK };
