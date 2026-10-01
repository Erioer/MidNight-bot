import { Events } from 'discord.js';
import { processStarboardReaction } from '../services/starboard/starboardService.js';
import { withdrawCountingRestoreVote } from '../services/countingGame/countingRestoreVote.js';

export default {
  name: Events.MessageReactionRemove,
  async execute(reaction, user) {
    await processStarboardReaction(reaction, user);
    await withdrawCountingRestoreVote(reaction, user);
  },
};
