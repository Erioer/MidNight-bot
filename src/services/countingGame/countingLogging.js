// countingLogging.js
// Essential-event audit logging for the counting game.
//
// Only high-value events are logged: count broken, count restored, shield
// consumed, and major milestones. Individual correct counts, chatter
// deletions, and temporary warning popups are deliberately NOT logged so the
// logging channel stays readable.

import { logEvent, EVENT_TYPES } from '../loggingService.js';

/** Counting event types, sourced from the shared logging registry. */
export const COUNTING_EVENT_TYPES = {
  COUNT_BROKEN: EVENT_TYPES.COUNTING_BROKEN,
  COUNT_RESTORED: EVENT_TYPES.COUNTING_RESTORED,
  SHIELD_CONSUMED: EVENT_TYPES.COUNTING_SHIELD_CONSUMED,
  MILESTONE_REACHED: EVENT_TYPES.COUNTING_MILESTONE,
};

/**
 * Sends a counting log event. Never throws — logging must not break gameplay.
 */
async function sendCountingLog({ client, guildId, eventType, data }) {
  if (!client || !guildId) return null;

  try {
    return await logEvent({ client, guildId, eventType, data });
  } catch (error) {
    // Swallowed on purpose: an unreachable log channel must not fail a count.
    return null;
  }
}

export async function logCountBroken({
  client,
  guildId,
  channelId,
  userId,
  brokenCount,
  received,
  reason,
  highestRecord,
}) {
  return sendCountingLog({
    client,
    guildId,
    eventType: COUNTING_EVENT_TYPES.COUNT_BROKEN,
    data: {
      title: 'Count Broken',
      headline: `<@${userId}> broke the counting sequence.`,
      lines: [
        `**User ID:** ${userId}`,
        `**Channel ID:** ${channelId}`,
        `**Broken count:** ${brokenCount}`,
        `**Received input:** ${received}`,
        `**Reason:** ${reason}`,
        `**Highest record:** ${highestRecord}`,
      ],
      userId,
      channelId,
    },
  });
}

export async function logCountRestored({
  client,
  guildId,
  channelId,
  restoredTo,
  method,
  actor,
  voters = [],
}) {
  const methodLabel = method === 'admin_command' ? 'Admin Command' : 'Community Vote';

  return sendCountingLog({
    client,
    guildId,
    eventType: COUNTING_EVENT_TYPES.COUNT_RESTORED,
    data: {
      title: 'Count Restored',
      headline: `Count restored to **${restoredTo}** via ${methodLabel}.`,
      lines: [
        `**Restored count:** ${restoredTo}`,
        `**Method:** ${methodLabel}`,
        `**Triggered by:** ${actor ? `<@${actor}>` : 'Unknown'}`,
        voters.length > 0 ? `**Voters:** ${voters.map((id) => `<@${id}>`).join(', ')}` : null,
      ].filter(Boolean),
      userId: actor || null,
      channelId,
    },
  });
}

export async function logShieldConsumed({
  client,
  guildId,
  channelId,
  userId,
  savedCount,
  shieldsRemaining,
}) {
  return sendCountingLog({
    client,
    guildId,
    eventType: COUNTING_EVENT_TYPES.SHIELD_CONSUMED,
    data: {
      title: 'Shield Consumed',
      headline: `<@${userId}> used a Counting Shield to save the count.`,
      lines: [
        `**User ID:** ${userId}`,
        `**Saved count:** ${savedCount}`,
        `**Shields remaining:** ${shieldsRemaining}`,
      ],
      userId,
      channelId,
    },
  });
}

export async function logMilestoneReached({
  client,
  guildId,
  channelId,
  userId,
  countMilestones = [],
  streakMilestones = [],
  mistakeMilestones = [],
  serverMilestones = [],
  rewards = null,
}) {
  const lines = [`**User ID:** ${userId}`];

  if (serverMilestones.length > 0) {
    lines.push(`**Server milestones:** ${serverMilestones.join(', ')}`);
  }
  if (countMilestones.length > 0) {
    lines.push(`**Count milestones:** ${countMilestones.join(', ')}`);
  }
  if (mistakeMilestones.length > 0) {
    lines.push(`**Blunder milestones:** ${mistakeMilestones.join(', ')}`);
  }
  if (streakMilestones.length > 0) {
    lines.push(`**Daily streak milestones:** ${streakMilestones.join(', ')}`);
  }
  if (rewards) {
    lines.push(`**XP reward:** +${rewards.xpReward}`);
    lines.push(`**Cash reward:** $${rewards.cashReward.toLocaleString()}`);
  }

  return sendCountingLog({
    client,
    guildId,
    eventType: COUNTING_EVENT_TYPES.MILESTONE_REACHED,
    data: {
      title: 'Counting Milestone Reached',
      headline: `<@${userId}> reached a counting milestone.`,
      lines,
      userId,
      channelId,
    },
  });
}