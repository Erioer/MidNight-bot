// componentsV2.js
// Shared builders for Components V2 messages.
//
// Discord rules this module exists to enforce:
//   - Once `MessageFlags.IsComponentsV2` is set, `content`, `embeds`, `stickers`
//     and `poll` are rejected on that message. All visible text must therefore
//     live inside a Text Display component.
//   - A message can never be converted between V1 and V2 after it is sent, so a
//     command must not mix these components with embeds in the same payload —
//     not even across a defer/edit chain.
//   - A V2 message carries at most 40 components (nested ones included) and
//     4,000 characters of text in total.
//
// Because of the second rule, every helper here returns bare components; the
// caller owns the `flags` and must use `v2Flags()` for the payload.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';

/**
 * Suppresses every mention ping for a V2 payload.
 *
 * Discord renders mentions inside Text Display components and treats them
 * exactly like message content, so `<@id>` really does ping that user. A
 * leaderboard lists members who never asked to be pinged, so every V2 payload
 * built from these helpers sends this.
 */
export const NO_PINGS = Object.freeze({ parse: [] });

/** Total component budget for a single V2 message. */
export const V2_COMPONENT_LIMIT = 40;

/** Total text budget for a single V2 message. */
export const V2_TEXT_LIMIT = 4000;

/**
 * Builds the flag set for a V2 payload.
 *
 * Note: `Ephemeral` is only honoured on the *first* response to an
 * interaction. `InteractionHelper.sanitizeEditReplyOptions` deliberately strips
 * every flag except `IsComponentsV2` when editing, because ephemerality is
 * already fixed by then. So pass `{ ephemeral: true }` when deferring, and
 * plain `v2Flags()` on the edit that carries the components.
 */
export function v2Flags({ ephemeral = false } = {}) {
  const base = MessageFlags.IsComponentsV2 ?? 0;
  return ephemeral ? base | MessageFlags.Ephemeral : base;
}

/** True when the installed discord.js understands Components V2. */
export function supportsComponentsV2() {
  return typeof MessageFlags.IsComponentsV2 === 'number';
}

/** A block of markdown. This is the only place visible text may live. */
export function text(content) {
  return new TextDisplayBuilder().setContent(String(content ?? ''));
}

/** A divider line. Pass a spacing size to control the gap. */
export function divider(spacing = SeparatorSpacingSize.Small) {
  return new SeparatorBuilder().setSpacing(spacing).setDivider(true);
}

/** Vertical breathing room with no line drawn. */
export function spacer(spacing = SeparatorSpacingSize.Large) {
  return new SeparatorBuilder().setSpacing(spacing).setDivider(false);
}

/** One or more images rendered as a media gallery. Falsy URLs are dropped. */
export function gallery(...urls) {
  return new MediaGalleryBuilder().addItems(
    urls.filter(Boolean).map((url) => new MediaGalleryItemBuilder().setURL(url)),
  );
}

/** An avatar/logo rendered as a section accessory. */
export function thumbnail(url, description) {
  const builder = new ThumbnailBuilder().setURL(url);
  return description ? builder.setDescription(description) : builder;
}

/** A button. Supply `url` for a link button, otherwise `customId`. */
export function button({ label, customId, url, emoji, style, disabled = false }) {
  const builder = new ButtonBuilder().setLabel(label);
  if (url) builder.setURL(url);
  else builder.setCustomId(customId);
  if (emoji) builder.setEmoji(emoji);
  if (disabled) builder.setDisabled(true);

  if (!style) {
    builder.setStyle(url ? ButtonStyle.Link : ButtonStyle.Secondary);
  } else {
    builder.setStyle(style);
  }

  return builder;
}

/** An action row holding up to five buttons or one select menu. */
export function row(...components) {
  return new ActionRowBuilder().addComponents(components.flat().filter(Boolean));
}

/**
 * Text stacked beside a single accessory (thumbnail or button).
 * Discord allows 1-3 text displays and exactly one accessory per section.
 */
export function section(texts, accessory) {
  const builder = new SectionBuilder().addTextDisplayComponents(
    ...[texts].flat().filter(Boolean).map((content) => (typeof content === 'string' ? text(content) : content)),
  );
  if (accessory) {
    // discord.js exposes two named setters rather than a generic one.
    if (accessory instanceof ThumbnailBuilder) builder.setThumbnailAccessory(accessory);
    else if (accessory instanceof ButtonBuilder) builder.setButtonAccessory(accessory);
    else throw new TypeError(`Unsupported section accessory: ${accessory?.constructor?.name}`);
  }
  return builder;
}

function appendPart(builder, part) {
  if (part instanceof TextDisplayBuilder) builder.addTextDisplayComponents(part);
  else if (part instanceof SeparatorBuilder) builder.addSeparatorComponents(part);
  else if (part instanceof MediaGalleryBuilder) builder.addMediaGalleryComponents(part);
  else if (part instanceof ActionRowBuilder) builder.addActionRowComponents(part);
  else if (part instanceof SectionBuilder) builder.addSectionComponents(part);
  else throw new TypeError(`Unsupported Components V2 part: ${part?.constructor?.name}`);
  return builder;
}

/**
 * Assembles a container from already-built parts, preserving their order.
 * Nested containers are not allowed by Discord, so they are rejected here
 * rather than failing at the API with an opaque 400.
 *
 * Accent colours are intentionally not set: a plain container reads cleaner
 * than a coloured bar for these dense stat blocks.
 */
export function container({ spoiler = false, parts = [] } = {}) {
  const builder = new ContainerBuilder();
  if (spoiler) builder.setSpoiler(true);
  for (const part of parts.flat().filter(Boolean)) appendPart(builder, part);
  return builder;
}

/**
 * Flattened length of a component payload, for the 40-component budget.
 * Nested children count toward the limit.
 */
export function countComponents(components) {
  let total = 0;
  for (const component of components.flat().filter(Boolean)) {
    total += 1;
    const children = component.toJSON?.().components;
    if (Array.isArray(children)) {
      for (const child of children) {
        total += 1;
        const grandchildren = child.components;
        if (Array.isArray(grandchildren)) total += grandchildren.length;
      }
    }
  }
  return total;
}

/** Total markdown characters across a component payload, for the 4,000 budget. */
export function countText(components) {
  let total = 0;
  for (const component of components.flat().filter(Boolean)) {
    const data = component.toJSON?.();
    if (!data) continue;
    if (typeof data.content === 'string') total += data.content.length;
    if (Array.isArray(data.components)) {
      for (const child of data.components) {
        if (typeof child?.content === 'string') total += child.content.length;
      }
    }
  }
  return total;
}

/** Wraps a value in inline code so digits and currency keep a fixed width. */
export function code(value) {
  return `\`${String(value)}\``;
}

/** `01`-style zero-padded rank label. */
export function rankLabel(index, width = 2) {
  return String(index + 1).padStart(width, '0');
}
