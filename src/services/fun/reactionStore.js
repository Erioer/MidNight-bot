// reactionStore.js
// Per-pair action counts for the react command. One key per
// (guild, action, giver, receiver) pair, following the same DatabaseWrapper
// pattern as services/starboard/starboardStore.js.

import { db } from '../../utils/database/wrapper.js';
import { getReactionCountKey } from '../../utils/database/keys.js';

export async function getActionCount(guildId, action, giverId, receiverId) {
  if (!db.initialized) {
    await db.initialize();
  }

  const count = await db.get(getReactionCountKey(guildId, action, giverId, receiverId), 0);
  return Number(count) || 0;
}

export async function addActionCount(guildId, action, giverId, receiverId, amount = 1) {
  if (!db.initialized) {
    await db.initialize();
  }

  return await db.increment(getReactionCountKey(guildId, action, giverId, receiverId), amount);
}
