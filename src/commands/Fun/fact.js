import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { fetchJson } from '../../services/fun/funApi.js';
import { NO_PINGS, container, text, v2Flags } from '../../utils/componentsV2.js';

const FACT_URL = 'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en';

export default {
  data: {
    name: 'fact',
    description: 'Get a random fact.',
    options: [],
  },
  category: 'Fun',
  prefixOnly: true,

  async execute(interaction) {
    try {
      const data = await fetchJson(FACT_URL);
      const fact = data.text || 'No fact available right now.';
      return interaction.reply({
        components: [container({ parts: [text('### Random Fact'), text(fact)] })],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });
    } catch (error) {
      logger.error('Fact command API error:', error);
      return replyUserError(interaction, {
        type: ErrorTypes.NETWORK,
        message: 'I could not fetch a fact right now. Please try again in a moment.',
      });
    }
  },
};