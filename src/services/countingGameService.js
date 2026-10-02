// countingGameService.js
// Core state machine for the counting game: configuration, sequence state,
// per-user statistics, ruin handling, shields, and restore-vote bookkeeping.
//
// Milestone thresholds, timers, shield rules, and reward ratios all live in
// src/config/countingGameConfig.js — see the design rule there.

import { logger } from '../utils/logger.js';
import {
  COUNTING_COMMENT_PREFIX,
  COUNTING_SHIELD,
  COUNTING_TIMERS,
  COUNTING_MILESTONES,
} from '../config/countingGameConfig.js';
import { parseCountToken, findNumbersInText } from './countingGame/countingNumberParser.js';
import { grantShield, getShieldBalance } from './countingGame/countingShields.js';

const COUNTING_GAME_KEY_PREFIX = 'countingGame:';

const COUNTING_SYSTEMS = {
  decimal: {
    label: 'Decimal',
    description: 'Standard 10-number system using 0-9',
    toString: (n) => n.toString(10),
    parse: (value) => {
      if (!/^[0-9]+$/.test(value)) return null;
      return Number(value);
    },
  },
  hexadecimal: {
    label: 'Hexadecimal',
    description: '16-number system using 0-9 and A-F',
    toString: (n) => n.toString(16).toUpperCase(),
    parse: (value) => {
      if (!/^[0-9A-Fa-f]+$/.test(value)) return null;
      return parseInt(value, 16);
    },
  },
  binary: {
    label: 'Binary',
    description: '2-number system using 0-1',
    toString: (n) => n.toString(2),
    parse: (value) => {
      if (!/^[01]+$/.test(value)) return null;
      return parseInt(value, 2);
    },
  },
  base36: {
    label: 'Base36',
    description: '36-number system using 0-9 and A-Z',
    toString: (n) => n.toString(36).toUpperCase(),
    parse: (value) => {
      if (!/^[0-9A-Za-z]+$/.test(value)) return null;
      return parseInt(value, 36);
    },
  },
  base64: {
    label: 'Base64',
    description: '64-number system using A-Z, a-z, 0-9, +, /',
    alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    toString: (n) => {
      if (n === 0) return 'A';
      const alphabet = COUNTING_SYSTEMS.base64.alphabet;
      let value = n;
      let result = '';
      while (value > 0) {
        const remainder = value % 64;
        result = alphabet[remainder] + result;
        value = Math.floor(value / 64);
      }
      return result;
    },
    parse: (value) => {
      const alphabet = COUNTING_SYSTEMS.base64.alphabet;
      const normalized = value.replace(/=+$/, '');
      if (!/^[A-Za-z0-9+/]+$/.test(normalized)) {
        return null;
      }
      let result = 0;
      for (const char of normalized) {
        const index = alphabet.indexOf(char);
        if (index === -1) return null;
        result = result * 64 + index;
      }
      return result;
    },
  },
  roman: {
    label: 'Roman',
    description: 'Roman numerals like I, II, III, IV, V',
    toString: (n) => {
      const romanNumerals = [
        ['M', 1000], ['CM', 900], ['D', 500], ['CD', 400],
        ['C', 100], ['XC', 90], ['L', 50], ['XL', 40],
        ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1],
      ];
      let num = n;
      let result = '';
      for (const [roman, value] of romanNumerals) {
        while (num >= value) {
          result += roman;
          num -= value;
        }
      }
      return result;
    },
    parse: (value) => {
      const roman = value.toUpperCase();
      if (!/^[IVXLCDM]+$/.test(roman)) return null;
      const romanValues = {
        I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000,
      };
      let total = 0;
      let prev = 0;
      for (let i = roman.length - 1; i >= 0; i--) {
        const current = romanValues[roman[i]];
        if (!current) return null;
        if (current < prev) {
          total -= current;
        } else {
          total += current;
          prev = current;
        }
      }
      return total;
    },
  },
  math: {
    label: 'Math Expressions',
    description: 'Use a math expression that equals the next number, like 4*4=16',
    toString: (n) => `${n}`,
    parse: (value) => parseCountToken(value),
  },
  alphabet: {
    label: 'Alphabet',
    description: 'Letters A-Z in sequence',
    toString: (n) => {
      let num = n;
      let result = '';
      while (num > 0) {
        num -= 1;
        result = String.fromCharCode(65 + (num % 26)) + result;
        num = Math.floor(num / 26);
      }
      return result;
    },
    parse: (value) => {
      const letters = value.toUpperCase();
      if (!/^[A-Z]+$/.test(letters)) return null;
      let result = 0;
      for (const char of letters) {
        result = result * 26 + (char.charCodeAt(0) - 64);
      }
      return result;
    },
  },
};

