import { PermissionFlagsBits } from 'discord.js';
import { NO_PINGS, v2Flags } from '../../../utils/componentsV2.js';
import { successContainer } from '../../../services/economy/economyViews.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logEvent, EVENT_TYPES } from '../../../services/loggingService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
export async function handleUpdate(interaction, client) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");
    const newType = interaction.options.getString("type");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need **Manage Channels** permission to update counters.' }).catch(logger.error);
        return;
    }

    if (!newType) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'You must provide a new counter type to update.' }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        const counterIndex = counters.findIndex(c => c.id === counterId);
        if (counterIndex === -1) {
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Counter with ID \`${counterId}\` not found. Use \`/serverstats list\` to see all counters.` }).catch(logger.error);
            return;
        }

        const counter = counters[counterIndex];
        const oldChannel = guild.channels.cache.get(counter.channelId);

        if (!oldChannel) {
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'The channel for this counter no longer exists. You cannot update a counter for a deleted channel.' }).catch(logger.error);
            return;
        }

        if (newType !== counter.type) {
            const existingTypeCounter = counters.find(c => c.type === newType && c.id !== counter.id);
            if (existingTypeCounter) {
                const existingChannel = guild.channels.cache.get(existingTypeCounter.channelId);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `A **${getCounterTypeLabel(newType)}** counter already exists for this server${existingChannel ? ` in ${existingChannel}` : ''}. Delete it first before reusing that type.` }).catch(logger.error);
                return;
            }
        }

        const oldType = counter.type;

        counter.type = newType;
        counter.updatedAt = new Date().toISOString();

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Failed to save updated counter data. Please try again.' }).catch(logger.error);
            return;
        }

        const updatedCounter = counters[counterIndex];
        const updated = await updateCounter(client, guild, updatedCounter);
        if (!updated) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Counter updated but failed to update channel name. The counter will update on the next scheduled run.' }).catch(logger.error);
            return;
        }

        const finalChannel = guild.channels.cache.get(updatedCounter.channelId);

        await logEvent({
            client,
            guildId: guild.id,
            eventType: EVENT_TYPES.COUNTER_CONFIG,
            data: {
                title: 'Counter Updated',
                lines: [
                    `**Counter ID:** \`${counterId}\``,
                    `**Type Changed:** ${getCounterEmoji(oldType)} ${getCounterTypeLabel(oldType)} → ${getCounterEmoji(newType)} ${getCounterTypeLabel(newType)}`,
                    `**Channel:** ${finalChannel}`,
                ],
                actor: {
                    id: interaction.user.id,
                    displayName: interaction.member?.displayName || interaction.user.username,
                    avatarUrl: interaction.user.displayAvatarURL(),
                },
            },
        }).catch(() => null);

        await InteractionHelper.safeEditReply(interaction, {
            components: [
                successContainer({
                    title: 'Counter Updated',
                    body: [
                        `**Counter ID:** \`${counterId}\``,
                        `**Type Changed:** ${getCounterEmoji(oldType)} ${getCounterTypeLabel(oldType)} → ${getCounterEmoji(newType)} ${getCounterTypeLabel(newType)}`,
                        '',
                        '**Current Settings:**',
                        `**Type:** ${getCounterEmoji(updatedCounter.type)} ${getCounterTypeLabel(updatedCounter.type)}`,
                        `**Channel:** ${finalChannel}`,
                        `**Channel Name:** ${finalChannel.name}`,
                        '',
                        'The counter will automatically update every 15 minutes.',
                    ].join('\n'),
                }),
            ],
            flags: v2Flags(),
            allowedMentions: NO_PINGS,
        }).catch(logger.error);

    } catch (error) {
        logger.error("Error updating counter:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred while updating the counter. Please try again.' }).catch(logger.error);
    }
}