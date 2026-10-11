import { SlashCommandBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { MidNightError, ErrorTypes } from '../../utils/errorHandler.js';
import { NO_PINGS, v2Flags } from '../../utils/componentsV2.js';
import { successContainer } from '../../services/economy/economyViews.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("flip")
    .setDescription("Flips a coin (Heads or Tails)."),
  category: 'Fun',

  async execute(interaction, config, client) {
    const result = Math.random() < 0.5 ? "Heads" : "Tails";

    await InteractionHelper.safeReply(interaction, {
      components: [
        successContainer({
          title: 'Heads or Tails?',
          body: `The coin landed on... **${result}**!`,
        }),
      ],
      flags: v2Flags(),
      allowedMentions: NO_PINGS,
    });
    logger.debug(`Flip command executed by user ${interaction.user.id} in guild ${interaction.guildId}`);
  },
};