// starboardEmbed.js
// Builds the message payload posted/edited in the starboard channel.
//
// NOTE on utils/embeds.js: createEmbed() is built on EmbedBuilder, whose
// prototype is globally monkey-patched by utils/embeds.js — setTimestamp()
// is a no-op for every embed in the app, and setDescription/setAuthor/
// addFields strip emoji from their text (EMOJI_REGEX). That's true for
// every embed MidNight sends today, not something specific to this file, so
// this embed is built to match: the dynamic timestamp requirement is met
// with a `<t:...:F>` field instead of the native embed timestamp, and the
// reposted message content will have emoji stripped the same way every
// other embed's text already does.

import { createEmbed } from '../../utils/embeds.js';

const STARBOARD_COLOR = '#f1c40f'; // gold accent strip — swap to '#3498db' for blue

// Matches a direct link to an image/GIF (not a page like a Tenor/Giphy share
// link — those aren't fetchable as a raw image URL without hitting their API).
const DIRECT_IMAGE_URL_RE = /(https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?)/i;

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
 * Builds { content, embeds } for the starboard channel: a star-count content
 * line, a main embed (author/content/jump link/timestamp), and, for
 * multi-image messages, extra image-only embeds stacked in the same message
 * (Discord allows up to 10 embeds per message — this is how most starboard
 * bots render a multi-image post as a gallery).
 */
export function buildStarboardPayload(message, count, emojiDisplay) {
  const images = collectImageUrls(message);
  const jumpUrl = message.url;
  const timestampTag = `<t:${Math.floor(message.createdTimestamp / 1000)}:F>`;

  const rawContent =
    message.content && message.content.length > 0
      ? message.content.slice(0, 3900) // stay well under the 4096 embed description cap
      : '*No message content*';
  const description = `${rawContent}\n\n**[Jump to Message](${jumpUrl})**`;

  const authorTag = message.author?.tag ?? 'Unknown User';
  const authorAvatar = message.author?.displayAvatarURL?.() ?? undefined;

  const nonImageAttachments = [...message.attachments.values()].filter((a) => !images.includes(a.url));
  const fields = [{ name: 'Sent', value: timestampTag, inline: true }];
  if (nonImageAttachments.length > 0) {
    fields.push({
      name: 'Attachments',
      value: nonImageAttachments
        .map((a) => `[${a.name}](${a.url})`)
        .join('\n')
        .slice(0, 1024),
    });
  }

  const mainEmbed = createEmbed({
    description,
    color: STARBOARD_COLOR,
    author: { name: `Messaged by ${authorTag}`, iconURL: authorAvatar },
    fields,
    image: images[0] || null,
  });

  const extraImageEmbeds = images
    .slice(1, 9) // main embed already used image[0]; stay well under Discord's 10-embed cap
    .map((url) => createEmbed({ color: STARBOARD_COLOR, image: url }));

  return {
    content: `**${count}** ${emojiDisplay} | <#${message.channel.id}>`,
    embeds: [mainEmbed, ...extraImageEmbeds],
  };
}
