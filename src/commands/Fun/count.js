import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  getCountingGameConfig,
  activateCountingGame,
  disableCountingGame,
  resetCountingGame,
  buildCountingLeaderboard,
  getCountingSystemChoices,
  getCountingSystemLabel,
  getExpectedCountValue,
  getUserStats,
  getAccuracy,
} from '../../services/countingGameService.js';
import { restoreCount } from '../../services/countingGame/countingHandler.js';
import { getShieldBalance } from '../../services/countingGame/countingShields.js';
import { COUNTING_SHIELD, COUNTING_TIMERS } from '../../config/countingGameConfig.js';
import { logger } from '../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
  data: new SlashCommandBuilder()
    .setName('count')
    .setDescription('Manage the server counting game')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.ManageChannels)
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
      subcommand.setName('disable').setDescription('Disable the counting game for this server'),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('View current counting game status'),
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
      subcommand
        .setName('restore')
        .setDescription('Instantly revert a broken count to its pre-ruin value'),
    ),
  category: 'Fun',

  async execute(interaction) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) {
        logger.warn('Count command defer failed', { userId: interaction.user.id, guildId: interaction.guildId });
        return;
      }

      const canManage = Boolean(
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
        || interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels),
      );

      if (!canManage) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the **Manage Server** or **Manage Channels** permission to use this command.' });
      }

      const guildId = interaction.guildId;
      const subcommand = interaction.options.getSubcommand();
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
          embeds: [
            successEmbed(
              'Counting Game Enabled',
              [
                `The counting game is now active in ${channel} using the **${getCountingSystemLabel(system)}** system.`,
                'Players count up from **1** and may not post two numbers in a row.',
                '',
                '**Accepted input**',
                '- Numbers, math (`4*4`, `32/2`, `4^2`), and words (`one`, `first`, `twenty-four`, `one hundred`)',
                '- Chatter after a count needs `\\` — e.g. `55 \\ we got this to hundred`',
                '- `\\ chat only` is treated as normal conversation',
                '',
                `**Restore votes needed:** ${activated.restoreVotesRequired} (react 🔄 on the ruin embed)`,
              ].join('\n'),
            ),
          ],
        });
      }

      if (subcommand === 'disable') {
        if (!config.enabled) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [infoEmbed('Counting Game Disabled', 'The counting game is already disabled for this server.')],
          });
        }

        await disableCountingGame(interaction.client, guildId);
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Counting Game Disabled', 'The counting game has been disabled.')],
        });
      }

      if (subcommand === 'status') {
        const cooldown = config.cooldown;
        const myShields = await getShieldBalance(interaction.client, guildId, interaction.user.id);
        const myStats = getUserStats(config, interaction.user.id);

        const fields = [
          { name: 'Enabled', value: config.enabled ? 'Yes' : 'No', inline: true },
          { name: 'Channel', value: config.channelId ? `<#${config.channelId}>` : 'Not configured', inline: true },
          { name: 'System', value: getCountingSystemLabel(config.system), inline: true },
          { name: 'Next count', value: getExpectedCountValue(config), inline: true },
          { name: 'Highest record', value: `${config.highestRecord || 0}`, inline: true },
          { name: 'Current streak', value: `${config.currentStreak || 0}`, inline: true },
          { name: 'Best streak', value: `${config.bestStreak || 0}`, inline: true },
          { name: 'Last counter', value: config.lastUserId ? `<@${config.lastUserId}>` : 'None', inline: true },
          { name: 'Restore votes needed', value: `${config.restoreVotesRequired || 3}`, inline: true },
          {
            name: 'Your shields',
            value: `${myShields}/${COUNTING_SHIELD.max}`,
            inline: true,
          },
          {
            name: 'Your counting',
            value: [
              `${myStats.counts} valid count${myStats.counts === 1 ? '' : 's'}`,
              `💥 ${myStats.ruins} ruin${myStats.ruins === 1 ? '' : 's'}`,
              `🔥 ${myStats.streak}🔥 day streak`,
              `🎯 ${getAccuracy(myStats).toFixed(1)}% accuracy`,
            ].join('\n'),
            inline: true,
          },
        ];

        if (cooldown?.userId) {
          const elapsed = Date.now() - (cooldown.startedAt || 0);
          const remainingSeconds = Math.max(0, Math.ceil((COUNTING_TIMERS.ruinCooldownMs - elapsed) / 1000));
          fields.push({
            name: 'Active cooldown',
            value: `<@${cooldown.userId}> — ${cooldown.validCounts || 0}/${COUNTING_TIMERS.cooldownValidCounts} valid counts or ${remainingSeconds}s`,
            inline: false,
          });
        }

        if (config.restoreVote) {
          fields.push({
            name: 'Pending restore vote',
            value: `Restoring to **${(config.restoreVote.preRuinCount || 0) + 1}** — ${config.restoreVote.voters.length}/${config.restoreVote.requiredVotes} votes`,
            inline: false,
          });
        }

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Counting Game Status',
              description: 'Overview of the currently configured counting game.',
              fields,
              color: 'primary',
            }),
          ],
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
          embeds: [
            successEmbed(
              'Count Restored',
              `The sequence was reverted to **${result.restoredTo}** by <@${interaction.user.id}>. Start again with **${result.restoredTo}** in <#${config.channelId}>.`,
            ),
          ],
        });
      }

      if (subcommand === 'reset') {
        if (!config.enabled) {
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Enable the counting game first with `/count setup`.' });
        }

        const startNumber = interaction.options.getInteger('start') || 1;
        await resetCountingGame(interaction.client, guildId, startNumber);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Counting Game Reset',
              `The counting sequence has been reset. Start again with **${startNumber}** in <#${config.channelId}>.`,
            ),
          ],
        });
      }

      if (subcommand === 'leaderboard') {
        const lines = await buildCountingLeaderboard(config, interaction);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Counting Game Leaderboard',
              description: lines.length > 0 ? lines.join('\n') : 'No counts have been recorded yet.',
              color: 'primary',
              fields: [
                { name: 'Counts', value: 'Total valid counts', inline: true },
                { name: 'Streak', value: 'Consecutive days active', inline: true },
                { name: 'Ruins', value: 'Times the count was broken', inline: true },
                { name: 'Accuracy', value: 'Valid / (valid + ruins)', inline: true },
                { name: 'Shield', value: 'Active shields held', inline: true },
              ],
            }),
          ],
        });
      }

      return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Please choose a valid counting game action.' });
    } catch (error) {
      logger.error('Count command error:', error);
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Something went wrong while managing the counting game.' });
    }
  },
};
