// Player event handlers for Riffy. Adapted from Musicify playerHandler (Apache-2.0).

import { logger } from '../../utils/logger.js';
import { MessageFlags } from 'discord.js';
import { NO_PINGS, v2Flags } from '../../utils/componentsV2.js';
import { ECONOMY_ACCENT } from '../economy/economyViews.js';
import { getGuildMusicData, clearUpdateInterval, clearAutoLeaveTimer, clearSummaryState, clearSummaryTimeout } from './playerStore.js';
import { setVoiceChannelStatus, clearVoiceChannelStatus } from './voiceStatus.js';
import {
    buildNowPlayingContainer,
    buildPlayerButtonRows,
    buildSessionSummaryContainer,
    buildDismissRow,
} from './musicEmbeds.js';
import { scheduleSessionSave, getTrackHistory, recordTrackHistory, recoverMusicSessions } from './musicSessionService.js';
import { getMusicNodesStatusKey, getGuildMusicSummaryKey } from '../../utils/database/keys.js';

const NODE_RECOVERY_THROTTLE_MS = 60 * 1000;
let lastNodeRecoveryAt = 0;

async function recordNodeTelemetry(client, name, status) {
    if (!client?.db || !name) {
        return;
    }
    try {
        const key = getMusicNodesStatusKey();
        const current = await client.db.get(key, {});
        await client.db.set(key, {
            ...(current && typeof current === 'object' ? current : {}),
            [name]: { status, at: new Date().toISOString() },
        });
    } catch {
        // Telemetry must never break playback.
    }
}

async function attemptNodeRecovery(client) {
    const now = Date.now();
    if (now - lastNodeRecoveryAt < NODE_RECOVERY_THROTTLE_MS) {
        return;
    }
    lastNodeRecoveryAt = now;
    try {
        // Dynamic import: musicActions already imports this module, so a static
        // import would create a load-time cycle.
        const { applyStoredFilter } = await import('./musicActions.js');
        await recoverMusicSessions(client, { applyFilter: applyStoredFilter });
    } catch (error) {
        logger.warn('Node-reconnect session recovery failed:', error?.message || error);
    }
}

function postMigrationNotice(client, player, newNode) {
    try {
        const channel = client.channels.cache.get(player?.textChannel);
        if (!channel) {
            return;
        }
        channel.send({
            content: `🔀 Audio stream reconnected via **${newNode?.name || 'backup node'}**.`,
            allowedMentions: NO_PINGS,
        }).then((message) => {
            const timer = setTimeout(() => {
                message.delete().catch(() => null);
            }, 30 * 1000);
            if (typeof timer?.unref === 'function') {
                timer.unref();
            }
        }).catch(() => null);
    } catch {
        // Notice is best-effort only.
    }
}

const SUMMARY_TTL_MS = 10 * 60 * 1000;

const UPDATE_INTERVAL_MS = 15 * 1000;
const IDLE_DISCONNECT_MS = 30 * 1000;

async function editOrSendPlayerMessage(client, guildData, channelId, nowPlayingContainer, components) {
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
        guildData.playerMessage = null;
        guildData.playerMessageId = null;
        guildData.playerChannelId = null;
        return;
    }

    const payload = {
        components: [nowPlayingContainer, ...components],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: NO_PINGS,
    };

    // Reuse the cached message object — re-fetching by ID every refresh costs a
    // REST call per cycle and is pure overhead on top of the edit itself.
    let message = guildData.playerMessage?.channelId === channelId ? guildData.playerMessage : null;
    if (!message && guildData.playerMessageId) {
        try {
            message = await channel.messages.fetch(guildData.playerMessageId);
        } catch {
            message = null;
        }
    }

    if (message) {
        try {
            await message.edit(payload);
            guildData.playerMessage = message;
            return;
        } catch {
            message = null;
            guildData.playerMessage = null;
            guildData.playerMessageId = null;
            guildData.playerChannelId = null;
            clearUpdateInterval(guildData);
        }
    }

    try {
        const newMsg = await channel.send(payload);
        guildData.playerMessage = newMsg;
        guildData.playerMessageId = newMsg.id;
        guildData.playerChannelId = channel.id;
    } catch (error) {
        logger.error(`Failed to send music player message in guild ${guildData.playerChannelId || channelId}: ${error?.message || error}`);
    }
}

