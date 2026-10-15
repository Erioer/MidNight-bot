import { getGuildMessageAttachmentsKey } from '../utils/database/keys.js';
import { logger } from '../utils/logger.js';

// Attachment snapshots close the "swap the evidence" loophole: client mods
// can replace a message's attachments via edit, and the gateway only hands us
// the new state when the old message isn't cached. Snapshotting metadata on
// create means edits can always be diffed, with or without cache.
//
// Metadata only (no file bytes) with a 7-day TTL — enough for moderation
// review, self-cleaning afterwards. Discord CDN URLs for removed files decay
// over time, so the log also carries proxy URLs, which survive longer.

const SNAPSHOT_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_SNAPSHOTS = 20;

function serializeAttachment(attachment) {
  return {
    id: attachment.id,
    name: attachment.name || 'attachment',
    url: attachment.url || null,
    proxyUrl: attachment.proxyURL || null,
    contentType: attachment.contentType || null,
    size: attachment.size || 0,
  };
}

export function serializeAttachments(message) {
  return [...(message?.attachments?.values() || [])].map(serializeAttachment).slice(0, MAX_SNAPSHOTS);
}

/** Stores the attachment state of a fresh message. No attachments → no-op. */
export async function snapshotMessageAttachments(client, message) {
  try {
    if (!client?.db || !message?.guildId || !message?.id) {
      return;
    }
    const files = serializeAttachments(message);
    if (files.length === 0) {
      return;
    }
    await client.db.set(
      getGuildMessageAttachmentsKey(message.guildId, message.id),
      { attachments: files, takenAt: Date.now() },
      SNAPSHOT_TTL_SECONDS,
    );
  } catch (error) {
    logger.debug('Attachment snapshot failed:', error?.message || error);
  }
}

export async function getAttachmentSnapshot(client, guildId, messageId) {
  try {
    if (!client?.db || !guildId || !messageId) {
      return [];
    }
    const record = await client.db.get(getGuildMessageAttachmentsKey(guildId, messageId), null);
    const files = record?.attachments;
    return Array.isArray(files) ? files : [];
  } catch {
    return [];
  }
}

export async function clearAttachmentSnapshot(client, guildId, messageId) {
  try {
    if (!client?.db?.delete || !guildId || !messageId) {
      return;
    }
    await client.db.delete(getGuildMessageAttachmentsKey(guildId, messageId));
  } catch {
    // Hygiene only — TTL cleans up regardless.
  }
}

/**
 * Diffs two attachment states by ID. Returns { removed, added } using the
 * serialised shape above.
 */
export function diffAttachments(before, after) {
  const beforeIds = new Set((before || []).map((file) => file?.id).filter(Boolean));
  const afterIds = new Set((after || []).map((file) => file?.id).filter(Boolean));
  return {
    removed: (before || []).filter((file) => file?.id && !afterIds.has(file.id)),
    added: (after || []).filter((file) => file?.id && !beforeIds.has(file.id)),
  };
}
