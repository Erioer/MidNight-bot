// countingMilestones.js
// Turns raw counter events into milestone announcements, starboard posts,
// XP/cash rewards, and audit-log entries.
//
// Every threshold comes from COUNTING_MILESTONES in
// src/config/countingGameConfig.js, so new thresholds are picked up by
// appending a number there and nothing else.

import { logger } from '../../utils/logger.js';
import { EmbedBuilder } from 'discord.js';
import { getColor } from '../../config/bot.js';
import {
  COUNTING_MILESTONES,
  COUNTING_REWARDS,
  getMilestones,
} from '../../config/countingGameConfig.js';
import { getXpForLevel, getUserLevelData } from '../leveling/leveling.js';
import { addXp } from '../leveling/xpSystem.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { getStarboardConfig } from '../starboard/starboardStore.js';

/** Filters out milestones already recorded for a user so rewards never double-fire. */
function newlyReached(thresholds, alreadyReached) {
  const seen = new Set(alreadyReached || []);
  return thresholds.filter((threshold) => {
    if (seen.has(threshold)) return false;
    seen.add(threshold);
    return true;
  });
}

function buildMilestoneEmbed({ title, description, color, fields = [], footer }) {
  const embed = new EmbedBuilder()
    .setColor(getColor(color) || 0xF1C40F)
    .setTitle(title)
    .setDescription(description);

  if (fields.length > 0) {
    embed.addFields(fields);
  }
  if (footer) {
    embed.addFields({ name: 'Recorded', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true });
  }

  return embed;
}

/**
 * Posts a payload to the guild's starboard channel. Returns the sent message
 * or null when no starboard is configured / the post failed.
 */
export async function postToStarboard(guild, payload) {
  if (!guild) return null;

  try {
    const config = await getStarboardConfig(guild.id);
    if (!config?.channelId) return null;

    const channel = await guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel || channel.isTextBased() === false) return null;
    if (!channel.isSendable?.()) return null;

    return await channel.send(payload);
  } catch (error) {
    logger.error('Failed to post counting milestone to starboard:', { guildId: guild?.id, error });
    return null;
  }
}

async function announceStarboard(guild, embed, content) {
  const sent = await postToStarboard(guild, { content, embeds: [embed] });
  if (sent) {
    logger.debug('Counting milestone posted to starboard', { guildId: guild.id, content });
  }
  return sent;
}

/* ------------------------------------------------------------------ *
 * Server milestones
 * ------------------------------------------------------------------ */

/**
 * Fires when the channel count crosses a server milestone. Both first-time
 * and re-reached thresholds are announced because `previousValue` resets to 0
 * whenever the sequence restarts.
 */
export async function handleServerMilestones({ client, guild, channel, config, previousValue, newValue }) {
  const crossed = getMilestones('server').filter(
    (threshold) => newValue >= threshold && previousValue < threshold,
  );

  if (crossed.length === 0) return [];

  const fired = [];
  for (const threshold of crossed) {
    const embed = buildMilestoneEmbed({
      title: 'Counting Milestone Reached',
      description: `This server just reached **${threshold}** in the counting game!`,
      color: 'economy',
      fields: [
        { name: 'Milestone', value: `${threshold}`, inline: true },
        { name: 'Channel', value: channel ? `<#${channel.id}>` : 'Unknown', inline: true },
        { name: 'Triggered by', value: `<@${config.lastUserId}>`, inline: true },
      ],
      footer: true,
    });

    const content = `🏆 <#${channel?.id}> reached **${threshold}** counts!`;
    await announceStarboard(guild, embed, content);
    fired.push({ type: 'server', threshold });
  }

  return fired;
}

/* ------------------------------------------------------------------ *
 * User count milestones (rewards + starboard)
 * ------------------------------------------------------------------ */

/**
 * Computes the reward payload for a user.
 *
 * XP  = 30% of the XP required to complete the user's current level.
 * Cash = 30% of net worth (wallet + bank), with a guaranteed $1,000 minimum.
 */
export async function calculateMilestoneReward(client, guildId, userId) {
  const levelData = await getUserLevelData(client, guildId, userId).catch(() => null);
  const currentLevel = Math.max(0, levelData?.level || 0);

  let xpReward = 0;
  try {
    xpReward = Math.floor(getXpForLevel(currentLevel) * COUNTING_REWARDS.xpLevelCompletionRatio);
  } catch {
    xpReward = 0;
  }

  const economy = await getEconomyData(client, guildId, userId).catch(() => null);
  const netWorth = (economy?.wallet || 0) + (economy?.bank || 0);
  const proportionalCash = Math.floor(netWorth * COUNTING_REWARDS.cashNetWorthRatio);
  const cashReward = Math.max(COUNTING_REWARDS.cashMinimum, proportionalCash);

  return { xpReward, cashReward, level: currentLevel, netWorth };
}

/**
 * Deposits cash straight into the bank, clamped to the user's bank capacity.
 * Any overflow goes to the wallet so no reward is silently lost to a full bank.
 */
export async function depositCashReward(client, guildId, userId, amount) {
  const economy = await getEconomyData(client, guildId, userId);
  const maxBank = getMaxBankCapacity(economy);
  const roomInBank = Math.max(0, maxBank - (economy.bank || 0));
  const toBank = Math.min(amount, roomInBank);
  const toWallet = amount - toBank;

  const updated = {
    ...economy,
    bank: (economy.bank || 0) + toBank,
    wallet: (economy.wallet || 0) + toWallet,
  };

  await setEconomyData(client, guildId, userId, updated);
  return { toBank, toWallet };
}

