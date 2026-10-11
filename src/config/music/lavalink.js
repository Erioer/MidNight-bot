import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    return ['true', '1', 'yes'].includes(String(value).toLowerCase());
}

function parseNodesFromEnv() {
    const raw = process.env.LAVALINK_NODES?.trim();
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function parseNodesPayload(parsed) {
    if (Array.isArray(parsed)) {
        return parsed;
    }
    if (Array.isArray(parsed?.nodes)) {
        return parsed.nodes;
    }
    return null;
}

function loadNodesFromFile() {
    const nodesFile = process.env.LAVALINK_NODES_FILE?.trim()
        || path.join(projectRoot, 'lavalink', 'nodes.json');

    if (!existsSync(nodesFile)) {
        return null;
    }

    try {
        const parsed = JSON.parse(readFileSync(nodesFile, 'utf8'));
        return parseNodesPayload(parsed);
    } catch {
        return null;
    }
}

export function getLavalinkNodes() {
    // 1. Full override: explicit JSON array replaces every other source.
    const fromJson = parseNodesFromEnv();
    if (fromJson?.length) {
        return fromJson;
    }

    const fromFile = loadNodesFromFile() || [];

    // 2. A node typed in .env becomes PRIMARY: it leads the pool and every
    // file node follows as a secondary failover target.
    if (hasEnvSingleNode()) {
        return dedupeNodes([buildEnvNode(), ...fromFile]);
    }

    // 3. No .env node: current system — file pool, else a localhost default.
    if (fromFile?.length) {
        return fromFile;
    }

    return [buildDefaultNode()];
}

/** Presence check: LAVALINK_HOST explicitly set (a commented default reads as blank). */
function hasEnvSingleNode() {
    return Boolean(process.env.LAVALINK_HOST?.trim());
}

function buildEnvNode() {
    return {
        host: process.env.LAVALINK_HOST.trim(),
        port: Number(process.env.LAVALINK_PORT || 2333),
        password: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
        secure: parseBoolean(process.env.LAVALINK_SECURE, false),
        name: process.env.LAVALINK_NAME?.trim() || 'Primary',
        primary: true,
    };
}

function buildDefaultNode() {
    return {
        host: 'localhost',
        port: 2333,
        password: 'youshallnotpass',
        secure: false,
        name: 'Main',
    };
}

/** First entry wins on host:port clashes, so a secondary can never shadow the primary. */
function dedupeNodes(nodes) {
    const seen = new Set();
    return nodes.filter((node) => {
        const key = `${String(node?.host || '').toLowerCase()}:${Number(node?.port || 2333)}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

export const lavalinkConfig = {
    nodes: getLavalinkNodes(),
    defaultSearchPlatform: process.env.LAVALINK_SEARCH_PLATFORM || 'ytmsearch',
    restVersion: process.env.LAVALINK_REST_VERSION || 'v4',
    // NOTE: Riffy reads these from the *global* client options, not per-node
    // objects — putting them inside a node entry would silently do nothing.
    reconnectTries: Number(process.env.LAVALINK_RECONNECT_TRIES || 10),
    reconnectTimeout: Number(process.env.LAVALINK_RECONNECT_TIMEOUT || 5000),
    resumeTimeout: Number(process.env.LAVALINK_RESUME_TIMEOUT || 60),
};

export default lavalinkConfig;
