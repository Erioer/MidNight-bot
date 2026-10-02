// countingRestoreVote.js
// Handles the community 🔄 vote that restores a broken count.
//
// Votes are stored in the counting config (key `countingGame:<guildId>`) as
// `restoreVote = { messageId, channelId, preRuinCount, brokenBy, requiredVotes,
// voters, createdAt, expiresAt, status, validCounts }`, so an in-progress vote
// survives bot restarts. Only one vote may be active at a time (single slot).
//
// The exploit safeguards live in three places:
//   - Rule 1 (5 valid counts) is enforced in countingGameService.recordCorrectCount.
//   - Rule 2 (new ruin voids the old vote) is enforced by the handler.
//   - Rule 3 (high-water mark), the 30-minute expiry, and the per-guild lock
//     are enforced here, alongside the reaction handling.

import { logger } from '../../utils/logger.js';
import { COUNTING_EMOJI } from '../../config/countingGameConfig.js';
import {
  buildVoteEmbed,
  clearRestoreVoteExpiry,
  isRestoreVoteExpired,
  performVoidRestoreVote,
  shouldVoidByHighWaterMark,
} from './countingVoteLifecycle.js';
import {
  getActiveCooldown,
  getActiveRestoreVote,
  getCountingGameConfig,
  saveCountingGameConfig,
} from '../countingGameService.js';
import { restoreCount } from './countingHandler.js';

// Per-guild lock so two reaction events (or a reaction racing the expiry timer)
// can never process and commit the same vote twice.
const voteLocks = new Set();

function acquireVoteLock(guildId) {
  if (voteLocks.has(guildId)) return false;
  voteLocks.add(guildId);
  return true;
}

function releaseVoteLock(guildId) {
  voteLocks.delete(guildId);
}

/** Renders the current tally onto the ruin embed, replaying the stored details. */
async function refreshVoteEmbed(reaction, config, vote, votes) {
  await reaction.message.edit({
    embeds: [buildVoteEmbed(vote, { votes, voteState: 'active', highestRecord: config.highestRecord })],
  }).catch(() => {});
}

function isRestoreEmoji(emoji) {
  if (!emoji) return false;
  // Unicode 🔄 has no id; a custom emoji named 🔄 is matched by name too.
  return emoji.name === COUNTING_EMOJI.restoreVote;
}

async function resolveReaction(reaction) {
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message?.partial) await reaction.message.fetch();
  } catch {
    return null;
  }
  return reaction;
}

/**
 * Reads the live 🔄 reaction count, excluding the bot's own reaction. The bot
 * always reacts to the ruin embed so members have a button to click, so that
 * one reaction must never count as a vote. This same number drives both the
 * embed tally and the restore threshold, so the two can never disagree.
 */
export async function fetchLiveVoteCount(message) {
  try {
    // A partial message's cache is empty until the reactions are fetched.
    if (message.reactions?.cache?.size === 0 && typeof message.reactions?.fetch === 'function') {
      await message.reactions.fetch().catch(() => null);
    }
    const reaction = message.reactions?.cache?.get(COUNTING_EMOJI.restoreVote);
    const raw = reaction?.count ?? 0;
    return Math.max(0, raw - 1);
  } catch {
    return 0;
  }
}

/** The current counted number on the active sequence (nextNumber - 1). */
function currentSequenceCount(config) {
  return Math.max(0, (config.nextNumber || 1) - 1);
}

/**
 * Registers a 🔄 vote on a ruin embed and performs the restore once the
 * configured threshold is reached. Safe to call for every reaction event: it
 * returns early when the reaction is not a counting restore vote.
 */