/** Grants XP through the shared leveling system so role rewards still apply. */
export async function grantXpReward(client, guild, member, amount) {
  if (!member || amount <= 0) return null;
  try {
    return await addXp(client, guild, member, amount, null);
  } catch (error) {
    logger.error('Failed to grant counting milestone XP:', { guildId: guild?.id, userId: member?.id, error });
    return null;
  }
}

/**
 * Evaluates user-count and daily-streak milestones for one user after a valid
 * count, awards rewards, and posts starboard entries.
 *
 * Returns `{ config, countMilestones, streakMilestones, rewards }`.
 */
export async function handleUserMilestones({
  client,
  guild,
  member,
  config,
  userId,
  previousCounts,
  previousStreak,
  currentCounts,
  currentStreak,
}) {
  const stats = config.users?.[userId] || {};
  const alreadyCounts = stats.countMilestones || [];
  const alreadyStreaks = stats.streakMilestones || [];

  const countMilestones = newlyReached(
    getMilestones('user').filter((threshold) => currentCounts >= threshold),
    alreadyCounts,
  );
  const streakMilestones = newlyReached(
    getMilestones('streak').filter((threshold) => currentStreak >= threshold),
    alreadyStreaks,
  );

  if (countMilestones.length === 0 && streakMilestones.length === 0) {
    return { config, countMilestones: [], streakMilestones: [], rewards: null };
  }

  const updatedConfig = {
    ...config,
    users: {
      ...config.users,
      [userId]: {
        ...stats,
        countMilestones: [...alreadyCounts, ...countMilestones],
        streakMilestones: [...alreadyStreaks, ...streakMilestones],
      },
    },
  };

  let rewards = null;
  if (countMilestones.length > 0 || streakMilestones.length > 0) {
    rewards = await calculateMilestoneReward(client, guild.id, userId);
    await grantXpReward(client, guild, member, rewards.xpReward);
    const deposit = await depositCashReward(client, guild.id, userId, rewards.cashReward);
    rewards = { ...rewards, ...deposit };
  }

  for (const threshold of countMilestones) {
    const embed = buildMilestoneEmbed({
      title: 'Counting Milestone',
      description: `<@${userId}> has contributed **${threshold}** valid counts!`,
      color: 'economy',
      fields: rewards
        ? [
          { name: 'Counts', value: `${currentCounts}`, inline: true },
          { name: 'Daily streak', value: `🔥 ${currentStreak}`, inline: true },
          { name: 'XP earned', value: `+${rewards.xpReward}`, inline: true },
          { name: 'Cash earned', value: `$${rewards.cashReward.toLocaleString()}`, inline: true },
        ]
        : [{ name: 'Counts', value: `${currentCounts}`, inline: true }],
      footer: true,
    });

    await announceStarboard(guild, embed, `🏆 <@${userId}> hit **${threshold}** counts!`);
  }

  for (const threshold of streakMilestones) {
    const embed = buildMilestoneEmbed({
      title: 'Daily Streak Milestone',
      description: `<@${userId}> has counted for **${threshold}** consecutive days!`,
      color: 'warning',
      fields: rewards
        ? [
          { name: 'Streak', value: `🔥 ${threshold} days`, inline: true },
          { name: 'XP earned', value: `+${rewards.xpReward}`, inline: true },
          { name: 'Cash earned', value: `$${rewards.cashReward.toLocaleString()}`, inline: true },
        ]
        : [{ name: 'Streak', value: `🔥 ${threshold} days`, inline: true }],
      footer: true,
    });

    await announceStarboard(guild, embed, `🔥 <@${userId}> counted **${threshold} days in a row**!`);
  }

  return {
    config: updatedConfig,
    countMilestones,
    streakMilestones,
    rewards,
    previousCounts,
    previousStreak,
  };
}

/**
 * Fires when a user's lifetime ruin count crosses a mistake milestone.
 * Mistakes are a "boon" badge, so these are starboard-only — no rewards.
 */
export async function handleMistakeMilestones({ guild, config, userId, currentRuins }) {
  const stats = config.users?.[userId] || {};
  const already = stats.mistakeMilestones || [];

  const crossed = newlyReached(
    getMilestones('mistakes').filter((threshold) => currentRuins >= threshold),
    already,
  );

  if (crossed.length === 0) {
    return { config, milestones: [] };
  }

  const updatedConfig = {
    ...config,
    users: {
      ...config.users,
      [userId]: {
        ...stats,
        mistakeMilestones: [...already, ...crossed],
      },
    },
  };

  for (const threshold of crossed) {
    const embed = buildMilestoneEmbed({
      title: 'Counting Blunder Milestone',
      description: `<@${userId}> has broken the count **${threshold}** time${threshold === 1 ? '' : 's'}.`,
      color: 'error',
      fields: [
        { name: 'Total ruins', value: `${currentRuins}`, inline: true },
        { name: 'Accuracy', value: `${formatAccuracy(config, userId)}%`, inline: true },
      ],
      footer: true,
    });

    await announceStarboard(guild, embed, `💥 <@${userId}> reached **${threshold}** counting blunders.`);
  }

  return { config: updatedConfig, milestones: crossed };
}

/* ------------------------------------------------------------------ *
 * Starboard for shield consumption is intentionally omitted — shields are a
 * private safety net, only the audit log records them.
 * ------------------------------------------------------------------ */

function formatAccuracy(config, userId) {
  const stats = config.users?.[userId] || {};
  const counts = stats.counts || 0;
  const ruins = stats.ruins || 0;
  const total = counts + ruins;
  if (total === 0) return '100.0';
  return (((counts / total) * 100)).toFixed(1);
}

export { COUNTING_MILESTONES };