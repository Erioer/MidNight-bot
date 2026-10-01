// countingHandler.js
// Orchestrates everything that happens when someone posts in a counting
// channel: parsing, warnings, ruins, shields, cooldowns, milestones, rewards,
// starboard posts, restore votes, and essential-event logging.

import { logger } from '../../utils/logger.js';
import { COUNTING_TIMERS, COUNTING_EMOJI } from '../../config/countingGameConfig.js';
import { splitComment } from './countingNumberParser.js';
import {
  buildMultiNumberNotice,
  buildRemovedNotice,
  buildRuinEmbed,
  buildShieldSavedEmbed,
  buildCooldownNotice,
  REMOVED_REASON_CHAT,
} from './countingMessages.js';
import {
  handleServerMilestones,
  handleUserMilestones,
  handleMistakeMilestones,
} from './countingMilestones.js';
import {
  classifyCountingBody,
  clearMultiNumberStrikes,
  getActiveCooldown,
  getCountingGameConfig,
  getExpectedCountValue,
  getUserStats,
  isUserOnCooldown,
  recordCorrectCount,
  recordRuin,
  registerMultiNumberStrike,
  saveCountingGameConfig,
  startRestoreVote,
} from '../countingGameService.js';
import { consumeShield } from './countingShields.js';
import {
  logCountBroken,
  logCountRestored,
  logShieldConsumed,
  logMilestoneReached,
} from './countingLogging.js';

/** Sends `embed` and removes it after the configured notice lifespan. */
async function sendTemporaryNotice(channel, embed) {
  try {
    const notice = await channel.send({ embeds: [embed] });
    setTimeout(() => {
      notice.delete().catch(() => {});
    }, COUNTING_TIMERS.noticeLifespanMs).unref?.();
    return notice;
  } catch (error) {
    logger.error('Failed to send counting notice:', error);
    return null;
  }
}

async function deleteUserMessage(message) {
  try {
    await message.delete();
  } catch {
    // Missing Manage Messages, or the message was already removed.
  }
}

/**
 * Returns true when the message belongs to the counting game and should not
 * fall through to prefix-command / XP handling.
 */
export async function handleCountingGame(message, client) {
  let config = await getCountingGameConfig(client, message.guild.id);
  if (!config.enabled || !config.channelId || message.channel.id !== config.channelId) {
    return false;
  }

  const raw = message.content ?? '';
  const { body, isChatterOnly } = splitComment(raw);

  // Pure `//` chatter is normal chat: no reactions, no count checks, no resets,
  // and it falls through to prefix-command and XP handling.
  if (isChatterOnly) {
    return false;
  }

  // A penalised user's attempts are removed without touching the sequence.
  if (isUserOnCooldown(config, message.author.id)) {
    const cooldown = getActiveCooldown(config);
    await deleteUserMessage(message);
    await sendTemporaryNotice(
      message.channel,
      buildCooldownNotice({
        userId: message.author.id,
        remainingSeconds: Math.max(1, Math.ceil((cooldown.startedAt + COUNTING_TIMERS.ruinCooldownMs - Date.now()) / 1000)),
        requiredCounts: COUNTING_TIMERS.cooldownValidCounts,
        completedCounts: cooldown.validCounts || 0,
      }),
    );
    return true;
  }

  const classification = classifyCountingBody(body, raw, config.system);

  if (classification.kind === 'invalid') {
    await deleteUserMessage(message);
    await sendTemporaryNotice(message.channel, buildRemovedNotice({
      userId: message.author.id,
      content: raw,
      reason: REMOVED_REASON_CHAT,
    }));
    return true;
  }

  if (classification.kind === 'multi_number') {
    return await handleMultiNumberOffence({ message, client, config, raw, numbers: classification.numbers });
  }

  const expected = config.nextNumber || 1;
  if (classification.value === expected) {
    if (config.lastUserId === message.author.id) {
      return await handleMistake({
        message,
        client,
        config,
        sentValue: classification.value,
        reason: 'You cannot count twice in a row!',
      });
    }
    return await handleValidCount({ message, client, config });
  }

  return await handleMistake({
    message,
    client,
    config,
    sentValue: classification.value,
    reason: 'Incorrect number was sent.',
  });
}

/**
 * Progressive multi-number penalty. Offences 1 and 2 preserve the count and
 * only remove the message; the 3rd consecutive offence is a Ruin Event.
 */
