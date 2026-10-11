import { SlashCommandBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { NO_PINGS, v2Flags } from '../../utils/componentsV2.js';
import { failureContainer, successContainer } from '../../services/economy/economyViews.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Checks the bot's latency and API speed"),

    async prefixExecute(interaction) {
        try {
            const startTime = Date.now();
            // No interim message: a V1 reply could never be edited into V2.
            const latency = Date.now() - startTime;
            const apiLatency = Math.max(0, Math.round(interaction.client.ws.ping));

            await interaction.reply({
                components: [
                    successContainer({
                        title: 'Pong!',
                        body: `**Bot Latency:** \`${latency}ms\`\n**API Latency:** \`${apiLatency}ms\``,
                    }),
                ],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });
        } catch (error) {
            logger.error('Ping prefix command error:', error);
            if (!interaction.replied && !interaction._replyMessage) {
                await interaction.channel.send({
                    components: [
                        failureContainer({ title: 'System Error', body: 'Could not determine latency at this time.' }),
                    ],
                    flags: v2Flags(),
                    allowedMentions: NO_PINGS,
                }).catch(() => {});
            }
        }
    },

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Ping interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ping'
            });
            return;
        }

        try {
            const startTime = interaction._commandStartTime || interaction.createdTimestamp;
            const latency = Math.max(0, Date.now() - startTime);
            const apiLatency = Math.max(0, Math.round(interaction.client.ws.ping));

            await InteractionHelper.safeEditReply(interaction, {
                components: [
                    successContainer({
                        title: 'Pong!',
                        body: `**Bot Latency:** \`${latency}ms\`\n**API Latency:** \`${apiLatency}ms\``,
                    }),
                ],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });
        } catch (error) {
            logger.error('Ping command error:', error);
            try {
                return await InteractionHelper.safeReply(interaction, {
                    components: [
                        failureContainer({ title: 'System Error', body: 'Could not determine latency at this time.' }),
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