export async function clearSummaryCard(client, guildData, guildId) {
    clearSummaryTimeout(guildData);
    if (guildId && client?.db) {
        try {
            await client.db.delete(getGuildMusicSummaryKey(guildId));
        } catch {
            // Persistence must never break card cleanup.
        }
    }
    if (!guildData.summaryMessageId || !guildData.summaryChannelId) {
        clearSummaryState(guildData);
        return;
    }
    try {
        const channel = client.channels.cache.get(guildData.summaryChannelId);
        if (channel) {
            const message = await channel.messages.fetch(guildData.summaryMessageId);
            try {
                await message.delete();
            } catch {
                // No Manage Messages (or already gone): strip the controls so
                // the card at least stops looking actionable.
                await message.edit({ components: [] }).catch(() => null);
            }
        }
    } catch {
        // Already dismissed, deleted, or inaccessible.
    } finally {
        clearSummaryState(guildData);
    }
}

function scheduleSummaryExpiry(client, guildId, guildData, expiresAt = Date.now() + SUMMARY_TTL_MS) {
    clearSummaryTimeout(guildData);
    guildData.summaryExpiresAt = expiresAt;
    guildData.summaryTimeout = setTimeout(() => {
        guildData.summaryTimeout = null;
        clearSummaryCard(client, guildData, guildId).catch(() => null);
    }, Math.max(0, expiresAt - Date.now()));
    if (typeof guildData.summaryTimeout?.unref === 'function') {
        guildData.summaryTimeout.unref();
    }
}

export async function transitionToSummary(client, guildId, { title, body, accentColor } = {}) {
    const guildData = getGuildMusicData(guildId);
    clearUpdateInterval(guildData);
    clearSummaryTimeout(guildData);

    const expiresAt = Date.now() + SUMMARY_TTL_MS;
    const summary = buildSessionSummaryContainer({ title, body, accentColor, expiresAt });
    const payload = {
        components: [summary, buildDismissRow()],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: NO_PINGS,
    };

    let message = null;
    if (guildData.playerMessageId && guildData.playerChannelId) {
        try {
            const channel = client.channels.cache.get(guildData.playerChannelId);
            if (channel) {
                const active = guildData.playerMessage?.channelId === guildData.playerChannelId
                    ? guildData.playerMessage
                    : await channel.messages.fetch(guildData.playerMessageId);
                if (active) {
                    await active.edit(payload);
                    message = active;
                }
            }
        } catch {
            message = null;
        }
    }

    // Single-card enforcement: if a summary already exists (e.g. leave/stop
    // transitioned first and player.destroy() then fired playerDisconnect),
    // rewrite it in place instead of stacking a second card.
    if (!message && guildData.summaryMessageId && guildData.summaryChannelId) {
        try {
            const channel = client.channels.cache.get(guildData.summaryChannelId);
            if (channel) {
                const existing = await channel.messages.fetch(guildData.summaryMessageId);
                if (existing) {
                    await existing.edit(payload);
                    message = existing;
                }
            }
        } catch {
            message = null;
        }
    }

    if (!message) {
        const player = client.riffy?.players?.get(guildId);
        const channelId = guildData.playerChannelId || guildData.summaryChannelId || player?.textChannel;
        const channel = channelId ? client.channels.cache.get(channelId) : null;
        if (!channel) {
            guildData.playerMessage = null;
            guildData.playerMessageId = null;
            guildData.playerChannelId = null;
            clearSummaryState(guildData);
            return null;
        }
        try {
            message = await channel.send(payload);
        } catch (error) {
            logger.error('Failed to send music session summary:', error);
            guildData.playerMessage = null;
            guildData.playerMessageId = null;
            guildData.playerChannelId = null;
            clearSummaryState(guildData);
            return null;
        }
    }

    guildData.summaryMessageId = message.id;
    guildData.summaryChannelId = message.channelId;
    guildData.playerMessage = null;
    guildData.playerMessageId = null;
    guildData.playerChannelId = null;
    scheduleSummaryExpiry(client, guildId, guildData);
    // Persisted so a restart can expire/resume the card instead of orphaning
    // it with a stale "expires X ago" footer.
    if (client?.db) {
        try {
            await client.db.set(getGuildMusicSummaryKey(guildId), {
                messageId: message.id,
                channelId: message.channelId,
                expiresAt: guildData.summaryExpiresAt,
            });
        } catch {
            // Persistence must never break the transition.
        }
    }
    return message;
}

