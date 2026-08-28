import { createEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { fetchJson } from '../../services/fun/funApi.js';

const DOG_FACT_URL = 'https://dogapi.dog/api/v2/facts';

export default {
  data: {
    name: 'dogfact',
    description: 'Get a random dog fact.',
    options: [],
  },
  category: 'Fun',
  prefixOnly: true,

  async execute(interaction) {
    try {
      const data = await fetchJson(DOG_FACT_URL);
      const fact = data.data?.[0]?.attributes?.body || 'No dog facts available right now.';
      return interaction.reply({
        embeds: [createEmbed({ title: 'Dog Fact', description: fact, color: 'primary' })],
      });
    } catch (error) {
      logger.error('Dog fact command API error:', error);
      return replyUserError(interaction, {
        type: ErrorTypes.NETWORK,
        message: 'I could not fetch a dog fact right now. Please try again in a moment.',
      });
    }
  },
};
