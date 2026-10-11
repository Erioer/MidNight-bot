import { MessageFlags } from 'discord.js';
import { success } from './musicEmbeds.js';
import { NO_PINGS, v2Flags } from '../../utils/componentsV2.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { MidNightError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { getGuildMusicData, clearUpdateInterval, clearAutoLeaveTimer } from './playerStore.js';
import { clearVoiceChannelStatus } from './voiceStatus.js';
import { canControlMusic, requireVoiceChannel, VOICE_CHANNEL_DENIAL } from './permissions.js';
import {
    buildNowPlayingContainer,
    buildQueueContainer,
    buildQueuePaginationRow,
    getQueuePageSize,
} from './musicEmbeds.js';
import { refreshPlayerMessage, transitionToSummary } from './playerHandler.js';
import { scheduleSessionSave } from './musicSessionService.js';
import { ECONOMY_ACCENT } from '../economy/economyViews.js';

const RESOLVER_FALLBACK_SOURCES = ['ytmsearch', 'scsearch'];
const UNSUPPORTED_RESOLVER_LOAD_TYPES = new Set(['NO_MATCHES', 'LOAD_FAILED', 'empty', 'error']);

export function isResolverUrl(value) {
    try {
        const url = new URL(String(value ?? '').trim());
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function decodeResolverSegment(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

export function extractSearchTermsFromUrl(value) {
    const text = String(value ?? '').trim();
    let url = null;
    try {
        url = new URL(text);
    } catch {
        return text;
    }

    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const segments = url.pathname
        .split('/')
        .map((segment) => decodeResolverSegment(segment.trim()))
        .filter(Boolean);
    const lastSegment = segments.length > 0 ? segments[segments.length - 1] : '';

    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
        return lastSegment || text;
    }

    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        const videoId = url.searchParams.get('v');
        if (videoId) {
            return videoId;
        }
        if (segments.length >= 2 && ['shorts', 'embed', 'live', 'videos'].includes(segments[0].toLowerCase())) {
            return segments[1];
        }
        return lastSegment || text;
    }

    if (lastSegment) {
        const cleaned = lastSegment
            .replace(/\.[a-z0-9]{2,5}$/i, '')
            .replace(/[-_+]+/g, ' ')
            .trim();
        return cleaned || text;
    }

    return text;
}

function normalizeResolverSource(source) {
    return String(source ?? '').trim().toLowerCase() || 'ytmsearch';
}

export function buildResolverAttempts(rawQuery, defaultSource = 'ytmsearch') {
    const trimmed = String(rawQuery ?? '').trim();
    if (!trimmed) {
        return [];
    }

    const normalizedDefaultSource = normalizeResolverSource(defaultSource);
    const attempts = [{ query: trimmed }];
    const seen = new Set([`default:${trimmed}`]);
    const push = (query, source = null) => {
        const candidate = String(query ?? '').trim();
        if (!candidate) {
            return;
        }
        // Riffy ignores an explicit source for URL identifiers, so only search
        // terms can use source-specific fallbacks.
        if (source && isResolverUrl(candidate)) {
            return;
        }
        const key = `${source || 'default'}:${candidate}`;
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        attempts.push(source ? { query: candidate, source } : { query: candidate });
    };

    if (isResolverUrl(trimmed)) {
        push(extractSearchTermsFromUrl(trimmed));
    } else {
        push(trimmed.replace(/\s+/g, ' '));
    }

    const fallbackTerms = attempts.length > 1 ? attempts[1].query : trimmed;
    for (const source of RESOLVER_FALLBACK_SOURCES) {
        if (source === normalizedDefaultSource) {
            continue;
        }
        push(fallbackTerms, source);
    }

    return attempts;
}

function hasUsableResolverTracks(result) {
    if (!result || !Array.isArray(result.tracks) || result.tracks.length === 0) {
        return false;
    }
    return !UNSUPPORTED_RESOLVER_LOAD_TYPES.has(result.loadType);
}

function formatResolverFailure(lastResult, errors) {
    const lastError = errors.length > 0 ? errors[errors.length - 1] : null;
    const underlying = lastError?.message
        || lastResult?.exception?.message
        || lastResult?.exception?.cause
        || lastResult?.loadType;
    const reason = typeof underlying === 'string' && underlying.trim()
        ? underlying.trim()
        : 'Track unavailable or age/region-restricted.';
    const trimmedReason = reason.length > 300 ? `${reason.slice(0, 300)}…` : reason;
    return `Lavalink said: ${trimmedReason}`;
}

export async function resolveTrackQuery(client, rawQuery, requester) {
    const trimmed = String(rawQuery ?? '').trim();
    if (!trimmed) {
        throw new MidNightError(
            'Missing query',
            ErrorTypes.VALIDATION,
            'Enter a song name or URL.',
        );
    }

    const attempts = buildResolverAttempts(trimmed, client?.riffy?.defaultSearchPlatform);
    let lastResult = null;
    const errors = [];

    for (const attempt of attempts) {
        try {
            const result = await client.riffy.resolve({
                query: attempt.query,
                requester,
                ...(attempt.source ? { source: attempt.source } : {}),
            });
            lastResult = result;
            if (hasUsableResolverTracks(result)) {
                return { result, attempts: attempts.length };
            }
        } catch (error) {
            lastResult = null;
            errors.push(error);
        }
    }

    throw new MidNightError(
        'No results',
        ErrorTypes.USER_INPUT,
        `No results found. ${formatResolverFailure(lastResult, errors)}`,
    );
}


export function getPlayer(client, guildId) {
    return client.riffy?.players?.get(guildId) || null;
}

/**
 * Starts playback without letting a node failure escape as an unhandled
 * rejection. A failed start is logged at debug level; the user-facing reply
 * was already built from the queued track, and the engine surfaces real
 * outages through node events and track errors.
 */
export function startPlayback(client, player, guildId) {
    try {
        const result = player.play();
        if (result?.catch) {
            result.catch((error) => {
                logger.debug(`Playback start failed in guild ${guildId}:`, error?.message || error);
            });
        }
    } catch (error) {
        logger.debug(`Playback start threw in guild ${guildId}:`, error?.message || error);
    }
}

export function assertRiffyAvailable(client) {
    if (!client.riffy) {
        throw new MidNightError(
            'Lavalink not configured',
            ErrorTypes.CONFIGURATION,
            'Music is unavailable — Lavalink is not configured.',
        );
    }
}

export function assertInVoice(member) {
    if (!requireVoiceChannel(member)) {
        throw new MidNightError(
            'Not in voice channel',
            ErrorTypes.USER_INPUT,
            'You need to be in a voice channel.',
        );
    }
}

export function assertCanControl(member, player) {
    if (!canControlMusic(member, player)) {
        throw new MidNightError(
            'Wrong voice channel',
            ErrorTypes.PERMISSION,
            VOICE_CHANNEL_DENIAL,
        );
    }
}

export async function ensurePlayer(client, interaction) {
    assertRiffyAvailable(client);
    assertInVoice(interaction.member);

    const guildId = interaction.guild.id;
    const guildData = getGuildMusicData(guildId);
    let player = getPlayer(client, guildId);

    if (!player) {
        player = client.riffy.createConnection({
            guildId,
            voiceChannel: interaction.member.voice.channel.id,
            textChannel: interaction.channel.id,
            deaf: true,
        });
        guildData.playerChannelId = interaction.channel.id;
        await applyStoredFilter(player, guildData);
    }

    player.setVolume(guildData.volume);
    return { player, guildData };
}

function isDuplicateTrack(player, track) {
    const uri = track?.info?.uri;
    if (!uri) {
        return false;
    }
    if (player.current?.info?.uri === uri) {
        return true;
    }
    return player.queue.some((existing) => existing.info?.uri === uri);
}

const FILTER_PRESETS = {
    clear: { label: 'Clear', method: null, args: [], requires: null },
    bassboost: { label: 'Bassboost', method: 'setBassboost', args: [true, { value: 3 }], requires: 'equalizer' },
    nightcore: { label: 'Nightcore', method: 'setNightcore', args: [true, { rate: 1.25 }], requires: 'timescale' },
    vaporwave: { label: 'Vaporwave', method: 'setVaporwave', args: [true, { pitch: 0.8 }], requires: 'timescale' },
    '8d': { label: '8D', method: 'set8D', args: [true, { rotationHz: 0.2 }], requires: 'rotation' },
    karaoke: {
        label: 'Karaoke',
        method: 'setKaraoke',
        args: [true, { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 }],
        requires: 'karaoke',
    },
};

export const FILTER_PRESET_NAMES = Object.keys(FILTER_PRESETS);

function getFilterPreset(presetName) {
    const preset = FILTER_PRESETS[presetName];
    if (!preset) {
        throw new MidNightError(
            'Invalid filter',
            ErrorTypes.VALIDATION,
            `Unknown audio filter. Choose one of: ${FILTER_PRESET_NAMES.join(', ')}.`,
        );
    }
    return preset;
}

function assertFilterSupported(player, preset) {
    if (!player?.node?.connected) {
        throw new MidNightError(
            'Filters unavailable',
            ErrorTypes.CONFIGURATION,
            'Audio filters are unavailable while the Lavalink node is disconnected.',
        );
    }
    if (!player.filters || typeof player.filters.clearFilters !== 'function' || typeof player.filters.updateFilters !== 'function') {
        throw new MidNightError(
            'Filters unavailable',
            ErrorTypes.CONFIGURATION,
            'Audio filters are unavailable on the current player.',
        );
    }
    const available = player.node?.info?.filters;
    if (Array.isArray(available) && preset.requires && !available.includes(preset.requires)) {
        throw new MidNightError(
            'Filter unsupported',
            ErrorTypes.CONFIGURATION,
            `The active Lavalink node does not support the ${preset.label} filter.`,
        );
    }
}

export async function applyFilterPreset(player, guildData, presetName) {
    const preset = getFilterPreset(presetName);
    assertFilterSupported(player, preset);
    if (!preset.method) {
        await player.filters.clearFilters();
    } else {
        const apply = player.filters[preset.method];
        if (typeof apply !== 'function') {
            throw new MidNightError(
                'Filters unavailable',
                ErrorTypes.CONFIGURATION,
                'Audio filters are unavailable on the current player.',
            );
        }
        apply.apply(player.filters, preset.args);
        await player.filters.updateFilters();
    }
    guildData.filterPreset = presetName;
    return preset;
}

export async function applyStoredFilter(player, guildData) {
    if (!player || !guildData || guildData.filterPreset === 'clear') {
        return;
    }
    try {
        await applyFilterPreset(player, guildData, guildData.filterPreset);
    } catch (error) {
        logger.warn(`Stored audio filter "${guildData.filterPreset}" could not be applied:`, error?.message || error);
    }
}

export async function setAudioFilter(client, interaction, presetName) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player) {
        throw new MidNightError('No player', ErrorTypes.USER_INPUT, 'No active music player.');
    }
    assertCanControl(interaction.member, player);

    const preset = await applyFilterPreset(player, getGuildMusicData(interaction.guild.id), presetName);
    await refreshPlayerMessage(client, interaction.guild.id);
    scheduleSessionSave(client, interaction.guild.id);
    if (presetName === 'clear') {
        return success('Filters Cleared', 'Audio filters cleared.');
    }
    return success('Filter Applied', `Audio filter set to **${preset.label}**.`);
}

