import { Events } from 'discord.js';
import { processStarboardReaction } from '../services/starboard/starboardService.js';
import { processCountingRestoreVote } from '../services/countingGame/countingRestoreVote.js';

export default {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    await processStarboardReaction(reaction, user);
    await processCountingRestoreVote(reaction, user);
  },
};
