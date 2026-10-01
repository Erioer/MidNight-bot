// countingMessages.js
// All Discord-facing copy for the counting game lives here so message text,
// warning variants, and the ruin embed stay in one place.
//
// NOTE on embeds.js: that module globally monkey-patches EmbedBuilder so that
// setTitle / setAuthor / addFields / setDescription strip emoji, and
// setFooter / setTimestamp become near no-ops. The counting notices are
// specified WITH emoji, so this file writes the embed `data` fields directly
// instead of going through the patched setters.

import { EmbedBuilder } from 'discord.js';
import { getColor } from '../../config/bot.js';
import {
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

/** Multi-number offence notice (auto-deletes). */
export function buildMultiNumberNotice({ userId, content, numbers, attempt, strikeLimit }) {
  const listed = numbers.slice(0, 4).map((number) => `\`${number}\``).join(' and ');
  const remaining = numbers.length > 4 ? ` (+${numbers.length - 4} more)` : '';
  const attemptLine = strikeLimit ? `This is offence **${attempt}** of ${strikeLimit}.` : '';

  return buildRawEmbed({
    color: NOTICE_COLOR,
    title: `${COUNTING_EMOJI.warning} Multiple numbers detected!`,
    description: [
      `<@${userId}>, your message contained both ${listed}${remaining}.`,
      'To include chat text alongside numbers, use `//` for comments (e.g., `55 // we got this to hundred`).',
      attemptLine,
    ].filter(Boolean).join('\n'),
    fields: [{ name: 'Your message', value: `\`${truncate(content, 180)}\``, inline: false }],
  });
}

export const REMOVED_REASON_CHAT =
  'Message contained text without a `//` comment prefix. Use `55 // text` or `// text` to chat.';

/** Generic "message removed" notice for text without a `//` prefix (auto-deletes). */
export function buildRemovedNotice({ userId, content, reason = REMOVED_REASON_CHAT }) {
  return buildRawEmbed({
    color: RUIN_COLOR,
    title: `${COUNTING_EMOJI.removed} Message Removed`,
    description: [
      `<@${userId}>: \`${truncate(content, 180)}\``,
      `**Reason:** ${reason}`,
    ].join('\n'),
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
  userId,
  sentValue,
  countAtBreak,
  expectedValue,
  nextExpected,
  highestRecord,
  reason,
  votes = 0,
  requiredVotes = COUNTING_TIMERS.cooldownValidCounts,
  restored = false,
  restoredBy = null,
  leadingText = null,
}) {
  const voteBlock = restored
    ? [
      `${COUNTING_EMOJI.restoreVote} **Count restored.**${restoredBy ? ` ${restoredBy}` : ''}`,
      `The sequence is back to **${countAtBreak}**.`,
    ].join('\n')
    : `${COUNTING_EMOJI.restoreVote} **Vote to Restore:** React with ${COUNTING_EMOJI.restoreVote} below to restore the count back to **${countAtBreak}**! (${votes}/${requiredVotes} votes)`;

  return buildRawEmbed({
    color: restored ? SUCCESS_COLOR : RUIN_COLOR,
    title: restored
      ? `${COUNTING_EMOJI.restore} Count Restored!`
      : `Count broken by <@${userId}> at ${countAtBreak}!`,
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
export function buildShieldSavedEmbed({ userId, mistakeValue, safeValue, nextExpected, shieldsRemaining }) {
  return buildRawEmbed({
    color: SHIELD_COLOR,
    title: `${COUNTING_EMOJI.shield} Count Saved!`,
    description: [
      `<@${userId}> made a mistake at ${mistakeValue}, but consumed 1 ${COUNTING_EMOJI.shield} Shield!`,
      `The count remains safe at ${safeValue}. Next expected number is ${nextExpected}.`,
      `Shields remaining: ${shieldsRemaining}/${COUNTING_SHIELD.max}.`,
    ].join('\n'),
  });
}

/** Notice shown when a penalised user tries to count during their cooldown. */
export function buildCooldownNotice({ userId, remainingSeconds, requiredCounts, completedCounts }) {
  return buildRawEmbed({
    color: NOTICE_COLOR,
    title: 'Counting Cooldown Active',
    description: [
      `<@${userId}>, you are on a counting cooldown for breaking the sequence.`,
      `It unlocks after **${requiredCounts}** valid counts by other members (${completedCounts}/${requiredCounts}) or in **${remainingSeconds}s**.`,
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