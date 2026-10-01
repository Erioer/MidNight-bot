// countingGameConfig.js
// Central, array-driven configuration for the counting game.
//
// DESIGN RULE: every milestone/reward trigger in this feature reads its
// thresholds from this file. Appending a new value (e.g. `1000` to
// MILESTONES.server) is the ONLY change needed to make the reward and
// starboard pipeline fire for it — no logic edits required.

/**
 * Milestone thresholds per category. Order matters only for readability;
 * all comparisons are numeric so unsorted appends still behave correctly.
 *
 * - server:    channel count reached (first time AND re-reached)
 * - user:      lifetime valid counts by a single user (rewards XP + cash)
 * - mistakes:  lifetime ruins caused by a single user (starboard only)
 * - streak:    consecutive calendar days with at least one valid count
 */
export const COUNTING_MILESTONES = {
  server: [50, 100, 200, 300, 500],
  user: [10, 25, 50, 100],
  mistakes: [5, 10, 25, 50],
  streak: [3, 7, 14, 30],
};

export const COUNTING_SHIELD = {
  // Maximum shields a user may hold at once.
  max: 2,
  // Granted for each valid count that crosses one of these thresholds.
  awardThresholds: [20, 25],
  // Shop item id in src/config/shop/items.js, and its price (kept here for
  // display/messages so the two never drift apart silently).
  shopItemId: 'counting_shield',
  price: 500,
};

export const COUNTING_TIMERS = {
  // Temporary notices (multi-number warning, message-removed notice,
  // shield-saved notice) auto-delete after this many ms.
  noticeLifespanMs: 6000,
  // A user who breaks the count is locked out of counting until either
  // `cooldownValidCounts` other people count correctly, or this elapses.
  ruinCooldownMs: 60000,
  cooldownValidCounts: 3,
  // Consecutive multi-number offences before a formal Ruin Event fires.
  multiNumberStrikeLimit: 3,
  // How long a multi-number strike stays on the record.
  multiNumberStrikeWindowMs: 300000,
};

export const COUNTING_REWARDS = {
  // 30% of the XP required to complete the user's *current* level.
  xpLevelCompletionRatio: 0.3,
  // 30% of net worth (wallet + bank), with a guaranteed floor.
  cashNetWorthRatio: 0.3,
  cashMinimum: 1000,
};

export const COUNTING_COMMENT_PREFIX = '//';

export const COUNTING_EMOJI = {
  restoreVote: '🔄',
  warning: '⚠️',
  removed: '🗑️',
  restore: '🔄',
  shield: '🛡️',
};

/** Returns the milestone thresholds for a category, always as a sorted number array. */
export function getMilestones(category) {
  const thresholds = COUNTING_MILESTONES[category];
  if (!Array.isArray(thresholds)) return [];
  return [...thresholds].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
}

/**
 * Returns every milestone in `category` that `value` has just reached or
 * passed but that sits at or below the previous recorded value. Used to
 * detect newly crossed thresholds even when several are crossed at once.
 */
export function findCrossedMilestones(category, previousValue, value) {
  return getMilestones(category).filter(
    (threshold) => value >= threshold && (previousValue ?? 0) < threshold,
  );
}

/** Returns the milestone in `category` exactly equal to `value`, if any. */
export function findExactMilestone(category, value) {
  return getMilestones(category).find((threshold) => threshold === value) ?? null;
}