export async function joinVoiceChannel(client, interaction) {
    assertRiffyAvailable(client);
    assertInVoice(interaction.member);

    const guildId = interaction.guild.id;
    const guildData = getGuildMusicData(guildId);
    const channel = interaction.member.voice.channel;
    let player = getPlayer(client, guildId);

    if (player && player.voiceChannel !== channel.id) {
        try {
            player.destroy();
        } catch {
            // player may already be gone
        }
        player = null;
    }

    if (!player) {
        player = client.riffy.createConnection({
            guildId,
            voiceChannel: channel.id,
            textChannel: interaction.channel.id,
            deaf: true,
        });
        guildData.playerChannelId = interaction.channel.id;
        await applyStoredFilter(player, guildData);
    }

    player.setVolume(guildData.volume);

    return success(
        'Joined Voice Channel',
        `Connected to **${channel.name}**. Use /play to start music, or /music for playback controls.`,
    );
}

export async function playQuery(client, interaction, query) {
    const { player, guildData } = await ensurePlayer(client, interaction);

    const { result } = await resolveTrackQuery(client, query, interaction.user);

    const { loadType, tracks, playlistInfo } = result;

    if (loadType === 'playlist' || loadType === 'PLAYLIST_LOADED') {
        let added = 0;
        let skipped = 0;

        for (const track of tracks) {
            track.info.requester = interaction.user;
        track.info.requesterName = interaction.member?.displayName || interaction.user.displayName || interaction.user.username;
            if (isDuplicateTrack(player, track)) {
                skipped += 1;
                continue;
            }
            player.queue.add(track);
            added += 1;
        }

        if (!player.playing && !player.paused) {
            startPlayback(client, player, interaction.guild.id);
        }

        scheduleSessionSave(client, interaction.guild.id);
        return {
            container: success(
                'Playlist Added',
                `**${playlistInfo?.name || 'Playlist'}**\nAdded ${added} of ${tracks.length} track(s).${skipped ? ` Skipped ${skipped} duplicate(s).` : ''}`,
            ),
        };
    }

    if (
        loadType === 'search'
        || loadType === 'track'
        || loadType === 'SEARCH_RESULT'
        || loadType === 'TRACK_LOADED'
    ) {
        const track = tracks?.[0];
        if (!track) {
            throw new MidNightError('No results', ErrorTypes.USER_INPUT, 'No results found for that query.');
        }

        if (isDuplicateTrack(player, track)) {
            throw new MidNightError(
                'Duplicate track',
                ErrorTypes.USER_INPUT,
                `**${track.info.title}** is already in the queue or playing.`,
            );
        }

        track.info.requester = interaction.user;
        track.info.requesterName = interaction.member?.displayName || interaction.user.displayName || interaction.user.username;

        const willPlayNow = !player.playing && !player.paused;
        player.queue.add(track);
        const queuePosition = player.queue.length;

        if (willPlayNow) {
            startPlayback(client, player, interaction.guild.id);
        }

        scheduleSessionSave(client, interaction.guild.id);
        return {
            container: success(
                willPlayNow ? 'Now Playing' : 'Track Added',
                willPlayNow
                    ? `**${track.info.title}**\n${track.info.author}`
                    : `**${track.info.title}**\n${track.info.author}\nPosition: #${queuePosition} in queue`,
            ),
        };
    }

    throw new MidNightError('No results', ErrorTypes.USER_INPUT, `No results found. (loadType: ${loadType})`);
}

