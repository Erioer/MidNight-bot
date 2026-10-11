import { SlashCommandBuilder } from 'discord.js';
import { NO_PINGS, container, gallery, text, v2Flags } from '../../utils/componentsV2.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Display a user's avatar image")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription(
          "The user whose avatar you want to see (defaults to you)",
        ),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("target") || interaction.user;
    const avatarUrl = user.displayAvatarURL({ size: 2048, dynamic: true });

    const avatarContainer = container({
        parts: [
            text(`### ${user.username}'s Avatar`),
            text(`[Download Link](${avatarUrl})`),
            gallery(avatarUrl),
        ],
    });

    await InteractionHelper.safeReply(interaction, { components: [avatarContainer], flags: v2Flags(), allowedMentions: NO_PINGS });
    logger.info(`Avatar command executed`, {
      userId: interaction.user.id,
      targetUserId: user.id,
      guildId: interaction.guildId
    });
  }
};