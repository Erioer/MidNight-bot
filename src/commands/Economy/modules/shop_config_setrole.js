import { PermissionsBitField } from 'discord.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import { NO_PINGS, v2Flags } from '../../../utils/componentsV2.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { successContainer } from '../../../services/economy/economyViews.js';

export default {
    async execute(interaction, config, client) {
        // This module replies ephemerally, so the defer carries the flag.
        const deferred = await InteractionHelper.safeDefer(interaction, {
            flags: v2Flags({ ephemeral: true }),
        });
        if (!deferred) return;

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'You need **Manage Server** permissions to set the premium role.',
            });
        }

        const role = interaction.options.getRole('role');
        const guildId = interaction.guildId;

        try {
            const currentConfig = await getGuildConfig(client, guildId);
            currentConfig.premiumRoleId = role.id;
            await setGuildConfig(client, guildId, currentConfig);

            return InteractionHelper.safeEditReply(interaction, {
                components: [
                    successContainer({
                        title: 'Premium Role Set',
                        body:
                            `The **Premium Shop Role** has been set to ${role.toString()}. ` +
                            'Members who purchase the Premium Role item will be granted this role.',
                    }),
                ],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });
        } catch (error) {
            logger.error('shop_config_setrole error:', error);
            return replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Could not save the guild configuration.',
            });
        }
    },
};