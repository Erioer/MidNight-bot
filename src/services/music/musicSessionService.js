import { getGuildMusicData } from './playerStore.js';
import { getGuildMusicHistoryKey, getGuildMusicSessionKey, getMusicSessionIndexKey } from '../../utils/database/keys.js';
import { logger } from '../../utils/logger.js';

const HISTORY_LIMIT = 20;

export async function getTrackHistory(client, guildId) {
  try {
    const history = await client?.db?.get(getGuildMusicHistoryKey(guildId), []);
    return Array.isArray(history) ? history.filter((uri) => typeof uri === 'string') : [];
  } catch {
    return [];
  }
}

export async function recordTrackHistory(client, guildId, uri) {
  if (!client?.db || !uri) {
    return;
  }
  try {
    const history = await getTrackHistory(client, guildId);
    const next = [uri, ...history.filter((entry) => entry !== uri)].slice(0, HISTORY_LIMIT);
    await client.db.set(getGuildMusicHistoryKey(guildId), next);
  } catch (error) {
    logger.warn(`Track history save failed for guild ${guildId}:`, error?.message || error);
  }
}

const SAVE_DEBOUNCE_MS = 1500;
const MAX_PERSISTED_TRACKS = 50;
const MAX_RECOVERY_TRACKS = 25;
const RECOVERY_DELAY_MS = 15000;
const RECOVERY_RETRY_DELAY_MS = 10000;
const RECOVERY_MAX_ATTEMPTS = 6;

const saveTimers = new Map();

function clampVolume(value, fallback = 75) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function sanitizeLoopMode(value) {
  return ['none', 'track', 'queue'].includes(value) ? value : 'none';
}

function sanitizeFilterPreset(value) {
  return typeof value === 'string' && value ? value : 'clear';
}

export function serializeSessionTrack(track) {
  const info = track?.info || {};
  return {
    encoded: track?.track || track?.encoded || track?.rawData?.encoded || null,
    title: info.title || 'Unknown',
    author: info.author || 'Unknown',
    uri: info.uri || null,
    length: typeof info.length === 'number' ? info.length : 0,
    isStream: Boolean(info.isStream || info.stream),
    sourceName: info.sourceName || null,
    requesterId: info.requester?.id || null,
    requesterName: track?.info?.requesterName || info.requester?.displayName || info.requester?.globalName || info.requester?.username || 'Unknown',
  };
}

async function addGuildToSessionIndex(client, guildId) {
  try {
    const key = getMusicSessionIndexKey();
    const index = await client.db.get(key, []);
    const guildIds = Array.isArray(index) ? index.map(String) : [];
    if (!guildIds.includes(String(guildId))) {
      guildIds.push(String(guildId));
      await client.db.set(key, guildIds);
    }
  } catch (error) {
    logger.warn(`Failed to index music session for guild ${guildId}:`, error?.message || error);
  }
}

async function removeGuildFromSessionIndex(client, guildId) {
  try {
    const key = getMusicSessionIndexKey();
    const index = await client.db.get(key, []);
    if (!Array.isArray(index)) {
      return;
    }
    const guildIds = index.map(String).filter((id) => id !== String(guildId));
    await client.db.set(key, guildIds);
  } catch (error) {
    logger.warn(`Failed to remove music session index for guild ${guildId}:`, error?.message || error);
  }
}

export function scheduleSessionSave(client, guildId) {
  if (!client?.db || !guildId) {
    return;
  }
  const key = String(guildId);
  if (saveTimers.has(key)) {
    clearTimeout(saveTimers.get(key));
  }
  const timer = setTimeout(() => {
    saveTimers.delete(key);
    saveSessionNow(client, guildId).catch((error) => {
      logger.warn(`Music session save failed for guild ${guildId}:`, error?.message || error);
    });
  }, SAVE_DEBOUNCE_MS);
  saveTimers.set(key, timer);
  if (typeof timer?.unref === 'function') {
    timer.unref();
  }
}

export async function saveSessionNow(client, guildId) {
  if (!client?.db || typeof client.db.set !== 'function' || typeof client.db.get !== 'function') {
    return;
  }

  const guildData = getGuildMusicData(guildId);
  const player = client.riffy?.players?.get(guildId) || null;
  const key = getGuildMusicSessionKey(guildId);

  if (!player) {
    if (!guildData.twentyFourSeven) {
      await client.db.delete(key).catch(() => null);
      await removeGuildFromSessionIndex(client, guildId);
      return;
    }
    const existing = await client.db.get(key, null).catch(() => null);
    if (!existing?.voiceChannelId || !existing?.textChannelId) {
      return;
    }
    const session = {
      ...existing,
      version: 1,
      guildId: String(guildId),
      twentyFourSeven: true,
      volume: clampVolume(guildData.volume, existing.volume ?? 75),
      loop: sanitizeLoopMode(guildData.loop),
      autoplay: Boolean(guildData.autoplay),
      filterPreset: sanitizeFilterPreset(guildData.filterPreset),
      updatedAt: new Date().toISOString(),
    };
    await client.db.set(key, session).catch(() => null);
    await addGuildToSessionIndex(client, guildId);
    return;
  }

  const tracks = [];
  if (player.current) {
    tracks.push(serializeSessionTrack(player.current));
  }
  if (player.queue?.length) {
    for (const track of player.queue.slice(0, MAX_PERSISTED_TRACKS)) {
      tracks.push(serializeSessionTrack(track));
      if (tracks.length >= MAX_PERSISTED_TRACKS + 1) {
        break;
      }
    }
  }

  const session = {
    version: 1,
    guildId: String(guildId),
    voiceChannelId: player.voiceChannel || null,
    textChannelId: guildData.playerChannelId || player.textChannel || null,
    twentyFourSeven: Boolean(guildData.twentyFourSeven),
    volume: clampVolume(guildData.volume),
    loop: sanitizeLoopMode(guildData.loop),
    autoplay: Boolean(guildData.autoplay),
    filterPreset: sanitizeFilterPreset(guildData.filterPreset),
    queue: tracks,
    updatedAt: new Date().toISOString(),
  };

  if (!session.voiceChannelId || !session.textChannelId) {
    return;
  }

  await client.db.set(key, session).catch(() => null);
  if (session.twentyFourSeven) {
    await addGuildToSessionIndex(client, guildId);
  }
}

