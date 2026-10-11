import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { container, divider, section, text, thumbnail } from '../../utils/componentsV2.js';
import { successContainer, ECONOMY_ACCENT } from '../economy/economyViews.js';
import { createProgressBar } from '../leveling/levelRankView.js';
import { getPaginationRow } from '../../utils/components.js';

const QUEUE_PAGE_SIZE = 10;

/** House-standard music outcome card (success accent). */
export function success(title, body) {
    return successContainer({ title, body });
}

export const MUSIC_BUTTON_IDS = {
    PAUSE: 'music_pause',
    RESUME: 'music_resume',
    SKIP: 'music_skip',
    STOP: 'music_stop',
    SHUFFLE: 'music_shuffle',
    LOOP: 'music_loop',
    VOL_DOWN: 'music_vol_down',
    VOL_UP: 'music_vol_up',
    QUEUE: 'music_queue',
    QUEUE_FIRST: 'music_queue_first',
    QUEUE_PREV: 'music_queue_prev',
    QUEUE_NEXT: 'music_queue_next',
    QUEUE_LAST: 'music_queue_last',
    AUTOPLAY: 'music_autoplay',
    DISMISS: 'music_dismiss',
};

export function formatDuration(ms) {
    if (!ms || Number.isNaN(ms)) {
        return 'Live';
    }
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getTrackArtwork(track) {
    const url = track?.info?.artworkUrl || track?.info?.thumbnail || null;
    if (!url || typeof url !== 'string') {
        return null;
    }
    // Builder accessories throw synchronously on malformed URLs — a bad
    // thumbnail must never take down the whole card render.
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return null;
        }
        return url;
    } catch {
        return null;
    }
}

function getLoopLabel(loop) {
    switch (loop) {
        case 'track':
            return 'Track';
        case 'queue':
            return 'Queue';
        default:
            return 'Off';
    }
}

export function buildNowPlayingContainer(track, player, guildData) {
    const requester = track?.info?.requester;
    // Captured when the track is queued so the card can show a display name;
    // `User.displayName` is always null, so the User itself can only give a
    // username. Falls back for tracks queued before this field existed.
    const requesterLabel = track?.info?.requesterName
        || requester?.displayName
        || requester?.globalName
        || requester?.username
        || requester?.tag
        || 'Unknown';

    const positionMs = player?.position || 0;
    const durationMs = track?.info?.length || 0;
    const position = formatDuration(positionMs);
    const duration = formatDuration(durationMs);
    const artwork = getTrackArtwork(track);

    // Live streams report no length, so there is no meaningful progress bar.
    const progressLine = durationMs > 0
        ? `${createProgressBar((positionMs / durationMs) * 100)} \`${position} / ${duration}\``
        : `\`${position} / ${duration}\``;

    const details = [
        `**Artist:** ${track?.info?.author || 'Unknown'}`,
        `**Requester:** ${requesterLabel}`,
        progressLine,
    ].join('\n');

    // A Section always requires an accessory, so fall back to a plain text
    // display when the track has no artwork.
    const head = artwork
        ? section([text('### Now Playing'), text(track?.info?.title || 'Unknown track'), text(details)], thumbnail(artwork))
        : [text('### Now Playing'), text(track?.info?.title || 'Unknown track'), text(details)];

    const state = player?.paused ? 'Paused' : 'Playing';
    const autoplayTag = track?.isAutoplay ? ' • Autoplay' : '';
    const footer = `-# ${state}${autoplayTag} • Volume: ${guildData?.volume ?? 75}% • Loop: ${getLoopLabel(guildData?.loop)} • Queue: ${player?.queue?.length || 0} track(s)`;

    return container({
        parts: [
            head,
            divider(),
            text(footer),
        ],
    });
}

export function buildSessionSummaryContainer({ title, body, accentColor, expiresAt } = {}) {
    const parts = [
        text(`### ${title || 'Music Session'}`),
        text(body || 'Playback ended.'),
        divider(),
    ];
    if (expiresAt) {
        const expiresSeconds = Math.max(0, Math.floor(expiresAt / 1000));
        parts.push(text(`-# Summary expires <t:${expiresSeconds}:R> • Dismiss removes it now`));
    } else {
        parts.push(text('-# Dismiss removes this summary'));
    }
    return container({ accentColor, parts });
}

export function buildDismissRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.DISMISS)
            .setLabel('Dismiss')
            .setStyle(ButtonStyle.Secondary),
    );
}

export function buildQueueContainer(queue, currentTrack, page = 0) {
    const totalTracks = queue?.length || 0;
    const totalPages = Math.max(1, Math.ceil(totalTracks / QUEUE_PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = safePage * QUEUE_PAGE_SIZE;
    const slice = queue?.slice(start, start + QUEUE_PAGE_SIZE) || [];

    const lines = [];
    if (currentTrack) {
        lines.push(`**Now Playing**\n${currentTrack.info?.title || 'Unknown'} — ${currentTrack.info?.author || 'Unknown'}`, '');
    }

    if (slice.length === 0) {
        lines.push('The queue is empty.');
    } else {
        lines.push(
            slice
                .map((track, index) => `${start + index + 1}. ${track.info?.title || 'Unknown'} — ${track.info?.author || 'Unknown'}`)
                .join('\n'),
        );
    }

    return container({
        parts: [
            text('### Music Queue'),
            text(lines.join('\n').substring(0, 3500)),
            divider(),
            text(`-# Page ${safePage + 1} of ${totalPages} • ${totalTracks} queued`),
        ],
    });
}

export function buildPlayerButtonRows(player, guildData) {
    const paused = player?.paused;
    // One toggle in the Pause slot: Pause (Primary) while playing, Resume
    // (Success) while paused. Same custom IDs and colors as before.
    const pauseResume = paused
        ? new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.RESUME)
            .setLabel('Resume')
            .setStyle(ButtonStyle.Success)
        : new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.PAUSE)
            .setLabel('Pause')
            .setStyle(ButtonStyle.Primary);
    const row1 = new ActionRowBuilder().addComponents(
        pauseResume,
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.SKIP)
            .setLabel('Skip')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.STOP)
            .setLabel('Stop')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.SHUFFLE)
            .setLabel('Shuffle')
            .setStyle(guildData?.shuffle ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.QUEUE)
            .setLabel('Queue')
            .setStyle(ButtonStyle.Secondary),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.LOOP)
            .setLabel('Loop')
            .setStyle(guildData?.loop !== 'none' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.AUTOPLAY)
            .setLabel('Autoplay')
            .setStyle(guildData?.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.VOL_DOWN)
            .setLabel('Vol -')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.VOL_UP)
            .setLabel('Vol +')
            .setStyle(ButtonStyle.Secondary),
    );

    return [row1, row2];
}

export function buildQueuePaginationRow(page, totalPages) {
    return getPaginationRow('music_queue', page + 1, totalPages);
}

export function getQueuePageSize() {
    return QUEUE_PAGE_SIZE;
}
