import { MessageFlags } from 'discord.js';
import { NO_PINGS, container, divider, text } from '../utils/componentsV2.js';
import { successContainer } from '../services/economy/economyViews.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { performDeletionByCounterId } from '../commands/ServerStats/modules/serverstats_delete.js';
import { logger } from '../utils/logger.js';
import { ErrorTypes, replyUserError, handleInteractionError } from '../utils/errorHandler.js';

export const counterDeleteActionHandler = {
  name: 'counter-delete',
  async execute(interaction, client, args = []) {
    try {
      
      try {
        await interaction.deferUpdate();
      } catch (error) {
        logger.error("Failed to defer button interaction:", error);
        return;
      }

      const [action, counterId, ownerId] = args;

      if (!interaction.inGuild()) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'This action can only be used in a server.' }).catch(logger.error);
        return;
      }

      if (!action || !counterId) {
        await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Counter delete action data is missing.' }).catch(logger.error);
        return;
      }

      if (ownerId && interaction.user.id !== ownerId) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Only the user who initiated this deletion can use these buttons.' }).catch(logger.error);
        return;
      }

      if (action === 'cancel') {
        await interaction.editReply({
          components: [
            container({
              parts: [
                text('### Cancelled'),
                text('Counter deletion cancelled.'),
              ],
            }),
          ],
          flags: MessageFlags.IsComponentsV2,
        }).catch(logger.error);
        return;
      }

      if (action !== 'confirm') {
        await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Unknown counter delete action.' }).catch(logger.error);
        return;
      }

      const { message } = await performDeletionByCounterId(client, interaction.guild, counterId);

      await logEvent({
        client,
        guildId: interaction.guild.id,
        eventType: EVENT_TYPES.COUNTER_CONFIG,
        data: {
          title: 'Counter Deleted',
          lines: [
            `**Counter ID:** \`${counterId}\``,
          ],
          actor: {
            id: interaction.user.id,
            displayName: interaction.member?.displayName || interaction.user.username,
            avatarUrl: interaction.user.displayAvatarURL(),
          },
        },
      }).catch(() => null);

      const detailBody = message
        .replace(/^✅\s*\*\*Counter Deleted Successfully!\*\*/, '')
        .trim();
      await interaction.editReply({
        components: [
          successContainer({
            title: 'Counter Deleted',
            body: detailBody,
          }),
        ],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: NO_PINGS,
      }).catch(logger.error);
    } catch (error) {
      await handleInteractionError(interaction, error, {
        type: 'button',
        handler: 'counter_delete',
        customId: interaction.customId,
      });
    }
  }
};

export default counterDeleteActionHandler;