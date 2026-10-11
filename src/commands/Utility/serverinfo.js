import { SlashCommandBuilder } from 'discord.js';
import { NO_PINGS, container, section, text, thumbnail, v2Flags } from '../../utils/componentsV2.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Get detailed information about the server"),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
      logger.warn(`ServerInfo interaction defer failed`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'serverinfo'
      });
      return;
    }

    const guild = interaction.guild;
    const owner = await guild.fetchOwner();

    const createdTimestamp = Math.floor(guild.createdAt.getTime() / 1000);

    const serverBody =
        `Server ID: ${guild.id}\n` +
        `**Owner:** ${owner.user.tag}\n` +
        `**Members:** ${guild.memberCount}\n` +
        `**Channels:** ${guild.channels.cache.size}\n` +
        `**Roles:** ${guild.roles.cache.size}\n` +
        `**Boosts:** Level ${guild.premiumTier} (${guild.premiumSubscriptionCount})\n` +
        `**Creation Date:** <t:${createdTimestamp}:R>`;

    const guildIcon = guild.iconURL({ size: 256 });
    const serverContainer = guildIcon
        ? container({ parts: [section([text(`### Server Info: ${guild.name}`), text(serverBody)], thumbnail(guildIcon))] })
        : container({ parts: [text(`### Server Info: ${guild.name}`), text(serverBody)] });

    await InteractionHelper.safeEditReply(interaction, { components: [serverContainer], flags: v2Flags(), allowedMentions: NO_PINGS });
    logger.info(`ServerInfo command executed`, {
      userId: interaction.user.id,
      guildId: guild.id,
      guildName: guild.name,
      memberCount: guild.memberCount
    });
  },
};