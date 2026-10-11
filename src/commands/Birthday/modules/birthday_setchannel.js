import { PermissionsBitField } from 'discord.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import { NO_PINGS, v2Flags } from '../../../utils/componentsV2.js';
import { failureContainer, noticeContainer, successContainer } from '../../../services/economy/economyViews.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const card = failureContainer({
                title: 'Permission Denied',
                body: 'You need **Manage Server** permissions to configure the birthday channel.',
            });
            return InteractionHelper.safeReply(interaction, {
                components: [card],
                flags: v2Flags({ ephemeral: true }),
                allowedMentions: NO_PINGS,
            });
        }

        try {
            const channel = interaction.options.getChannel('channel');
            const guildId = interaction.guildId;
            const guildConfig = await getGuildConfig(client, guildId);

            if (channel) {
                guildConfig.birthdayChannelId = channel.id;
                await setGuildConfig(client, guildId, guildConfig);
                const card = successContainer({
                    title: 'Birthday Announcements Enabled',
                    body: `Birthday announcements will now be posted in ${channel}.`,
                });
                return InteractionHelper.safeReply(interaction, {
                    components: [card],
                    flags: v2Flags({ ephemeral: true }),
                    allowedMentions: NO_PINGS,
                });
            } else {
                guildConfig.birthdayChannelId = null;
                await setGuildConfig(client, guildId, guildConfig);
                const card = noticeContainer({
                    title: 'Birthday Announcements Disabled',
                    body: 'No channel provided — birthday announcements have been disabled.',
                });
                return InteractionHelper.safeReply(interaction, {
                    components: [card],
                    flags: v2Flags({ ephemeral: true }),
                    allowedMentions: NO_PINGS,
                });
            }
        } catch (error) {
            logger.error('birthday_setchannel error:', error);
            const card = failureContainer({
                title: '⚠️ Configuration Error',
                body: 'Could not save the birthday channel configuration.',
            });
            return InteractionHelper.safeReply(interaction, {
                components: [card],
                flags: v2Flags({ ephemeral: true }),
                allowedMentions: NO_PINGS,
            });
        }
    },
};
