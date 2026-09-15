import { MidNightError, ErrorTypes } from '../../utils/errorHandler.js';
import { createEmbed } from '../../utils/embeds.js';

const PING_COLUMN_WIDTH = 5;

function formatPing(node) {
    const ping = node.connected ? node.stats?.ping : null;
    if (typeof ping === 'number' && Number.isFinite(ping)) {
        return String(Math.max(0, Math.round(ping)));
    }
    return 'N/A';
}

function formatStatus(node) {
    return node.connected ? 'Connected' : 'Disconnected';
}

function buildNodeTable(nodes) {
    const nameColumnWidth = Math.max('Node'.length, ...nodes.map((node) => node.name.length));
    const header = `${'Node'.padEnd(nameColumnWidth)}  ${'Pings'.padStart(PING_COLUMN_WIDTH)}  Status`;
    const rows = nodes.map((node) => {
        const name = node.name.padEnd(nameColumnWidth);
        const ping = formatPing(node).padStart(PING_COLUMN_WIDTH);
        return `${name}  ${ping}  ${formatStatus(node)}`;
    });
    return [header, ...rows].join('\n');
}

export function getNodeStatusEmbed(client) {
    if (!client.riffy) {
        throw new MidNightError(
            'Lavalink not configured',
            ErrorTypes.CONFIGURATION,
            'Music is unavailable — Lavalink is not configured.',
        );
    }

    const nodes = [...client.riffy.nodeMap.values()];
    if (!nodes.length) {
        return createEmbed({
            title: 'Node Ping',
            description: 'No Lavalink nodes are configured.',
            color: 'primary',
            footer: '0 nodes',
        });
    }

    const connectedCount = nodes.filter((node) => node.connected).length;

    return createEmbed({
        title: 'Node Ping',
        description: `\`\`\`\n${buildNodeTable(nodes)}\n\`\`\``,
        color: 'primary',
        footer: `${connectedCount}/${nodes.length} nodes connected`,
        timestamp: true,
    });
}