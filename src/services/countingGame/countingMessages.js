// countingMessages.js
// All Discord-facing copy for the counting game lives here so message text,
// warning variants, and the ruin card stay in one place.
//
// Every builder returns a Components V2 container: callers must send
// `flags: MessageFlags.IsComponentsV2` and must not add `content` or `embeds`.
// Emoji are written directly into the Text Display copy.
//
// NOTE on mentions: mentions inside a Text Display ping exactly like message
// content, so no `<@id>` appears in the card copy itself. The mention is
// returned by `buildMention` and sent as a leading Text Display ahead of the
// card, and the card refers to the offender in the second person.

import {
  COUNTING_COMMENT_EXAMPLE,
  COUNTING_COMMENT_PREFIX,
  COUNTING_EMOJI,
  COUNTING_SHIELD,
  COUNTING_TIMERS,
} from '../../config/countingGameConfig.js';
import { container, text } from '../../utils/componentsV2.js';

// Semantic accents. Only these three are ever used here.
const FAILURE_ACCENT = 16711680; // #FF0000
const COOLDOWN_ACCENT = 16705372; // #FEE75C
const SUCCESS_ACCENT = 3066993; // #2ECC71

/**
 * Builds the leading Text Display that accompanies a card. The offender is
 * always mentioned here rather than inside the card copy.
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

  return container({
    accentColor: COOLDOWN_ACCENT,
    parts: [
      text(`### ${COUNTING_EMOJI.warning} Multiple numbers detected!`),
      text([
        `Your message contained both ${listed}${remaining}.`,
        `To add chat text next to a number, write \`[count number] ${COUNTING_COMMENT_PREFIX} [text]\` — e.g. \`${COUNTING_COMMENT_EXAMPLE}\`.`,
        attemptLine,
      ].filter(Boolean).join('\n')),
      text(`**Your message:** \`${truncate(content, 180)}\``),
    ],
  });
}

export const REMOVED_REASON_CHAT =
  `Your message had no number, or mixed text with a number without the comment prefix. Write \`[count number] ${COUNTING_COMMENT_PREFIX} [text]\`, or \`${COUNTING_COMMENT_PREFIX} text\` to just chat.`;

/** Generic "message removed" notice for text without a comment prefix (auto-deletes). */
export function buildRemovedNotice({ content, reason = REMOVED_REASON_CHAT, attempt = null, strikeLimit = null }) {
  const attemptLine = attempt && strikeLimit
    ? `This is offence **${attempt}** of ${strikeLimit}.`
    : '';

  return container({
    accentColor: FAILURE_ACCENT,
    parts: [
      text(`### ${COUNTING_EMOJI.removed} Message Removed`),
      text([
        `Your message: \`${truncate(content, 180)}\``,
        `**Reason:** ${reason}`,
        attemptLine,
      ].filter(Boolean).join('\n')),
    ],
  });
}

/**
 * Permanent ruin card. Unlike the temporary notices this one is never
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

  return container({
    accentColor: restored ? SUCCESS_ACCENT : FAILURE_ACCENT,
    parts: [
      text(restored
        ? `### ${COUNTING_EMOJI.restore} Count Restored!`
        : `### Count broken at ${countAtBreak}!`),
      text([
        ...(leadingText ? [leadingText.trimEnd()] : []),
        `Sent: \`${truncate(String(sentValue), 60)}\` (Expected: ${expectedValue})`,
        `Next expected number: ${nextExpected}`,
        `Highest Record for this channel: ${highestRecord}`,
        '',
        `*Reason: ${reason}*`,
        '',
        voteBlock,
      ].join('\n')),
    ],
  });
}

/** Permanent notice shown when a shield absorbs a mistake. */
export function buildShieldSavedEmbed({ mistakeValue, safeValue, nextExpected, shieldsRemaining }) {
  return container({
    accentColor: SUCCESS_ACCENT,
    parts: [
      text(`### ${COUNTING_EMOJI.shield} Count Saved!`),
      text([
        `You made a mistake at ${mistakeValue}, but consumed 1 ${COUNTING_EMOJI.shield} Shield!`,
        `The count remains safe at ${safeValue}. Next expected number is ${nextExpected}.`,
        `Shields remaining: ${shieldsRemaining}/${COUNTING_SHIELD.max}.`,
      ].join('\n')),
    ],
  });
}

/**
 * Notice shown when a penalised user tries to count during their cooldown. The
 * notice is a one-shot message that is never edited, so it states the unlock
 * requirement plainly instead of showing a progress fraction that would go
 * stale the moment anyone else counts.
 */
export function buildCooldownNotice({ remainingSeconds, requiredCounts }) {
  return container({
    accentColor: COOLDOWN_ACCENT,
    parts: [
      text('### Counting Cooldown Active'),
      text([
        'You are on a counting cooldown for breaking the sequence.',
        `It unlocks after **${requiredCounts}** valid counts by other members, or in **${remainingSeconds}s**.`,
        'Your message was removed and was not counted.',
      ].join('\n')),
    ],
  });
}

function truncate(value, maxLength) {
  const str = String(value ?? '');
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
}