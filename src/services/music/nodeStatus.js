import { MidNightError, ErrorTypes } from '../../utils/errorHandler.js';
import { createEmbed } from '../../utils/embeds.js';
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

export async function getNodeStatusEmbed(client) {
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
        return createEmbed({
            title: 'Pong!',
            description: 'No Lavalink nodes are configured.',
        });
    }

    const probed = await Promise.all(
        configured.map(async (cfg) => {
            const key = cfg.name || cfg.host;
            const live = client.riffy.nodeMap.get(key);

            if (!live) {
                return { name: key, ping: null, status: '⚫ Offline' };
            }
            if (!live.connected) {
                return { name: key, ping: null, status: '🔴 Disconnected' };
            }

            const livePing = await measureNodePing(live);
            const ping = livePing ?? getCachedStatsPing(live);
            return { name: key, ping, status: '🟢 Connected' };
        }),
    );

    const onlineCount = probed.filter((row) => row.status.includes('Connected')).length;

    const embed = createEmbed({ title: 'Pong!', description: null }).addFields(
        { name: 'Node', value: probed.map((row) => row.name).join('\n'), inline: true },
        {
            name: 'Ping',
            value: probed.map((row) => (row.ping === null ? 'N/A' : `${row.ping}ms`)).join('\n'),
            inline: true,
        },
        { name: 'Status', value: probed.map((row) => row.status).join('\n'), inline: true },
    );
    embed.setFooter({ text: `${onlineCount}/${probed.length} nodes online` });
    return embed;
}