export async function skipTrack(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.current) {
        throw new MidNightError('No player', ErrorTypes.USER_INPUT, 'Nothing is playing right now.');
    }
    assertCanControl(interaction.member, player);
    const title = player.current.info?.title || 'Unknown';
    // Under track-loop, stop() would replay the same track. Clear it so the skip
    // advances; trackStart re-applies the stored loop mode to the next track.
    if (player.loop === 'track') {
        player.setLoop('none');
    }
    player.stop();
    return success('Skipped', `Skipped **${title}**.`);
}

export async function stopPlayback(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player) {
        throw new MidNightError('No player', ErrorTypes.USER_INPUT, 'No active music player.');
    }
    assertCanControl(interaction.member, player);

    const guildData = getGuildMusicData(interaction.guild.id);
    const queueLength = player.queue?.length || 0;

    if (queueLength >= 5 && guildData.stopConfirmPending !== interaction.user.id) {
        guildData.stopConfirmPending = interaction.user.id;
        setTimeout(() => {
            if (guildData.stopConfirmPending === interaction.user.id) {
                guildData.stopConfirmPending = null;
            }
        }, 15000);
        return success(
            'Confirm Stop',
            `There are **${queueLength}** tracks in the queue. Run **/music stop** again within 15 seconds to confirm.`,
        );
    }

    guildData.stopConfirmPending = null;
    const stoppedBy = interaction.member?.displayName || interaction.user.displayName || interaction.user.username;
    const lastTitle = player.current?.info?.title || guildData.lastTrackTitle || 'Unknown track';
    await destroyPlayerSession(client, interaction.guild.id, player, guildData, {
        summary: {
            title: 'Playback Stopped',
            body: `Last played **${lastTitle}**.\nQueue cleared (${queueLength} removed).\nStopped by **${stoppedBy}**.`,
            accentColor: ECONOMY_ACCENT.FAILURE,
        },
    });
    return success('Stopped', 'Playback stopped and the queue was cleared.');
}

