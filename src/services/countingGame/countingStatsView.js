// countingStatsView.js
// Components V2 layouts for the counting game.
//
// Shared by `/count stats`, `/count rank` and the "Your Statistics" button so
// all three render identically. Every payload here is Components V2: callers
// must send `flags: v2Flags(...)` and must not add `content` or `embeds`,
// because Discord rejects mixing the two on the same message.

import { ButtonStyle } from 'discord.js';
import {
  getAccuracy,
  getCountingSystemLabel,
  getExpectedCountValue,
} from '../countingGameService.js';
import { COUNTING_SHIELD, COUNTING_TIMERS } from '../../config/countingGameConfig.js';
import {
  button,
  code,
  container,
  divider,
  rankLabel,
  row,
  section,
  text,
  thumbnail,
} from '../../utils/componentsV2.js';

/** Custom ID prefix for the leaderboard's "Your Statistics" button. */
export const COUNT_STATS_BUTTON = 'count_stats';

/**
 * Personal counting card: valid counts, ruins, accuracy, daily streak and
 * shields, laid out beside the member's avatar.
 *
 * A Section always needs an accessory, so when there is no avatar to show the
 * same text is emitted as two plain text displays instead.
 */
export function buildCountingStatsContainer({
  userId,
  displayName,
  avatarUrl,
  stats,
  position,
  isSelf = true,
}) {
  const accuracy = getAccuracy(stats).toFixed(1);
  const total = stats.counts + stats.ruins;
  const heading = isSelf ? 'Your Counting' : `${displayName || 'This member'}'s Counting`;

  const header = `### ${heading}\n-# Total counts: ${code(total)}`;
  const body = [
    `${code(stats.counts)} Valid ${stats.counts === 1 ? 'count' : 'counts'}  •  ${code(stats.ruins)} ${stats.ruins === 1 ? 'Ruin' : 'Ruins'}  •  ${code(`${accuracy}%`)} Accuracy`,
    `🔥 ${code(stats.streak)} Day Streak  •  🛡️ ${code(`${stats.shields}/${COUNTING_SHIELD.max}`)} Shields`,
  ].join('\n');

  const card = avatarUrl
    ? section([text(header), text(body)], thumbnail(avatarUrl, `${heading} avatar`))
    : [text(header), text(body)];

  const rankLine = position && position.rank > 0
    ? `You are ranked ${code(`#${position.rank}`)} of ${code(position.total)} members on this server.`
    : 'You have no valid counts on the board yet — be the first to count.';

  return container({
    parts: [
      card,
      divider(),
      text(rankLine),
      text('-# Accuracy is valid counts ÷ (valid counts + ruins). Ruins are recorded when you break the sequence.'),
    ],
  });
}

/**
 * Administrative overview of the configured game. Values are stacked in two
 * labelled groups rather than laid out in columns: Discord renders markdown in
 * a proportional font, so column padding drifts no matter how it is padded.
 */
export function buildCountingStatusContainer({ config, cooldown }) {
  const nextExpected = getExpectedCountValue(config);
  const current = Math.max(0, nextExpected - 1);

  const statusLines = [
    `- Enabled: ${code(config.enabled ? 'Yes' : 'No')}`,
    `- Channel: ${config.channelId ? `<#${config.channelId}>` : 'Not configured'}`,
    `- System: ${code(getCountingSystemLabel(config.system))}`,
    `- Votes needed: ${code(config.restoreVotesRequired || COUNTING_TIMERS.cooldownValidCounts)}`,
  ];

  const gameLines = [
    `- Current count: ${code(current)}`,
    `- Next count: ${code(nextExpected)}`,
    `- Highest record: ${code(config.highestRecord || 0)}`,
    `- Last counter: ${config.lastUserId ? `<@${config.lastUserId}>` : 'None'}`,
  ];

  const parts = [
    text('### Counting Game Status\n-# Overview of the currently configured counting game'),
    text(`**Status**\n${statusLines.join('\n')}`),
    text(`**Game Status**\n${gameLines.join('\n')}`),
  ];

  if (cooldown?.userId) {
    const elapsed = Date.now() - (cooldown.startedAt || 0);
    const remainingSeconds = Math.max(0, Math.ceil((COUNTING_TIMERS.ruinCooldownMs - elapsed) / 1000));
    parts.push(text([
      '**Active Cooldown**',
      `- <@${cooldown.userId}> — ${code(`${cooldown.validCounts || 0}/${COUNTING_TIMERS.cooldownValidCounts}`)} valid counts or ${code(`${remainingSeconds}s`)}`,
    ].join('\n')));
  }

  if (config.restoreVote) {
    const votes = config.restoreVote.voters?.length || 0;
    const required = config.restoreVote.requiredVotes || 0;
    parts.push(text([
      '**Pending Restore Vote**',
      `- Restoring to ${code((config.restoreVote.preRuinCount || 0) + 1)} — ${code(`${votes}/${required}`)} votes`,
    ].join('\n')));
  }

  parts.push(
    divider(),
    text('Use `/count rank` to view your own count statistics.'),
  );

  return container({
    parts,
  });
}

/**
 * Simple titled notice used by the admin subcommands (setup, disable, reset,
 * restore) so every `/count` response is Components V2 rather than mixing V1
 * embeds and V2 containers across the one command.
 */
export function buildCountingNoticeContainer({ title, lines = [] }) {
  return container({
    parts: [
      text(`### ${title}`),
      ...(lines.length > 0 ? [text(lines.join('\n'))] : []),
    ],
  });
}

/**
 * The public "top 10 counters" board. The top three get a second line carrying
 * the detail that will not fit on one; ranks 4-10 stay single line.
 */
export function buildCountingLeaderboardContainers({ rows, total, viewerId, viewerRank }) {
  const lines = rows.length > 0
    ? rows.map((row, index) => {
      const head = `${rankLabel(index)}  **<@${row.userId}>**  •  ${code(`${row.counts} Total`)} (${code(`${row.accuracy}%`)} Acc.)`;
      if (index >= 3) return head;
      return `${head}\n┗  ${code(row.counts)} Valid  •  ${code(row.ruins)} Ruins  •  ${code(`${row.streak}d`)} Streak  •  ${code(`${row.shields}/${COUNTING_SHIELD.max}`)} Shields`;
    })
    : ['No counts have been recorded yet.'];

  const footer = viewerRank > 0
    ? `Your rank is ${code(`#${viewerRank}`)} of ${code(total)} members`
    : 'You have no counts on the board yet';

  return [
    container({
      parts: [
        text(['## 🔢 Count Leaderboard', 'Top 10 Counters', '', ...lines].join('\n')),
        divider(),
        text(footer),
        row(button({
          label: 'Your Statistics',
          customId: `${COUNT_STATS_BUTTON}:${viewerId}`,
          style: ButtonStyle.Success,
        })),
      ],
    }),
  ];
}
