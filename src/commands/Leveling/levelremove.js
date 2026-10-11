import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { MidNightError, ErrorTypes } from '../../utils/errorHandler.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { removeLevels, getUserLevelData, getLevelingConfig } from '../../services/leveling/leveling.js';
import { NO_PINGS, v2Flags } from '../../utils/componentsV2.js';
import { noticeContainer, successContainer } from '../../services/economy/economyViews.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
  data: new SlashCommandBuilder()
    .setName('levelremove')
    .setDescription('Remove levels from a user')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to remove levels from')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('levels')
        .setDescription('Number of levels to remove')
        .setRequired(true)
        .setMinValue(1)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const hasPermission = await checkUserPermissions(
      interaction,
      PermissionFlagsBits.ManageGuild,
      'You need ManageGuild permission to use this command.'
    );
    if (!hasPermission) return;

    const levelingConfig = await getLevelingConfig(client, interaction.guildId);
    if (!levelingConfig?.enabled) {
      await InteractionHelper.safeEditReply(interaction, {
        components: [
          noticeContainer({
            title: 'Leveling Disabled',
            body: 'The leveling system is currently disabled on this server.',
          }),
        ],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });
      return;
    }

    const targetUser = interaction.options.getUser('user');
    const levelsToRemove = interaction.options.getInteger('levels');

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      throw new MidNightError(
        `User ${targetUser.id} not found in this guild`,
        ErrorTypes.USER_INPUT,
        'The specified user is not in this server.'
      );
    }
    const displayName = member.displayName || targetUser.username;

    const userData = await getUserLevelData(client, interaction.guildId, targetUser.id);
    if (userData.level === 0) {
      throw new MidNightError(
        `User ${targetUser.id} is already at minimum level`,
        ErrorTypes.VALIDATION,
        `${displayName} is already at level 0 and cannot have levels removed.`
      );
    }

    const updatedData = await removeLevels(client, interaction.guildId, targetUser.id, levelsToRemove);

    await InteractionHelper.safeEditReply(interaction, {
      components: [
        successContainer({
          title: 'Levels Removed',
          body: `Successfully removed ${levelsToRemove} levels from **${displayName}**.\n**New Level:** \`${updatedData.level}\``,
        }),
      ],
      flags: v2Flags(),
      allowedMentions: NO_PINGS,
    });

    logger.info(
      `[ADMIN] User ${interaction.user.tag} removed ${levelsToRemove} levels from ${targetUser.tag} in guild ${interaction.guildId}`
    );
  }
};