import { PermissionsBitField, ChannelType } from 'discord.js';
import { setLogChannel, logEvent, EVENT_TYPES } from '../../../services/loggingService.js';
import { NO_PINGS, v2Flags } from '../../../utils/componentsV2.js';
import { successContainer } from '../../../services/economy/economyViews.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
const DESTINATION_LABELS = {
  audit: 'Audit Log',
  applications: 'Applications',
  reports: 'Reports',
};

export default {
  prefixOnly: false,
  async execute(interaction, config, client) {
    try {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need **Manage Server** permissions to configure logging channels.' });
      }

      await InteractionHelper.safeDefer(interaction, { ephemeral: true });

      const destination = interaction.options.getString('destination');
      const channel = interaction.options.getChannel('channel');
      const disable = interaction.options.getBoolean('disable') ?? false;

      if (disable) {
        await setLogChannel(client, interaction.guildId, destination, null);
        await logEvent({
          client,
          guildId: interaction.guildId,
          eventType: EVENT_TYPES.LOGGING_CONFIG,
          data: {
            title: 'Log Channel Cleared',
            lines: [
              `**Destination:** ${DESTINATION_LABELS[destination]}`,
            ],
            actor: {
              id: interaction.user.id,
              displayName: interaction.member?.displayName || interaction.user.username,
              avatarUrl: interaction.user.displayAvatarURL(),
            },
          },
        }).catch(() => null);
        return InteractionHelper.safeEditReply(interaction, {
          components: [
            successContainer({
              title: 'Channel Cleared',
              body: `The **${DESTINATION_LABELS[destination]}** channel has been removed.`,
            }),
          ],
          flags: v2Flags(),
          allowedMentions: NO_PINGS,
        });
      }

      if (!channel || channel.type !== ChannelType.GuildText) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Please provide a valid text channel.' });
      }

      const botPerms = channel.permissionsFor(interaction.guild.members.me);
      if (!botPerms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: `I need **View Channel**, **Send Messages**, and **Embed Links** in ${channel}.` });
      }

      await setLogChannel(client, interaction.guildId, destination, channel.id);

      await logEvent({
        client,
        guildId: interaction.guildId,
        eventType: EVENT_TYPES.LOGGING_CONFIG,
        data: {
          title: 'Log Channel Updated',
          lines: [
            `**Destination:** ${DESTINATION_LABELS[destination]}`,
            `**Channel:** ${channel}`,
          ],
          actor: {
            id: interaction.user.id,
            displayName: interaction.member?.displayName || interaction.user.username,
            avatarUrl: interaction.user.displayAvatarURL(),
          },
        },
      }).catch(() => null);

      return InteractionHelper.safeEditReply(interaction, {
        components: [
          successContainer({
            title: 'Channel Updated',
            body: `**${DESTINATION_LABELS[destination]}** logs will be sent to ${channel}.\nUse \`/logging dashboard\` to toggle event categories.`,
          }),
        ],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });
    } catch (error) {
      logger.error('logging_channel error:', error);
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Failed to update the log channel.' });
    }
  },
};