export async function applyPause(client, guildId) {
    const player = getPlayer(client, guildId);
    if (!player?.current || player.paused) {
        return false;
    }

    player.pause(true);
    await refreshPlayerMessage(client, guildId);
    return true;
}

export async function applyResume(client, guildId) {
    const player = getPlayer(client, guildId);
    if (!player?.current || !player.paused) {
        return false;
    }

    player.pause(false);
    await refreshPlayerMessage(client, guildId);
    return true;
}

export async function pausePlayback(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.current) {
        throw new MidNightError('No player', ErrorTypes.USER_INPUT, 'Nothing is playing right now.');
    }
    assertCanControl(interaction.member, player);

    if (player.paused) {
        throw new MidNightError('Already paused', ErrorTypes.USER_INPUT, 'Playback is already paused.');
    }

    await applyPause(client, interaction.guild.id);
    return success('Paused', 'Playback paused.');
}

export async function resumePlayback(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.current) {
        throw new MidNightError('No player', ErrorTypes.USER_INPUT, 'Nothing is playing right now.');
    }
    assertCanControl(interaction.member, player);

    if (!player.paused) {
        throw new MidNightError('Not paused', ErrorTypes.USER_INPUT, 'Playback is not paused.');
    }

    await applyResume(client, interaction.guild.id);
    return success('Resumed', 'Playback resumed.');
}