const DEFAULT_COUNTING_GAME = {
  enabled: false,
  channelId: null,
  system: 'decimal',
  nextNumber: 1,
  lastUserId: null,
  currentStreak: 0,
  bestStreak: 0,
  highestRecord: 0,
  leaderboard: {},
  restoreVotesRequired: COUNTING_TIMERS.cooldownValidCounts,
  users: {},
  cooldown: null,
  multiNumberStrikes: {},
  restoreVote: null,
};

const DEFAULT_USER_STATS = {
  counts: 0,
  ruins: 0,
  shields: 0,
  streak: 0,
  lastActiveDay: null,
  lastShieldAwardCount: 0,
  countMilestones: [],
  mistakeMilestones: [],
  streakMilestones: [],
};

function normalizeUserStats(stats) {
  const source = stats && typeof stats === 'object' ? stats : {};
  return {
    ...DEFAULT_USER_STATS,
    ...source,
    counts: Number.isFinite(source.counts) ? source.counts : 0,
    ruins: Number.isFinite(source.ruins) ? source.ruins : 0,
    shields: Number.isFinite(source.shields) ? source.shields : 0,
    streak: Number.isFinite(source.streak) ? source.streak : 0,
    lastActiveDay: typeof source.lastActiveDay === 'string' ? source.lastActiveDay : null,
    lastShieldAwardCount: Number.isFinite(source.lastShieldAwardCount) ? source.lastShieldAwardCount : 0,
    countMilestones: Array.isArray(source.countMilestones) ? [...source.countMilestones] : [],
    mistakeMilestones: Array.isArray(source.mistakeMilestones) ? [...source.mistakeMilestones] : [],
    streakMilestones: Array.isArray(source.streakMilestones) ? [...source.streakMilestones] : [],
  };
}

function normalizeCountingGame(state) {
  const normalized = {
    ...DEFAULT_COUNTING_GAME,
    ...(state || {}),
  };

  normalized.system = COUNTING_SYSTEMS[normalized.system] ? normalized.system : 'decimal';
  normalized.leaderboard = normalized.leaderboard && typeof normalized.leaderboard === 'object'
    ? { ...normalized.leaderboard }
    : {};
  normalized.users = normalized.users && typeof normalized.users === 'object'
    ? Object.fromEntries(
      Object.entries(normalized.users).map(([userId, stats]) => [userId, normalizeUserStats(stats)]),
    )
    : {};
  normalized.multiNumberStrikes = normalized.multiNumberStrikes && typeof normalized.multiNumberStrikes === 'object'
    ? { ...normalized.multiNumberStrikes }
    : {};
  normalized.highestRecord = Number.isFinite(normalized.highestRecord) ? normalized.highestRecord : 0;
  normalized.restoreVotesRequired = Number.isFinite(normalized.restoreVotesRequired) && normalized.restoreVotesRequired > 0
    ? Math.floor(normalized.restoreVotesRequired)
    : COUNTING_TIMERS.cooldownValidCounts;
  normalized.nextNumber = Number.isFinite(normalized.nextNumber) && normalized.nextNumber > 0
    ? Math.floor(normalized.nextNumber)
    : 1;

  return normalized;
}

function getStorageKey(guildId) {
  return `${COUNTING_GAME_KEY_PREFIX}${guildId}`;
}

