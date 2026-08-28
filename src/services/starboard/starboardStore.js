// starboardStore.js
// Data access for the Starboard feature, following the same pattern as
// utils/database/tickets.js: thin async wrappers around the shared
// DatabaseWrapper (PostgreSQL, with automatic in-memory fallback), one key
// per record rather than one big JSON blob per guild.

import { db, getFromDb } from '../../utils/database/wrapper.js';
import {
  getStarboardConfigKey,
  getStarboardMessageKey,
  getStarboardMessagesPrefix,
} from '../../utils/database/keys.js';

/** Returns { channelId, emoji, threshold, createdAt } or null. */
export async function getStarboardConfig(guildId) {
  if (!db.initialized) {
    await db.initialize();
  }

  return await db.get(getStarboardConfigKey(guildId));
}

export async function saveStarboardConfig(guildId, { channelId, emoji, threshold }) {
  if (!db.initialized) {
    await db.initialize();
  }

  await db.set(getStarboardConfigKey(guildId), {
    channelId,
    emoji,
    threshold,
    createdAt: Date.now(),
  });
}

export async function deleteStarboardConfig(guildId) {
  if (!db.initialized) {
    await db.initialize();
  }

  await db.delete(getStarboardConfigKey(guildId));
}

/** Returns { starboardMessageId, originalChannelId, authorId } or null. */
export async function getStarredMessage(guildId, originalMessageId) {
  if (!db.initialized) {
    await db.initialize();
  }

  return await db.get(getStarboardMessageKey(guildId, originalMessageId));
}

export async function saveStarredMessage(guildId, originalMessageId, entry) {
  if (!db.initialized) {
    await db.initialize();
  }

  await db.set(getStarboardMessageKey(guildId, originalMessageId), entry);
}

export async function deleteStarredMessage(guildId, originalMessageId) {
  if (!db.initialized) {
    await db.initialize();
  }

  await db.delete(getStarboardMessageKey(guildId, originalMessageId));
}

/** Deletes every tracked starred-message mapping for a guild (called by $removeStarboard). */
export async function clearStarredMessages(guildId) {
  if (!db.initialized) {
    await db.initialize();
  }

  if (typeof db.list !== 'function') {
    return;
  }

  const keys = await db.list(getStarboardMessagesPrefix(guildId));
  for (const key of keys) {
    await db.delete(key);
  }
}
