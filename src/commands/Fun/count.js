import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  getCountingGameConfig,
  activateCountingGame,
  disableCountingGame,
  resetCountingGame,
  collectCountingLeaderboard,
  getCountingLeaderboardPosition,
  getCountingSystemChoices,
  getCountingSystemLabel,
  getUserStats,
} from '../../services/countingGameService.js';
import { restoreCount } from '../../services/countingGame/countingHandler.js';
import { getShieldBalance } from '../../services/countingGame/countingShields.js';
import {
  buildCountingLeaderboardContainers,
  buildCountingNoticeContainer,
  buildCountingStatsContainer,
  buildCountingStatusContainer,
} from '../../services/countingGame/countingStatsView.js';
import { NO_PINGS, v2Flags } from '../../utils/componentsV2.js';
import { logger } from '../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

/**
 * Subcommands whose reply is visible to the whole server. Everything else is
 * ephemeral, because it is either personal or an admin-only confirmation.
 */
const PUBLIC_SUBCOMMANDS = new Set(['leaderboard', 'status']);

/** Subcommands that require Manage Server / Manage Channels. */
const MANAGEMENT_SUBCOMMANDS = new Set(['setup', 'disable', 'reset', 'restore']);

/**
 * Discord rule this command depends on: a message can never be converted
 * between V1 and V2. So `IsComponentsV2` is only ever set on the *final*
 * response, and every error path returns before that point.
 */
