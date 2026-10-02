// countingMessages.js
// All Discord-facing copy for the counting game lives here so message text,
// warning variants, and the ruin embed stay in one place.
//
// NOTE on embeds.js: that module globally monkey-patches EmbedBuilder so that
// setTitle / setAuthor / addFields / setDescription strip emoji, and
// setFooter / setTimestamp become near no-ops. The counting notices are
// specified WITH emoji, so this file writes the embed `data` fields directly
// instead of going through the patched setters.
//
// NOTE on mentions: Discord does not render or ping user mentions inside an
// embed, so no `<@id>` ever appears in embed copy. The mention is returned by
// `buildMention` and sent as the message `content` alongside the embed, and the
// embed itself refers to the offender in the second person.

import { EmbedBuilder } from 'discord.js';
import { getColor } from '../../config/bot.js';
import {
  COUNTING_COMMENT_EXAMPLE,
  COUNTING_COMMENT_PREFIX,
  COUNTING_EMOJI,
  COUNTING_SHIELD,
  COUNTING_TIMERS,
} from '../../config/countingGameConfig.js';

const RUIN_COLOR = '#ED4245';
const NOTICE_COLOR = '#FEE75C';
const SHIELD_COLOR = '#5865F2';
const SUCCESS_COLOR = '#57F287';

/**
 * Builds an embed while preserving emoji in the title, description, and
 * fields. `embed.data` is assigned post-construction so the sanitizing
 * setters never see the text.
 */
function buildRawEmbed({ color, title, description, fields = [] }) {
  const embed = new EmbedBuilder();
  embed.setColor(getColor(color));

  embed.data.title = title;
  embed.data.description = description;
  embed.data.fields = fields.map((field) => ({ ...field }));

  return embed;
}

/**
 * Builds the message `content` that accompanies an embed. Discord only pings a
 * user from message content, never from embed fields, so the offender is always
 * mentioned here rather than inside the embed.
 */
export function buildMention(userId, text = '') {
  return `<@${userId}>${text ? ` ${text}` : ''}`;
}

/** Multi-number offence notice (auto-deletes). */
export function buildMultiNumberNotice({ content, numbers, attempt, strikeLimit }) {
  const listed = numbers.slice(0, 4).map((number) => `\`${number}\``).join(' and ');
  const remaining = numbers.length > 4 ? ` (+${numbers.length - 4} more)` : '';
  const attemptLine = strikeLimit
    ? `This is offence **${attempt}** of ${strikeLimit}.`
    : `Next offence will break the count.`;

  return buildRawEmbed({
    color: NOTICE_COLOR,
    title: `${COUNTING_EMOJI.warning} Multiple numbers detected!`,
    description: [
      `Your message contained both ${listed}${remaining}.`,
      `To add chat text next to a number, write \`[count number] ${COUNTING_COMMENT_PREFIX} [text]\` — e.g. \`${COUNTING_COMMENT_EXAMPLE}\`.`,
      attemptLine,
    ].filter(Boolean).join('\n'),
    fields: [{ name: 'Your message', value: `\`${truncate(content, 180)}\``, inline: false }],
  });
}

export const REMOVED_REASON_CHAT =
  `Your message had no number, or mixed text with a number without the comment prefix. Write \`[count number] ${COUNTING_COMMENT_PREFIX} [text]\`, or \`${COUNTING_COMMENT_PREFIX} text\` to just chat.`;

/** Generic "message removed" notice for text without a comment prefix (auto-deletes). */
export function buildRemovedNotice({ content, reason = REMOVED_REASON_CHAT, attempt = null, strikeLimit = null }) {
  const attemptLine = attempt && strikeLimit
    ? `This is offence **${attempt}** of ${strikeLimit}.`
    : '';

  return buildRawEmbed({
    color: RUIN_COLOR,
    title: `${COUNTING_EMOJI.removed} Message Removed`,
    description: [
      `Your message: \`${truncate(content, 180)}\``,
      `**Reason:** ${reason}`,
      attemptLine,
    ].filter(Boolean).join('\n'),
  });
}