export async function shuffleQueue(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.queue?.length) {
        throw new MidNightError('Empty queue', ErrorTypes.USER_INPUT, 'The queue is empty.');
    }
    assertCanControl(interaction.member, player);
    player.queue.shuffle();
    getGuildMusicData(interaction.guild.id).shuffle = true;
    await refreshPlayerMessage(client, interaction.guild.id);
    scheduleSessionSave(client, interaction.guild.id);
    return success('Shuffled', 'The queue has been shuffled.');
}

export async function setLoopMode(client, interaction, mode) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player) {
        throw new MidNightError('No player', ErrorTypes.USER_INPUT, 'No active music player.');
    }
    assertCanControl(interaction.member, player);

    const guildData = getGuildMusicData(interaction.guild.id);
    guildData.loop = mode;
    player.setLoop(mode);

    const labels = { none: 'Off', track: 'Track', queue: 'Queue' };
    await refreshPlayerMessage(client, interaction.guild.id);
    scheduleSessionSave(client, interaction.guild.id);
    return success('Loop Updated', `Loop mode set to **${labels[mode] || mode}**.`);
}

export async function toggleLoop(client, interaction) {
    const guildData = getGuildMusicData(interaction.guild.id);
    const next = guildData.loop === 'none' ? 'track' : guildData.loop === 'track' ? 'queue' : 'none';
    return setLoopMode(client, interaction, next);
}

export async function setVolume(client, interaction, volume) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player) {
        throw new MidNightError('No player', ErrorTypes.USER_INPUT, 'No active music player.');
    }
    assertCanControl(interaction.member, player);

    const guildData = getGuildMusicData(interaction.guild.id);
    guildData.volume = Math.max(0, Math.min(100, volume));
    player.setVolume(guildData.volume);
    await refreshPlayerMessage(client, interaction.guild.id);
    scheduleSessionSave(client, interaction.guild.id);
    return success('Volume Updated', `Volume set to **${guildData.volume}%**.`);
}

export async function adjustVolume(client, interaction, delta) {
    const guildData = getGuildMusicData(interaction.guild.id);
    return setVolume(client, interaction, guildData.volume + delta);
}

