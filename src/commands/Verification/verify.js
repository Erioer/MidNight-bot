import { SlashCommandBuilder } from 'discord.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { verifyUser } from '../../services/verificationService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { NO_PINGS, container, text, v2Flags } from '../../utils/componentsV2.js';
import { successContainer } from '../../services/economy/economyViews.js';

export default {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verify yourself and gain access to the server'),

    async execute(interaction, config, client) {
        const guild = interaction.guild;

        const result = await verifyUser(client, guild.id, interaction.user.id, {
            source: 'command_self',
            moderatorId: null
        });

        if (result.status === 'already_verified') {
            return await InteractionHelper.safeReply(interaction, {
                components: [
                    container({
                        parts: [
                            text('### Already Verified'),
                            text('You are already verified.'),
                        ],
                    }),
                ],
                flags: v2Flags({ ephemeral: true }),
                allowedMentions: NO_PINGS,
            });
        }

        await InteractionHelper.safeReply(interaction, {
            components: [
                successContainer({
                    title: 'Verification Complete',
                    body: `You have been verified and given the **${result.roleName}** role! Welcome to the server! 🎉`,
                }),
            ],
            flags: v2Flags({ ephemeral: true }),
            allowedMentions: NO_PINGS,
        });
    }
};
