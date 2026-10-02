# MidNight — Feature-Rich Discord Bot

**MidNight** is a feature-packed Discord bot that throws moderation, economy, music, fun stuff, and community tools into a single package so you don't have add 10 different bots for each thing. It is built with discord.js 14 and PostgreSQL.

## List of changes in this fork

Note: All the commands that I added are prefix only because TitanBot for some reason already had 99 registered commands and discord only allows for 100 so yeah, prefix future proof adding commands without having to deal with original code
(Also use `/configwizard` to set a prefix because prefix are not enabled by default)

### 1. Starboard system

The starboard system was added to automatically showcase top-tier community posts whenever they reach a set threshold of star reactions. It features full visual rendering for media attachments alongside simple configuration commands:

* **Full Media & Visual Compatibility**:
  * Automatically detects and displays image attachments, animated GIFs, video previews, and image URLs inside the starboard embed
  * Handles multi-attachment posts seamlessly so no visual context is lost when a message gets starred
  * Strips clutter while keeping the original author link, jump link, channel origin, and total reaction tally clean

* **Dynamic Star Tally & Live Embed Updates**:
  * Updates the reaction count in real-time as more users react to the original message
  * Removes or updates the starboard entry automatically if reactions drop below the required threshold

* **Commands & Configuration**:
  * `setchannelstarboard <channel> <emoji> <threshold>` — Configures the designated starboard channel, custom star emoji (supports both standard and custom Discord emojis), and minimum required reaction count
  * `removestarboard` — Instantly disables the starboard system and removes the active configuration for the server

### 2. Level System rework and Arcane comparison

The level system is now verses Arcane bot's premium leveling system:

* Voice leveling/xp: ✅
* Custom XP values: ✅
* Role rewards: **infinite**
* Role rewards per level: **infinite**
* First place role updates: **updates the second you level up** (soo its better at something at least)
* Booster roles: **infinite**

Note: All of the above features related to leveling just now were Arcane's premium features, Now listing more leveling features that i added