export async function seekTrack(client, interaction, seconds) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.current) {
        throw new MidNightError('No player', ErrorTypes.USER_INPUT, 'Nothing is playing right now.');
    }
    assertCanControl(interaction.member, player);

    const info = player.current.info || {};
    if (info.isStream || info.isSeekable === false) {
        throw new MidNightError(
            'Not seekable',
            ErrorTypes.USER_INPUT,
            'This track cannot be seeked (it may be a live stream).',
        );
    }

    const position = Math.max(0, seconds * 1000);
    if (info.length && position > info.length) {
        throw new MidNightError(
            'Seek out of range',
            ErrorTypes.USER_INPUT,
            `You can only seek up to ${Math.floor(info.length / 1000)}s for this track.`,
        );
    }

    player.seek(position);
    await refreshPlayerMessage(client, interaction.guild.id);
    return success('Seeked', `Seeked to **${seconds}s**.`);
}

export async function removeFromQueue(client, interaction, index) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.queue?.length) {
        throw new MidNightError('Empty queue', ErrorTypes.USER_INPUT, 'The queue is empty.');
    }
    assertCanControl(interaction.member, player);

    const queueIndex = index - 1;
    if (queueIndex < 0 || queueIndex >= player.queue.length) {
        throw new MidNightError('Invalid index', ErrorTypes.USER_INPUT, `Invalid queue position. Queue has ${player.queue.length} track(s).`);
    }

    const removed = player.queue[queueIndex];
    player.queue.remove(queueIndex);
    await refreshPlayerMessage(client, interaction.guild.id);
    scheduleSessionSave(client, interaction.guild.id);
    return success('Removed', `Removed **${removed.info?.title || 'track'}** from the queue.`);
}

export async function moveInQueue(client, interaction, from, to) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.queue?.length) {
        throw new MidNightError('Empty queue', ErrorTypes.USER_INPUT, 'The queue is empty.');
    }
    assertCanControl(interaction.member, player);

    const fromIndex = from - 1;
    const toIndex = to - 1;
    if (fromIndex < 0 || fromIndex >= player.queue.length || toIndex < 0 || toIndex >= player.queue.length) {
        throw new MidNightError('Invalid index', ErrorTypes.USER_INPUT, 'Invalid queue positions.');
    }

    const track = player.queue[fromIndex];
    player.queue.remove(fromIndex);
    player.queue.splice(toIndex, 0, track);
    await refreshPlayerMessage(client, interaction.guild.id);
    scheduleSessionSave(client, interaction.guild.id);
    return success('Moved', `Moved **${track.info?.title || 'track'}** to position #${to}.`);
}

export async function clearQueue(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.queue?.length) {
        throw new MidNightError('Empty queue', ErrorTypes.USER_INPUT, 'The queue is already empty.');
    }
    assertCanControl(interaction.member, player);
    player.queue.clear();
    await refreshPlayerMessage(client, interaction.guild.id);
    scheduleSessionSave(client, interaction.guild.id);
    return success('Queue Cleared', 'All queued tracks were removed.');
}

export async function setTwentyFourSeven(client, interaction, enabled) {
    const guildData = getGuildMusicData(interaction.guild.id);
    guildData.twentyFourSeven = enabled;
    scheduleSessionSave(client, interaction.guild.id);
    return success(
        '24/7 Mode',
        enabled
            ? '24/7 mode enabled. The bot will stay in the voice channel when the queue ends.'
            : '24/7 mode disabled. The bot will leave after 30 seconds of idle time.',
    );
}

export async function setAutoplayState(client, interaction, mode) {
    const player = getPlayer(client, interaction.guild.id);
    if (player) {
        assertCanControl(interaction.member, player);
    } else {
        assertInVoice(interaction.member);
    }

    const guildData = getGuildMusicData(interaction.guild.id);
    const enabled = mode === 'enable' ? true : mode === 'disable' ? false : !guildData.autoplay;
    guildData.autoplay = enabled;
    scheduleSessionSave(client, interaction.guild.id);
    if (player?.current) {
        await refreshPlayerMessage(client, interaction.guild.id);
    }
    return success(
        enabled ? 'Autoplay Enabled' : 'Autoplay Disabled',
        enabled
            ? 'Autoplay is **ON**. Similar tracks will keep playing when the queue ends.'
            : 'Autoplay is **OFF**. Playback will stop when the queue ends.',
    );
}