/** Returns `YYYY-MM-DD` in UTC for streak comparisons. */
export function getCalendarDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** Returns the day before `day` (`YYYY-MM-DD`) in UTC. */
function getPreviousCalendarDay(day) {
  const parsed = new Date(`${day}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

export function getUserStats(config, userId) {
  return normalizeUserStats(config?.users?.[userId]);
}

export function getAccuracy(userStats) {
  const counts = Math.max(0, userStats.counts || 0);
  const ruins = Math.max(0, userStats.ruins || 0);
  const total = counts + ruins;
  if (total === 0) return 100;
  return (counts / total) * 100;
}

export function getCountingGameConfig(client, guildId) {
  return (async () => {
    try {
      const rawState = await client.db.get(getStorageKey(guildId));
      return normalizeCountingGame(rawState);
    } catch (error) {
      logger.error('Failed to load counting game config:', { guildId, error });
      return normalizeCountingGame();
    }
  })();
}

export async function saveCountingGameConfig(client, guildId, state) {
  const normalized = normalizeCountingGame(state);
  await client.db.set(getStorageKey(guildId), normalized);
  return normalized;
}

export async function disableCountingGame(client, guildId) {
  const config = await getCountingGameConfig(client, guildId);
  return saveCountingGameConfig(client, guildId, { ...config, enabled: false });
}

export async function resetCountingGame(client, guildId, startNumber = 1) {
  const config = await getCountingGameConfig(client, guildId);
  return saveCountingGameConfig(client, guildId, {
    ...config,
    nextNumber: startNumber,
    lastUserId: null,
    currentStreak: 0,
    // A manual reset supersedes any pending ruin outcome.
    restoreVote: null,
    cooldown: null,
    multiNumberStrikes: {},
  });
}

export async function activateCountingGame(client, guildId, channelId, system = 'decimal', options = {}) {
  const normalizedSystem = COUNTING_SYSTEMS[system] ? system : 'decimal';
  const restoreVotesRequired = Number.isFinite(options.restoreVotes) && options.restoreVotes > 0
    ? Math.floor(options.restoreVotes)
    : COUNTING_TIMERS.cooldownValidCounts;

  const existing = await getCountingGameConfig(client, guildId);
  const config = normalizeCountingGame({
    ...existing,
    enabled: true,
    channelId,
    system: normalizedSystem,
    nextNumber: 1,
    lastUserId: null,
    currentStreak: 0,
    bestStreak: 0,
    leaderboard: {},
    users: {},
    cooldown: null,
    multiNumberStrikes: {},
    restoreVote: null,
    restoreVotesRequired,
  });

  return saveCountingGameConfig(client, guildId, config);
}

export function getCountingSystemChoices() {
  return Object.entries(COUNTING_SYSTEMS).map(([value, system]) => ({
    name: system.label,
    value,
  }));
}

export function getCountingSystemLabel(systemKey) {
  return COUNTING_SYSTEMS[systemKey]?.label || COUNTING_SYSTEMS.decimal.label;
}

export function getExpectedCountValue(config) {
  const system = COUNTING_SYSTEMS[config.system] ? config.system : 'decimal';
  return COUNTING_SYSTEMS[system].toString(config.nextNumber || 1);
}

/**
 * Resolves the numeric value a user intended. Decimal and math systems accept
 * digits, number words, and arithmetic; the remaining systems (hex, binary,
 * base36, base64, roman, alphabet) use their own digit/letter alphabet, so the
 * smart decimal parser must not be applied to them.
 *
 * Returns `{ value, isExactNumber }` where `isExactNumber` is false when the
 * input was prose that merely contained a number (used to distinguish the
 * multi-number offence from a wrong count).
 */
export function resolveAttemptedValue(body, system = 'decimal') {
  const trimmed = typeof body === 'string' ? body.trim() : '';
  if (trimmed.length === 0) return { value: null, isExactNumber: false };

  if (system === 'decimal' || system === 'math') {
    const direct = parseCountToken(trimmed);
    return { value: direct, isExactNumber: direct !== null };
  }

  const definition = COUNTING_SYSTEMS[system];
  if (definition) {
    const native = definition.parse(trimmed);
    if (native !== null) return { value: native, isExactNumber: true };
  }

  return { value: null, isExactNumber: false };
}

/**
 * Classifies a message body into the outcome the handler should act on.
 *
 * Returns one of:
 *  - `{ kind: 'chatter' }`                      pure `//` chat
 *  - `{ kind: 'multi_number', numbers }`         2+ numbers without `//`
 *  - `{ kind: 'invalid' }`                       prose without `//`
 *  - `{ kind: 'count', value }`                  a parsable number
 */
export function classifyCountingBody(body, rawContent = body, system = 'decimal') {
  const { value } = resolveAttemptedValue(body, system);

  if (value !== null) {
    return { kind: 'count', value };
  }

  // Only decimal-ish systems can have their stray numbers counted, otherwise
  // a hex token like `1A` would be mistaken for a second number.
  if (system === 'decimal' || system === 'math') {
    const numbers = findNumbersInText(rawContent);
    if (numbers.length >= 2) {
      return { kind: 'multi_number', numbers };
    }
  }

  return { kind: 'invalid' };
}

/**
 * Legacy helper retained for callers that only need a yes/no answer.
 * Uses each system's own alphabet, and additionally accepts the smart
 * decimal parser for the `decimal` and `math` systems.
 */
export function isValidCountingMessage(content, config) {
  const system = COUNTING_SYSTEMS[config.system] ? config.system : 'decimal';
  const { value } = resolveAttemptedValue(content, system);
  return value !== null && value === (config.nextNumber || 1);
}

/* ------------------------------------------------------------------ *
 * Cooldown (anti-sabotage) after a ruin
 * ------------------------------------------------------------------ */

/**
 * Returns the active ruin cooldown for a guild, or null when there is none
 * or it has already lapsed. Expiry is "3 valid counts by others OR 60s".
 */
export function getActiveCooldown(config) {
  const cooldown = config?.cooldown;
  if (!cooldown || !cooldown.userId) return null;

  const elapsed = Date.now() - (cooldown.startedAt || 0);
  const timeExpired = elapsed >= COUNTING_TIMERS.ruinCooldownMs;
  const countsComplete = (cooldown.validCounts || 0) >= COUNTING_TIMERS.cooldownValidCounts;

  if (timeExpired || countsComplete) return null;
  return cooldown;
}

/** True when `userId` is currently locked out of counting. */
export function isUserOnCooldown(config, userId) {
  const cooldown = getActiveCooldown(config);
  return Boolean(cooldown && cooldown.userId === userId);
}

/** Milliseconds remaining on `userId`'s cooldown, or 0. */
export function getCooldownRemainingMs(config, userId) {
  const cooldown = getActiveCooldown(config);
  if (!cooldown || cooldown.userId !== userId) return 0;
  const remaining = cooldown.startedAt + COUNTING_TIMERS.ruinCooldownMs - Date.now();
  return remaining > 0 ? remaining : 0;
}

export function startCooldown(config, userId) {
  return {
    ...config,
    cooldown: {
      userId,
      startedAt: Date.now(),
      validCounts: 0,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Multi-number strikes
 * ------------------------------------------------------------------ */

function pruneStrikes(strikes) {
  const cutoff = Date.now() - COUNTING_TIMERS.multiNumberStrikeWindowMs;
  const pruned = {};
  for (const [userId, record] of Object.entries(strikes)) {
    if (record && (record.lastAt || 0) >= cutoff) {
      pruned[userId] = record;
    }
  }
  return pruned;
}

/**
 * Registers another multi-number offence and returns the running strike
 * count (1-based) for that user within the strike window.
 */
export function registerMultiNumberStrike(config, userId) {
  const strikes = pruneStrikes(config.multiNumberStrikes || {});
  const previous = strikes[userId]?.count || 0;
  const next = {
    ...config,
    multiNumberStrikes: {
      ...strikes,
      [userId]: { count: previous + 1, lastAt: Date.now() },
    },
  };
  return { config: next, strikes: previous + 1 };
}

export function getMultiNumberStrikes(config, userId) {
  const strikes = pruneStrikes(config.multiNumberStrikes || {});
  return strikes[userId]?.count || 0;
}

export function clearMultiNumberStrikes(config, userId) {
  const strikes = pruneStrikes(config.multiNumberStrikes || {});
  delete strikes[userId];
  return { ...config, multiNumberStrikes: strikes };
}

/* ------------------------------------------------------------------ *
 * Shields
 *
 * Balances live in the economy inventory (see countingShields.js) so shop
 * purchases and milestone awards share one source of truth. Only the
 * "last awarded at count" cursor is kept here, in the counting config.
 * ------------------------------------------------------------------ */

/** True when the user's lifetime count has crossed a new shield threshold. */
export function hasCrossedShieldThreshold(stats) {
  return COUNTING_SHIELD.awardThresholds.some(
    (threshold) => stats.counts >= threshold && stats.lastShieldAwardCount < threshold,
  );
}

/** Records that shield thresholds have been processed up to `stats.counts`. */
export function markShieldThresholdsProcessed(config, userId) {
  const stats = getUserStats(config, userId);
  return {
    ...config,
    users: {
      ...config.users,
      [userId]: { ...stats, lastShieldAwardCount: stats.counts },
    },
  };
}

/* ------------------------------------------------------------------ *
 * Sequence mutation
 * ------------------------------------------------------------------ */

/**
 * Applies a valid count. Returns the saved config plus the context the
 * caller needs for milestone/reward/streak side effects.
 */
export async function recordCorrectCount(client, guildId, userId) {
  const config = await getCountingGameConfig(client, guildId);
  const leaderboard = { ...config.leaderboard };
  leaderboard[userId] = (leaderboard[userId] || 0) + 1;

  const stats = getUserStats(config, userId);
  const countedNumber = config.nextNumber || 1;
  const today = getCalendarDay();

  let streak = stats.streak;
  if (stats.lastActiveDay !== today) {
    streak = stats.lastActiveDay && stats.lastActiveDay === getPreviousCalendarDay(today)
      ? stats.streak + 1
      : 1;
  }

  const previousStreak = stats.streak;
  const counts = stats.counts + 1;

  const users = {
    ...config.users,
    [userId]: {
      ...stats,
      counts,
      streak,
      lastActiveDay: today,
    },
  };

  let cooldown = config.cooldown;
  if (cooldown && cooldown.userId !== userId) {
    cooldown = { ...cooldown, validCounts: (cooldown.validCounts || 0) + 1 };
  }

  // Rule 1 safeguard: a restore vote only stays open until the rebuilt
  // sequence has `restoreVoteMaxCounts` valid counts. Once the run is that
  // long, wiping it back to the pre-ruin number is no longer allowed.
  let restoreVote = config.restoreVote;
  let closedVote = null;
  if (restoreVote && (restoreVote.status ?? 'ACTIVE') === 'ACTIVE') {
    const validCounts = (restoreVote.validCounts || 0) + 1;
    if (validCounts >= COUNTING_TIMERS.restoreVoteMaxCounts) {
      closedVote = {
        vote: {
          ...restoreVote,
          voters: Array.isArray(restoreVote.voters) ? restoreVote.voters : [],
        },
        state: 'resumed',
      };
      restoreVote = null;
    } else {
      restoreVote = { ...restoreVote, validCounts };
    }
  }

  const nextStreak = (config.currentStreak || 0) + 1;

  let updatedConfig = {
    ...config,
    leaderboard,
    users,
    cooldown,
    restoreVote,
    lastUserId: userId,
    currentStreak: nextStreak,
    bestStreak: Math.max(config.bestStreak || 0, nextStreak),
    highestRecord: Math.max(config.highestRecord || 0, countedNumber),
    nextNumber: countedNumber + 1,
  };

  const statsBeforeAward = getUserStats(updatedConfig, userId);
  const shouldAward = hasCrossedShieldThreshold(statsBeforeAward);

  if (shouldAward) {
    updatedConfig = markShieldThresholdsProcessed(updatedConfig, userId);
  }

  const saved = await saveCountingGameConfig(client, guildId, updatedConfig);

  // Award after persisting the count so a failed grant cannot roll it back.
  let shieldAwarded = false;
  let shields = await getShieldBalance(client, guildId, userId).catch(() => 0);
  if (shouldAward) {
    const grant = await grantShield(client, guildId, userId).catch(() => ({ granted: false, shields: 0 }));
    shieldAwarded = grant.granted;
    shields = grant.shields;
  }

  return {
    config: saved,
    countedNumber,
    previousStreak,
    streak: saved.users[userId]?.streak ?? streak,
    counts: saved.users[userId]?.counts ?? counts,
    shieldAwarded,
    shields,
    closedVote,
  };
}

/**
 * Applies a ruin: increments the breaker's ruin stat, resets the sequence,
 * and puts the breaker on cooldown.
 */
export async function recordRuin(client, guildId, userId) {
  const config = await getCountingGameConfig(client, guildId);
  const stats = getUserStats(config, userId);

  const updated = startCooldown({
    ...config,
    users: {
      ...config.users,
      [userId]: { ...stats, ruins: stats.ruins + 1 },
    },
    nextNumber: 1,
    lastUserId: null,
    currentStreak: 0,
  }, userId);

  const saved = await saveCountingGameConfig(client, guildId, updated);
  return {
    config: saved,
    ruins: saved.users[userId]?.ruins ?? stats.ruins + 1,
  };
}

/* ------------------------------------------------------------------ *
 * Restore votes
 * ------------------------------------------------------------------ */

/**
 * Starts (or replaces) the active restore vote for a guild. Persisted so the
 * vote survives bot restarts, including the original sent value and reason so
 * every later embed edit can replay the full picture.
 */
export async function startRestoreVote(client, guildId, {
  messageId,
  channelId,
  preRuinCount,
  expectedValue,
  sentValue,
  reason,
  isRuinEvent = false,
  brokenBy,
  requiredVotes,
}) {
  const config = await getCountingGameConfig(client, guildId);
  const votesRequired = Number.isFinite(requiredVotes) && requiredVotes > 0
    ? Math.floor(requiredVotes)
    : config.restoreVotesRequired;

  const now = Date.now();
  const restoreVote = {
    messageId,
    channelId: channelId || config.channelId || null,
    preRuinCount,
    expectedValue: Number.isFinite(expectedValue) ? expectedValue : Math.max(1, (preRuinCount || 0) + 1),
    sentValue: sentValue ?? null,
    reason: reason ?? null,
    isRuinEvent: Boolean(isRuinEvent),
    brokenBy: brokenBy || null,
    requiredVotes: votesRequired,
    voters: [],
    createdAt: now,
    // Safeguards: the vote self-closes after the window, and valid counts on
    // the new sequence are tallied so Rule 1 can close it early (see
    // countingVoteLifecycle.js and recordCorrectCount).
    expiresAt: now + COUNTING_TIMERS.restoreVoteWindowMs,
    status: 'ACTIVE',
    validCounts: 0,
  };

  return saveCountingGameConfig(client, guildId, { ...config, restoreVote });
}

export function getRestoreVote(config) {
  const vote = config?.restoreVote;
  if (!vote || !vote.messageId) return null;
  return {
    ...vote,
    voters: Array.isArray(vote.voters) ? vote.voters : [],
  };
}

/**
 * Returns the restore vote only while it is still actionable. Votes written
 * before the status field existed are treated as active. Closed votes are
 * normally removed from storage, so this is a safety net for stale state.
 */
export function getActiveRestoreVote(config) {
  const vote = getRestoreVote(config);
  if (!vote) return null;
  if (vote.status && vote.status !== 'ACTIVE') return null;
  return vote;
}

/**
 * Records a 🔄 vote. Returns `{ config, accepted, alreadyVoted, reached,
 * votes }`. One vote per user; the breaker may not vote.
 */
export function applyRestoreVote(config, userId) {
  const vote = getRestoreVote(config);
  if (!vote) {
    return { config, accepted: false, alreadyVoted: false, reached: false, votes: 0 };
  }

  if (vote.brokenBy && vote.brokenBy === userId) {
    return { config, accepted: false, alreadyVoted: true, reached: false, votes: vote.voters.length };
  }

  if (vote.voters.includes(userId)) {
    return { config, accepted: false, alreadyVoted: true, reached: false, votes: vote.voters.length };
  }

  const voters = [...vote.voters, userId];
  const reached = voters.length >= vote.requiredVotes;

  return {
    config: {
      ...config,
      restoreVote: { ...vote, voters },
    },
    accepted: true,
    alreadyVoted: false,
    reached,
    votes: voters.length,
    requiredVotes: vote.requiredVotes,
  };
}

/**
 * Withdraws a 🔄 vote when the reaction is removed. Keeps the tally on the ruin
 * embed in sync so a vote cannot be farmed by add/remove.
 */
export function removeRestoreVote(config, userId) {
  const vote = getRestoreVote(config);
  if (!vote || !vote.voters.includes(userId)) {
    return { config, removed: false, votes: vote?.voters.length ?? 0 };
  }

  const voters = vote.voters.filter((id) => id !== userId);
  return {
    config: { ...config, restoreVote: { ...vote, voters } },
    removed: true,
    votes: voters.length,
  };
}

/**
 * Reverts the sequence to `preRuinCount` and clears the active vote.
 * Accepts `method` so the log records whether an admin or the community did it.
 */
export async function completeRestore(client, guildId, method = 'community_vote') {
  const config = await getCountingGameConfig(client, guildId);
  const vote = getRestoreVote(config);
  const target = vote?.preRuinCount;

  const saved = await saveCountingGameConfig(client, guildId, {
    ...config,
    nextNumber: Math.max(1, (Number.isFinite(target) ? target : config.highestRecord || 0) + 1),
    restoreVote: null,
  });

  return { config: saved, restoredTo: saved.nextNumber, method, voters: vote?.voters ?? [] };
}

/** Resolves the last number that counted before the break. */
export function resolvePreRuinCount(config) {
  const vote = getRestoreVote(config);
  if (vote && Number.isFinite(vote.preRuinCount)) return vote.preRuinCount;
  return Math.max(0, (config.highestRecord || config.nextNumber || 1) - 1);
}

const MEDALS = ['🥇', '🥈', '🥉'];
const LEADERBOARD_LIMIT = 10;
const NAME_MAX_LENGTH = 18;

function padTo(value, width) {
  return String(value).padStart(width, ' ');
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

/**
 * Builds the rich leaderboard lines: counts, daily streak, ruins, accuracy, and
 * shield balance. Shield balances are read from the economy inventory, so this
 * accepts an interaction (or anything with `client`) rather than a guild.
 */
export async function buildCountingLeaderboard(config, context) {
  const entries = Object.entries(config.leaderboard || {});
  if (entries.length === 0) {
    return [];
  }

  const ranked = entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, LEADERBOARD_LIMIT);

  const guild = context?.guild;
  const client = context?.client;

  const lines = [];

  for (const [index, [userId, count]] of ranked.entries()) {
    const stats = getUserStats(config, userId);
    const member = guild?.members?.cache?.get(userId);
    const rawName = member?.user?.username || `<@${userId}>`;
    const truncated = rawName.length > NAME_MAX_LENGTH
      ? `${rawName.slice(0, NAME_MAX_LENGTH - 1)}…`
      : rawName;
    const displayName = member ? `${truncated}#${member.user.discriminator}` : truncated;

    const shields = client
      ? await getShieldBalance(client, guild?.id, userId).catch(() => 0)
      : 0;

    const accuracy = getAccuracy(stats).toFixed(1);
    const ruinLabel = `${stats.ruins} ${pluralize(stats.ruins, 'ruin')}`;
    const rank = index < MEDALS.length ? MEDALS[index] : `${index + 1}.`;

    lines.push(
      `${rank} **${displayName}** • ${padTo(count, 3)} ${pluralize(count, 'count')} | ${stats.streak}🔥 | 💥 ${ruinLabel} | 🎯 ${accuracy}% | 🛡️ Shield (${shields}/${COUNTING_SHIELD.max})`,
    );
  }

  return lines;
}

export { COUNTING_SYSTEMS, COUNTING_MILESTONES, COUNTING_COMMENT_PREFIX };