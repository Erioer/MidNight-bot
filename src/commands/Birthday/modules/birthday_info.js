import { getUserBirthday } from '../../../services/birthdayService.js';
import { logger } from '../../../utils/logger.js';
import { NO_PINGS, v2Flags } from '../../../utils/componentsV2.js';
import { failureContainer, successContainer } from '../../../services/economy/economyViews.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const targetUser = interaction.options.getUser("user") || interaction.user;
        const userId = targetUser.id;
        const guildId = interaction.guildId;

        const birthdayData = await getUserBirthday(client, guildId, userId);

        if (!birthdayData) {
            const card = failureContainer({
                title: 'No Birthday Found',
                body: targetUser.id === interaction.user.id
                    ? "You haven't set your birthday yet. Use `/birthday set` to add it!"
                    : `${targetUser.username} hasn't set their birthday yet.`,
            });
            return await InteractionHelper.safeEditReply(interaction, {
                components: [card],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });
        }

        const card = successContainer({
            title: 'Birthday Information',
            body: `**Date:** ${birthdayData.monthName} ${birthdayData.day}\n**User:** ${targetUser.toString()}`,
        });

        await InteractionHelper.safeEditReply(interaction, {
            components: [card],
            flags: v2Flags(),
            allowedMentions: NO_PINGS,
        });

        logger.info('Birthday info retrieved successfully', {
            userId: interaction.user.id,
            targetUserId: targetUser.id,
            guildId,
            commandName: 'birthday_info'
        });
    }
};
