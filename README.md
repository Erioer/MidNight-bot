# MidNight — Feature-Rich Discord Bot

**MidNight** is a feature-packed Discord bot that throws moderation, economy, music, fun stuff, and community tools into a single package so you don't have add 10 different bots for each thing. It is built with discord.js 14 and PostgreSQL.

## Features

Prefix commands are disabled by default — set one with `/configwizard`. Slash-only: dashboards, setup wizards, `/play`, `/queue`, and the entire Moderation category (prefix names like `$kick` collide with fun commands such as `$react kick`, so moderation never runs on prefix). See `Commands.md` for the full 169-entry command list and `ErrorList.md` for every error code the bot can emit.

### Moderation & Administration

* Mass ban/kick, ban, kick, timeout/untimeout, purge, lock/unlock, say, DM staff tooling (all slash-only)
* Warning system with detailed case tracking (`warn`, `warnings`, `cases`)
* User notes for long-term staff context (`usernotes add/view/remove/clear`)
* User reports with a dedicated report channel (`report file`, `report setchannel`)
* Command access control: enable/disable commands or entire categories per server (`commands dashboard/enable/disable`)

### Economy

* Wallet + bank, `balance`, `pay`, `deposit`, `withdraw`
* Earn commands: `work`, `crime`, `slut`, `rob`, `beg`, `fish`, `mine`, `gamble`, `daily`
* Item shop + inventory (`shop`, `buy`, `inventory`), including a **Counting Shield** ($500, max 2 held) and an **XP Boost** (+10% XP for 6h, max 10 held, 12h reuse cooldown)
* Premium role bonus (+10% cash, +5pp success on earn commands) and jail restrictions on earn commands
* Server leaderboard (`eleaderboard`) and per-server economy dashboard

### Leveling

* Message, voice, and reaction XP with custom rates, ignore channels/roles, and editable level-up messages
* Infinite role rewards, per-level rewards, first-place holder rewards, and booster roles
* `rank` cards with progress bars, lifetime XP, and active boost display; server `leaderboard`

### Counting Game

* Smart parsing: digits, number words, arithmetic, `expression=result` validation, `\` chatter splitting
* Ruin embeds with exact failure reasons plus community vote restore (configurable threshold, live reaction tally, expiry safeguards) and admin instant restore (`count restore`)
* Progressive anti-spam: warnings, then ruin events with temporary counting penalties
* Counting Shields save the sequence on mistakes; milestones and streaks pay XP (30% of level requirement) and economy rewards (30% of net worth, min $1,000) and post to starboard

### Starboard

* Auto-showcases posts reaching a configurable star threshold with custom emoji (standard or custom)
* Full media rendering (images, GIFs, videos, URLs), live tally updates, and automatic removal when reactions drop below threshold
* `setchannelstarboard`, `removestarboard` (prefix)

### Music (Lavalink v4 via Riffy)

* `/play` (direct links including YouTube, Spotify/Deezer/Apple sources, plain search with `ytmsearch`→`scsearch` fallback), `/queue` (paginated), `/nowplaying`, `/join`
* Full controls: pause, resume, skip, stop (with confirmation on long queues), shuffle, loop (off/track/queue), volume, seek, remove, move, clear, leave, 24/7
* **Autoplay** recommendations with toggle command + player-card button, 20-track history ring, and `• Autoplay` footer tag
* **DSP filters**: bassboost, nightcore, vaporwave, 8D, karaoke (+ clear), validated against live node capabilities
* **Interactive `/music search`**: paginated results with a track-picker menu
* **Liked songs**: save up to 100 tracks per user in PostgreSQL (`likes add/list/remove/play`)
* **Session persistence**: 24/7 sessions (voice/text channels, volume, loop, autoplay, filter, queue) survive restarts with automatic re-hydration
* **Multi-node failover**: penalty-based migration on disconnect/failure, reconnect retries, session resuming, per-node player/penalty telemetry in `/music ping` and `/stats`
* Now Playing card with progress bar, artwork, requester display name, and control buttons; session summary cards (dismissible, 10-minute expiry) replace message deletion
* Auto-leaves an empty voice channel after 7s (pauses instead in 24/7 mode); sets the voice channel status to the current song

### Search & Utilities

* `search define` (Wikipedia), `search duckduckgo` (Instant Answers + HTML fallback), `search urban` — all with paginated results
* `shorten` via spoo.me with custom endings (3–16 chars)
* `weather` (Open-Meteo + geocoding), `hexcolor` with preview, `countdown`, `poll`, `calculate`, `baseconvert`, `unixtime`, `time`, `avatar`, `serverinfo`, `userinfo`, `randomuser`, `firstmsg`

### Fun & Giveaways

* `fact`, `dogfact`, `catfact`, `react` (59 anime emotions via nekos.best + husbando/kitsune/neko/waifu images), `fight`, `flip`, `roll`
* Giveaways with timed entries, multi-winners, end/reroll/delete (`gcreate`, `gend`, `greroll`, `gdelete`)

### Tickets, Applications & Community

* Tickets: setup panel, dashboard, claim, priorities, per-user limits, transcripts (`ticket setup/dashboard`, `claim`, `close`, `priority`)
* Applications: setup, submit, review, status (`apply`, `app-admin`)
* Welcome/goodbye messages with custom embeds, auto-roles, verification gates (`greet dashboard`, `welcome setup`, `verify`, `autoverify`)
* Join-to-Create voice channels, reaction roles, server stats trackers, birthday tracking with timezone-aware announcements
* Rich logging dashboard (channels, category toggles, filters), personal/global to-do lists, `wipedata` for GDPR-style self-deletion

### Reliability

* PostgreSQL persistence with automatic in-memory fallback (degraded mode)
* Structured error registry — every code documented in `ErrorList.md`
* `/stats` system dashboard: runtime, reach, per-API health checks, Lavalink node ping
* Component timeouts and stale-interaction guards throughout

## Quick Setup

### Docker Deployment (Recommended)

1. Clone the repo:
```bash
git clone https://github.com/Erioer/MidNight-bot.git
cd MidNight-bot

