// searchPager.js
// Shared pagination for the /search subcommands.
//
// Long result bodies are chunked into pages; when everything fits on one page
// no buttons are rendered at all. Multi-page results get Previous/Next
// buttons (shop pattern) that fully disable after 5 minutes, with the page
// content preserved — a V2 message's `components` IS the whole message, so
// the timeout edit must resend the page, not just the buttons.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { NO_PINGS, container, divider, text, v2Flags } from '../../../utils/componentsV2.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

/** Paginator lifetime: buttons go dead after this long. */
export const PAGER_TIMEOUT_MS = 5 * 60 * 1000;

/** Max body characters per page. Well under the 4,000-char V2 total. */
export const PAGE_MAX_CHARS = 1500;

/**
 * Splits a markdown body into pages on paragraph boundaries. A single
 * overlong paragraph is hard-sliced so no page can ever blow the budget.
 */
export function chunkText(body, maxChars = PAGE_MAX_CHARS) {
  const paragraphs = String(body || '').split(/\n\s*\n/);
  const pages = [];
  let current = '';

  const push = () => {
    if (current) pages.push(current);
    current = '';
  };

  for (const paragraph of paragraphs) {
    if (!paragraph) continue;
    if (paragraph.length > maxChars) {
      push();
      for (let i = 0; i < paragraph.length; i += maxChars) {
        pages.push(paragraph.slice(i, i + maxChars));
      }
      continue;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars) {
      push();
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  push();

  return pages.length > 0 ? pages : ['*No content*'];
}

/** One search result page. Neutral view, so no accent is set. */
export function buildSearchPage({ title, body, page, totalPages, footer }) {
  const footerLine = totalPages > 1
    ? `-# Page ${page}/${totalPages}${footer ? ` • ${footer}` : ''}`
    : `-# ${footer || ''}`.trimEnd();

  const parts = [text(`### ${title}`), text(body), divider()];
  if (footerLine.replace(/^-#\s*/, '')) parts.push(text(footerLine));
  return container({ parts });
}

function pagerRow(page, totalPages, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('search_prev')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page <= 1),
    new ButtonBuilder()
      .setCustomId('search_next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page >= totalPages),
  );
}

function renderPayload({ title, pages, footer, page, disabled = false }) {
  const components = [buildSearchPage({ title, body: pages[page - 1], page, totalPages: pages.length, footer })];
  if (pages.length > 1) components.push(pagerRow(page, pages.length, disabled));
  return { components, flags: v2Flags(), allowedMentions: NO_PINGS };
}

/**
 * Sends paginated V2 results through an already-deferred interaction.
 *
 * Single-page results are a plain send with no buttons and no collector.
 * Multi-page results attach a 5-minute collector scoped to this message that
 * only the invoker can turn; on timeout the buttons disable in place.
 */
export async function sendPaginated(interaction, { title, pages, footer }) {
  const safePages = Array.isArray(pages) && pages.length > 0 ? pages : ['*No content*'];
  let currentPage = 1;

  await InteractionHelper.safeEditReply(
    interaction,
    renderPayload({ title, pages: safePages, footer, page: currentPage }),
  );

  if (safePages.length <= 1) return;

  const message = await interaction.fetchReply().catch(() => null);
  if (!message) {
    logger.debug('searchPager: no message to paginate', { commandName: 'search' });
    return;
  }

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: PAGER_TIMEOUT_MS,
  });

  collector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.user.id !== interaction.user.id) {
      await buttonInteraction.reply({
        components: [container({ parts: [text('### Not Your Search')] })],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        allowedMentions: NO_PINGS,
      }).catch(() => {});
      return;
    }

    const { customId } = buttonInteraction;
    if (customId !== 'search_prev' && customId !== 'search_next') return;

    await buttonInteraction.deferUpdate().catch(() => {});
    if (customId === 'search_prev' && currentPage > 1) currentPage -= 1;
    else if (customId === 'search_next' && currentPage < safePages.length) currentPage += 1;

    await buttonInteraction
      .editReply(renderPayload({ title, pages: safePages, footer, page: currentPage }))
      .catch(() => {});
  });

  collector.on('end', async () => {
    try {
      // Resend the current page with dead buttons. Editing with only the
      // buttons would wipe the page content.
      await message.edit(renderPayload({ title, pages: safePages, footer, page: currentPage, disabled: true }));
    } catch (error) {
      logger.debug('searchPager: could not disable components on collector end', {
        error: error.message,
      });
    }
  });
}
