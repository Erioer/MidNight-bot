import { MessageFlags } from 'discord.js';
import { getTicketData, saveTicketData } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { logTicketFeedback } from '../../../utils/ticket/ticketLogging.js';
import { NO_PINGS } from '../../../utils/componentsV2.js';
import { failureContainer, successContainer } from '../../../services/economy/economyViews.js';

const STAR_LABELS = {
    '1': '⭐ 1 — Poor',
    '2': '⭐ 2 — Below Average',
    '3': '⭐ 3 — Average',
    '4': '⭐ 4 — Good',
    '5': '⭐ 5 — Excellent',
};

export default {
    name: 'ticket_feedback',

    async execute(interaction, client, args) {

        const [guildId, channelId] = args;

        if (!guildId || !channelId) {
            await interaction.update({
                components: [
                    failureContainer({
                        title: '⚠️ Invalid Feedback Link',
                        body: 'This feedback link appears to be malformed.',
                    }),
                ],
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: NO_PINGS,
            });
            return;
        }

        let ticketData;
        try {
            ticketData = await getTicketData(guildId, channelId);
        } catch (err) {
            logger.warn('ticketFeedback: failed to load ticket data', { guildId, channelId, error: err.message });
        }

        if (!ticketData) {
            await interaction.update({
                components: [
                    failureContainer({
                        title: '⚠️ Ticket Not Found',
                        body: 'Could not find the ticket associated with this survey.',
                    }),
                ],
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: NO_PINGS,
            });
            return;
        }

        if (interaction.user.id !== ticketData.userId) {
            await interaction.reply({
                components: [
                    failureContainer({
                        title: '❌ Not Allowed',
                        body: 'Only the ticket creator can submit feedback for this ticket.',
                    }),
                ],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                allowedMentions: NO_PINGS,
            });
            return;
        }

        if (ticketData.feedback?.rating) {
            await interaction.update({
                components: [
                    successContainer({
                        title: '✅ Already Submitted',
                        body: `You already rated this ticket **${STAR_LABELS[String(ticketData.feedback.rating)]}**.\nThank you for your feedback!`,
                    }),
                ],
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: NO_PINGS,
            });
            return;
        }

        const rating = parseInt(interaction.values[0], 10);
        const ratingLabel = STAR_LABELS[String(rating)] ?? `${rating} stars`;

        try {
            ticketData.feedback = {
                rating,
                submittedAt: new Date().toISOString(),
            };
            await saveTicketData(guildId, channelId, ticketData);
        } catch (err) {
            logger.error('ticketFeedback: failed to save feedback', { guildId, channelId, rating, error: err.message });
        }

        try {
            await logTicketFeedback({
                client: interaction.client,
                guildId,
                ticketNumber: ticketData.id,
                ticketChannelId: channelId,
                userId: interaction.user.id,
                rating,
            });
        } catch (err) {
            logger.warn('ticketFeedback: failed to send log', { guildId, channelId, error: err.message });
        }

        const thankYouContainer = successContainer({
            title: '✅ Thanks for your feedback!',
            body: `You rated your support experience **${ratingLabel}**.\n\nYour feedback has been recorded and helps us improve!`,
            footer: 'Thank you for using our support system.',
        });

        await interaction.update({
            components: [thankYouContainer],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: NO_PINGS,
        });

        logger.info('Ticket feedback submitted', {
            guildId,
            channelId,
            userId: interaction.user.id,
            rating,
        });
    },
};
