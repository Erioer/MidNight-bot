import axios from 'axios';
import { BOT_USER_AGENT } from '../../../config/bot.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { chunkText, sendPaginated } from './searchPager.js';

const WIKI_SUMMARY_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const WIKI_OPENSEARCH_URL = 'https://en.wikipedia.org/w/api.php';

// Wikimedia blocks generic HTTP-client user agents; identify the bot.
const WIKI_HEADERS = { 'User-Agent': BOT_USER_AGENT };

/**
 * Normalises a Wikipedia page-summary response into title/body/link.
 * Returns null when the payload carries nothing displayable.
 */
export function parseWikiSummary(data) {
  if (!data || typeof data !== 'object') return null;
  const extract = typeof data.extract === 'string' ? data.extract.trim() : '';
  if (!extract) return null;
  return {
    title: data.title || 'Wikipedia',
    body: extract,
    url: data.content_urls?.desktop?.page || null,
    disambiguation: data.type === 'disambiguation',
  };
}

async function fetchSummary(title) {
  const response = await axios.get(`${WIKI_SUMMARY_URL}${encodeURIComponent(title)}`, {
    timeout: 8000,
    headers: WIKI_HEADERS,
  });
  return parseWikiSummary(response.data);
}

async function searchFirstTitle(term) {
  const response = await axios.get(WIKI_OPENSEARCH_URL, {
    timeout: 8000,
    headers: WIKI_HEADERS,
    params: { action: 'opensearch', search: term, limit: 1, namespace: 0, format: 'json' },
  });
  const titles = response.data?.[1];
  return Array.isArray(titles) && titles.length > 0 ? titles[0] : null;
}

export default {
    async execute(interaction) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction);
            if (!deferred) {
                return;
            }

            const word = interaction.options.getString('word');

            if (word.length < 2) {
                logger.warn('Define command - word too short', {
                    userId: interaction.user.id,
                    word: word,
                    guildId: interaction.guildId
                });
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Please enter a word with at least 2 characters.' });
            }

            let result = null;
            try {
                result = await fetchSummary(word);
            } catch (error) {
                // No exact page (404) or a rejected request (400/403): fall
                // back to the top search hit, if any.
                if (![400, 403, 404].includes(error.response?.status)) throw error;
                const suggestion = await searchFirstTitle(word).catch(() => null);
                if (suggestion) {
                    result = await fetchSummary(suggestion).catch(() => null);
                }
            }

            if (!result) {
                return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `No definitions found for "${word}".` });
            }

            const lines = [result.body];
            if (result.url) lines.push('', `[Read more on Wikipedia](${result.url})`);

            logger.info('Dictionary definition retrieved', {
                userId: interaction.user.id,
                word: word,
                guildId: interaction.guildId,
                commandName: 'define'
            });

            return await sendPaginated(interaction, {
                title: result.title,
                pages: chunkText(lines.join('\n')),
                footer: 'Provided by Wikipedia',
            });

        } catch (error) {
            // Delegated below: handleInteractionError logs with full context
            // (message, stack, trace), so logging here as well would print
            // every failure twice.
            await handleInteractionError(interaction, error, {
                commandName: 'define',
                source: 'wikipedia_api'
            });
        }
    },
};