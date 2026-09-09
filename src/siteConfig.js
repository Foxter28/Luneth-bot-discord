/**
 * Website + Discord configuration for the Lunera landing page.
 *
 * All Discord-related values live here so they're never scattered across
 * the codebase. The actual bot secret (DISCORD_TOKEN) is intentionally
 * NOT exposed here — only public, non-sensitive widget data is fetched.
 */
module.exports = {
  // --- Discord widget (public, non-secret) ---
  discord: {
    /** Discord guild (server) ID — used to build the widget endpoint. */
    guildId: '1416799484511391754',

    /**
     * Server-side widget endpoint. The widget JSON is public and does NOT
     * require a bot token, but we proxy it through our own /api/widget
     * route so we can cache it and avoid client-side CORS/rate-limit
     * surprises. The browser never sees this URL directly.
     */
    widgetUrl: 'https://discord.com/api/guilds/1416799484511391754/widget.json',

    /**
     * Invite URL used for the primary "Join Discord" CTAs.
     *
     * Preference order at runtime:
     *   1. DISCORD_INVITE_URL env var (set it on the host, e.g. Render)
     *   2. instant_invite returned by the widget JSON (live value)
     *   3. null — the page degrades gracefully if both are unavailable,
     *      and does NOT invent an invite link.
     *
     * Leave the fallback below empty; the live widget value will fill in.
     */
    inviteUrlEnvFallback: process.env.DISCORD_INVITE_URL || '',
  },

  /**
   * Known voice channel names keyed by channel ID.
   * The Discord widget only exposes SOME channels in channels[] — voice
   * channels occupied by members are NOT all listed. We merge these names
   * server-side so the voice overlay can show proper channel names.
   */
  voiceChannelNames: {
    '1416799486335783014': '🎵・Music',
    '1547199659666055269': 'gatau deh',
    '1547235062804652125': 'ngajarin orang',
  },

  /** How long to cache the widget JSON on the server (ms). */
  widgetCacheTtl: 5_000, // 5s — minimal server cache; Discord itself caches 30-60s
};
