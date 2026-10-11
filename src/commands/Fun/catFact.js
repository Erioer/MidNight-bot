import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { fetchJson } from '../../services/fun/funApi.js';
import { NO_PINGS, container, text, v2Flags } from '../../utils/componentsV2.js';

const CAT_FACT_URL = 'https://meowfacts.herokuapp.com/';

export default {
  data: {
    name: 'catfact',
    description: 'Get a random cat fact.',
    options: [],
  },
  category: 'Fun',
  prefixOnly: true,

  async execute(interaction) {
    try {
      const data = await fetchJson(CAT_FACT_URL);
      const fact = data.data?.[0] || 'No cat facts available right now.';
      return interaction.reply({
        components: [container({ parts: [text('### Cat Fact'), text(fact)] })],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });
    } catch (error) {
      logger.error('Cat fact command API error:', error);
      return replyUserError(interaction, {
        type: ErrorTypes.NETWORK,
        message: 'I could not fetch a cat fact right now. Please try again in a moment.',
      });
    }
  },
};