import { SlashCommandBuilder, ButtonStyle } from 'discord.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyPrefix } from '../../utils/database.js';
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

/** Custom ID prefix for the "Your Balance" button under this board. */
export const ECONOMY_BALANCE_BUTTON = 'economy_balance';

export default {
    data: new SlashCommandBuilder()
        .setName("eleaderboard")
        .setDescription("View the server's top 10 richest users.")
        .setDMPermission(false),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

            const guildId = interaction.guildId;

            logger.debug(`[ECONOMY] Leaderboard requested`, { guildId });

            const prefix = getEconomyPrefix(guildId);

            let allKeys = await client.db.list(prefix);

            if (!Array.isArray(allKeys)) {
                allKeys = [];
            }

            if (allKeys.length === 0) {
                throw createError(
                    "No economy data found",
                    ErrorTypes.VALIDATION,
                    "No economy data found for this server."
                );
            }

            let allUserData = [];

            for (const key of allKeys) {
                const userId = key.replace(prefix, "");
                const userData = await client.db.get(key);

                if (userData) {
                    allUserData.push({
                        userId: userId,
                        net_worth: (userData.wallet || 0) + (userData.bank || 0),
                    });
                }
            }

            allUserData.sort((a, b) => b.net_worth - a.net_worth);

            const topUsers = allUserData.slice(0, 10);
            const userRank =
                allUserData.findIndex((u) => u.userId === interaction.user.id) +
                1;

            logger.info(`[ECONOMY] Leaderboard generated`, {
                guildId,
                userCount: allUserData.length,
                userRank
            });

            // Currency is wrapped in inline code so the column keeps a fixed
            // width; Discord's markdown font is proportional and would drift.
            const rows = topUsers.map((user, index) =>
                `${rankLabel(index)}  **<@${user.userId}>**  —  ${code(`$${user.net_worth.toLocaleString()}`)}`,
            );

            const footer = userRank > 0
                ? `Your rank is ${code(`#${userRank}`)} of ${code(allUserData.length)} members`
                : 'You have no economy account on this server yet';

            const components = [
                container({
                    parts: [
                        text([
                            '## 💹 Economy Leaderboard',
                            'Top 10 most wealthiest members',
                            '',
                            ...rows,
                        ].join('\n')),
                        divider(),
                        text(footer),
                        row(button({
                            label: 'Your Balance',
                            customId: `${ECONOMY_BALANCE_BUTTON}:${interaction.user.id}`,
                            style: ButtonStyle.Success,
                        })),
                    ],
                }),
            ];

            // `flags` carries IsComponentsV2 only: `content` and `embeds` are
            // rejected on a V2 message, so all text lives in the containers.
            await InteractionHelper.safeEditReply(interaction, {
                components,
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });
    }, { command: 'eleaderboard' })
};
