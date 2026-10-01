// countingRestoreVote.js
// Handles the community 🔄 vote that restores a broken count.
//
// Votes are stored in the counting config (key `countingGame:<guildId>`) as
// `restoreVote = { messageId, channelId, preRuinCount, brokenBy, requiredVotes,
// voters, createdAt }`, so an in-progress vote survives bot restarts.

import { logger } from '../../utils/logger.js';
import { COUNTING_EMOJI, COUNTING_COMMENT_PREFIX } from '../../config/countingGameConfig.js';
import { buildRuinEmbed } from './countingMessages.js';
import {
  applyRestoreVote,
  getActiveCooldown,
  getCountingGameConfig,
  removeRestoreVote,
  saveCountingGameConfig,
} from '../countingGameService.js';
import { restoreCount } from './countingHandler.js';

/** Renders the current tally onto the ruin embed, replaying the stored details. */
async function refreshVoteEmbed(reaction, config, vote, votes) {
  const countAtBreak = vote.preRuinCount || 0;
  await reaction.message.edit({
    embeds: [buildRuinEmbed({
      sentValue: vote.sentValue ?? '—',
      countAtBreak,
      expectedValue: vote.expectedValue ?? countAtBreak + 1,
      nextExpected: 1,
      highestRecord: Math.max(config.highestRecord || 0, countAtBreak),
      reason: vote.reason || 'Sequence was broken and is awaiting a restore vote.',
      ...(vote.isRuinEvent
        ? {
          leadingText: `${COUNTING_EMOJI.warning} You have repeatedly posted invalid messages without the \`${COUNTING_COMMENT_PREFIX}\` comment prefix.`,
        }
        : {}),
      votes,
      requiredVotes: vote.requiredVotes,
    })],
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
 * Reads the *live* 🔄 reaction count straight from Discord rather than trusting
 * the locally tracked voter list. This keeps the embed tally honest even if a
 * reaction is added or removed outside our event handlers (bulk actions, mobile
 * sync, race conditions), so the displayed number can never drift from reality.
 */
export async function fetchLiveVoteCount(message) {
  try {
    // A partial message's cache is empty until the reactions are fetched.
    if (message.reactions?.cache?.size === 0 && typeof message.reactions?.fetch === 'function') {
      await message.reactions.fetch().catch(() => null);
    }
    const reaction = message.reactions?.cache?.get(COUNTING_EMOJI.restoreVote);
    return reaction?.count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Resolves the number to display on the ruin embed: the live Discord reaction
 * count when it is readable, otherwise the locally tracked tally.
 */
async function resolveDisplayVoteCount(message, trackedVotes) {
  const live = await fetchLiveVoteCount(message);
  if (live > 0) return live;
  return trackedVotes;
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

  const guildId = reaction.message.guild.id;
  const config = await getCountingGameConfig(reaction.client, guildId);

  if (!config.enabled) return;

  const vote = config.restoreVote;
  if (!vote || vote.messageId !== reaction.message.id) return;

  // Ignore extra votes from members who already voted.
  if (vote.brokenBy === user.id || vote.voters.includes(user.id)) return;

  const { config: votedConfig, reached, votes } = applyRestoreVote(config, user.id);
  await saveCountingGameConfig(reaction.client, guildId, votedConfig);

  // Reflect progress on the embed without disturbing other reactions. The tally
  // comes from Discord itself, and the original sent value and reason are
  // replayed from the persisted vote so the message always explains exactly
  // what broke the count.
  const ruinMessage = reaction.message;
  const displayVotes = await resolveDisplayVoteCount(ruinMessage, votes);
  await refreshVoteEmbed(reaction, config, vote, displayVotes);

  if (!reached) return;

  const outcome = await restoreCount({
    client: reaction.client,
    guild: reaction.message.guild,
    messageId: ruinMessage.id,
    method: 'community_vote',
    actor: user.id,
  });

  logger.info('Counting game restored by community vote', {
    guildId,
    restoredTo: outcome.restoredTo,
    votes,
  });
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

  const guildId = reaction.message.guild.id;
  const config = await getCountingGameConfig(reaction.client, guildId);
  if (!config.enabled) return;

  const vote = config.restoreVote;
  if (!vote || vote.messageId !== reaction.message.id) return;

  const { config: updated, removed, votes } = removeRestoreVote(config, user.id);
  if (!removed) return;

  await saveCountingGameConfig(reaction.client, guildId, updated);
  const displayVotes = await resolveDisplayVoteCount(reaction.message, votes);
  await refreshVoteEmbed(reaction, config, vote, displayVotes);
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