export async function dismissSummary(client, guildId, messageId) {
    const guildData = getGuildMusicData(guildId);
    if (!guildData.summaryMessageId) {
        return false;
    }
    if (messageId && guildData.summaryMessageId !== messageId) {
        return false;
    }
    await clearSummaryCard(client, guildData, guildId);
    return true;
}

/**
 * Boot-time sweep for summary cards orphaned by a restart (in-memory TTL
 * timers die with the old process). Expired cards are deleted; live ones get
 * a fresh timer for their remaining TTL.
 */
export async function resumeMusicSummaries(client) {
    if (!client?.db || typeof client.db.get !== 'function') {
        return { cleared: 0, resumed: 0 };
    }
    const outcome = { cleared: 0, resumed: 0 };
    for (const guild of client.guilds.cache.values()) {
        let ref = null;
        try {
            ref = await client.db.get(getGuildMusicSummaryKey(guild.id), null);
        } catch {
            ref = null;
        }
        if (!ref?.messageId || !ref?.channelId) {
            continue;
        }
        const guildData = getGuildMusicData(guild.id);
        const channel = client.channels.cache.get(ref.channelId);
        let message = null;
        try {
            message = channel ? await channel.messages.fetch(ref.messageId) : null;
        } catch {
            message = null;
        }
        if (!message) {
            try {
                await client.db.delete(getGuildMusicSummaryKey(guild.id));
            } catch {
                // Ignore persistence failures during boot sweep.
            }
            outcome.cleared += 1;
            continue;
        }
        if (ref.expiresAt && ref.expiresAt <= Date.now()) {
            try {
                await message.delete();
            } catch {
                await message.edit({ components: [] }).catch(() => null);
            }
            try {
                await client.db.delete(getGuildMusicSummaryKey(guild.id));
            } catch {
                // Ignore persistence failures during boot sweep.
            }
            outcome.cleared += 1;
            continue;
        }
        guildData.summaryMessageId = message.id;
        guildData.summaryChannelId = message.channelId;
        guildData.summaryExpiresAt = ref.expiresAt || 0;
        scheduleSummaryExpiry(client, guild.id, guildData, guildData.summaryExpiresAt);
        outcome.resumed += 1;
    }
    return outcome;
}

function extractYouTubeVideoId(uri) {
    try {
        const url = new URL(String(uri || ''));
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        if (host === 'youtu.be') {
            return url.pathname.split('/').filter(Boolean)[0] || null;
        }
        if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
            return url.searchParams.get('v');
        }
    } catch {
        // Not a URL — nothing to extract.
    }
    return null;
}

/**
 * Autoplay engine, built on Riffy's native implementation (same engine as the
 * riffy-music-bot reference). Why native instead of a text search:
 *
 * - YouTube seeds resolve the official `watch?v=id&list=RD<id>` mix playlist
 *   and pick a RANDOM unplayed entry — a `"Author - Title mix"` text search
 *   just matches the same song again, which is exactly the reported bug.
 * - Spotify/SoundCloud/Apple seeds scrape the platform's own recommendation
 *   shelf (via Riffy's autoPlay helper) instead of guessing from titles.
 * - `playedIdentifiers` is a 50-entry ring, randomly picked, reset when
 *   exhausted.
 *
 * MidNight layers on top: the persistent 20-URI db history is pre-seeded into
 * the native ring so restarts/migrations don't replay recent tracks, and
 * consecutive failures fall through to the standard queue-end path instead of
 * looping forever (native calls `stop()` on failure, which re-fires queueEnd).
 */
export async function runAutoplayEngine(client, player, guildData) {
    if (!player?.previous && !player?.current) {
        return false;
    }

    try {
        if (!player.playedIdentifiers) {
            player.playedIdentifiers = new Set();
        }
        const history = await getTrackHistory(client, player.guildId);
        for (const uri of history.slice(-50)) {
            player.playedIdentifiers.add(uri);
            // Legacy history entries are full watch URLs while native keys on
            // video IDs — bridge both so old entries still exclude correctly.
            const videoId = extractYouTubeVideoId(uri);
            if (videoId) {
                player.playedIdentifiers.add(videoId);
            }
        }
        while (player.playedIdentifiers.size > 50) {
            player.playedIdentifiers.delete(player.playedIdentifiers.values().next().value);
        }

        await player.autoplay(player);
    } catch (error) {
        logger.warn(`Autoplay engine failed in guild ${player.guildId}:`, error?.message || error);
        return false;
    }

    if (!player.current && player.queue.length === 0) {
        return false;
    }
    guildData.autoplayFailures = 0;
    return true;
}

