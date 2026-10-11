import { SlashCommandBuilder } from 'discord.js';
import { NO_PINGS, container, section, text, thumbnail, v2Flags } from '../../utils/componentsV2.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Get detailed information about a user")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("The user to inspect (defaults to you)"),
    ),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
      logger.warn(`UserInfo interaction defer failed`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'userinfo'
      });
      return;
    }

    const user = interaction.options.getUser("target") || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);

    const createdTimestamp = Math.floor(user.createdAt.getTime() / 1000);
    const joinedTimestamp = member?.joinedAt ? Math.floor(member.joinedAt.getTime() / 1000) : null;

    const rolesValue =
        member && member.roles.cache.size > 1
            ? member.roles.cache
                .map((r) => r.name)
                .slice(0, 5)
                .join(",")
            : "None";

    const userBody =
        `**ID:** ${user.id}\n` +
        `**Bot:** ${user.bot ? "Yes" : "No"}\n` +
        `**Roles:** ${rolesValue}\n` +
        `**Account Created:** <t:${createdTimestamp}:R>\n` +
        `**Joined Server:** ${joinedTimestamp ? `<t:${joinedTimestamp}:R>` : "Not in server"}\n` +
        `**Highest Role:** ${member?.roles?.highest?.name || "None"}`;

    const avatarUrl = user.displayAvatarURL({ size: 256 });
    const userContainer = avatarUrl
        ? container({ parts: [section([text(`### User Info: ${user.username}`), text(userBody)], thumbnail(avatarUrl))] })
        : container({ parts: [text(`### User Info: ${user.username}`), text(userBody)] });

    await InteractionHelper.safeEditReply(interaction, { components: [userContainer], flags: v2Flags(), allowedMentions: NO_PINGS });
    logger.info(`UserInfo command executed`, {
      userId: interaction.user.id,
      targetUserId: user.id,
      guildId: interaction.guildId
    });
  },
};