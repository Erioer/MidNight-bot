// leaderboardButtons.js
// Button handlers for the Components V2 leaderboards.
//
// Each button re-runs the read-only part of the matching slash command and
// answers ephemerally, so the public board stays a single shared message while
// the personal numbers are only shown to the person who clicked.

import { MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { container, NO_PINGS, text } from '../utils/componentsV2.js';
import { getEconomyData, getMaxBankCapacity } from '../utils/economy.js';
import { getLevelingConfig, getUserLevelData, getXpForLevel } from '../services/leveling/leveling.js';
import { buildLevelRankContainer } from '../services/leveling/levelRankView.js';
import {
  getCountingGameConfig,
  getCountingLeaderboardPosition,
  getUserStats,
} from '../services/countingGameService.js';
import { getShieldBalance } from '../services/countingGame/countingShields.js';
import { buildCountingStatsContainer } from '../services/countingGame/countingStatsView.js';
import {
  balanceContainer,
  dataErrorContainer,
  getEconomyRank,
} from '../services/economy/economyViews.js';

/** Resolves who a leaderboard button is about, defaulting to the clicker. */
function resolveTargetId(interaction, args) {
  const fromId = args?.[0];
  return typeof fromId === 'string' && /^\d{17,20}$/.test(fromId) ? fromId : interaction.user.id;
}

/**
 * Fetches a member and the avatar to show beside their stats.
 *
 * `avatarUrl` must be returned for the cached/fetched member too, not just the
 * user fallback: without it the rank card silently drops the Section accessory
 * and renders as plain text, which is what `/rank` looks like.
 */
async function resolveMember(interaction, userId) {
  const member = await interaction.guild?.members?.fetch(userId).catch(() => null);
  if (member) {
    return {
      member,
      displayName: member.displayName || member.user?.username || 'Unknown member',
      avatarUrl: member.user?.displayAvatarURL?.({ dynamic: true, size: 256 }),
    };
  }

  const user = await interaction.client.users.fetch(userId).catch(() => null);
  return {
    member: null,
    displayName: user?.username || 'Unknown member',
    avatarUrl: user?.displayAvatarURL?.({ dynamic: true, size: 256 }),
  };
}

function errorContainer(message) {
  return container({ parts: [text(message)] });
}

/** "Your Balance" under /eleaderboard. Renders exactly like `/balance`. */
export const economyBalanceHandler = {
  customId: 'economy_balance',

  async execute(interaction, client, args) {
    try {
      const userId = resolveTargetId(interaction, args);
      const { displayName, avatarUrl } = await resolveMember(interaction, userId);

      const userData = await getEconomyData(client, interaction.guildId, userId);
      if (!userData) {
        await interaction.reply({
          components: [dataErrorContainer({ command: 'balance' })],
          flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
          allowedMentions: NO_PINGS,
        });
        return;
      }

      const maxBank = getMaxBankCapacity(userData);
      const wallet = typeof userData?.wallet === 'number' ? userData.wallet : 0;
      const bank = typeof userData?.bank === 'number' ? userData.bank : 0;
      const { rank, total } = await getEconomyRank(client, interaction.guildId, userId);

      await interaction.reply({
        components: [
          balanceContainer({
            displayName: displayName || `User ${userId}`,
            avatarUrl: avatarUrl || null,
            wallet,
            bank,
            maxBank,
            rank,
            totalMembers: total,
            isSelf: userId === interaction.user.id,
          }),
        ],
        // Both flags must be set on the first response: ephemerality cannot be
        // changed afterwards, and a V2 message may not carry `content`.
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        allowedMentions: NO_PINGS,
      });
    } catch (error) {
      logger.error('Error handling economy balance button:', error);
      throw error;
    }
  },
};

/** "Your Rank" under /leaderboard. */
export const levelRankHandler = {
  customId: 'level_rank',

  async execute(interaction, client, args) {
    try {
      const userId = resolveTargetId(interaction, args);
      const { displayName, avatarUrl } = await resolveMember(interaction, userId);

      const levelingConfig = await getLevelingConfig(client, interaction.guildId);
      if (!levelingConfig?.enabled) {
        await interaction.reply({
          components: [errorContainer('### Leveling Disabled\nThe leveling system is currently disabled on this server.')],
          flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
          allowedMentions: NO_PINGS,
        });
        return;
      }

      const userData = await getUserLevelData(client, interaction.guildId, userId);
      const level = userData?.level ?? 0;

      await interaction.reply({
        components: [
          buildLevelRankContainer({
            displayName,
            avatarUrl,
            level,
            xp: userData?.xp ?? 0,
            totalXp: userData?.totalXp ?? 0,
            xpNeeded: getXpForLevel(level + 1),
            isSelf: userId === interaction.user.id,
          }),
        ],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        allowedMentions: NO_PINGS,
      });
    } catch (error) {
      logger.error('Error handling level rank button:', error);
      throw error;
    }
  },
};

/** "Your Statistics" under /count leaderboard. */
export const countStatsHandler = {
  customId: 'count_stats',

  async execute(interaction, client, args) {
    try {
      const userId = resolveTargetId(interaction, args);
      const { displayName, avatarUrl } = await resolveMember(interaction, userId);

      const config = await getCountingGameConfig(client, interaction.guildId);
      const stats = getUserStats(config, userId);
      const shields = await getShieldBalance(client, interaction.guildId, userId).catch(() => 0);

      await interaction.reply({
        components: [
          buildCountingStatsContainer({
            userId,
            displayName,
            avatarUrl,
            stats: { ...stats, shields },
            position: getCountingLeaderboardPosition(config, userId),
            isSelf: userId === interaction.user.id,
          }),
        ],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        allowedMentions: NO_PINGS,
      });
    } catch (error) {
      logger.error('Error handling count stats button:', error);
      throw error;
    }
  },
};