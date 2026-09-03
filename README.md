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

### 3. Counting System (a tiny little change)

* Bot will react with ✅, why? because its kinda annoying to not know that the bot even registered the message

### 4. Fun commands

* Added Commands: `fact`, `dogfact`, `catfact` and `react <emotion>` or just `<emotion>` for simplicity

### 5. Music System tweaks

* This bot will automatically leave the VC after **7s** when there's no user in the same VC as the bot
* Voice channel's status will automatically change to the name of the currently playing song
* Per-user likes: saves up to 100 songs with `/music likes` and play them back using bot's PostgreeSQL DB to store them
* Added Commands: `/music likes add`, `/music likes remove`, `/music likes play`, `/music likes list`

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

* Counting system that automatically verifies and reacts with a ✅ to correct numbers.

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