export async function processCountingRestoreVote(reactionRaw, user) {
  if (!reactionRaw?.message?.guild) return;
  if (!user || user.bot) return;
  if (!isRestoreEmoji(reactionRaw.emoji)) return;

  const reaction = await resolveReaction(reactionRaw);
  if (!reaction) return;

  // The bot reacts with 🔄 itself; never treat that as a member vote even if the
  // event arrives before the user object is fully fetched.
  if (reaction.client?.user?.id === user.id) return;

  const guildId = reaction.message.guild.id;
  if (!acquireVoteLock(guildId)) return;

  try {
    const config = await getCountingGameConfig(reaction.client, guildId);
    if (!config.enabled) return;

    const vote = getActiveRestoreVote(config);
    if (!vote || vote.messageId !== reaction.message.id) return;

    // Expiry: the window may have lapsed while the bot slept, or while this
    // event sat in the queue. Close it before accepting any vote.
    if (isRestoreVoteExpired(vote)) {
      await performVoidRestoreVote(reaction.client, guildId, 'expired');
      return;
    }

    // Rule 3: once the rebuilt sequence reaches the restore target the vote is
    // meaningless — restoring would move the count backwards or stand still.
    if (shouldVoidByHighWaterMark(currentSequenceCount(config), vote.preRuinCount)) {
      await performVoidRestoreVote(reaction.client, guildId, 'cancelled');
      return;
    }

    // The member who broke the count can never vote.
    if (vote.brokenBy === user.id) return;

    // Tally = live reactions minus the bot's own reaction. The tracked voter
    // list is kept in sync for the audit trail and as a floor, so a momentary
    // unreadable reaction cache can never make the count fall behind.
    const liveVotes = await fetchLiveVoteCount(reaction.message);
    const voters = vote.voters.includes(user.id) ? vote.voters : [...vote.voters, user.id];
    const voteCount = Math.max(liveVotes, voters.length);

    const resolvedVote = { ...vote, voters };
    const reached = voteCount >= vote.requiredVotes;
    const votedConfig = { ...config, restoreVote: resolvedVote };
    await saveCountingGameConfig(reaction.client, guildId, votedConfig);

    const ruinMessage = reaction.message;
    await refreshVoteEmbed(reaction, votedConfig, resolvedVote, voteCount);

    if (!reached) return;

    // Re-check the high-water mark immediately before committing: a valid count
    // may have landed while the votes were being tallied.
    const fresh = await getCountingGameConfig(reaction.client, guildId);
    if (shouldVoidByHighWaterMark(currentSequenceCount(fresh), vote.preRuinCount)) {
      await performVoidRestoreVote(reaction.client, guildId, 'cancelled');
      return;
    }

    const outcome = await restoreCount({
      client: reaction.client,
      guild: reaction.message.guild,
      messageId: ruinMessage.id,
      method: 'community_vote',
      actor: user.id,
    });

    clearRestoreVoteExpiry(guildId);

    logger.info('Counting game restored by community vote', {
      guildId,
      restoredTo: outcome.restoredTo,
      votes: voters.length,
    });
  } finally {
    releaseVoteLock(guildId);
  }
}

export { isRestoreEmoji, resolveReaction, refreshVoteEmbed };

/**
 * Withdraws a 🔄 vote when the reaction is removed so votes cannot be farmed by
 * repeatedly adding and removing the emoji.
 */
export async function withdrawCountingRestoreVote(reactionRaw, user) {
  if (!reactionRaw?.message?.guild) return;
  if (!user || user.bot) return;
  if (!isRestoreEmoji(reactionRaw.emoji)) return;

  const reaction = await resolveReaction(reactionRaw);
  if (!reaction) return;

  // Ignore the bot removing its own reaction.
  if (reaction.client?.user?.id === user.id) return;

  const guildId = reaction.message.guild.id;
  if (!acquireVoteLock(guildId)) return;

  try {
    const config = await getCountingGameConfig(reaction.client, guildId);
    if (!config.enabled) return;

    const vote = getActiveRestoreVote(config);
    if (!vote || vote.messageId !== reaction.message.id) return;

    if (isRestoreVoteExpired(vote)) {
      await performVoidRestoreVote(reaction.client, guildId, 'expired');
      return;
    }

    if (!vote.voters.includes(user.id)) return;

    const voters = vote.voters.filter((id) => id !== user.id);
    const liveVotes = await fetchLiveVoteCount(reaction.message);
    const voteCount = Math.max(liveVotes, voters.length);
    const resolvedVote = { ...vote, voters };
    const updated = { ...config, restoreVote: resolvedVote };
    await saveCountingGameConfig(reaction.client, guildId, updated);
    await refreshVoteEmbed(reaction, updated, resolvedVote, voteCount);
  } finally {
    releaseVoteLock(guildId);
  }
}

/**
 * Clears a lapsed ruin cooldown. Called opportunistically from the message
 * handler so a stale penalty never persists in storage.
 */
export function purgeExpiredCooldown(config) {
  if (config.cooldown && !getActiveCooldown(config)) {
    return { ...config, cooldown: null };
  }
  return config;
}