function hasConnectedNodes(client) {
  try {
    const nodes = client.riffy?.nodeMap?.values ? [...client.riffy.nodeMap.values()] : [];
    return nodes.some((node) => node?.connected);
  } catch {
    return false;
  }
}

async function resolveRecoveryTrack(client, saved) {
  const query = saved?.uri || [saved?.title, saved?.author].filter(Boolean).join(' ').trim();
  if (!query) {
    return null;
  }
  try {
    const result = await client.riffy.resolve({ query, requester: { id: saved?.requesterId || 'recovery' } });
    const track = result?.tracks?.[0] || null;
    if (!track) {
      return null;
    }
    track.info.requesterName = saved?.requesterName || 'Unknown';
    return track;
  } catch {
    return null;
  }
}

export async function recoverMusicSessions(client, { applyFilter } = {}) {
  const outcome = { recovered: 0, skipped: 0, ready: hasConnectedNodes(client) };
  if (!client?.db || typeof client.db.get !== 'function') {
    return outcome;
  }
  if (client.config?.features?.music === false) {
    return outcome;
  }
  if (!client.riffy) {
    return outcome;
  }

  let guildIds = [];
  try {
    guildIds = await client.db.get(getMusicSessionIndexKey(), []);
  } catch {
    guildIds = [];
  }
  if (!Array.isArray(guildIds)) {
    guildIds = [];
  }

  for (const guildId of [...new Set(guildIds.map(String))]) {
    let session = null;
    try {
      session = await client.db.get(getGuildMusicSessionKey(guildId), null);
    } catch {
      session = null;
    }
    if (!session?.twentyFourSeven) {
      continue;
    }
    if (client.riffy.players.get(guildId)) {
      continue;
    }

    const guild = client.guilds.cache.get(guildId);
    const voiceChannel = guild && session.voiceChannelId ? guild.channels.cache.get(session.voiceChannelId) : null;
    const textChannel = guild && session.textChannelId ? guild.channels.cache.get(session.textChannelId) : null;
    if (!guild || !voiceChannel || !textChannel) {
      outcome.skipped += 1;
      continue;
    }

    try {
      const player = client.riffy.createConnection({
        guildId,
        voiceChannel: voiceChannel.id,
        textChannel: textChannel.id,
        deaf: true,
      });
      const guildData = getGuildMusicData(guildId);
      guildData.twentyFourSeven = true;
      guildData.volume = clampVolume(session.volume);
      guildData.loop = sanitizeLoopMode(session.loop);
      guildData.autoplay = Boolean(session.autoplay);
      guildData.filterPreset = sanitizeFilterPreset(session.filterPreset);
      guildData.playerChannelId = textChannel.id;
      player.setVolume(guildData.volume);
      player.setLoop(guildData.loop);

      if (guildData.filterPreset !== 'clear' && typeof applyFilter === 'function') {
        try {
          await applyFilter(player, guildData);
        } catch (error) {
          logger.warn(`Stored audio filter could not be restored for guild ${guildId}:`, error?.message || error);
        }
      }

      const savedTracks = Array.isArray(session.queue) ? session.queue.slice(0, MAX_RECOVERY_TRACKS) : [];
      for (const saved of savedTracks) {
        const track = await resolveRecoveryTrack(client, saved);
        if (track) {
          player.queue.add(track);
        }
      }
      if (player.queue.length > 0 && !player.playing && !player.paused) {
        try {
          const result = player.play();
          if (result?.catch) {
            result.catch((error) => {
              logger.debug(`Recovery playback start failed in guild ${guildId}:`, error?.message || error);
            });
          }
        } catch (error) {
          logger.debug(`Recovery playback start threw in guild ${guildId}:`, error?.message || error);
        }
      }
      outcome.recovered += 1;
      scheduleSessionSave(client, guildId);
    } catch (error) {
      logger.warn(`Music session recovery failed for guild ${guildId}:`, error?.message || error);
      outcome.skipped += 1;
    }
  }

  return outcome;
}

export function scheduleSessionRecovery(client, options = {}) {
  if (!client) {
    return;
  }
  let attempts = 0;
  const run = async () => {
    attempts += 1;
    try {
      const outcome = await recoverMusicSessions(client, options);
      if (outcome.recovered > 0) {
        logger.info(`Music session recovery restored ${outcome.recovered} 24/7 session(s).`);
        return;
      }
      if (outcome.ready || attempts >= RECOVERY_MAX_ATTEMPTS) {
        return;
      }
    } catch (error) {
      logger.warn('Music session recovery failed:', error?.message || error);
      if (attempts >= RECOVERY_MAX_ATTEMPTS) {
        return;
      }
    }
    const timer = setTimeout(run, RECOVERY_RETRY_DELAY_MS);
    if (typeof timer?.unref === 'function') {
      timer.unref();
    }
  };
  const initial = setTimeout(run, RECOVERY_DELAY_MS);
  if (typeof initial?.unref === 'function') {
    initial.unref();
  }
}
