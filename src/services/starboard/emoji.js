// emoji.js
// Handles both custom guild emoji (<:name:id> / <a:name:id>) and standard
// unicode emoji (⭐) for the starboard trigger emoji.

const CUSTOM_EMOJI_RE = /^<a?:([a-zA-Z0-9_]{2,32}):(\d{15,21})>$/;

/**
 * Parses a raw command argument into a stored emoji shape:
 *   { id: string|null, name: string, raw: string }
 * - Custom emoji: id is the snowflake, name is the emoji name, raw is exactly
 *   what was typed (used to redisplay it correctly, animated or not).
 * - Unicode emoji: id is null, name === raw === the unicode character(s).
 * Returns null if the input is empty/unusable.
 */
export function parseEmojiInput(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const match = trimmed.match(CUSTOM_EMOJI_RE);
  if (match) {
    return { id: match[2], name: match[1], raw: trimmed };
  }

  // Not a <:name:id> pattern — treat as unicode. Not validated against a full
  // emoji table (no dependency for it); a bad non-emoji string simply never
  // matches a real reaction, so the starboard just won't trigger.
  return { id: null, name: trimmed, raw: trimmed };
}

/** Compares the guild's configured emoji against a live reaction's emoji (reaction.emoji). */
export function emojiMatches(storedEmoji, reactionEmoji) {
  if (!storedEmoji || !reactionEmoji) return false;
  if (storedEmoji.id) {
    return reactionEmoji.id === storedEmoji.id;
  }
  return !reactionEmoji.id && reactionEmoji.name === storedEmoji.name;
}

/** Returns the exact string to show the emoji correctly in a message (e.g. the star count line). */
export function displayEmoji(storedEmoji) {
  return storedEmoji.raw;
}
