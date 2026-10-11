import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from 'discord.js';
import { randomBytes } from 'node:crypto';
import { NO_PINGS, v2Flags, container, divider, text } from '../../utils/componentsV2.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { MidNightError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { ensurePlayer, getPlayer, startPlayback } from './musicActions.js';
import { scheduleSessionSave } from './musicSessionService.js';
import { canControlMusic, VOICE_CHANNEL_DENIAL } from './permissions.js';
import { formatDuration, success } from './musicEmbeds.js';

const SEARCH_PAGE_SIZE = 10;
const SEARCH_SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_SEARCH_SESSIONS = 50;
const MAX_SEARCH_RESULTS = 50;

const searchSessions = new Map();

function pruneSearchSessions() {
    const now = Date.now();
    for (const [token, session] of searchSessions) {
        if (session.expiresAt <= now) {
            searchSessions.delete(token);
        }
    }
    while (searchSessions.size > MAX_SEARCH_SESSIONS) {
        const oldest = searchSessions.keys().next();
        if (oldest.done) {
            break;
        }
        searchSessions.delete(oldest.value);
    }
}

export function getMusicSearchSession(token) {
    const session = searchSessions.get(token);
    if (!session) {
        return null;
    }
    if (session.expiresAt <= Date.now()) {
        searchSessions.delete(token);
        return null;
    }
    return session;
}

function getSearchPageCount(session) {
    return Math.max(1, Math.ceil(session.tracks.length / SEARCH_PAGE_SIZE));
}

