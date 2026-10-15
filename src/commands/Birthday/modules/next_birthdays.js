import { getUpcomingBirthdays } from '../../../services/birthdayService.js';
import { deleteBirthday } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { NO_PINGS, container, divider, text, v2Flags } from '../../../utils/componentsV2.js';
import { failureContainer } from '../../../services/economy/economyViews.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const next5 = await getUpcomingBirthdays(client, interaction.guildId, 5);

        if (next5.length === 0) {
            const card = failureContainer({
                title: 'No Birthdays Found',
                body: 'No birthdays have been set up in this server yet. Use `/birthday set` to add birthdays!',
            });
            return await InteractionHelper.safeEditReply(interaction, {
                components: [card],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });
        }

        let displayIndex = 0;
        for (const birthday of next5) {
            const member = await interaction.guild.members.fetch(birthday.userId).catch(() => null);
            if (!member) {
                deleteBirthday(client, interaction.guildId, birthday.userId).catch(() => null);
                continue;
            }
            displayIndex++;

            let timeUntil = '';
            if (birthday.daysUntil === 0) {
                timeUntil = '🎉 **Today!**';
            } else if (birthday.daysUntil === 1) {
                timeUntil = '📅 **Tomorrow!**';
            } else {
                timeUntil = `In ${birthday.daysUntil} day${birthday.daysUntil > 1 ? 's' : ''}`;
            }
        }

        if (displayIndex === 0) {
            const card = failureContainer({
                title: 'No Upcoming Birthdays',
                body: 'No upcoming birthdays found for current server members.',
            });
            return await InteractionHelper.safeEditReply(interaction, {
                components: [card],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });
        }

        let birthdayList = `Here are the next 5 birthdays in ${interaction.guild.name}:\n\n`;
        displayIndex = 0;
        for (const birthday of next5) {
            const member = await interaction.guild.members.fetch(birthday.userId).catch(() => null);
            if (!member) {
                continue;
            }
            displayIndex++;

            let timeUntil = '';
            if (birthday.daysUntil === 0) {
                timeUntil = '🎉 **Today!**';
            } else if (birthday.daysUntil === 1) {
                timeUntil = '📅 **Tomorrow!**';
            } else {
                timeUntil = `In ${birthday.daysUntil} day${birthday.daysUntil > 1 ? 's' : ''}`;
            }

            birthdayList += `${displayIndex}. **${member.displayName}**\n<@${birthday.userId}>\n📅 **Date:** ${birthday.monthName} ${birthday.day}\n⏰ **Time:** ${timeUntil}\n\n`;
        }

        birthdayList += `Use /birthday set to add your birthday!`;

        // Neutral card: a birthday list is information, not an outcome.
        const card = container({
            parts: [
                text('### 🎂 Next 5 Upcoming Birthdays'),
                text(birthdayList.trimEnd()),
            ],
        });

        await InteractionHelper.safeEditReply(interaction, {
            components: [card],
            flags: v2Flags(),
            allowedMentions: NO_PINGS,
        });

        logger.info('Next birthdays retrieved successfully', {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            upcomingCount: displayIndex,
            commandName: 'next_birthdays'
        });
    }
};
