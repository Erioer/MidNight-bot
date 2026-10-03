// levelRankView.js
// Components V2 layout for the personal level card.
//
// Shared by `/rank` and the level leaderboard's "Your Rank" button so both
// render identically. Callers must send `flags: v2Flags(...)` and must not add
// `content` or `embeds`: Discord rejects mixing V1 and V2 on one message.

import {
  code,
  container,
  divider,
  section,
  text,
  thumbnail,
} from '../../utils/componentsV2.js';

/** Progress bar of `length` cells, filled to `percentage`. */
export function createProgressBar(percentage, length = 20) {
  const clamped = Math.max(0, Math.min(100, percentage || 0));
  const filled = Math.round((clamped / 100) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

/**
 * Level, XP toward the next level, lifetime XP and the progress bar, laid out
 * beside the member's avatar.
 *
 * A Section always requires an accessory, so when there is no avatar the same
 * text is emitted as two plain text displays instead.
 */
export function buildLevelRankContainer({
  displayName,
  avatarUrl,
  level,
  xp,
  totalXp,
  xpNeeded,
  isSelf = true,
}) {
  const progress = xpNeeded > 0 ? Math.floor((xp / xpNeeded) * 100) : 0;
  const heading = isSelf ? 'Your Rank' : `${displayName || 'This member'}'s Rank`;

  const header = `### ${heading}\n-# Level ${code(level)}`;
  const body = [
    `${code(`${xp.toLocaleString()} / ${xpNeeded.toLocaleString()} XP`)} toward level ${code(level + 1)}`,
    `Total XP: ${code(totalXp.toLocaleString())}`,
    `${createProgressBar(progress)} ${code(`${progress}%`)}`,
  ].join('\n');

  const card = avatarUrl
    ? section([text(header), text(body)], thumbnail(avatarUrl, `${heading} avatar`))
    : [text(header), text(body)];

  return container({
    parts: [
      card,
      divider(),
      text(`-# XP resets each level. Total XP is everything you have earned on this server.`),
    ],
  });
}