export function buildSearchPayload(session, page) {
    const totalPages = getSearchPageCount(session);
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    session.page = safePage;
    session.expiresAt = Date.now() + SEARCH_SESSION_TTL_MS;

    const start = safePage * SEARCH_PAGE_SIZE;
    const slice = session.tracks.slice(start, start + SEARCH_PAGE_SIZE);
    const lines = slice.map((track, index) => {
        const position = start + index + 1;
        const duration = track?.info?.isStream ? 'Live' : formatDuration(track?.info?.length || 0);
        return `${position}. **${track?.info?.title || 'Unknown'}** — ${track?.info?.author || 'Unknown'} \`${duration}\``;
    });

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`music_search_select:${session.token}`)
        .setPlaceholder('Select a track to enqueue')
        .addOptions(
            slice.map((track, index) => new StringSelectMenuOptionBuilder()
                .setLabel(`${start + index + 1}. ${track?.info?.title || 'Unknown'}`.slice(0, 100))
                .setDescription(`By ${track?.info?.author || 'Unknown'}`.slice(0, 100))
                .setValue(String(start + index))),
        );

    const components = [
        container({
            parts: [
                text(`### Search Results for ${session.query}`),
                text(lines.join('\n').substring(0, 3500)),
                divider(),
                text(`-# Page ${safePage + 1} of ${totalPages} • ${session.tracks.length} tracks • Expires <t:${Math.floor(session.expiresAt / 1000)}:R>`),
            ],
        }),
        new ActionRowBuilder().addComponents(menu),
    ];

    if (totalPages > 1) {
        components.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`music_search_prev:${session.token}`)
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(safePage === 0),
                new ButtonBuilder()
                    .setCustomId(`music_search_page:${session.token}`)
                    .setLabel(`Page ${safePage + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`music_search_next:${session.token}`)
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(safePage === totalPages - 1),
            ),
        );
    }

    return { components, page: safePage, totalPages };
}

export async function startMusicSearch(client, interaction, query) {
    if (!client?.riffy) {
        throw new MidNightError(
            'Lavalink not configured',
            ErrorTypes.CONFIGURATION,
            'Music is unavailable — Lavalink is not configured.',
        );
    }

    const trimmed = String(query ?? '').trim();
    if (!trimmed) {
        throw new MidNightError(
            'Missing query',
            ErrorTypes.VALIDATION,
            'Enter a song name or URL to search.',
        );
    }

    let result = null;
    try {
        result = await client.riffy.resolve({ query: trimmed, requester: interaction.user });
    } catch (error) {
        throw new MidNightError(
            'Search failed',
            ErrorTypes.NETWORK,
            `Music search failed. ${error?.message || 'Please try again.'}`,
        );
    }

    const tracks = Array.isArray(result?.tracks) ? result.tracks.slice(0, MAX_SEARCH_RESULTS) : [];
    if (tracks.length === 0) {
        throw new MidNightError(
            'No results',
            ErrorTypes.USER_INPUT,
            `No results found for **${trimmed.slice(0, 120)}**.`,
        );
    }

    pruneSearchSessions();
    const token = randomBytes(9).toString('hex');
    const session = {
        token,
        guildId: interaction.guild?.id || null,
        userId: interaction.user.id,
        query: trimmed.slice(0, 120),
        tracks,
        page: 0,
        expiresAt: Date.now() + SEARCH_SESSION_TTL_MS,
    };
    searchSessions.set(token, session);

    const payload = buildSearchPayload(session, 0);
    await InteractionHelper.safeEditReply(interaction, {
        components: payload.components,
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
    });
    return payload;
}

async function assertSearchOwner(interaction, token) {
    const session = getMusicSearchSession(token);
    if (!session || (interaction.guild && session.guildId !== interaction.guild.id)) {
        await replyUserError(interaction, {
            type: ErrorTypes.USER_INPUT,
            message: 'That music search expired. Run **/music search** again.',
        });
        return null;
    }
    if (interaction.user.id !== session.userId) {
        await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'That music search belongs to someone else.',
        });
        return null;
    }
    return session;
}

export async function handleMusicSearchPage(interaction, client, token, delta) {
    const session = await assertSearchOwner(interaction, token);
    if (!session) {
        return;
    }
    await interaction.deferUpdate().catch(() => null);
    const payload = buildSearchPayload(session, session.page + delta);
    await interaction.editReply({
        components: payload.components,
        flags: MessageFlags.IsComponentsV2,
    }).catch(() => null);
}

function isDuplicateSearchTrack(player, track) {
    const uri = track?.info?.uri;
    if (!uri) {
        return false;
    }
    if (player.current?.info?.uri === uri) {
        return true;
    }
    return player.queue.some((existing) => existing?.info?.uri === uri);
}

export async function handleMusicSearchSelect(interaction, client, token) {
    const session = await assertSearchOwner(interaction, token);
    if (!session) {
        return;
    }

    const index = Number(interaction.values?.[0]);
    const track = Number.isInteger(index) ? session.tracks[index] : null;
    if (!track) {
        await replyUserError(interaction, {
            type: ErrorTypes.USER_INPUT,
            message: 'That search result is no longer available. Run **/music search** again.',
        });
        return;
    }

    const existing = getPlayer(client, interaction.guild.id);
    if (existing && !canControlMusic(interaction.member, existing)) {
        await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: VOICE_CHANNEL_DENIAL,
        });
        return;
    }

    await interaction.deferUpdate().catch(() => null);
    const { player } = await ensurePlayer(client, interaction);
    if (isDuplicateSearchTrack(player, track)) {
        await replyUserError(interaction, {
            type: ErrorTypes.USER_INPUT,
            message: `**${track.info?.title || 'Track'}** is already in the queue or playing.`,
        });
        return;
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

    searchSessions.delete(token);
    await interaction.editReply({
        components: [
            success(
                willPlayNow ? 'Now Playing' : 'Track Added',
                willPlayNow
                    ? `**${track.info?.title || 'Unknown'}**\n${track.info?.author || 'Unknown'}`
                    : `**${track.info?.title || 'Unknown'}**\n${track.info?.author || 'Unknown'}\nPosition: #${queuePosition} in queue`,
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: NO_PINGS,
    }).catch(() => null);
}
