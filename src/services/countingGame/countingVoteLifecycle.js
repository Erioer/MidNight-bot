// countingVoteLifecycle.js
// Owns the Discord-side lifecycle of a ruin restore vote: rendering the active
// embed, closing/voiding it, and enforcing the 30-minute window.
//
// This module deliberately does NOT import countingHandler.js, so that
// countingRestoreVote.js can import both this and `restoreCount` without an
// import cycle.
//
// Exploit safeguards:
//  - Rule 1: a vote closes once `restoreVoteMaxCounts` valid counts land on the
//    new sequence (enforced in countingGameService.recordCorrectCount).
//  - Rule 2: exactly one vote exists; a newer ruin voids the previous embed
//    (enforced by the handler, using `closeRestoreVoteMessage`).
//  - Rule 3: a vote is voided once the new sequence reaches the restore target
//    (`shouldVoidByHighWaterMark`).
//  - Expiry: a vote closes after `restoreVoteWindowMs`, enforced by a timer,
//    a lazy check on every reaction, and a startup sweep.

import { logger } from '../../utils/logger.js';
import {
  COUNTING_COMMENT_PREFIX,
  COUNTING_EMOJI,
  COUNTING_TIMERS,
} from '../../config/countingGameConfig.js';
import { buildRuinEmbed } from './countingMessages.js';
import {
  getActiveRestoreVote,
  getCountingGameConfig,
  saveCountingGameConfig,
} from '../countingGameService.js';

const voteExpiryTimers = new Map();

/** True when the vote's persisted window has lapsed. */
export function isRestoreVoteExpired(vote) {
  const expiresAt = Number(vote?.expiresAt);
  return Number.isFinite(expiresAt) && Date.now() >= expiresAt;
}

/**
 * Rule 3 high-water mark. Restoring is only meaningful while the new sequence
 * sits below the restore target; once it reaches the target the vote is void.
 * A target of 0 (broke on the very first number) stays open until the new
 * sequence posts its first count.
 */
export function shouldVoidByHighWaterMark(currentCount, target) {
  const targetCount = Number.isFinite(target) ? target : 0;
  if (targetCount <= 0) return currentCount > 0;
  return currentCount >= targetCount;
}

/** Builds the ruin embed for a stored vote (active, restored, or a closed state). */
export function buildVoteEmbed(vote, { votes = 0, voteState = 'active', highestRecord = 0 } = {}) {
  const countAtBreak = Number.isFinite(vote?.preRuinCount) ? vote.preRuinCount : 0;
  return buildRuinEmbed({
    sentValue: vote?.sentValue ?? '—',
    countAtBreak,
    expectedValue: Number.isFinite(vote?.expectedValue) ? vote.expectedValue : countAtBreak + 1,
    nextExpected: 1,
    highestRecord: Math.max(highestRecord || 0, countAtBreak),
    reason: vote?.reason || 'Sequence was broken and is awaiting a restore vote.',
    ...(vote?.isRuinEvent
      ? {
        leadingText: `${COUNTING_EMOJI.warning} You have repeatedly posted invalid messages without the \`${COUNTING_COMMENT_PREFIX}\` comment prefix.`,
      }
      : {}),
    votes,
    requiredVotes: vote?.requiredVotes,
    voteState,
  });
}

/** Fetches the vote's message, or null when the channel/message is gone. */
export async function resolveVoteMessage(client, vote) {
  if (!client?.channels?.fetch || !vote?.channelId || !vote?.messageId) return null;
  const channel = await client.channels.fetch(vote.channelId).catch(() => null);
  if (!channel?.messages?.fetch) return null;
  return channel.messages.fetch(vote.messageId).catch(() => null);
}

/**
 * Rewrites the vote message so it no longer invites votes: the embed shows the
 * closing state and the bot's own reactions are removed. Only the message owned
 * by `vote` is touched, so an overwritten vote can never edit a newer one.
 */
export async function closeRestoreVoteMessage(client, vote, voteState = 'voided') {
  const message = await resolveVoteMessage(client, vote);
  if (!message) return false;
  await message.edit({ embeds: [buildVoteEmbed(vote, { voteState })] }).catch(() => {});
  await message.reactions?.removeAll?.().catch(() => {});
  return true;
}

/** Cancels the pending expiry timer for a guild, if any. */
export function clearRestoreVoteExpiry(guildId) {
  const timer = voteExpiryTimers.get(guildId);
  if (timer) {
    clearTimeout(timer);
    voteExpiryTimers.delete(guildId);
  }
}

/** Schedules the automatic close of a guild's current vote. */
export function scheduleRestoreVoteExpiry(client, guildId) {
  clearRestoreVoteExpiry(guildId);
  const timer = setTimeout(() => {
    voteExpiryTimers.delete(guildId);
    expireRestoreVote(client, guildId).catch((error) => {
      logger.error('Failed to expire counting restore vote:', { guildId, error });
    });
  }, COUNTING_TIMERS.restoreVoteWindowMs);
  timer.unref?.();
  voteExpiryTimers.set(guildId, timer);
}

/**
 * Closes the guild's current vote and clears it from storage. Callers that hold
 * the per-guild vote lock may call this directly; the expiry timer and the
 * startup sweep use it too. Returns the closed vote, or null when idle.
 */
export async function performVoidRestoreVote(client, guildId, voteState = 'voided') {
  const config = await getCountingGameConfig(client, guildId);
  const vote = getActiveRestoreVote(config);
  if (!vote) {
    clearRestoreVoteExpiry(guildId);
    return null;
  }

  await saveCountingGameConfig(client, guildId, { ...config, restoreVote: null });
  await closeRestoreVoteMessage(client, vote, voteState);
  clearRestoreVoteExpiry(guildId);

  logger.info('Counting restore vote closed', {
    guildId,
    state: voteState,
    messageId: vote.messageId,
  });

  return vote;
}

async function expireRestoreVote(client, guildId) {
  const config = await getCountingGameConfig(client, guildId);
  const vote = getActiveRestoreVote(config);
  if (!vote) {
    clearRestoreVoteExpiry(guildId);
    return;
  }
  if (!isRestoreVoteExpired(vote)) {
    scheduleRestoreVoteExpiry(client, guildId);
    return;
  }
  await performVoidRestoreVote(client, guildId, 'expired');
}

/**
 * Closes any vote whose window lapsed while the bot was offline, and re-arms
 * the timer for votes that are still live. Wired from the ready event.
 */
export async function sweepExpiredRestoreVotes(client) {
  const summary = { scanned: 0, closed: 0, rearmed: 0 };
  if (!client?.db?.list) return summary;

  let keys = [];
  try {
    keys = await client.db.list('countingGame:');
  } catch (error) {
    logger.error('Failed to list counting games for vote sweep:', error);
    return summary;
  }

  for (const key of keys) {
    const guildId = String(key).split(':')[1];
    if (!guildId) continue;
    summary.scanned += 1;
    try {
      const config = await getCountingGameConfig(client, guildId);
      const vote = getActiveRestoreVote(config);
      if (!vote) continue;
      if (isRestoreVoteExpired(vote)) {
        await performVoidRestoreVote(client, guildId, 'expired');
        summary.closed += 1;
      } else {
        scheduleRestoreVoteExpiry(client, guildId);
        summary.rearmed += 1;
      }
    } catch (error) {
      logger.error('Failed to sweep counting restore vote:', { guildId, error });
    }
  }

  return summary;
}
