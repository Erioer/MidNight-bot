import { SlashCommandBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { MidNightError, ErrorTypes } from '../../utils/errorHandler.js';
import { getUserLevelData, getLevelingConfig, getXpForLevel } from '../../services/leveling/leveling.js';
import { buildLevelRankContainer } from '../../services/leveling/levelRankView.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  container,
  NO_PINGS,
  text,
  v2Flags,
} from '../../utils/componentsV2.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription("Check your or another user's rank and level")
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to check the rank of')
        .setRequired(false)
    )
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
        // Ephemeral was already claimed by the defer; `v2Flags()` keeps only the
        // V2 bit, which is the only flag an edit can still change.
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });
      return;
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (!member) {
      throw new MidNightError(
        `User ${targetUser.id} not found in guild`,
        ErrorTypes.USER_INPUT,
        'Could not find the specified user in this server.'
      );
    }

    const userData = await getUserLevelData(client, interaction.guildId, targetUser.id);

    const components = buildLevelRankContainer({
      displayName: member.displayName || targetUser.username,
      avatarUrl: member.displayAvatarURL({ dynamic: true, size: 256 }),
      level: userData?.level ?? 0,
      xp: userData?.xp ?? 0,
      totalXp: userData?.totalXp ?? 0,
      xpNeeded: getXpForLevel((userData?.level ?? 0) + 1),
      isSelf: targetUser.id === interaction.user.id,
    });

    // `components` must be an array: MessagePayload calls `.map()` on it, so
    // handing over the bare ContainerBuilder throws inside discord.js.
    await InteractionHelper.safeEditReply(interaction, {
      components: [components],
      flags: v2Flags(),
      allowedMentions: NO_PINGS,
    });
    logger.debug(`Rank checked for user ${targetUser.id} in guild ${interaction.guildId}`);
  }
};