export default {
  data: new SlashCommandBuilder()
    .setName('count')
    .setDescription('Manage the server counting game')
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Start a counting game in a text channel')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('The channel where counting will take place')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) =>
          option
            .setName('system')
            .setDescription('The counting system to use')
            .setRequired(true)
            .addChoices(...getCountingSystemChoices()),
        )
        .addIntegerOption((option) =>
          option
            .setName('votes')
            .setDescription('Reactions needed to restore a broken count via community vote')
            .setMinValue(1)
            .setMaxValue(25),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('Disable the counting game for this server'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('View current counting game status'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('Reset the current counting sequence')
        .addIntegerOption((option) =>
          option
            .setName('start')
            .setDescription('The number to start at after reset')
            .setMinValue(1),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('leaderboard').setDescription('Show the counting game leaderboard'),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('stats').setDescription('Show your counting statistics')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('Whose statistics to show')
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('rank').setDescription('Show your position on the counting leaderboard')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('Whose rank to show')
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('restore')
        .setDescription('Instantly revert a broken count to its pre-ruin value'),
    ),
  category: 'Fun',

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const isPublic = PUBLIC_SUBCOMMANDS.has(subcommand);

      // Ephemeral is fixed by the defer, so it has to be requested here. The
      // edit that follows carries `IsComponentsV2` only.
      const deferSuccess = await InteractionHelper.safeDefer(
        interaction,
        isPublic ? {} : { flags: MessageFlags.Ephemeral },
      );
      if (!deferSuccess) {
        logger.warn('Count command defer failed', { userId: interaction.user.id, guildId: interaction.guildId });
        return;
      }

      const isAdmin = Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
      const canManage = Boolean(
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
        || interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels),
      );

      if (subcommand === 'status' && !isAdmin) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the **Administrator** permission to view the counting game status panel.' });
      }

      if (MANAGEMENT_SUBCOMMANDS.has(subcommand) && !canManage) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the **Manage Server** or **Manage Channels** permission to use this command.' });
      }

      const guildId = interaction.guildId;
      const config = await getCountingGameConfig(interaction.client, guildId);

      if (subcommand === 'setup') {
        const channel = interaction.options.getChannel('channel');
        const system = interaction.options.getString('system');
        const votes = interaction.options.getInteger('votes') || null;
        if (!channel || channel.type !== ChannelType.GuildText) {
          return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Please choose a text channel for the counting game.' });
        }

        if (config.enabled && config.channelId && config.channelId !== channel.id) {
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `This server already has an active counting channel configured: <#${config.channelId}>. Disable the current counting game first, or use that existing channel.` });
        }

        const activated = await activateCountingGame(interaction.client, guildId, channel.id, system, {
          restoreVotes: votes,
        });

        return await InteractionHelper.safeEditReply(interaction, {
          components: [
            buildCountingNoticeContainer({
              title: '✅ Counting Game Enabled',
              lines: [
                `The counting game is now active in ${channel} using the **${getCountingSystemLabel(system)}** system.`,
                'Players count up from **1** and may not post two numbers in a row.',
                '',
                '**Accepted input**',
                '- Numbers, math (`4*4`, `32/2`, `4^2`), and words (`one`, `first`, `twenty-four`, `one hundred`)',
                '- Chatter after a count needs `\\` — e.g. `55 \\ we got this to hundred`',
                '- `\\ chat only` is treated as normal conversation',
                '',
                `**Restore votes needed:** ${activated.restoreVotesRequired} (react 🔄 on the ruin embed)`,
              ],
            }),
          ],
          flags: v2Flags(),
          allowedMentions: NO_PINGS,
        });
      }

      if (subcommand === 'disable') {
        if (!config.enabled) {
          return await InteractionHelper.safeEditReply(interaction, {
            components: [
              buildCountingNoticeContainer({
                title: 'Counting Game Disabled',
                lines: ['The counting game is already disabled for this server.'],
              }),
            ],
            flags: v2Flags(),
            allowedMentions: NO_PINGS,
          });
        }

        await disableCountingGame(interaction.client, guildId);
        return await InteractionHelper.safeEditReply(interaction, {
          components: [
            buildCountingNoticeContainer({
              title: 'Counting Game Disabled',
              lines: ['The counting game has been disabled.'],
            }),
          ],
          flags: v2Flags(),
          allowedMentions: NO_PINGS,
        });
      }

      if (subcommand === 'status') {
        const components = [
          buildCountingStatusContainer({ config, cooldown: config.cooldown }),
        ];

        return await InteractionHelper.safeEditReply(interaction, {
          components,
          flags: v2Flags(),
          allowedMentions: NO_PINGS,
        });
      }

      if (subcommand === 'restore') {
        if (!config.enabled) {
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Enable the counting game first with `/count setup`.' });
        }

        const result = await restoreCount({
          client: interaction.client,
          guild: interaction.guild,
          messageId: config.restoreVote?.messageId || null,
          method: 'admin_command',
          actor: interaction.user.id,
        });

        return await InteractionHelper.safeEditReply(interaction, {
          components: [
            buildCountingNoticeContainer({
              title: 'Count Restored',
              lines: [
                `The sequence was reverted to **${result.restoredTo}** by <@${interaction.user.id}>. Start again with **${result.restoredTo}** in <#${config.channelId}>.`,
              ],
            }),
          ],
          flags: v2Flags(),
          allowedMentions: NO_PINGS,
        });
      }

      if (subcommand === 'reset') {
        if (!config.enabled) {
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Enable the counting game first with `/count setup`.' });
        }

        const startNumber = interaction.options.getInteger('start') || 1;
        await resetCountingGame(interaction.client, guildId, startNumber);

        return await InteractionHelper.safeEditReply(interaction, {
          components: [
            buildCountingNoticeContainer({
              title: 'Counting Game Reset',
              lines: [`The counting sequence has been reset. Start again with **${startNumber}** in <#${config.channelId}>.`],
            }),
          ],
          flags: v2Flags(),
          allowedMentions: NO_PINGS,
        });
      }

      if (subcommand === 'leaderboard') {
        const { rows, total } = await collectCountingLeaderboard(config, interaction);
        const { rank: viewerRank } = getCountingLeaderboardPosition(config, interaction.user.id);

        const components = buildCountingLeaderboardContainers({
          rows,
          total,
          viewerId: interaction.user.id,
          viewerRank,
        });

        return await InteractionHelper.safeEditReply(interaction, {
          components,
          flags: v2Flags(),
          allowedMentions: NO_PINGS,
        });
      }

      if (subcommand === 'stats' || subcommand === 'rank') {
        const target = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);

        const stats = getUserStats(config, target.id);
        // The shield ledger lives in the economy inventory, not the counting doc.
        const shields = await getShieldBalance(interaction.client, guildId, target.id).catch(() => 0);

        const components = [
          buildCountingStatsContainer({
            userId: target.id,
            displayName: member?.displayName || target.username,
            avatarUrl: member?.displayAvatarURL?.({ dynamic: true, size: 256 }) || target.displayAvatarURL?.({ dynamic: true, size: 256 }),
            stats: { ...stats, shields },
            position: getCountingLeaderboardPosition(config, target.id),
            isSelf: target.id === interaction.user.id,
          }),
        ];

        return await InteractionHelper.safeEditReply(interaction, {
          components,
          flags: v2Flags(),
          allowedMentions: NO_PINGS,
        });
      }

      return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Please choose a valid counting game action.' });
    } catch (error) {
      logger.error('Count command error:', error);
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Something went wrong while managing the counting game.' });
    }
  },
};
