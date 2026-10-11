import { getTicketData, saveTicketData } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { logTicketFeedback } from '../../../utils/ticket/ticketLogging.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { NO_PINGS, v2Flags } from '../../../utils/componentsV2.js';
import { failureContainer, noticeContainer, successContainer } from '../../../services/economy/economyViews.js';

export default {
    name: 'ticket_feedback_comment_modal',

    async execute(interaction, client, args) {
        const [guildId, channelId] = args;

        if (!guildId || !channelId) {
            await InteractionHelper.safeReply(interaction, {
                components: [failureContainer({
                    title: '⚠️ Invalid Feedback Submission',
                    body: 'This feedback form appears to be malformed.',
                })],
                flags: v2Flags({ ephemeral: true }),
                allowedMentions: NO_PINGS,
            });
            return;
        }

        const comment = interaction.fields.getTextInputValue('feedback_comment')?.trim();
        if (!comment) {
            await InteractionHelper.safeReply(interaction, {
                components: [noticeContainer({
                    title: '⚠️ Empty Feedback',
                    body: 'Please enter a comment before submitting your feedback.',
                })],
                flags: v2Flags({ ephemeral: true }),
                allowedMentions: NO_PINGS,
            });
            return;
        }

        const deferred = await InteractionHelper.safeDefer(interaction, { flags: v2Flags({ ephemeral: true }) });
        if (!deferred) {
            return;
        }

        let ticketData;
        try {
            ticketData = await getTicketData(guildId, channelId);
        } catch (err) {
            logger.warn('ticketFeedbackComment: failed to load ticket data', { guildId, channelId, error: err.message });
        }

        if (!ticketData) {
            await InteractionHelper.safeEditReply(interaction, {
                components: [failureContainer({
                    title: '⚠️ Ticket Not Found',
                    body: 'Could not find the ticket associated with this feedback.',
                })],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });
            return;
        }

        if (interaction.user.id !== ticketData.userId) {
            await InteractionHelper.safeEditReply(interaction, {
                components: [failureContainer({
                    title: '❌ Not Allowed',
                    body: 'Only the ticket creator can submit feedback for this ticket.',
                })],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });
            return;
        }

        ticketData.feedback = {
            ...ticketData.feedback,
            comment,
            commentSubmittedAt: new Date().toISOString(),
        };

        try {
            await saveTicketData(guildId, channelId, ticketData);
        } catch (err) {
            logger.error('ticketFeedbackComment: failed to save feedback', { guildId, channelId, error: err.message });
        }

        try {
            await logTicketFeedback({
                client: interaction.client,
                guildId,
                ticketNumber: ticketData.id,
                ticketChannelId: channelId,
                userId: interaction.user.id,
                rating: ticketData.feedback?.rating ?? null,
                comment,
            });
        } catch (err) {
            logger.warn('ticketFeedbackComment: failed to send log', { guildId, channelId, error: err.message });
        }

        await InteractionHelper.safeEditReply(interaction, {
            components: [successContainer({
                title: '✅ Feedback Submitted',
                body: 'Your written feedback has been recorded. Thank you for helping us improve!',
            })],
            flags: v2Flags(),
            allowedMentions: NO_PINGS,
        });

        logger.info('Ticket feedback comment submitted', {
            guildId,
            channelId,
            userId: interaction.user.id,
        });
    },
};
