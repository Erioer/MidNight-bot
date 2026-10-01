# MidNight — Feature-Rich Discord Bot

**MidNight** is a comprehensive Discord bot combining moderation, economy, music, entertainment, and community tools into a single ESM-native package. It is built with discord.js 14 and PostgreSQL.

## List of changes in this fork

Note: All the commands that I added are prefix only because the TitanBot for some reason already had 99 registered commands and discord only allows for 100 so yeah, prefix future proof adding commands without having to deal with original code
(Also use `/configwizard` to set a prefix because prefix are not enabled by default)

### 1. Added starboard system with image & GIF compatibility

* Commands: `setchannelstarboard <channel> <emoji> <threshold>`, and `removestarboard`

### 2. Level System rework

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

### 3. Counting System rework

The counting game was completely rewritten around smart parsing, transparent ruin mechanics, community safety nets, scalable rewards, and full economy integration:

* **Smart parsing & chat support**:
  * Plain digits, number words (`one`, `first`, `twenty-four`, `one hundred`), and arithmetic (`4*4`, `32/2`, `10+6`, `4^2`, `4**2`, parentheses) are all accepted
  * `expression=result` form is validated (`4*4=16` counts, `4*4=15` does not)
  * The bot reacts directly on your own message: ✅ for a correct count, ❌ for a wrong one
  * A backslash (`\`) splits a count from chatter: `55 \ we got this to hundred` counts **55** and ignores the rest. A backslash is used instead of `//` because Discord opens its slash-command menu on a leading slash
  * Messages starting with `\` are treated as pure chatter and never touch the sequence
  * Non-comment messages containing text or multiple numbers without `\` are auto-deleted with a temporary notice quoting the original text, which stays up for **30s** so it can actually be read
  * Discord does not ping user mentions placed inside an embed, so the offender is always mentioned in the message text *outside* the embed; the embed itself speaks in the second person
  * Every other number system (hex, binary, base36, base64, Roman, alphabet) uses its own strict alphabet, preventing smart decimal parsing from interfering with other modes

* **Ruin & restore mechanics**:
  * Wrong numbers and double-counting post a **permanent** ruin embed displaying the sent value, expected value, next expected number, high score, exact failure reason, and live vote tally
  * **Community Vote Restore**: Members restore a ruined count by reacting with 🔄 on the ruin embed. The vote threshold is configurable via `/count setup` (default: `3`) and stored in PostgreSQL to survive bot restarts
  * The tally shown on the embed is read from Discord's **live reaction count**, so it can never drift from the real number of 🔄 reactions
  * Vote safety controls: One vote per member, the user who broke the count cannot vote, and removing the 🔄 reaction decrements the tally
  * **Admin Instant Restore**: `/count restore` (requires *Manage Server* or *Manage Channels*) instantly reverts the sequence to the last number that counted and clears pending votes
  * **Ruin Cooldown**: The user who broke the count is temporarily penalized—their counting attempts are auto-deleted until **3 valid counts** are completed by other users or **60s** elapse

* **Progressive anti-spam penalties**:
  * Posting multiple numbers **or plain text without a `\`** triggers progressive warnings
  * Offences 1 and 2 auto-delete the message and preserve the active count sequence
  * The 3rd consecutive offence (in either form, they share one strike meter) triggers an official **Ruin Event**, which resets the count and places the offender on cooldown
  * A single correct count clears the user's active strike counter

* **Counting Shields (Economy Integration)**:
  * Users can hold a maximum of **2 Shields** in their inventory
  * Purchased directly from the economy shop for **$500** (`buy counting_shield`) or automatically awarded upon reaching valid count thresholds
  * When a user with a shield makes a mistake, 1 Shield is consumed automatically—saving the sequence, preserving the next expected number, and retaining the last counter
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

### 4. Fun commands

* Added Commands: `fact`, `dogfact`, `catfact` and `react <emotion>` or just `<emotion>` for simplicity

### 5. Music System tweaks

* This bot will automatically leave the VC after **7s** when there's no user in the same VC as the bot
* Voice channel's status will automatically change to the name of the currently playing song
* Per-user likes: saves up to 100 songs with `/music likes` and play them back using bot's PostgreeSQL DB to store them
* A dedicated command to check available lavalink node's pings & status (automactically scales when new nodes are added or removed)
* Added Commands: `/music likes add`, `/music likes remove`, `/music likes play`, `/music likes list`,`/music ping`

### 6. Commands Policy

* Full structure covering all 20 categories with cascading resolution (Global Defaults --> Category Rules --> Individual Command Overrides)
* Flexible properties: `isEnabled`, `isAdminOnly` (requires Manage Server permission), `isSlashEnabled`, and `isPrefixEnabled`
* Commented properties (e.g. `#isEnabled: true`) inherit defaults, while uncommented lines force overrides
* Category-level kill switch: setting `isEnabled: false` on a category forces all contained commands to disable regardless of individual overrides
* Features a built-in reset switch (`restoreDefaults: true`) that restores the file to `DEFAULT_TEMPLATE` on startup and automatically reverts the switch back to `restoreDefaults: false`
* *Note: Requires a bot restart for any yml changes to take effect*

---

## Features Overview

<table>
<tr>
<td width="50%" valign="top">
  
### Moderation & Administration

* Mass ban/kick capabilities.

* User notes and case management.

* Abuse protection with cooldowns.

### Economy System

* Shop, inventory, and item trading.

* Gambling, daily rewards, and pay systems.

* Configurable per-server economy.

### Fun & Entertainment

* 59 reaction emotion GIFs powered by the nekos.best API, displaying the `anime_name` beneath the GIF. *(For the complete list of available reaction commands, refer to the `commands.txt` file included in the repository).*

* 4 image types (husbando, kitsune, neko, waifu) displaying the `artist_name` beneath the image.

* Counting system with smart number parsing, counting shields, community restore votes, and milestone rewards that automatically verifies and reacts with a ✅ to correct numbers.

* Additional tools like text reversal, wanted posters, and random facts.

### Music

* Multi-platform search supporting Spotify, Deezer, and Apple Music, while blocking YouTube URLs.

* 24/7 mode ensuring persistent playback.

* Auto-leave system that automatically disconnects the bot when there are no users remaining in the voice channel.

* Auto status changer that updates the voice channel status to display the name of the currently playing song.

* Custom user playlists (likes/hearts list) allowing users to save and play back their own songs using the bot's default PostgreSQL database.

* Interactive buttons for play, skip, shuffle, loop, and queue controls.

* Queue management system to add, remove, move, clear, and paginate tracks.

### Additional Features

* **Leveling System**: An Arcane-style progression system featuring custom level rewards, special rewards for the highest rank holder, and configurable ignored channels/roles.

* **Starboard**: Highlight community messages with full support for archiving images and GIFs.

* **Advanced Ticket System**: Priority management, configurable limits, transcripts, and a staff dashboard.

* **Server Stats & Reaction Roles**: Live voice/member counters, multi-role support, and dashboards.

* **Giveaways**: Multi-winner support, rerolls, timed entries, and automated announcements.

* **Birthday System**: Timezone support and automatic day-of announcements.

* **Welcome & Verification**: Custom embeds, auto-role on join, verification gates, and join-to-create temporary voice channels.

* Prefix shortcuts including `!play`, `!skip`, `!stop`, `!queue`, and `!react <emotion>` or you can just do `<emotion>`.

</td>
</tr>
</table>

## Quick Setup
### Docker Deployment (Recommended)


1. Clone the repository using `git clone (https://github.com/Erioer/MidNight-bot.git` and navigate inside with `cd MidNight`.

2. Configure environment variables by copying the template: `cp .env.example .env`. At minimum, set `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID`. Docker Compose will read `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` from `.env`, which default to `midnight` / `password` / `midnight`.

3. Build and start the bot with `docker compose up -d --build`.

4. Verify the deployment using `docker compose ps` and `curl http://localhost:3000/health`. By default, `POSTGRES_SSL=false` and `AUTO_MIGRATE=true` are set in the compose file.


### Using GitHub Container Registry

Pull the latest image using `docker pull ghcr.io/Erioer/MidNight:main`.

## Music Setup

Music is powered by Lavalink v4 via Riffy.

* **Default Setup**: Multiple public v4 SSL nodes load from `lavalink/nodes.json`. Edit this file to manage node connections.

* **Self-Hosted Setup**: Run `docker compose --profile local-lavalink up -d`. Add the following to `.env`: `LAVALINK_HOST=lavalink`, `LAVALINK_PORT=2333`, `LAVALINK_PASSWORD=youshallnotpass`, and `LAVALINK_SECURE=false`. Remove or rename `lavalink/nodes.json` to enforce environment-variable fallback.

* **Voice Channel Status**: Requires the `SET_VOICE_CHANNEL_STATUS` permission on the bot's role. Without it, the current song status silently fails and logs a warning.


## Manual Installation

### Prerequisites

* Node.js 20.10.0 or higher.

* PostgreSQL (recommended) or in-memory fallback.


### Steps


1. Clone the repository with `git clone [https://github.com/Erioer/MidNight.git](https://github.com/Erioer/MidNight.git)`, navigate to `cd MidNight`, and run `npm install`.

2. Copy `.env.example` to `.env` and configure `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID`.

3. For production environments, define `NODE_ENV=production`, `LOG_LEVEL=warn`, `WEB_HOST=0.0.0.0`, `PORT=3000`, and `PORT_RETRY_ATTEMPTS=5`.

4. Set up PostgreSQL by creating the database `createdb midnight` and configuring user privileges.

5. Verify the database using `npm run migrate:check` and start the bot using `npm start`.


## Required Bot Intents & Permissions

* **Intents**: Guilds, Guild Messages, Message Content, Guild Members, Guild Message Reactions, Guild Voice States, and Direct Messages.

* **Permissions**: View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Manage Messages, Manage Channels, Manage Roles, Kick/Ban/Moderate Members, Connect, and Voice Channel Status (required for the now-playing status feature).*

### Read the original repo's README for the information i may have missed here
[Link to Original repo](https://github.com/codebymitch/TitanBot)
