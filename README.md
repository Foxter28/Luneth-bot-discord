# Discord Economy Bot

Discord economy bot built with **discord.js v14** + **SQLite** storage (uses the built-in `node:sqlite` module, no compilation/build tools needed). Features: balance, daily, work, shop, buy, inventory, coinflip, slots, leaderboard, and give (admin).

## 1. Install dependencies

```bash
npm install
```

## 2. Set up the Discord bot

1. Open https://discord.com/developers/applications and create a New Application.
2. Go to the **Bot** tab → click **Reset Token** → copy the token.
3. Go to the **OAuth2 → General** tab → copy the **Client ID**.
4. Right-click your Discord server (developer mode must be on) → **Copy Server ID** for GUILD_ID (testing).

## 3. Fill in the environment variables

Copy `.env.example` to `.env`, then fill it in:

```
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_bot_client_id
GUILD_ID=your_testing_server_id
```

## 4. Invite the bot to your server

Open this URL (replace CLIENT_ID):

```
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=2147485696&scope=bot%20applications.commands
```

## 5. Deploy slash commands

```bash
npm run deploy
```

## 6. Run the bot

```bash
npm start
```

## Folder structure

```
src/
  index.js            → bot entry point
  deploy-commands.js  → slash command registration
  config.js           → currency name, daily/work amounts, cooldowns
  database.js         → database layer (SQLite, auto-migrates from economy.json)
  shopItems.js        → shop item list (edit here)
  commands/           → all slash commands
```

## Customization

- **Change the currency name & symbol**: edit `src/config.js` (e.g. "Moondust" + 🌙 for a Luneth theme).
- **Add shop items**: edit `src/shopItems.js`, just add a new object with a unique `id`.
- **Add a new command**: create a new file in `src/commands/`, following the pattern of existing files (export `data` and `execute`).
- **Change the database**: if you later want to move to PostgreSQL/MySQL, just replace the contents of `src/database.js`; the other commands don't need to change because they're already decoupled through functions (`getUser`, `updateBalance`, etc.).

## Notes

- **Storage is dual-mode.** By default the bot stores data in the local `economy.db` (SQLite) file — auto-created on first run, with old `economy.json` data migrated automatically. If you set `TURSO_DATABASE_URL` (+ `TURSO_AUTH_TOKEN`) in `.env`, the bot instead stores everything in a **Turso cloud database**, which survives restarts/deploys (needed for free hosting like Render where the local filesystem is wiped on deploy). See `.env.example`.
- The database uses **WAL mode** for better concurrency, which creates sibling files `economy.db-wal` and `economy.db-shm` while the bot runs. These are ignored by git and safe to delete when the bot is stopped.
- **Never run more than one bot instance at a time.** If the bot was stopped with `Ctrl+C` in a Windows terminal, a stale `node src/index.js` process can be left running and still hold the database, causing `database is locked` errors. If you see those, stop any leftover bot processes (e.g. in Task Manager) before starting a new one.
- The `/give` command is admin-only (restricted via `setDefaultMemberPermissions`).
- Slots & coinflip use `Math.random()` — fine for a starter bot; can be replaced with other algorithms if you need more precise odds.
