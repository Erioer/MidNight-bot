import { PermissionFlagsBits } from 'discord.js';
import { NO_PINGS, v2Flags, container, divider, text } from '../../../utils/componentsV2.js';
import { getServerCounters, saveServerCounters, getCounterEmoji as getCounterTypeEmoji, getCounterTypeLabel, getGuildCounterStats } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
export async function handleList(interaction, client) {
    const guild = interaction.guild;

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need **Manage Channels** permission to view counters.' }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);
        const stats = await getGuildCounterStats(guild);

        const validCounters = [];
        const orphanedCounters = [];
        
        for (const counter of counters) {
            const channel = guild.channels.cache.get(counter.channelId);
            if (channel) {
                validCounters.push(counter);
            } else {
                orphanedCounters.push(counter);
                logger.info(`Removing orphaned counter ${counter.id} (type: ${counter.type}, deleted channel: ${counter.channelId}) from guild ${guild.id}`);
            }
        }

        if (orphanedCounters.length > 0) {
            await saveServerCounters(client, guild.id, validCounters);
            logger.info(`Cleaned up ${orphanedCounters.length} orphaned counter(s) from guild ${guild.id}`);
        }

        if (validCounters.length === 0) {
            const card = container({
                parts: [
                    text('### Server Counters'),
                    text('No counters have been set up for this server yet.\n\nUse `/serverstats create` to set up your first counter!'),
                    divider(),
                    text('**Available Counter Types**\n**Members + Bots** - Total server members\n**Members Only** - Human members only\n**Bots Only** - Bot members only'),
                    divider(),
                    text('**Usage Examples**\n`/serverstats create type:members channel_type:voice category:Stats`\n`/serverstats create type:bots channel_type:text category:Server Info`\n`/serverstats list`'),
                    divider(),
                    text('-# Counter System • Automatic updates every 15 minutes'),
                ],
            });

            await InteractionHelper.safeEditReply(interaction, {
                components: [card],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            }).catch(logger.error);
            return;
        }

        const counterLines = [];
        for (let i = 0; i < validCounters.length; i++) {
            const counter = validCounters[i];
            const channel = guild.channels.cache.get(counter.channelId);

            if (!channel) {

                logger.warn(`Counter ${counter.id} still has missing channel after cleanup`);
                continue;
            }

            const currentCount = getCurrentCount(stats, counter.type);
            const status = channel.name.includes(':') ? '✅ Active' : '⚠️ Not Updated';

            counterLines.push(
                [
                    `**${getCounterTypeEmoji(counter.type)} Counter #${i + 1} - ${channel.name}**`,
                    `**ID:** \`${counter.id}\``,
                    `**Type:** ${getCounterTypeDisplay(counter.type)}`,
                    `**Channel:** ${channel}`,
                    `**Current Count:** ${currentCount}`,
                    `**Status:** ${status}`,
                    `**Created:** ${new Date(counter.createdAt).toLocaleDateString()}`,
                ].join('\n'),
            );
        }

        const activeCount = validCounters.filter(c => {
            const channel = guild.channels.cache.get(c.channelId);
            return channel && channel.name.includes(':');
        }).length;

        const card = container({
            parts: [
                text(`### Server Counters (${validCounters.length})`),
                text('Here are all the active counters for this server.\n\nCounters automatically update every 15 minutes.'),
                divider(),
                text(counterLines.join('\n\n').slice(0, 3500)),
                divider(),
                text([
                    '**Statistics**',
                    `**Total Counters:** ${validCounters.length}`,
                    `**Active Counters:** ${activeCount}`,
                    `**Next Update:** <t:${Math.floor(Date.now() / 1000) + 900}:R>`,
                    '',
                    '**Management Commands**',
                    '`/serverstats create` - Create new counter',
                    '`/serverstats update` - Update existing counter',
                    '`/serverstats delete` - Delete counter',
                ].join('\n')),
                divider(),
                text('-# Counter System • Automatic updates every 15 minutes'),
            ],
        });

        await InteractionHelper.safeEditReply(interaction, {
            components: [card],
            flags: v2Flags(),
            allowedMentions: NO_PINGS,
        }).catch(logger.error);

    } catch (error) {
        logger.error("Error displaying counters:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred while fetching counters. Please try again.' }).catch(logger.error);
    }
}

function getCounterTypeDisplay(type) {
    return `${getCounterTypeEmoji(type)} ${getCounterTypeLabel(type)}`;
}

function getCounterEmoji(type) {
    return getCounterTypeEmoji(type);
}

function getCurrentCount(stats, type) {
    switch (type) {
        case "members":
            return stats.totalCount;
        case "bots":
            return stats.botCount;
        case "members_only":
            return stats.humanCount;
        default:
            return 0;
    }
}