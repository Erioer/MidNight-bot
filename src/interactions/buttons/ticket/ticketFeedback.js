import { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
import { getTicketData, saveTicketData } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { logTicketFeedback } from '../../../utils/ticket/ticketLogging.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { NO_PINGS, container, text, v2Flags } from '../../../utils/componentsV2.js';
import { failureContainer, successContainer } from '../../../services/economy/economyViews.js';

const STAR_LABELS = {
    '1': '⭐ 1 — Poor',
    '2': '⭐ 2 — Below Average',
    '3': '⭐ 3 — Average',
    '4': '⭐ 4 — Good',
    '5': '⭐ 5 — Excellent',
};

const feedbackHandler = {
    name: 'ticket_feedback',

    async execute(interaction, client, args) {

        const [guildId, channelId, ratingStr] = args;

        if (!guildId || !channelId || !ratingStr) {
            await InteractionHelper.safeReply(interaction, {
                components: [
                    failureContainer({
                        title: '⚠️ Invalid Feedback Link',
                        body: 'This feedback link appears to be malformed.',
                    }),
                ],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });
            return;
        }

        try {
            await interaction.deferUpdate();
        } catch (err) {
            logger.warn('ticketFeedback: interaction expired before deferUpdate', { guildId, channelId, error: err.message });
            return;
        }

        let ticketData;
        try {
            ticketData = await getTicketData(guildId, channelId);
        } catch (err) {
            logger.warn('ticketFeedback: failed to load ticket data', { guildId, channelId, error: err.message });
        }

        if (!ticketData) {
            await InteractionHelper.safeEditReply(interaction, {
                components: [
                    failureContainer({
                        title: '⚠️ Ticket Not Found',
                        body: 'Could not find the ticket associated with this survey.',
                    }),
                ],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });
            return;
        }

        if (interaction.user.id !== ticketData.userId) {
            await InteractionHelper.safeEditReply(interaction, {
                components: [
                    failureContainer({
                        title: '❌ Not Allowed',
                        body: 'Only the ticket creator can submit feedback for this ticket.',
                    }),
                ],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });
            return;
        }

        if (ticketData.feedback?.rating) {
            await InteractionHelper.safeEditReply(interaction, {
                components: [
                    successContainer({
                        title: '✅ Already Submitted',
                        body: `You already rated this ticket **${STAR_LABELS[String(ticketData.feedback.rating)]}**.\nThank you for your feedback!`,
                    }),
                ],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });
            return;
        }

        const rating = parseInt(ratingStr, 10);
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

        await InteractionHelper.safeEditReply(interaction, {
            components: [
                successContainer({
                    title: '✅ Thanks for your feedback!',
                    body: `You rated your support experience **${ratingLabel}**.\n\nYour feedback has been recorded and helps us improve!`,
                    footer: 'Thank you for using our support system.',
                }),
            ],
            flags: v2Flags(),
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

const commentHandler = {
    name: 'ticket_feedback_comment',

    async execute(interaction, client, args) {
        const [guildId, channelId] = args;

        if (!guildId || !channelId) {
            await interaction.update({
                components: [
                    failureContainer({
                        title: '⚠️ Invalid Feedback Link',
                        body: 'This feedback action appears to be malformed.',
                    }),
                ],
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: NO_PINGS,
            });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`ticket_feedback_comment_modal:${guildId}:${channelId}`)
            .setTitle('Add Ticket Feedback');

        const commentInput = new TextInputBuilder()
            .setCustomId('feedback_comment')
            .setLabel('Your feedback')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Share what went well or how we can improve...')
            .setRequired(true)
            .setMaxLength(1000);

        modal.addComponents(new ActionRowBuilder().addComponents(commentInput));

        await interaction.showModal(modal);
    },
};

const declineHandler = {
    name: 'ticket_feedback_decline',

    async execute(interaction) {
        await interaction.update({
            components: [
                container({
                    parts: [
                        text('### 👋 No problem!'),
                        text('You can always reach out again if you need further support.'),
                    ],
                }),
            ],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: NO_PINGS,
        });
    },
};

export default [feedbackHandler, commentHandler, declineHandler];
