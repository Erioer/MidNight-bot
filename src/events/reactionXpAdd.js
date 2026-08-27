import { Events } from 'discord.js';
import { processReactionXp } from '../services/leveling/reactionXp.js';

export default {
  name: Events.MessageReactionAdd,
  async execute(reaction, user, client) {
    await processReactionXp(reaction, user, client);
  },
};