* Reaction leveling/XP (i think i didn't gave a user-friendly option to change this so just edit the code for now)
* First rank holder rewards
* Booster roles
* Ignore channels or roles
* Edit level up messages
* Also `/level setup` does nothing in this fork and I'm too lazy to remove it

### 3. Counting System rework, smart parsing, and safeguards

The counting game was completely rewritten around smart parsing, transparent ruin mechanics, community safety nets, scalable rewards, and full economy integration:


* **Smart parsing & chat support**:
  * Plain digits, number words (`one`, `first`, `twenty-four`, `one hundred`), and arithmetic (`4*4`, `32/2`, `10+6`, `4^2`, `4**2`, parentheses) are all accepted
  * `expression=result` form is validated (`4*4=16` counts, `4*4=15` does not)
  * The bot reacts directly on your own message: ✅ for a correct count, ❌ for a wrong one
  * A backslash (`\`) splits a count from chatter: `55 \ we got this to hundred` counts **55** and ignores the rest
  * Messages starting with `\` are treated as pure chatter and never touch the sequence
  * Non-comment messages containing text or multiple numbers without `\` are auto-deleted with a temporary notice quoting the original text, which stays up for **30s** so it can actually be read
  * Every other number system (hex, binary, base36, base64, Roman, alphabet) uses its own strict alphabet, preventing smart decimal parsing from interfering with other modes


* **Ruin & restore mechanics**:
  * Wrong numbers and double-counting post a **permanent** ruin embed displaying the sent value, expected value, next expected number, high score, exact failure reason, and live vote tally
  * **Community Vote Restore**: Members restore a ruined count by reacting with 🔄 on the ruin embed. The vote threshold is configurable via `/count setup` (default: `3`) and stored in PostgreSQL to survive bot restarts
  * The tally shown on the embed is read from Discord's **live reaction count**, so it can never drift from the real number of 🔄 reactions
  * Vote safety controls: One vote per member, and removing the 🔄 reaction decrements the tally
  * **Vote safeguards**: A vote window stays open for **30 minutes** *or* until **5 valid counts** have rebuilt the sequence, whichever comes first, and is voided the moment the rebuilt count reaches the restore target. Only one vote window can exist at a time—a newer ruin voids the previous embed (*"Overwritten by a newer ruin event"*). Every closed vote is rewritten with its end state (Voided / Expired / Restore Cancelled / Closed) and has its 🔄 reactions removed. Timers are re-armed and stale votes closed automatically on bot startup
  * **Admin Instant Restore**: `/count restore` (requires *Manage Server* or *Manage Channels*) instantly reverts the sequence to the last number that counted and clears pending votes


* **Progressive anti-spam penalties**:
  * Posting multiple numbers **or plain text without a `\**` triggers progressive warnings
  * Offences 1 and 2 auto-delete the message and preserve the active count sequence
  * The 3rd consecutive offence triggers an official **Ruin Event**, which resets the count and temporarily penalizes the offender by auto-deleting their counting attempts until **3 valid counts** are completed by other users or **60s** elapse


* **Counting Shields (Economy Integration)**:
  * Users can hold a maximum of **2 Shields** in their inventory
  * Purchased directly from the economy shop for **$500** (`buy counting_shield`) or automatically awarded upon reaching valid count thresholds
  * When a user who holds a shield makes a mistake, 1 Shield is consumed automatically—saving the sequence, preserving the next expected number, and retaining the last counter
  * Fully integrated into the economy inventory system, so bought and earned shields share the same item object


* **Scalable Milestones, Starboard & Rewards**:
  * Server count, user count, mistake/blunder, and daily active streak milestones are array-driven in `src/config/countingGameConfig.js` for easy expansion without code rewrites
  * **Leveling Rewards**: Reaching user milestones or daily streak targets awards **30% of the total XP required** for the user's current level (e.g., 300 XP awarded if Level 5 requires 1,000 total XP)
  * **Economy Rewards**: Awards **30% of total net worth** (wallet + bank) deposited directly into the bank account (guaranteed minimum payout of **$1,000**)
  * Milestone events are automatically posted to the configured starboard channel


* **Essential Event Logging**:
  * Clean, non-spammy logging capturing only high-value events: count broken, count restored, shield consumed, game config changes, and major milestones reached


* **Commands & Leaderboard Metrics**:
  * Commands: `/count setup`, `/count disable`, `/count reset`, `/count restore`, `/count status`, `/count leaderboard`
  * Overhauled leaderboard tracking valid counts alongside **Daily Active Streak**, **Total Ruins/Mistakes**, **Accuracy Ratio**, and active **Shield Balances**



### 4. Fun commands and anime reaction gifs

* Added Commands: `fact`, `dogfact`, `catfact` and `react <emotion>` or just `<emotion>` for simplicity (Check `Commands.md` for the full list of available reaction commands)
* Includes 59 reaction emotion GIFs powered by the nekos.best API, displaying the `anime_name` beneath the GIF
* Features 4 image types (husbando, kitsune, neko, waifu) displaying the `artist_name` beneath the image
* Prefix shortcuts available: `!react <emotion>` or simply `<emotion>`

### 5. Music System tweaks and user playback features

* This bot will automatically leave the VC after **7s** when there's no user in the same VC as the bot
* Voice channel's status will automatically change to the name of the currently playing song
* Per-user likes: saves up to 100 songs with `/music likes` and play them back using bot's PostgreeSQL DB to store them
* A dedicated command to check available lavalink node's pings & status (automactically scales when new nodes are added or removed)
* Added Commands: `/music likes add`, `/music likes remove`, `/music likes play`, `/music likes list`,`/music ping`

### 6. Commands Policy and override system details

* Full structure covering all 20 categories with cascading resolution (Global Defaults --> Category Rules --> Individual Command Overrides)
* Flexible properties: `isEnabled`, `isAdminOnly` (requires Manage Server permission), `isSlashEnabled`, and `isPrefixEnabled`
* Commented properties (e.g. `#isEnabled: true`) inherit defaults, while uncommented lines force overrides
* Category-level kill switch: setting `isEnabled: false` on a category forces all contained commands to disable regardless of individual overrides
* Features a built-in reset switch (`restoreDefaults: true`) that restores the file to `DEFAULT_TEMPLATE` on startup and automatically reverts the switch back to `restoreDefaults: false`
* *Note: Requires a bot restart for any yml changes to take effect*

---

## What Else This Bot Can Do (The Baseline Features)

Here is a full summary of all baseline features inherited from TitanBot that actually matter:

* **Moderation & Administration**:
  * Mass ban and kick capabilities for bulk moderation
  * Member warning system and detailed case tracking
  * User notes so staff can record detailed moderation history


* **Economy System**:
  * Item shop, inventory, and user-to-user item trading
  * Gambling commands to risk virtual currency for rewards
  * Daily rewards, money transfer systems, and per-server economy configuration


* **Advanced Ticket System**:
  * Staff claim system with ticket priorities
  * Per-user ticket limits to prevent support spam
  * Automated transcript generation to save ticket chat history


* **Server Utilities & Community Tools**:
  * Live member counters and voice channel statistics
  * Self-assignable reaction roles supporting multiple emojis and roles
  * Multi-winner giveaways with automated picking, timed entries, and reroll options
  * Birthday tracking with timezone support and automated day-of celebration announcements
  * Welcome messages with custom embeds, auto-roles on join, and verification gates


* **Music Core Features**:
  * Multi-platform search supporting Spotify, Deezer, and Apple Music (YouTube URLs are blocked)
  * Persistent 24/7 playback mode
  * Interactive control buttons for play, skip, shuffle, loop, and queue controls



---

## Quick Setup

### Docker Deployment (Recommended)

1. Clone the repo:
```bash
git clone https://github.com/Erioer/MidNight-bot.git
cd MidNight

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

* **Default Mode**: Uses public SSL nodes listed in `lavalink/nodes.json`.
* **Self-Hosted Mode**: Run `docker compose --profile local-lavalink up -d` and set these in your `.env`:
```env
LAVALINK_HOST=lavalink
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
LAVALINK_SECURE=false

```


Then delete or rename `lavalink/nodes.json` so it falls back to your `.env` settings.
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