/**
 * Permanent ruin embed. Unlike the temporary notices this one is never
 * deleted — the community restore vote lives on it.
 *
 * `countAtBreak` is the last number that counted successfully (so restoring
 * resumes counting continues from it), while `expectedValue` is the number the
 * breaker should have sent.
 */
export function buildRuinEmbed({
  sentValue,
  countAtBreak,
  expectedValue,
  nextExpected,
  highestRecord,
  reason,
  votes = 0,
  requiredVotes = COUNTING_TIMERS.cooldownValidCounts,
  voteState = 'active',
  leadingText = null,
}) {
  // Closing states replace the vote prompt so the message can never keep
  // inviting reactions after the window has been superseded, expired, or is
  // no longer meaningful (see countingVoteLifecycle.js).
  const closedCopy = {
    restored: `${COUNTING_EMOJI.restoreVote} **Count restored.** The sequence is back to **${countAtBreak}**.`,
    voided: '❌ **Voided:** Overwritten by a newer ruin event.',
    expired: '⏱️ **Expired:** The voting window has closed.',
    cancelled: '⚠️ **Restore Cancelled:** The current sequence has already reached the restore target.',
    resumed: '🔒 **Closed:** A new counting sequence has already begun.',
  };

  const voteBlock = voteState === 'active'
    ? `${COUNTING_EMOJI.restoreVote} **Vote to Restore:** React with ${COUNTING_EMOJI.restoreVote} to restore the count back to **${countAtBreak}**! `
      + (votes > 0
        ? `(**${votes}** of ${requiredVotes} votes)`
        : `**Needs ${requiredVotes} votes.**`)
    : (closedCopy[voteState] || closedCopy.voided);

  const restored = voteState === 'restored';

  return buildRawEmbed({
    color: restored ? SUCCESS_COLOR : RUIN_COLOR,
    title: restored
      ? `${COUNTING_EMOJI.restore} Count Restored!`
      : `Count broken at ${countAtBreak}!`,
    description: [
      ...(leadingText ? [leadingText.trimEnd()] : []),
      `Sent: \`${truncate(String(sentValue), 60)}\` (Expected: ${expectedValue})`,
      `Next expected number: ${nextExpected}`,
      `Highest Record for this channel: ${highestRecord}`,
      '',
      `*Reason: ${reason}*`,
      '',
      voteBlock,
    ].join('\n'),
  });
}

/** Permanent notice shown when a shield absorbs a mistake. */
export function buildShieldSavedEmbed({ mistakeValue, safeValue, nextExpected, shieldsRemaining }) {
  return buildRawEmbed({
    color: SHIELD_COLOR,
    title: `${COUNTING_EMOJI.shield} Count Saved!`,
    description: [
      `You made a mistake at ${mistakeValue}, but consumed 1 ${COUNTING_EMOJI.shield} Shield!`,
      `The count remains safe at ${safeValue}. Next expected number is ${nextExpected}.`,
      `Shields remaining: ${shieldsRemaining}/${COUNTING_SHIELD.max}.`,
    ].join('\n'),
  });
}

/**
 * Notice shown when a penalised user tries to count during their cooldown. The
 * notice is a one-shot message that is never edited, so it states the unlock
 * requirement plainly instead of showing a progress fraction that would go
 * stale the moment anyone else counts.
 */
export function buildCooldownNotice({ remainingSeconds, requiredCounts }) {
  return buildRawEmbed({
    color: NOTICE_COLOR,
    title: 'Counting Cooldown Active',
    description: [
      'You are on a counting cooldown for breaking the sequence.',
      `It unlocks after **${requiredCounts}** valid counts by other members, or in **${remainingSeconds}s**.`,
      'Your message was removed and was not counted.',
    ].join('\n'),
  });
}

function truncate(value, maxLength) {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

export { buildRawEmbed };