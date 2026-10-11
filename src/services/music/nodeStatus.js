import { MidNightError, ErrorTypes } from '../../utils/errorHandler.js';
import { container, divider, text } from '../../utils/componentsV2.js';
import { ECONOMY_ACCENT } from '../economy/economyViews.js';
import { getLavalinkNodes } from '../../config/music/lavalink.js';
import { logger } from '../../utils/logger.js';

const WS_OPEN = 1;
const PROBE_TIMEOUT_MS = 4000;

function measureNodePing(node, timeoutMs = PROBE_TIMEOUT_MS) {
    return new Promise((resolve) => {
        let settled = false;
        let timer = null;
        let onPong = null;

        const finish = (value) => {
            if (settled) {
                return;
            }
            settled = true;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            try {
                if (node?.ws && onPong) {
                    node.ws.removeListener('pong', onPong);
                }
            } catch {
                // ignore listener cleanup errors
            }
            resolve(value);
        };

        try {
            const ws = node?.ws;
            if (!ws || ws.readyState !== WS_OPEN) {
                finish(null);
                return;
            }
            const start = Date.now();
            onPong = () => finish(Date.now() - start);
            timer = setTimeout(() => finish(null), timeoutMs);
            ws.once('pong', onPong);
            ws.ping();
        } catch (error) {
            logger.debug(`Node ping probe failed for "${node?.name}": ${error?.message || error}`);
            finish(null);
        }
    });
}

function getCachedStatsPing(node) {
    const ping = node?.stats?.ping;
    if (typeof ping === 'number' && Number.isFinite(ping)) {
        return Math.max(0, Math.round(ping));
    }
    return null;
}

function getNodePenalty(node) {
    try {
        const penalty = node?.penalties;
        return typeof penalty === 'number' && Number.isFinite(penalty) ? Math.round(penalty) : 0;
    } catch {
        return 0;
    }
}

function countNodePlayers(client, live) {
    try {
        let count = 0;
        for (const player of client.riffy?.players?.values() || []) {
            if (player?.node === live) {
                count += 1;
            }
        }
        return count;
    } catch {
        return 0;
    }
}

/** Raw node rows: [{ name, ping, status, players, penalty }]. Pure-ish — probes live nodes. */
export async function probeLavalinkNodes(client) {
    if (!client.riffy) {
        throw new MidNightError(
            'Lavalink not configured',
            ErrorTypes.CONFIGURATION,
            'Music is unavailable — Lavalink is not configured.',
        );
    }

    // Source the list from the configured nodes (nodes.json / env) so nodes that
    // died and were removed from Riffy's live map still show up as Offline.
    const configured = getLavalinkNodes();
    if (!configured?.length) {
        return [];
    }

    return Promise.all(
        configured.map(async (cfg) => {
            const key = cfg.name || cfg.host;
            const live = client.riffy.nodeMap.get(key);

            if (!live) {
                return { name: key, ping: null, status: '⚫ Offline', players: 0, penalty: 0, primary: Boolean(cfg.primary) };
            }
            if (!live.connected) {
                return { name: key, ping: null, status: '🔴 Disconnected', players: 0, penalty: 0, primary: Boolean(cfg.primary) };
            }

            const livePing = await measureNodePing(live);
            const ping = livePing ?? getCachedStatsPing(live);
            return {
                name: key,
                ping,
                status: '🟢 Connected',
                players: countNodePlayers(client, live),
                penalty: getNodePenalty(live),
                primary: Boolean(cfg.primary),
            };
        }),
    );
}

export async function getNodeStatusContainer(client) {
    if (!client.riffy) {
        throw new MidNightError(
            'Lavalink not configured',
            ErrorTypes.CONFIGURATION,
            'Music is unavailable — Lavalink is not configured.',
        );
    }

    const probed = await probeLavalinkNodes(client);

    if (!probed?.length) {
        return buildNodePingContainer([], 'No Lavalink nodes are configured.');
    }

    return buildNodePingContainer(probed);
}

/**
 * Shared node-ping card. `/stats`'s Node Ping button and `/music ping` both
 * render through here so the two views can never drift apart.
 */
export function buildNodePingContainer(rows, emptyBody = 'No Lavalink nodes configured.') {
    const onlineCount = rows.filter((row) => row.status.includes('Connected')).length;

    const body = rows.length > 0
        ? rows
            .map((row) => {
                const primary = row.primary ? ' ★ Primary' : '';
                const head = `• **${row.name}:**${primary} ${row.status}`;
                if (!row.status.includes('Connected')) {
                    return head;
                }
                const ping = row.ping === null ? '' : ` (\`${row.ping}ms\`)`;
                return `${head}${ping} · ${row.players ?? 0} players · penalty ${row.penalty ?? 0}`;
            })
            .join('\n')
        : emptyBody;

    return container({
        accentColor: rows.length > 0 && onlineCount === 0 ? ECONOMY_ACCENT.FAILURE : undefined,
        parts: [
            text('### Node Ping'),
            text(body),
            divider(),
            text(`-# ${onlineCount}/${rows.length} nodes online`),
        ],
    });
}