```


2. Copy the config template:
```bash
cp .env.example .env

```


Open `.env` and fill in `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID`.
3. Start everything up:
```bash
docker compose up -d --build

```


4. Verify it's actually running:
```bash
docker compose ps
curl http://localhost:3000/health

```



### Using GitHub Container Registry

If you just want to pull the ready-made container image directly:

```bash
docker pull ghcr.io/Erioer/MidNight:main

```

---

## Music Setup

Music runs on Lavalink v4 through Riffy.

* **Default Mode**: Uses the public node pool in `lavalink/nodes.json` (US + EU nodes, mixed SSL/plain). Override with `LAVALINK_NODES` (JSON array) or `LAVALINK_NODES_FILE`.
* **Self-Hosted Mode**: Run `docker compose --profile local-lavalink up -d` and set `LAVALINK_HOST` in your `.env` — that node becomes **primary** (preferred for new players, marked `★ Primary` in `/music ping`), with the file pool as secondary failover targets:
```env
LAVALINK_HOST=lavalink
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
LAVALINK_SECURE=false

```


No need to touch `lavalink/nodes.json` — its entries automatically become secondaries. Failover between nodes is penalty-based, and players do not move back when the primary recovers.
* **Important Permission Note**: Give the bot the `Set Voice Channel Status` permission, or the automatic song-name status feature will silently cry in the logs and fail.

---

## Manual Installation

### Prerequisites

* Node.js 20.10.0 or higher
* PostgreSQL database

### Steps

1. Clone and install dependencies:
```bash
git clone https://github.com/Erioer/MidNight.git
cd MidNight
npm install

```


2. Copy `.env.example` to `.env` and fill in your bot token, client ID, and database credentials.
3. Create your database (`createdb midnight`) and set user permissions.
4. Verify database migrations and start the bot:
```bash
npm run migrate:check
npm start

```



---

## Required Bot Intents & Permissions

* **Intents**: Guilds, Guild Messages, Message Content, Guild Members, Guild Message Reactions, Guild Voice States, and Direct Messages.
* **Permissions**: View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Manage Messages, Manage Channels, Manage Roles, Kick/Ban/Moderate Members, Connect, and Voice Channel Status.

### Read the original repo's README for anything I forgot to mention here

[Link to Original repo](https://github.com/codebymitch/TitanBot)
