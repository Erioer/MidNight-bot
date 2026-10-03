import { SlashCommandBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { MidNightError, ErrorTypes } from '../../utils/errorHandler.js';
import {
  getLeaderboardSnapshot,
  getLevelingConfig,
  getUserLevelData,
  getXpForLevel,
} from '../../services/leveling/leveling.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  button,
  code,
  container,
  divider,
  NO_PINGS,
  rankLabel,
  row,
  text,
  v2Flags,
} from '../../utils/componentsV2.js';

/** Custom ID prefix for the "Your Rank" button under this board. */
export const LEVEL_RANK_BUTTON = 'level_rank';

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription("Shows the server's level leaderboard")
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const levelingConfig = await getLevelingConfig(client, interaction.guildId);

    if (!levelingConfig?.enabled) {
      await InteractionHelper.safeEditReply(interaction, {
        components: [
          container({
            parts: [text('### Leveling Disabled\nThe leveling system is currently disabled on this server.')],
          }),
        ],
        flags: v2Flags({ ephemeral: true }),
      });
      return;
    }

    // The snapshot reports the full board size, so "your rank" can show
    // "#N of M members" without a second pass over the member list.
    const { entries, total } = await getLeaderboardSnapshot(client, interaction.guildId, 10);

    if (entries.length === 0) {
      throw new MidNightError(
        'No leaderboard data found',
        ErrorTypes.DATABASE,
        'No level data found yet. Start chatting to gain XP!'
      );
    }

    const viewerData = await getUserLevelData(client, interaction.guildId, interaction.user.id);
    const viewerEntry = entries.find((entry) => entry.userId === interaction.user.id);
    const viewerRank = viewerEntry?.rank || viewerData?.rank || 0;

    // Ranks 1-3 carry a second line, because their XP bar plus total does not
    // fit on one line at Discord's font width.
    const rows = entries.map((user, index) => {
      const xpForNextLevel = getXpForLevel(user.level + 1);
      const name = `<@${user.userId}>`;

      if (index < 3) {
        return [
          `${rankLabel(index)}  **${name}**  •  Level ${code(user.level)}`,
          `┗  ${code(`${user.xp.toLocaleString()} / ${xpForNextLevel.toLocaleString()} XP`)}  •  Total: ${code(`${user.totalXp.toLocaleString()} XP`)}`,
        ].join('\n');
      }

      return `${rankLabel(index)}  **${name}**  —  Lv. ${code(user.level)} ${code(`(${user.xp.toLocaleString()}/${xpForNextLevel.toLocaleString()} XP)`)}`;
    });

    const footer = viewerRank > 0
      ? `Your rank is ${code(`#${viewerRank}`)} of ${code(total)} members`
      : 'You have no XP on the board yet — start chatting to appear here';

    const components = [
      container({
        parts: [
          text([
            '## 🏆 Level Leaderboard',
            'Top 10 most active members',
            '',
            ...rows,
          ].join('\n')),
          divider(),
          text(footer),
          row(button({
            label: 'Your Rank',
            customId: `${LEVEL_RANK_BUTTON}:${interaction.user.id}`,
            style: ButtonStyle.Success,
          })),
        ],
      }),
    ];

    await InteractionHelper.safeEditReply(interaction, {
      components,
      flags: v2Flags(),
      allowedMentions: NO_PINGS,
    });
    logger.debug(`Leaderboard displayed for guild ${interaction.guildId}`);
  }
};
