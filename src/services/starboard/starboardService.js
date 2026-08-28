// starboardService.js
// Core reaction-add/remove logic: filtering, threshold checks, and
// posting/editing/deleting starboard messages. Called from
// src/events/messageReactionAdd.js and messageReactionRemove.js.

import { logger } from '../../utils/logger.js';
import {
  getStarboardConfig,
  getStarredMessage,
  saveStarredMessage,
  deleteStarredMessage,
} from './starboardStore.js';
import { emojiMatches, displayEmoji } from './emoji.js';
import { buildStarboardPayload } from './starboardEmbed.js';

/**
 * Tiny per-message mutex so rapid-fire reaction add/remove events on the
 * same message can't race each other into posting duplicate starboard
 * entries or double-deleting. Keyed by `${guildId}:${messageId}`.
 */
const locks = new Map();
function runExclusive(key, task) {
  const previous = locks.get(key) || Promise.resolve();
  const current = previous.then(task, task);
  locks.set(key, current.catch(() => {})); // never let one failed task poison the chain for the next caller
  return current;
}

async function resolvePartials(reaction, user) {
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
    if (user.partial) await user.fetch();
  } catch (error) {
    // Original message/reaction was likely deleted before we could fetch it.
    return null;
  }
  return reaction;
}

/**
 * Shared entry point for both messageReactionAdd and messageReactionRemove —
 * the filter → match → resync logic is identical either way; only the
 * resulting count differs, and discord.js already keeps `reaction.count`
 * accurate for us on both events.
 */
export async function processStarboardReaction(reactionRaw, user) {
  if (!reactionRaw.message.guild) return; // ignore DMs
  if (user.bot) return; // don't let bots (including this bot) inflate/trigger star counts

  const reaction = await resolvePartials(reactionRaw, user);
  if (!reaction) return;

  const message = reaction.message;
  const guildId = message.guild.id;

  const config = await getStarboardConfig(guildId);
  if (!config) return; // no starboard configured for this guild

  // --- Self-reaction guard (required) ---
  // Never process reactions on messages that live inside the starboard
  // channel itself — otherwise reacting to a starboard post could recurse.
  if (message.channelId === config.channelId) return;

  if (!emojiMatches(config.emoji, reaction.emoji)) return;

  const key = `${guildId}:${message.id}`;
  await runExclusive(key, () => syncStarboardMessage(config, message, reaction.count));
}

async function syncStarboardMessage(config, message, count) {
  const guildId = message.guild.id;
  const entry = await getStarredMessage(guildId, message.id);

  if (count >= config.threshold) {
    const starboardChannel = await message.guild.channels.fetch(config.channelId).catch(() => null);
    if (!starboardChannel) return;

    const payload = buildStarboardPayload(message, count, displayEmoji(config.emoji));

    if (entry) {
      const existingMessage = await starboardChannel.messages
        .fetch(entry.starboardMessageId)
        .catch(() => null);
      if (existingMessage) {
        await existingMessage
          .edit(payload)
          .catch((error) => logger.debug(`Starboard edit failed: ${error.message}`));
        return;
      }
      // Starboard message was deleted out-of-band (e.g. by a mod) — fall
      // through and recreate it below so the mapping stays accurate.
    }

    const posted = await starboardChannel.send(payload).catch((error) => {
      logger.error('Failed to post starboard message:', error);
      return null;
    });
    if (posted) {
      await saveStarredMessage(guildId, message.id, {
        starboardMessageId: posted.id,
        originalChannelId: message.channelId,
        authorId: message.author?.id ?? null,
      });
    }
    return;
  }

  // Below threshold: if we'd previously posted it, take it down.
  if (entry) {
    const starboardChannel = await message.guild.channels.fetch(config.channelId).catch(() => null);
    if (starboardChannel) {
      const existingMessage = await starboardChannel.messages
        .fetch(entry.starboardMessageId)
        .catch(() => null);
      if (existingMessage) await existingMessage.delete().catch(() => {});
    }
    await deleteStarredMessage(guildId, message.id);
  }
}
