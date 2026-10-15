import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';
import {
  clearAttachmentSnapshot,
  diffAttachments,
  getAttachmentSnapshot,
  serializeAttachments,
  snapshotMessageAttachments,
} from '../services/messageAttachments.js';

const MAX_LOGGED_EDIT_CONTENT_LENGTH = 512;

export default {
  name: Events.MessageUpdate,
  once: false,

  async execute(oldMessage, newMessage) {
    try {
      if (!newMessage.guild || newMessage.author?.bot) return;

      // Partial old messages carry no attachments — fetch the full state so
      // the diff below compares real data, not an empty cache entry.
      let oldFull = oldMessage;
      if (oldMessage?.partial) {
        oldFull = await oldMessage.fetch().catch(() => null);
        if (!oldFull) return;
      }

      const contentChanged = oldFull.content !== newMessage.content;

      // Authoritative baseline first (survives cache gaps and restarts),
      // live old-vs-new as fallback when no snapshot exists.
      const snapshot = await getAttachmentSnapshot(
        newMessage.client,
        newMessage.guild.id,
        newMessage.id,
      );
      const baseline = snapshot.length > 0
        ? snapshot
        : serializeAttachments(oldFull);
      const { removed, added } = diffAttachments(baseline, serializeAttachments(newMessage));

      if (!contentChanged && removed.length === 0 && added.length === 0) return;

      const metaLines = [
        formatLogLine('Channel', newMessage.channel ? `${newMessage.channel.name} ${newMessage.channel.toString()}` : 'Unknown'),
        formatLogLine('Message ID', `\`${newMessage.id}\``),
        formatLogLine('Message author', newMessage.author ? newMessage.author.toString() : 'Unknown'),
        formatLogLine('Message created', `<t:${Math.floor(newMessage.createdTimestamp / 1000)}:R>`),
        `[Jump to Message](${newMessage.url})`,
      ];

      const formatFileLine = (file) => {
        const label = file.name || file.id;
        const link = file.proxyUrl || file.url;
        return `• \`${label}\`${link ? ` — [file](${file.url})${file.proxyUrl ? ` · [proxy](${file.proxyUrl})` : ''}` : ''}`;
      };

      if (removed.length > 0 || added.length > 0) {
        metaLines.push(
          `**Attachments changed:** ${removed.length} removed, ${added.length} added`,
        );
        if (removed.length > 0) {
          metaLines.push(`**Removed:**\n${removed.map(formatFileLine).join('\n')}`);
        }
        if (added.length > 0) {
          metaLines.push(`**Added:**\n${added.map(formatFileLine).join('\n')}`);
        }
      }

      // Removed image evidence, while CDN links are still alive.
      const removedImages = removed
        .filter((file) => file.contentType?.startsWith('image/') && file.url)
        .slice(0, 4)
        .map((file) => file.url);

      const oldContent = oldFull.content || '*(empty message)*';
      const newContent = newMessage.content || '*(empty message)*';
      const oldContentTruncated = oldContent.length > MAX_LOGGED_EDIT_CONTENT_LENGTH
        ? `${oldContent.substring(0, MAX_LOGGED_EDIT_CONTENT_LENGTH - 3)}...`
        : oldContent;
      const newContentTruncated = newContent.length > MAX_LOGGED_EDIT_CONTENT_LENGTH
        ? `${newContent.substring(0, MAX_LOGGED_EDIT_CONTENT_LENGTH - 3)}...`
        : newContent;

      await logEvent({
        client: newMessage.client,
        guildId: newMessage.guild.id,
        eventType: EVENT_TYPES.MESSAGE_EDIT,
        data: {
          title: removed.length > 0 || added.length > 0 ? 'Message attachments edited' : 'Message edited',
          lines: metaLines,
          quoted: true,
          fields: contentChanged ? [
            { name: 'Before', value: oldContentTruncated, inline: true },
            { name: 'After', value: newContentTruncated, inline: true },
          ] : [],
          images: removedImages.length > 0 ? removedImages : undefined,
          userId: newMessage.author?.id,
          channelId: newMessage.channel.id,
        }
      });

      // Re-baseline so the next edit diffs against the new state, and drop
      // the snapshot entry when the message carries no files at all.
      if (serializeAttachments(newMessage).length > 0) {
        await snapshotMessageAttachments(newMessage.client, newMessage).catch(() => null);
      } else {
        await clearAttachmentSnapshot(newMessage.client, newMessage.guild.id, newMessage.id).catch(() => null);
      }

    } catch (error) {
      logger.error('Error in messageUpdate event:', error);
    }
  }
};