async function handleMultiNumberOffence({ message, client, config, raw, numbers }) {
  const { config: struckConfig, strikes } = registerMultiNumberStrike(config, message.author.id);
  await saveCountingGameConfig(client, message.guild.id, struckConfig);
  await deleteUserMessage(message);

  if (strikes < COUNTING_TIMERS.multiNumberStrikeLimit) {
    await sendTemporaryNotice(message.channel, buildMultiNumberNotice({
      userId: message.author.id,
      content: raw,
      numbers,
      attempt: strikes,
      strikeLimit: COUNTING_TIMERS.multiNumberStrikeLimit,
    }));
    return true;
  }

  const reason = 'Repeatedly posting messages with multiple numbers without `//` comment prefix.';
  await postRuin({
    message,
    client,
    config: struckConfig,
    sentValue: numbers.join(', '),
    reason,
    isRuinEvent: true,
  });

  return true;
}

/** A wrong number or a double count. Shields absorb the mistake when available. */
async function handleMistake({ message, client, config, sentValue, reason }) {
  const shieldResult = await consumeShield(client, message.guild.id, message.author.id);

  if (shieldResult.consumed) {
    // The count is preserved exactly as it was: same next number, same last counter.
    const safeValue = (config.nextNumber || 1) - 1;

    await message.channel.send({
      embeds: [buildShieldSavedEmbed({
        userId: message.author.id,
        mistakeValue: sentValue,
        safeValue,
        nextExpected: config.nextNumber,
        shieldsRemaining: shieldResult.shields,
      })],
    });

    await logShieldConsumed({
      client,
      guildId: message.guild.id,
      channelId: message.channel.id,
      userId: message.author.id,
      savedCount: safeValue,
      shieldsRemaining: shieldResult.shields,
    });

    return true;
  }

  await postRuin({ message, client, config, sentValue, reason });
  return true;
}

/**
 * Posts the permanent ruin embed, resets the sequence, puts the breaker on
 * cooldown, opens a restore vote, and logs the break.
 */
async function postRuin({ message, client, config, sentValue, reason, isRuinEvent = false }) {
  // `countAtBreak` is the last number that counted; `expectedValue` is the one
  // the breaker should have sent. Restoring resumes counting from countAtBreak.
  const expectedValue = Math.max(1, config.nextNumber || 1);
  const countAtBreak = Math.max(0, expectedValue - 1);
  const highestRecord = Math.max(config.highestRecord || 0, countAtBreak);

  const ruinResult = await recordRuin(client, message.guild.id, message.author.id);

  // Blunder milestones are evaluated against the freshly incremented ruin count.
  const blunderResult = await handleMistakeMilestones({
    guild: message.guild,
    config: ruinResult.config,
    userId: message.author.id,
    currentRuins: ruinResult.ruins,
  });

  const afterConfig = blunderResult.config !== ruinResult.config
    ? await saveCountingGameConfig(client, message.guild.id, blunderResult.config)
    : ruinResult.config;

  if (blunderResult.milestones.length > 0) {
    await logMilestoneReached({
      client,
      guildId: message.guild.id,
      channelId: message.channel.id,
      userId: message.author.id,
      mistakeMilestones: blunderResult.milestones,
    });
  }

  const requiredVotes = config.restoreVotesRequired || COUNTING_TIMERS.cooldownValidCounts;

  // The Ruin Event notice and the permanent ruin embed are the same message, so
  // the community vote always lives on a fully detailed embed.
  const description = isRuinEvent
    ? [
      `${COUNTING_EMOJI.warning} <@${message.author.id}> has repeatedly posted messages with multiple numbers.`,
      `*Reason: ${reason}*`,
      '',
    ].join('\n')
    : null;

  const embed = buildRuinEmbed({
    userId: message.author.id,
    sentValue,
    countAtBreak,
    expectedValue,
    nextExpected: afterConfig.nextNumber,
    highestRecord,
    reason,
    votes: 0,
    requiredVotes,
    ...(description ? { leadingText: description } : {}),
  });

  const ruinMessage = await message.channel.send({ embeds: [embed] }).catch(() => null);

  if (ruinMessage) {
    await ruinMessage.react(COUNTING_EMOJI.restoreVote).catch(() => {});
    await startRestoreVote(client, message.guild.id, {
      messageId: ruinMessage.id,
      channelId: message.channel.id,
      preRuinCount: countAtBreak,
      expectedValue,
      sentValue: String(sentValue),
      reason,
      isRuinEvent,
      brokenBy: message.author.id,
      requiredVotes,
    });
  }

  await logCountBroken({
    client,
    guildId: message.guild.id,
    channelId: message.channel.id,
    userId: message.author.id,
    brokenCount: countAtBreak,
    received: String(sentValue),
    reason,
    highestRecord,
  });

  return afterConfig;
}

