// reactionXp.js
//
// Reaction-triggered XP: both the person who reacts and the author of the
// reacted-to message earn XP, each independently subject to their own
// reaction-XP cooldown (tracked via lastReactionXp, separate from the
// message-XP cooldown so reacting doesn't reset your message-XP timer).
//
// Anti-abuse defaults (not explicitly requested, but standard practice):
// no XP for reacting to your own message, and no XP if the message author
// is a bot (nothing meaningful being "authored" there).

import { logger } from '../../utils/logger.js';
import { getLevelingConfig, getUserLevelData } from './leveling.js';
import { addXp } from './xpSystem.js';

async function resolvePartials(reaction, user) {
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
    if (user.partial) await user.fetch();
  } catch (error) {
    // Original message/reaction was likely deleted before we could fetch it.
    return null;
  }
  return reaction;
}

function rollXp(reactionCfg) {
  const min = reactionCfg.min ?? 25;
  const max = reactionCfg.max ?? 25;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function isOffCooldown(client, guildId, userId, cooldownSeconds) {
  const data = await getUserLevelData(client, guildId, userId);
  const cooldownMs = (cooldownSeconds || 0) * 1000;
  return Date.now() - (data.lastReactionXp || 0) >= cooldownMs;
}

export async function processReactionXp(reactionRaw, user, client) {
  if (!reactionRaw.message.guild) return; // ignore DMs
  if (user.bot) return;

  const reaction = await resolvePartials(reactionRaw, user);
  if (!reaction) return;

  const message = reaction.message;
  const guild = message.guild;

  if (!message.author || message.author.bot) return; // nothing meaningful for a bot "author" to earn
  if (user.id === message.author.id) return; // no self-reaction XP farming

  const config = await getLevelingConfig(client, guild.id);
  if (!config.enabled || !config.reactionXp?.enabled) return;

  const reactorMember = await guild.members.fetch(user.id).catch(() => null);
  const authorMember = await guild.members.fetch(message.author.id).catch(() => null);

  const xpToAdd = rollXp(config.reactionXp);
  const cooldownSeconds = config.reactionXp.cooldown ?? 300;

  if (reactorMember && (await isOffCooldown(client, guild.id, user.id, cooldownSeconds))) {
    await addXp(client, guild, reactorMember, xpToAdd, message.channel, { isReactionGrant: true }).catch((error) =>
      logger.debug('Failed to grant reactor reaction-XP:', error.message)
    );
  }

  if (authorMember && (await isOffCooldown(client, guild.id, message.author.id, cooldownSeconds))) {
    await addXp(client, guild, authorMember, xpToAdd, message.channel, { isReactionGrant: true }).catch((error) =>
      logger.debug('Failed to grant author reaction-XP:', error.message)
    );
  }
}
