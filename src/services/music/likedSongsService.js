import { successEmbed } from '../../utils/embeds.js';
import { MidNightError, ErrorTypes } from '../../utils/errorHandler.js';
import { getUserLikedSongsKey } from '../../utils/database/keys.js';
import { getPlayer, ensurePlayer } from './musicActions.js';

const MAX_LIKED_SONGS = 100;
const DISPLAY_LIMIT = 25;

async function ensureDb(client) {
    if (!client.db || typeof client.db.get !== 'function') {
        throw new MidNightError(
            'Database unavailable',
            ErrorTypes.CONFIGURATION,
            'The database is unavailable right now. Try again later.',
        );
    }
}

export async function getLikedSongs(client, userId) {
    await ensureDb(client);
    const raw = await client.db.get(getUserLikedSongsKey(userId), []);
    return Array.isArray(raw) ? raw : [];
}

async function saveLikedSongs(client, userId, songs) {
    await ensureDb(client);
    await client.db.set(getUserLikedSongsKey(userId), songs);
}

export async function addCurrentSongToLikes(client, interaction, userId) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.current) {
        throw new MidNightError('Nothing playing', ErrorTypes.USER_INPUT, 'Nothing is playing right now.');
    }

    const info = player.current.info || {};
    const uri = info.uri;
    if (!uri) {
        throw new MidNightError('Cannot save', ErrorTypes.USER_INPUT, 'The current track cannot be saved to your liked songs.');
    }

    const songs = await getLikedSongs(client, userId);
    if (songs.some((song) => song.uri === uri)) {
        throw new MidNightError(
            'Already saved',
            ErrorTypes.USER_INPUT,
            `**${info.title}** is already in your liked songs.`,
        );
    }
    if (songs.length >= MAX_LIKED_SONGS) {
        throw new MidNightError(
            'Limit reached',
            ErrorTypes.USER_INPUT,
            `You can save up to **${MAX_LIKED_SONGS}** songs. Remove some with **/music likes remove**.`,
        );
    }

    songs.push({
        title: info.title || 'Unknown',
        author: info.author || 'Unknown',
        uri,
        addedAt: Date.now(),
    });
    await saveLikedSongs(client, userId, songs);

    return successEmbed(
        'Song Saved',
        `Added **${info.title}** to your liked songs.\nUse **/music likes list** to view it, or **/music likes play 1** to play it.`,
    );
}

export async function listLikedSongs(client, userId) {
    const songs = await getLikedSongs(client, userId);
    if (songs.length === 0) {
        throw new MidNightError(
            'Empty playlist',
            ErrorTypes.USER_INPUT,
            'You have no liked songs yet. Play something and use **/music likes add**.',
        );
    }

    const shown = songs.slice(0, DISPLAY_LIMIT);
    const lines = shown.map((song, index) => `**${index + 1}.** ${song.title} — ${song.author}`);
    const extra = songs.length > DISPLAY_LIMIT ? `\n… and ${songs.length - DISPLAY_LIMIT} more.` : '';
    return successEmbed(`Your Liked Songs (${songs.length})`, lines.join('\n') + extra);
}

export async function removeLikedSong(client, userId, index) {
    const songs = await getLikedSongs(client, userId);
    const songIndex = index - 1;
    if (songIndex < 0 || songIndex >= songs.length) {
        throw new MidNightError(
            'Invalid number',
            ErrorTypes.USER_INPUT,
            `You have **${songs.length}** liked song(s). Pick a number between 1 and ${Math.max(songs.length, 1)}.`,
        );
    }

    const [removed] = songs.splice(songIndex, 1);
    await saveLikedSongs(client, userId, songs);
    return successEmbed('Song Removed', `Removed **${removed.title}** from your liked songs.`);
}

export async function playLikedSong(client, interaction, userId, index) {
    const songs = await getLikedSongs(client, userId);
    const songIndex = index - 1;
    if (songIndex < 0 || songIndex >= songs.length) {
        throw new MidNightError(
            'Invalid number',
            ErrorTypes.USER_INPUT,
            `You have **${songs.length}** liked song(s). Pick a number between 1 and ${Math.max(songs.length, 1)}.`,
        );
    }

    const song = songs[songIndex];
    const { player } = await ensurePlayer(client, interaction);

    const result = await client.riffy.resolve({ query: song.uri, requester: interaction.user });
    const track = result?.tracks?.[0];
    if (!track) {
        throw new MidNightError(
            'Unavailable',
            ErrorTypes.USER_INPUT,
            `**${song.title}** could not be played right now. It may have been removed from its source.`,
        );
    }

    track.info.requester = interaction.user;
    player.queue.add(track);
    const willPlayNow = !player.playing && !player.paused;
    if (willPlayNow) {
        player.play();
    }

    return successEmbed(
        willPlayNow ? 'Now Playing' : 'Track Added',
        `**${track.info.title}**\n${track.info.author}\nPosition: #${player.queue.length} in queue`,
    );
}
