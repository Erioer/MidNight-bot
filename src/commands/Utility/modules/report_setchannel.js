import { PermissionsBitField } from 'discord.js';
import { NO_PINGS, v2Flags } from '../../../utils/componentsV2.js';
import { successContainer } from '../../../services/economy/economyViews.js';
import { setLogChannel } from '../../../services/loggingService.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need **Manage Server** permissions to set the report channel.' });
        }

        const channel = interaction.options.getChannel('channel');
        const guildId = interaction.guildId;

        try {
            await setLogChannel(client, guildId, 'reports', channel.id);

            return InteractionHelper.safeReply(interaction, {
                components: [successContainer({
                    title: 'Report Channel Set',
                    body: `All new reports will now be sent to ${channel}.\nYou can also manage this from \`/logging dashboard\`.`,
                })],
                flags: v2Flags({ ephemeral: true }),
                allowedMentions: NO_PINGS,
            });
        } catch (error) {
            logger.error('report_setchannel error:', error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Could not save the channel configuration.' });
        }
    },
};
