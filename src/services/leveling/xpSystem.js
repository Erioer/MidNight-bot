// xpSystem.js

import { logger } from '../../utils/logger.js';
import { getLevelingConfig, getXpForLevel, getUserLevelData, saveUserLevelData } from './leveling.js';
import { logEvent, EVENT_TYPES } from '../loggingService.js';
import { formatLogLine } from '../../utils/logging/logEmbeds.js';
import { Mutex } from '../../utils/mutex.js';
import { wrapServiceBoundary } from '../../utils/errorHandler.js';
import { updateFirstPlaceRole } from './firstPlaceRoleService.js';

/**
 * Award XP to a member. Returns null when XP is skipped (disabled/invalid amount).
 * Throws on storage or unexpected failures.
 */
export const addXp = wrapServiceBoundary(async function addXp(client, guild, member, xpToAdd, channel = null, options = {}) {
  const lockKey = `leveling:${guild.id}:${member.user.id}`;
  return await Mutex.runExclusive(lockKey, async () => {
    if (!xpToAdd || xpToAdd <= 0) {
      return null;
    }

    const config = await getLevelingConfig(client, guild.id);

    if (!config.enabled) {
      return null;
    }

    // Server boosters (native premiumSince) or members holding the configured
    // booster role earn a flat 10% bonus on top of whatever amount was passed in.
    const isBooster =
      Boolean(member.premiumSince) ||
      Boolean(config.boosterRoleId && member.roles.cache.has(config.boosterRoleId));
    const effectiveXp = isBooster ? Math.ceil(xpToAdd * 1.1) : xpToAdd;

    const levelData = await getUserLevelData(client, guild.id, member.user.id);

    levelData.xp += effectiveXp;
    levelData.totalXp += effectiveXp;
    if (options.isReactionGrant) {
      levelData.lastReactionXp = Date.now();
    } else {
      levelData.lastMessage = Date.now();
    }

    let xpNeededForNextLevel = getXpForLevel(levelData.level);
    let didLevelUp = false;
    const initialLevel = levelData.level;
    const earnedRoleRewards = [];

    while (levelData.xp >= xpNeededForNextLevel && levelData.level < 1000) {
      levelData.xp -= xpNeededForNextLevel;
      levelData.level += 1;
      didLevelUp = true;
      xpNeededForNextLevel = getXpForLevel(levelData.level);

      logger.info(`🎉 ${member.user.tag} leveled up to level ${levelData.level} in ${guild.name}`);

      if (config.roleRewards && config.roleRewards[levelData.level]) {
        const roleId = config.roleRewards[levelData.level];
        await awardRoleReward(guild, member, roleId, levelData.level);
        earnedRoleRewards.push({ level: levelData.level, roleId });
      }
    }

    if (didLevelUp) {
      // Announcements only fire when a role was actually earned this XP grant —
      // not on every level — and always go to the channel the triggering
      // action happened in rather than a fixed configured channel.
      if (config.announceLevelUp && channel && earnedRoleRewards.length > 0) {
        for (const earned of earnedRoleRewards) {
          await sendLevelUpAnnouncement(guild, member, levelData, config, channel, earned.roleId);
        }
      }

      try {
        await logEvent({
          client,
          guildId: guild.id,
          eventType: EVENT_TYPES.LEVELING_LEVELUP,
          data: {
            title: 'Level Up',
            lines: [
              formatLogLine('Member', `${member.user.tag} (\`${member.user.id}\`)`),
              formatLogLine('New Level', levelData.level.toString()),
              formatLogLine('Levels Gained', (levelData.level - initialLevel).toString()),
              formatLogLine('Total XP', levelData.totalXp.toString()),
            ],
            userId: member.user.id,
          },
        });
      } catch (logError) {
        logger.debug('Failed to log leveling event:', logError.message);
      }
    }

    await saveUserLevelData(client, guild.id, member.user.id, levelData);

    await updateFirstPlaceRole(client, guild, member, config, levelData.totalXp).catch((error) =>
      logger.debug('Failed to update first-place role:', error.message)
    );

    return {
      level: levelData.level,
      xp: levelData.xp,
      totalXp: levelData.totalXp,
      xpNeeded: getXpForLevel(levelData.level + 1),
      leveledUp: didLevelUp,
    };
  });
}, {
  service: 'xpSystem',
  operation: 'addXp',
  userMessage: 'Failed to award XP. Please try again.',
});

async function awardRoleReward(guild, member, roleId, level) {
  try {
    const role = guild.roles.cache.get(roleId);

    if (!role) {
      logger.warn(`Role ${roleId} not found for level ${level} reward in guild ${guild.id}`);
      return;
    }

    if (member.roles.cache.has(roleId)) {
      return;
    }

    await member.roles.add(role, `Level ${level} reward`);
    logger.info(`✅ Awarded role ${role.name} to ${member.user.tag} for reaching level ${level}`);
  } catch (error) {
    logger.error(`Failed to award role reward to ${member.user.id}:`, error);
  }
}

async function sendLevelUpAnnouncement(guild, member, levelData, config, channel, roleId) {
  try {
    if (!channel || !channel.isTextBased()) {
      return;
    }

    const permissions = channel.permissionsFor(guild.members.me);
    if (!permissions || !permissions.has(['SendMessages', 'EmbedLinks'])) {
      logger.warn(`Missing permissions to send levelup message in ${channel.id}`);
      return;
    }

    const role = guild.roles.cache.get(roleId);
    const roleName = role ? role.name : 'a new';

    const message = (config.levelUpMessage || '{user} has earned the {role} role!')
      .replace(/{user}/g, member.toString())
      .replace(/{level}/g, levelData.level)
      .replace(/{role}/g, roleName)
      .replace(/{xp}/g, levelData.xp)
      .replace(/{xpNeeded}/g, getXpForLevel(levelData.level + 1));

    await channel.send(message).catch(error => {
      logger.error(`Failed to send level up message in channel ${channel.id}:`, error);
    });
  } catch (error) {
    logger.error('Error sending level up announcement:', error);
  }
}