export async function refreshPlayerMessage(client, guildId) {
    try {
        const player = client.riffy?.players?.get(guildId);
        if (!player?.current) {
            return;
        }

        const guildData = getGuildMusicData(guildId);
        await clearSummaryCard(client, guildData, guildId);
        const nowPlaying = buildNowPlayingContainer(player.current, player, guildData);
        const components = buildPlayerButtonRows(player, guildData);
        const channelId = guildData.playerChannelId || player.textChannel;
        await editOrSendPlayerMessage(client, guildData, channelId, nowPlaying, components);
    } catch (error) {
        logger.error('Failed to refresh music player message:', error);
    }
}

function startUpdateInterval(client, guildId) {
    const guildData = getGuildMusicData(guildId);
    clearUpdateInterval(guildData);
    guildData.updateInterval = setInterval(() => {
        // A paused card is byte-identical every cycle — refreshing it is pure
        // REST traffic. Explicit actions (pause/resume/volume/loop/buttons)
        // still call refreshPlayerMessage directly.
        const player = client.riffy?.players?.get(guildId);
        if (player?.paused) {
            return;
        }
        refreshPlayerMessage(client, guildId);
    }, UPDATE_INTERVAL_MS);
}

export function setupPlayerHandler(client) {
    if (!client.riffy) {
        logger.warn('Riffy not initialized; music player handlers not attached.');
        return;
    }

    // Lavalink nodes often flap (reconnect -> error -> reconnect). Throttle all
    // per-node messages to one line per interval, log the first connect only,
    // and skip reconnect noise entirely since it is meaningless during flapping.
    const nodeLogState = new Map();
    const NODE_LOG_INTERVAL_MS = 5 * 60 * 1000;

    const shouldLogNodeEvent = (nodeName) => {
        const prev = nodeLogState.get(nodeName) ?? { lastLogAt: 0, hasConnected: false };
        const now = Date.now();
        if (now - prev.lastLogAt < NODE_LOG_INTERVAL_MS) {
            return false;
        }
        nodeLogState.set(nodeName, { ...prev, lastLogAt: now });
        return true;
    };

    const markNodeConnected = (nodeName) => {
        const prev = nodeLogState.get(nodeName) ?? { lastLogAt: 0, hasConnected: false };
        nodeLogState.set(nodeName, { ...prev, hasConnected: true });
    };

    client.riffy.on('nodeConnect', (node) => {
        const prev = nodeLogState.get(node.name) ?? { lastLogAt: 0, hasConnected: false };
        if (prev.hasConnected) {
            return;
        }
        markNodeConnected(node.name);
        logger.info(`Lavalink node "${node.name}" connected.`);
        recordNodeTelemetry(client, node.name, 'connected').catch(() => null);
        // A fresh node may be the first healthy target in a while — give any
        // unrecovered 24/7 sessions another chance (throttled internally).
        attemptNodeRecovery(client).catch(() => null);
    });

    client.riffy.on('nodeReconnect', () => {
        // Intentionally silent — reconnect spam is not actionable during flapping.
    });

    client.riffy.on('nodeError', (node, error) => {
        recordNodeTelemetry(client, node?.name, 'error').catch(() => null);
        if (!shouldLogNodeEvent(node.name)) {
            return;
        }
        // Tagged with the registry code: an AggregateError here means every
        // connection attempt to the node failed (node unreachable), not a bug.
        logger.warn(`Lavalink node "${node.name}" error: ${error?.message || error}`, {
            errorCode: 'LAVALINK_ERROR',
            node: node.name,
        });
    });

    client.riffy.on('nodeDisconnect', (node) => {
        recordNodeTelemetry(client, node?.name, 'disconnected').catch(() => null);
        if (!shouldLogNodeEvent(node.name)) {
            return;
        }
        logger.warn(`Lavalink node "${node.name}" disconnected.`);
    });

    client.riffy.on('playerMigrated', (player, oldNode, newNode) => {
        logger.info(`Music player in guild ${player.guildId} migrated from "${oldNode?.name}" to "${newNode?.name}".`);
        recordNodeTelemetry(client, newNode?.name, 'connected').catch(() => null);
        postMigrationNotice(client, player, newNode);
        refreshPlayerMessage(client, player.guildId).catch(() => null);
    });

    client.riffy.on('playerMigrationFailed', (player, error) => {
        logger.warn(`Music player migration failed in guild ${player?.guildId}: ${error?.message || error}`, {
            errorCode: 'LAVALINK_ERROR',
            node: player?.node?.name,
        });
    });

    client.riffy.on('nodeMigrationFailed', (node, error) => {
        logger.warn(`Lavalink node migration failed for "${node?.name}": ${error?.message || error}`, {
            errorCode: 'LAVALINK_ERROR',
            node: node?.name,
        });
    });

    client.riffy.on('socketClosed', (player, payload) => {
        logger.warn(`Music voice socket closed in guild ${player?.guildId}: ${payload?.code || payload?.reason || 'unknown reason'}`, {
            errorCode: 'LAVALINK_ERROR',
            node: player?.node?.name,
        });
    });

    client.riffy.on('trackStart', async (player, track) => {
        const guildData = getGuildMusicData(player.guildId);
        // Every fallible step is guarded with its step name inline in the
        // message — console output drops the error object, so a single shared
        // catch used to hide which step actually failed.
        try {
            await clearSummaryCard(client, guildData, player.guildId);
        } catch (error) {
            logger.warn(`Music trackStart summary-clear failed in guild ${player.guildId}: ${error?.message || error}`);
        }

        guildData.lastTrackTitle = track?.info?.title || guildData.lastTrackTitle;
        guildData.lastTrackInfo = {
            title: track?.info?.title || null,
            author: track?.info?.author || null,
            uri: track?.info?.uri || null,
            isrc: track?.info?.isrc || null,
        };
        guildData.sessionTrackCount += 1;
        guildData.autoplayFailures = 0;
        guildData.lastSessionStats = null;
        // Native autoplay tracks arrive with isAutoplay set but no MidNight
        // requester metadata — tag them so the card credits the engine.
        if (track?.isAutoplay && track?.info && !track.info.requesterName) {
            track.info.requesterName = 'Autoplay Engine';
        }
        if (track?.info?.uri || track?.info?.identifier) {
            // Native exclusion keys on info.identifier first (video IDs for
            // YouTube), falling back to URI — record the same priority so the
            // ring actually matches.
            recordTrackHistory(client, player.guildId, track.info.identifier || track.info.uri).catch(() => null);
        }

        // Keep the Lavalink player's loop mode aligned with the stored preference.
        // Skip temporarily clears track-loop so it can advance; restore it here.
        // Guarded: a throwing setLoop must never skip the card update below.
        try {
            if (guildData.loop && player.loop !== guildData.loop) {
                player.setLoop(guildData.loop);
            }
        } catch (error) {
            logger.warn(`Music trackStart loop-restore failed in guild ${player.guildId}: ${error?.message || error}`);
        }

        if (player.previous) {
            guildData.previousTracks.push(player.previous);
            if (guildData.previousTracks.length > 20) {
                guildData.previousTracks.shift();
            }
        }

        if (guildData.idleTimeout) {
            clearTimeout(guildData.idleTimeout);
            guildData.idleTimeout = null;
        }

        let nowPlaying = null;
        let components = null;
        try {
            nowPlaying = buildNowPlayingContainer(track, player, guildData);
            components = buildPlayerButtonRows(player, guildData);
        } catch (error) {
            logger.error(`Music trackStart card-build failed in guild ${player.guildId}: ${error?.message || error}`);
            return;
        }

        try {
            const channelId = guildData.playerChannelId || player.textChannel;
            await editOrSendPlayerMessage(client, guildData, channelId, nowPlaying, components);
        } catch (error) {
            logger.error(`Music trackStart card-send failed in guild ${player.guildId}: ${error?.message || error}`);
        }
        startUpdateInterval(client, player.guildId);
        setVoiceChannelStatus(client, player.guildId, track.info?.title).catch(() => null);
        scheduleSessionSave(client, player.guildId);
    });

    client.riffy.on('queueEnd', async (player) => {
        try {
            const guildData = getGuildMusicData(player.guildId);
            clearUpdateInterval(guildData);

            if (guildData.autoplay && (guildData.autoplayFailures || 0) < 2) {
                try {
                    if (await runAutoplayEngine(client, player, guildData)) {
                        return;
                    }
                } catch (error) {
                    logger.warn(`Autoplay engine failed in guild ${player.guildId}:`, error?.message || error);
                }
                guildData.autoplayFailures = (guildData.autoplayFailures || 0) + 1;
            }

            clearVoiceChannelStatus(client, player.guildId).catch(() => null);

            // Native autoplay failure calls stop(), which can re-fire queueEnd —
            // never stack a second summary on top of the first.
            if (guildData.summaryMessageId) {
                return;
            }

            const finishedCount = guildData.sessionTrackCount;
            const lastTitle = player.current?.info?.title || guildData.lastTrackTitle || 'Unknown track';
            await transitionToSummary(client, player.guildId, {
                title: 'Queue Finished',
                body: `Last played **${lastTitle}**.\nSession tracks played: **${finishedCount}**.`,
                accentColor: ECONOMY_ACCENT.COOLDOWN,
            });

            if (!guildData.twentyFourSeven) {
                if (guildData.idleTimeout) {
                    clearTimeout(guildData.idleTimeout);
                }
                guildData.idleTimeout = setTimeout(() => {
                    try {
                        const currentPlayer = client.riffy.players.get(player.guildId);
                        if (currentPlayer && !currentPlayer.playing && !currentPlayer.paused && !currentPlayer.current) {
                            currentPlayer.destroy();
                        }
                    } catch {
                        // player already destroyed
                    }
                    guildData.idleTimeout = null;
                }, IDLE_DISCONNECT_MS);
            }
        } catch (error) {
            logger.error('Music queueEnd error:', error);
        }
    });

    client.riffy.on('playerDisconnect', async (player) => {
        const guildData = getGuildMusicData(player.guildId);
        clearUpdateInterval(guildData);
        clearAutoLeaveTimer(guildData);
        clearVoiceChannelStatus(client, player.guildId).catch(() => null);

        // destroyPlayerSession() already transitioned to a summary (built from
        // pre-reset counters) before player.destroy() fired this event.
        // Rebuilding here would read the zeroed counters — see the 0-track bug.
        if (!guildData.summaryMessageId) {
            const snapshot = guildData.lastSessionStats;
            const lastTitle = snapshot?.title || player.current?.info?.title || guildData.lastTrackTitle || 'Unknown track';
            const trackCount = snapshot && typeof snapshot.count === 'number' ? snapshot.count : guildData.sessionTrackCount;
            await transitionToSummary(client, player.guildId, {
                title: 'Disconnected from Voice Channel',
                body: `Session ended. Last played **${lastTitle}**.\nSession tracks played: **${trackCount}**.`,
            });
        }

        guildData.playerMessage = null;
        guildData.playerMessageId = null;
        guildData.playerChannelId = null;
        guildData.previousTracks = [];
        guildData.autoPaused = false;
        if (guildData.idleTimeout) {
            clearTimeout(guildData.idleTimeout);
            guildData.idleTimeout = null;
        }
    });

    client.riffy.on('trackError', async (player, track, payload) => {
        logger.error(`Track error in ${player.guildId} for "${track?.info?.title}":`, payload?.error || payload);
        const guildData = getGuildMusicData(player.guildId);
        if (guildData.playerChannelId) {
            const channel = client.channels.cache.get(guildData.playerChannelId);
            if (channel) {
                channel.send(`Failed to play **${track?.info?.title || 'track'}**. Skipping...`).catch(() => null);
            }
        }
    });

    client.riffy.on('trackStuck', async (player, track, payload) => {
        logger.warn(`Track stuck in ${player.guildId} for "${track?.info?.title}" (${payload?.thresholdMs}ms)`);
    });
}

export async function shutdownMusic(client) {
    if (!client.riffy?.players) {
        return;
    }

    for (const player of client.riffy.players.values()) {
        try {
            player.destroy();
        } catch (error) {
            logger.debug('Error destroying music player during shutdown:', error.message);
        }
    }
}