export function buildNowPlayingReply(client, guildId) {
    const player = getPlayer(client, guildId);
    if (!player?.current) {
        throw new MidNightError('No player', ErrorTypes.USER_INPUT, 'Nothing is playing right now.');
    }
    const guildData = getGuildMusicData(guildId);
    return {
        components: [buildNowPlayingContainer(player.current, player, guildData)],
        flags: v2Flags(),
    };
}

export function buildQueueReply(client, guildId, page = 0) {
    const player = getPlayer(client, guildId);
    if (!player) {
        throw new MidNightError('No player', ErrorTypes.USER_INPUT, 'No active music player.');
    }

    const totalPages = Math.max(1, Math.ceil((player.queue?.length || 0) / getQueuePageSize()));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);

    return {
        components: [buildQueueContainer(player.queue, player.current, safePage), ...(totalPages > 1 ? [buildQueuePaginationRow(safePage, totalPages)] : [])],
        flags: v2Flags(),
        page: safePage,
        totalPages,
    };
}

export async function destroyPlayerSession(client, guildId, player, guildData, { forceDisconnect = false, summary = null } = {}) {
    clearUpdateInterval(guildData);
    clearAutoLeaveTimer(guildData);
    if (guildData.idleTimeout) {
        clearTimeout(guildData.idleTimeout);
        guildData.idleTimeout = null;
    }

    // Snapshot counters BEFORE the reset below: if the transition fails and a
    // later playerDisconnect rebuilds the summary, it must not read zeroes.
    guildData.lastSessionStats = {
        title: guildData.lastTrackTitle,
        count: guildData.sessionTrackCount,
    };

    if (summary) {
        await transitionToSummary(client, guildId, summary);
    } else if (guildData.playerMessageId && guildData.playerChannelId && !guildData.summaryMessageId) {
        try {
            const channel = client.channels.cache.get(guildData.playerChannelId);
            if (channel) {
                const msg = await channel.messages.fetch(guildData.playerMessageId);
                await msg.delete();
            }
        } catch {
            // message already deleted
        }
        guildData.playerMessage = null;
        guildData.playerMessageId = null;
        guildData.playerChannelId = null;
    }

    guildData.previousTracks = [];
    guildData.stopConfirmPending = null;
    guildData.autoPaused = false;
    guildData.queuePages?.clear();
    guildData.lastTrackTitle = null;
    guildData.sessionTrackCount = 0;

    clearVoiceChannelStatus(client, guildId).catch(() => null);

    if (player) {
        player.queue.clear();
        player.stop();
        if (forceDisconnect || !guildData.twentyFourSeven) {
            player.destroy();
        }
    }

    scheduleSessionSave(client, guildId);
}

export async function leaveVoiceChannel(client, interaction) {
    assertRiffyAvailable(client);

    const guildId = interaction.guild.id;
    const player = getPlayer(client, guildId);
    if (!player) {
        throw new MidNightError('No player', ErrorTypes.USER_INPUT, 'I am not in a voice channel.');
    }
    assertCanControl(interaction.member, player);

    const channel = interaction.guild.channels.cache.get(player.voiceChannel);
    const channelName = channel?.name || 'voice channel';
    const guildData = getGuildMusicData(guildId);
    const lastTitle = player.current?.info?.title || guildData.lastTrackTitle;

    await destroyPlayerSession(client, guildId, player, guildData, {
        forceDisconnect: true,
        summary: {
            title: 'Disconnected from Voice Channel',
            body: lastTitle
                ? `Disconnected from **${channelName}**.\nLast played **${lastTitle}**.\nSession tracks played: **${guildData.sessionTrackCount}**.`
                : `Disconnected from **${channelName}**.`,
        },
    });

    return success('Left Voice Channel', `Disconnected from **${channelName}**.`);
}

export async function replyMusicSuccess(interaction, container) {
    if (interaction.deferred || interaction.replied) {
        await InteractionHelper.safeEditReply(interaction, {
            components: Array.isArray(container) ? container : [container],
            flags: v2Flags(),
            allowedMentions: NO_PINGS,
        });
    } else {
        await interaction.reply({
            components: Array.isArray(container) ? container : [container],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            allowedMentions: NO_PINGS,
        });
    }
}

