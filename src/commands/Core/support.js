import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { NO_PINGS, container, text, v2Flags } from '../../utils/componentsV2.js';
import { failureContainer } from '../../services/economy/economyViews.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const SUPPORT_SERVER_URL = "https://discord.gg/mMMr46zywH";
export default {
    data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("Get link to the support server"),

  async execute(interaction) {
    try {
      const supportButton = new ButtonBuilder()
        .setLabel("Join Support Server")
        .setStyle(ButtonStyle.Link)
        .setURL(SUPPORT_SERVER_URL);

      const actionRow = new ActionRowBuilder().addComponents(supportButton);

      await InteractionHelper.safeReply(interaction, {
        components: [
          container({
            parts: [
              text('### Need Help?'),
              text('Join our official support server for assistance, report bugs, or suggest features.'),
            ],
          }),
          actionRow,
        ],
        flags: v2Flags({ ephemeral: true }),
        allowedMentions: NO_PINGS,
      });
    } catch (error) {
      logger.error('Support command error:', error);

      try {
        return await InteractionHelper.safeReply(interaction, {
          components: [
            failureContainer({ title: 'System Error', body: 'Could not display support information.' }),
          ],
          flags: v2Flags({ ephemeral: true }),
          allowedMentions: NO_PINGS,
        });
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  },
};