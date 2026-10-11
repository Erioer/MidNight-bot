// starboardEmbed.js
// Builds the message payload posted/edited in the starboard channel.
//
// Components V2 layout, following the house card skeleton: section with the
// author's avatar beside the title, message content, a media gallery for
// images, then a divider and a metadata footer. No accent: a board post
// reports no outcome.
//
// Text budget: a V2 message carries at most 4,000 characters total, so the
// reposted content is sliced to leave room for the fixed chrome around it.

import { MessageFlags } from 'discord.js';
import { container, divider, gallery, text } from '../../utils/componentsV2.js';

// Matches a direct link to an image/GIF (not a page like a Tenor/Giphy share
// link — those aren't fetchable as a raw image URL without hitting their API).
const DIRECT_IMAGE_URL_RE = /(https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?)/i;

// Reposted content cap: keeps the whole V2 payload under the 4,000-character
// total once the title, footer and attachment lines are added.
const MAX_CONTENT_LENGTH = 3400;

// Non-image attachment lines are capped so a file-dump cannot blow the budget.
const MAX_ATTACHMENTS_LENGTH = 200;

function collectImageUrls(message) {
  const urls = [];

  for (const attachment of message.attachments.values()) {
    const looksLikeImage =
      (attachment.contentType && attachment.contentType.startsWith('image/')) ||
      /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(attachment.name || attachment.url || '');
    if (looksLikeImage) urls.push(attachment.url);
  }

  if (urls.length === 0 && message.content) {
    const match = message.content.match(DIRECT_IMAGE_URL_RE);
    if (match) urls.push(match[1]);
  }

  return urls;
}

/**
 * Builds { components, flags } for the starboard channel: a star-count title
 * beside the author's avatar, the message content, a gallery for images, and
 * a footer carrying the send time, the jump link and any attachments.
 *
 * The title carries the guild's configured trigger emoji: it identifies which
 * reaction starred the message at a glance.
 */
export function buildStarboardPayload(message, count, emojiDisplay) {
  const images = collectImageUrls(message);
  const jumpUrl = message.url;
  const timestampTag = `<t:${Math.floor(message.createdTimestamp / 1000)}:F>`;

  const rawContent =
    message.content && message.content.length > 0
      ? message.content.slice(0, MAX_CONTENT_LENGTH)
      : '*No message content*';

  // Server display name first (member nickname), then the global display
  // name, then the legacy tag. No avatar: the thumbnail rendered oversized
  // next to the header and crowded the card.
  const authorName = message.member?.displayName
    || message.author?.displayName
    || message.author?.tag
    || 'Unknown User';

  const nonImageAttachments = [...message.attachments.values()].filter((a) => !images.includes(a.url));
  const attachmentLine = nonImageAttachments.length > 0
    ? nonImageAttachments
      .map((a) => `[${a.name}](${a.url})`)
      .join(' • ')
      .slice(0, MAX_ATTACHMENTS_LENGTH)
    : null;

  const footerParts = [
    `Sent ${timestampTag}`,
    `[Jump to Message](${jumpUrl})`,
  ];
  if (attachmentLine) footerParts.push(`Attachments: ${attachmentLine}`);

  const head = [text(`### ${count} ${emojiDisplay} | <#${message.channel.id}>`), text(`**Messaged by ${authorName}**`)];

  const parts = [head, text(rawContent)];

  if (images.length > 0) {
    parts.push(gallery(...images.slice(0, 10)));
  }

  parts.push(divider(), text(`-# ${footerParts.join(' • ')}`));

  return {
    components: [container({ parts })],
    flags: MessageFlags.IsComponentsV2,
  };
}
