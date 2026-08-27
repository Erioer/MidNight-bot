// firstPlaceRoleService.js
//
// Keeps a guild's configured "first place" role pointed at whoever currently
// holds the top spot on the XP leaderboard, without re-scanning the whole
// leaderboard on every single XP grant. leveling.js's getLeaderboard() fetches
// every guild member to rank them, which is far too expensive to run on every
// message/reaction — so instead we cache { userId, totalXp } for the current
// holder in the guild's leveling config, and only act when a member's new XP
// total could plausibly overtake that cached value.

import { logger } from '../../utils/logger.js';
import { saveLevelingConfig } from './leveling.js';

export async function updateFirstPlaceRole(client, guild, member, config, newTotalXp) {
  if (!config.firstPlaceRoleId) {
    return;
  }

  const currentHolder = config.topXpHolder;
  const isAlreadyHolder = currentHolder?.userId === member.user.id;

  if (!isAlreadyHolder && currentHolder && newTotalXp <= currentHolder.totalXp) {
    // Someone else still holds first place and this member hasn't caught up.
    return;
  }

  if (isAlreadyHolder) {
    // Still first place — just keep the cached XP amount accurate, no role change.
    config.topXpHolder = { userId: member.user.id, totalXp: newTotalXp };
    await saveLevelingConfig(client, guild.id, config).catch((error) =>
      logger.debug('Failed to persist topXpHolder cache update:', error.message)
    );
    return;
  }

  const role = guild.roles.cache.get(config.firstPlaceRoleId);
  if (!role) {
    logger.warn(`First-place role ${config.firstPlaceRoleId} not found in guild ${guild.id}`);
    return;
  }

  if (currentHolder?.userId) {
    const previousMember = await guild.members.fetch(currentHolder.userId).catch(() => null);
    if (previousMember && previousMember.roles.cache.has(role.id)) {
      await previousMember.roles
        .remove(role, 'No longer #1 on the XP leaderboard')
        .catch((error) => logger.debug('Failed to remove first-place role from previous holder:', error.message));
    }
  }

  await member.roles
    .add(role, 'Reached #1 on the XP leaderboard')
    .catch((error) => logger.warn(`Failed to award first-place role to ${member.user.id}:`, error.message));

  config.topXpHolder = { userId: member.user.id, totalXp: newTotalXp };
  await saveLevelingConfig(client, guild.id, config).catch((error) =>
    logger.debug('Failed to persist new topXpHolder:', error.message)
  );

  logger.info(`👑 ${member.user.tag} is now #1 on the XP leaderboard in ${guild.name}`);
}