/** Valid count: advances the sequence, then runs streaks, milestones, rewards. */
async function handleValidCount({ message, client, config }) {
  const previousValue = Math.max(0, (config.nextNumber || 1) - 1);
  const previousCounts = getUserStats(config, message.author.id).counts;
  const previousStreak = getUserStats(config, message.author.id).streak;

  const result = await recordCorrectCount(client, message.guild.id, message.author.id);

  // A correct count clears any lingering multi-number strikes for this user.
  let currentConfig = clearMultiNumberStrikes(result.config, message.author.id);
  currentConfig = await saveCountingGameConfig(client, message.guild.id, currentConfig);

  if (result.shieldAwarded) {
    await message.channel.send({
      content: `${COUNTING_EMOJI.shield} <@${message.author.id}> earned a **Counting Shield** for reaching **${currentConfig.users[message.author.id].counts}** valid counts! (${result.shields} held)`,
    }).catch(() => {});
  }

  const milestoneResult = await handleUserMilestones({
    client,
    guild: message.guild,
    member: message.member,
    config: currentConfig,
    userId: message.author.id,
    previousCounts,
    previousStreak,
    currentCounts: result.counts,
    currentStreak: result.streak,
  });

  if (milestoneResult.config !== currentConfig) {
    currentConfig = await saveCountingGameConfig(client, message.guild.id, milestoneResult.config);
  }

  if (milestoneResult.rewards) {
    await logMilestoneReached({
      client,
      guildId: message.guild.id,
      channelId: message.channel.id,
      userId: message.author.id,
      countMilestones: milestoneResult.countMilestones,
      streakMilestones: milestoneResult.streakMilestones,
      rewards: milestoneResult.rewards,
    });
  }

  const serverMilestones = await handleServerMilestones({
    client,
    guild: message.guild,
    channel: message.channel,
    config: currentConfig,
    previousValue,
    newValue: result.countedNumber,
  });

  for (const milestone of serverMilestones) {
    await logMilestoneReached({
      client,
      guildId: message.guild.id,
      channelId: message.channel.id,
      userId: message.author.id,
      serverMilestones: [milestone.threshold],
    });
  }

  // Strip the in-memory cooldown once its unlock condition is satisfied so the
  // next message from the penalised user is judged fresh.
  // Drop a lapsed cooldown from storage so the penalty never persists.
  if (currentConfig.cooldown && !getActiveCooldown(currentConfig)) {
    await saveCountingGameConfig(client, message.guild.id, { ...currentConfig, cooldown: null });
  }

  return true;
}

/**
 * Admin/community restore. Reverts the sequence to the last number that counted
 * successfully and rewrites the ruin embed to reflect the outcome.
 */
export async function restoreCount({ client, guild, messageId, method, actor }) {
  const config = await getCountingGameConfig(client, guild.id);
  const vote = config.restoreVote;

  // `preRuinCount` is the last number that counted, so counting resumes at +1.
  const countAtBreak = vote?.preRuinCount ?? Math.max(0, (config.highestRecord || 1) - 1);
  const nextExpected = Math.max(1, countAtBreak + 1);
  const highestRecord = Math.max(config.highestRecord || 0, countAtBreak);

  let ruinMessage = null;
  let channel = null;

  if (messageId) {
    channel = await guild.channels.fetch(vote?.channelId || config.channelId).catch(() => null);
    if (channel) {
      ruinMessage = await channel.messages.fetch(messageId).catch(() => null);
    }
  }

  const updatedConfig = await saveCountingGameConfig(client, guild.id, {
    ...config,
    nextNumber: nextExpected,
    lastUserId: null,
    currentStreak: 0,
    restoreVote: null,
    cooldown: null,
  });

  if (ruinMessage) {
    await ruinMessage.edit({
      embeds: [buildRuinEmbed({
        userId: vote?.brokenBy || 'unknown',
        sentValue: vote?.sentValue ?? '—',
        countAtBreak,
        expectedValue: vote?.expectedValue ?? nextExpected,
        nextExpected,
        highestRecord,
        reason: 'Sequence was manually restored.',
        restored: true,
        restoredBy: actor ? `Restored by <@${actor}>.` : null,
      })],
    }).catch(() => {});

    await ruinMessage.reactions.removeAll().catch(() => {});
  }

  await logCountRestored({
    client,
    guildId: guild.id,
    channelId: channel?.id || config.channelId,
    restoredTo: nextExpected,
    method,
    actor,
    voters: vote?.voters || [],
  });

  return { config: updatedConfig, restoredTo: nextExpected };
}

/** Expected next value, re-exported for the command layer. */
export { getExpectedCountValue };