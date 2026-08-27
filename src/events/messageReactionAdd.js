import { Events } from 'discord.js';
import { processStarboardReaction } from '../services/starboard/starboardService.js';

export default {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    await processStarboardReaction(reaction, user);
  },
};
