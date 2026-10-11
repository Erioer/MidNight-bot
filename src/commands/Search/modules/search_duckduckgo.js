import axios from 'axios';
import { BOT_USER_AGENT } from '../../../config/bot.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { chunkText, sendPaginated } from './searchPager.js';

const DUCKDUCKGO_URL = 'https://api.duckduckgo.com/';
const DUCKDUCKGO_HTML_URL = 'https://html.duckduckgo.com/html/';
const MAX_LINKS = 8;

/**
 * Normalises a DuckDuckGo Instant Answer response into a summary plus a
 * flat list of { text, url } links. Related topics may nest one level deep
 * under a category node — those are flattened in order.
 */
export function parseDuckDuckGo(data) {
  if (!data || typeof data !== 'object') return { summary: '', links: [] };

  const summary = typeof data.AbstractText === 'string' ? data.AbstractText.trim() : '';
  const summaryUrl = typeof data.AbstractURL === 'string' ? data.AbstractURL : '';
  const summarySource = typeof data.AbstractSource === 'string' ? data.AbstractSource : '';

  const links = [];
  const topics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
  for (const topic of topics) {
    if (links.length >= MAX_LINKS) break;
    if (topic && typeof topic.FirstURL === 'string' && typeof topic.Text === 'string') {
      links.push({ text: topic.Text, url: topic.FirstURL });
    } else if (topic && Array.isArray(topic.Topics)) {
      for (const nested of topic.Topics) {
        if (links.length >= MAX_LINKS) break;
        if (nested && typeof nested.FirstURL === 'string' && typeof nested.Text === 'string') {
          links.push({ text: nested.Text, url: nested.FirstURL });
        }
      }
    }
  }

  return { summary, summaryUrl, summarySource, links };
}

function shorten(text, maxLength = 160) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat;
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * Parses DuckDuckGo's keyless HTML results page into { text, url } links.
 * Used only when the Instant Answer API returns neither a summary nor topics.
 * Result anchors carry the real URL in the `uddg` query parameter.
 */
export function parseDuckDuckGoHtml(html) {
  const links = [];
  if (typeof html !== 'string' || !html) return links;

  const anchorRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while (links.length < MAX_LINKS && (match = anchorRe.exec(html)) !== null) {
    const uddg = /[?&]uddg=([^&]+)/.exec(match[1]);
    if (!uddg) continue;
    let url = '';
    try {
      url = decodeURIComponent(uddg[1]);
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(url)) continue;
    const title = decodeEntities(match[2].replace(/<[^>]+>/g, '')).trim();
    if (!title || links.some((l) => l.url === url)) continue;
    links.push({ text: title, url });
  }

  return links;
}

async function fetchHtmlLinks(query) {
  // Exception to the house user agent: this endpoint answers bot user agents
  // with an empty bot-check page (HTTP 202, zero results — verified live), so
  // the fallback would never fire. A browser UA is required for it to work.
  const response = await axios.get(DUCKDUCKGO_HTML_URL, {
    timeout: 8000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    params: { q: query },
  });
  return parseDuckDuckGoHtml(response.data);
}

export default {
    async execute(interaction) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction);
            if (!deferred) {
                return;
            }

            const query = interaction.options.getString('query');

            const response = await axios.get(DUCKDUCKGO_URL, {
                timeout: 8000,
                headers: { 'User-Agent': BOT_USER_AGENT },
                params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 },
            });

            const { summary, summaryUrl, summarySource, links } = parseDuckDuckGo(response.data);

            // The Instant Answer API is sparse: fall back to the HTML results
            // page so ordinary queries still return website links.
            let resolvedLinks = links;
            if (!summary && resolvedLinks.length === 0) {
                resolvedLinks = await fetchHtmlLinks(query).catch(() => []);
            }

            if (!summary && resolvedLinks.length === 0) {
                return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `No results found for "${query}".` });
            }

            const lines = [];
            if (summary) {
                lines.push(summary);
                if (summaryUrl) lines.push(`[Source: ${summarySource || 'DuckDuckGo'}](${summaryUrl})`);
                lines.push('');
            }
            if (resolvedLinks.length > 0) {
                lines.push('**Related:**');
                for (const link of resolvedLinks) {
                    lines.push(`• [${shorten(link.text)}](${link.url})`);
                }
            }

            logger.info('DuckDuckGo search completed', {
                userId: interaction.user.id,
                query: query,
                guildId: interaction.guildId,
                commandName: 'duckduckgo'
            });

            return await sendPaginated(interaction, {
                title: query.length > 100 ? `${query.slice(0, 99)}…` : query,
                pages: chunkText(lines.join('\n')),
                footer: 'Provided by DuckDuckGo',
            });

        } catch (error) {
            // Delegated: handleInteractionError logs with full context, so
            // logging here as well would print every failure twice.
            await handleInteractionError(interaction, error, {
                commandName: 'duckduckgo',
                source: 'duckduckgo_api'
            });
        }
    },
};