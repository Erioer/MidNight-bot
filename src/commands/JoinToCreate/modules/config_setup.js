import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelType,
    MessageFlags,
    ComponentType,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { NO_PINGS, container, divider, text, v2Flags } from '../../../utils/componentsV2.js';
import { noticeContainer, successContainer } from '../../../services/economy/economyViews.js';
import { logger } from '../../../utils/logger.js';
import { MidNightError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { 
    getJoinToCreateConfig, 
    updateJoinToCreateConfig,
    removeJoinToCreateTrigger,
    addJoinToCreateTrigger
} from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
        try {
            const triggerChannel = interaction.options.getChannel('trigger_channel');
        const guildId = interaction.guild.id;

        const currentConfig = await getJoinToCreateConfig(client, guildId);

        if (!currentConfig.triggerChannels.includes(triggerChannel.id)) {
            throw new MidNightError(
                `Channel ${triggerChannel.id} is not a Join to Create trigger`,
                ErrorTypes.VALIDATION,
                `${triggerChannel} is not configured as a Join to Create trigger channel.`
            );
        }

        const card = container({
            parts: [
                text('### Join to Create Configuration'),
                text(`Configure settings for ${triggerChannel}`),
                divider(),
                text([
                    `**Current Channel Name Template**\n\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                    `**Current User Limit**\n${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'No limit' : currentConfig.userLimit + ' users'}`,
                    `**Current Bitrate**\n${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                ].join('\n\n')),
                divider(),
                text('-# Select an option to configure below'),
            ],
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`jointocreate_config_${triggerChannel.id}`)
            .setPlaceholder('Select a configuration option')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Change Channel Name Template')
                    .setDescription('Modify the template for temporary channel names')
                    .setValue('name_template'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Change User Limit')
                    .setDescription('Set maximum users per temporary channel')
                    .setValue('user_limit'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Change Bitrate')
                    .setDescription('Adjust audio quality for temporary channels')
                    .setValue('bitrate'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Remove This Trigger Channel')
                    .setDescription('Remove this channel from the Join to Create system')
                    .setValue('remove_trigger'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('View Current Settings')
                    .setDescription('Show all current configuration details')
                    .setValue('view_settings')
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await InteractionHelper.safeEditReply(interaction, {
            components: [card, row],
            flags: v2Flags(),
            allowedMentions: NO_PINGS,
        }).catch(error => {
            logger.error('Failed to edit reply in config_setup:', error);
        });

        const collector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: (i) => i.user.id === interaction.user.id && i.customId === `jointocreate_config_${triggerChannel.id}`,
time: 60000
        });

        collector.on('collect', async (selectInteraction) => {
            await selectInteraction.deferUpdate();

            const selectedOption = selectInteraction.values[0];

            try {
                switch (selectedOption) {
                    case 'name_template':
                        await handleNameTemplateChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'user_limit':
                        await handleUserLimitChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'bitrate':
                        await handleBitrateChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'remove_trigger':
                        await handleRemoveTrigger(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'view_settings':
                        await handleViewSettings(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                }
            } catch (error) {
                if (error instanceof MidNightError) {
                    logger.debug(`Configuration validation error: ${error.message}`, error.context || {});
                } else {
                    logger.error('Unexpected configuration menu error:', error);
                }
                
                const errorMessage = error instanceof MidNightError 
                    ? error.userMessage || 'An error occurred while processing your selection.'
                    : 'An error occurred while processing your selection.';
                    
                await replyUserError(selectInteraction, {
                    type: ErrorTypes.CONFIGURATION,
                    message: errorMessage
                }).catch(() => {});
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const disabledRow = new ActionRowBuilder().addComponents(
                    selectMenu.setDisabled(true)
                );
                
                await InteractionHelper.safeEditReply(interaction, {
                    components: [card, disabledRow],
                    flags: v2Flags(),
                    allowedMentions: NO_PINGS,
                }).catch(() => {});
            }
        });
            } catch (error) {
            if (error instanceof MidNightError) {
                throw error;
            }
            logger.error('Unexpected error in config_setup:', error);
            throw new MidNightError(
                `Config setup failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Failed to configure Join to Create system.'
            );
        }
    }
};

async function handleNameTemplateChange(interaction, triggerChannel, currentConfig, client) {
    const card = container({
        parts: [
            text('### Channel Name Template Configuration'),
            text('Please enter the new channel name template.'),
            divider(),
            text([
                '**Available Variables**',
                "• `{username}` - User's username",
                "• `{display_name}` - User's display name",
                "• `{user_tag}` - User's tag (User#1234)",
                '• `{guild_name}` - Server name',
                '',
                `**Current Template**\n\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
            ].join('\n')),
            divider(),
            text('-# Type your new template in the chat below'),
        ],
    });

    await interaction.followUp({ components: [card], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2, allowedMentions: NO_PINGS });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id,
time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newTemplate = message.content.trim();
            
            if (!newTemplate || newTemplate.length > 100) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Template must be between 1 and 100 characters.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                nameTemplate: newTemplate
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                components: [successContainer({ title: 'Template Updated', body: `Channel name template changed to \`${newTemplate}\`` })],
                flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
                allowedMentions: NO_PINGS,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof MidNightError) {
                logger.debug(`Template validation error: ${error.message}`);
            } else {
                logger.error('Template update error:', error);
            }
            
            const errorMessage = error instanceof MidNightError
                ? error.userMessage || 'Could not update the channel name template.'
                : 'Could not update the channel name template.';
                
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No response received. Template update cancelled.'
            }).catch(() => {});
        }
    });
}

async function handleUserLimitChange(interaction, triggerChannel, currentConfig, client) {
    const card = container({
        parts: [
            text('### User Limit Configuration'),
            text('Please enter the new user limit (0-99, where 0 = no limit).'),
            divider(),
            text(`**Current Limit**\n${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'No limit' : currentConfig.userLimit + ' users'}`),
            divider(),
            text('-# Type the new limit in the chat below'),
        ],
    });

    await interaction.followUp({ components: [card], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2, allowedMentions: NO_PINGS });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newLimit = parseInt(message.content.trim());
            
            if (newLimit < 0 || newLimit > 99) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'User limit must be between 0 and 99.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                userLimit: newLimit
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                components: [successContainer({ title: 'Limit Updated', body: `User limit changed to ${newLimit === 0 ? 'No limit' : newLimit + ' users'}` })],
                flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
                allowedMentions: NO_PINGS,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof MidNightError) {
                logger.debug(`User limit validation error: ${error.message}`);
            } else {
                logger.error('User limit update error:', error);
            }
            
            const errorMessage = error instanceof MidNightError
                ? error.userMessage || 'Could not update the user limit.'
                : 'Could not update the user limit.';
                
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No valid response received. Update cancelled.'
            }).catch(() => {});
        }
    });
}

async function handleBitrateChange(interaction, triggerChannel, currentConfig, client) {
    const card = container({
        parts: [
            text('### Bitrate Configuration'),
            text('Please enter the new bitrate in kbps (8-384).'),
            divider(),
            text([
                `**Current Bitrate**\n${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                '**Common Values**\n• 64 kbps - Normal quality\n• 96 kbps - Good quality\n• 128 kbps - High quality\n• 256 kbps - Very high quality',
            ].join('\n\n')),
            divider(),
            text('-# Type the new bitrate in the chat below'),
        ],
    });

    await interaction.followUp({ components: [card], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2, allowedMentions: NO_PINGS });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newBitrate = parseInt(message.content.trim());
            
            if (newBitrate < 8 || newBitrate > 384) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Bitrate must be between 8 and 384 kbps.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                bitrate: newBitrate * 1000
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                components: [successContainer({ title: 'Bitrate Updated', body: `Bitrate changed to ${newBitrate} kbps` })],
                flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
                allowedMentions: NO_PINGS,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof MidNightError) {
                logger.debug(`Bitrate validation error: ${error.message}`);
            } else {
                logger.error('Bitrate update error:', error);
            }
            
            const errorMessage = error instanceof MidNightError
                ? error.userMessage || 'Could not update the bitrate.'
                : 'Could not update the bitrate.';
                
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No valid response received. Update cancelled.'
            }).catch(() => {});
        }
    });
}

async function handleRemoveTrigger(interaction, triggerChannel, currentConfig, client) {
    const card = noticeContainer({
        title: 'Remove Trigger Channel',
        body: `Are you sure you want to remove ${triggerChannel} from the Join to Create system?`,
        footer: 'This action cannot be undone',
    });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`confirm_remove_${triggerChannel.id}`)
            .setLabel('Remove Channel')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`cancel_remove_${triggerChannel.id}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.followUp({
        components: [card, row],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        allowedMentions: NO_PINGS,
    });

    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id && 
                     (i.customId === `confirm_remove_${triggerChannel.id}` || i.customId === `cancel_remove_${triggerChannel.id}`),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (buttonInteraction) => {
        await buttonInteraction.deferUpdate();

        if (buttonInteraction.customId === `confirm_remove_${triggerChannel.id}`) {
            try {
                const success = await removeJoinToCreateTrigger(client, interaction.guild.id, triggerChannel.id);
                
                if (success) {
                    await buttonInteraction.followUp({
                        components: [successContainer({ title: 'Channel Removed', body: `${triggerChannel} has been removed from the Join to Create system.` })],
                        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
                        allowedMentions: NO_PINGS,
                    });
                } else {
                    await replyUserError(buttonInteraction, {
                        type: ErrorTypes.CONFIGURATION,
                        message: 'Could not remove the trigger channel.'
                    });
                }
            } catch (error) {
                if (error instanceof MidNightError) {
                    logger.debug(`Trigger removal validation error: ${error.message}`);
                } else {
                    logger.error('Remove trigger error:', error);
                }
                
                const errorMessage = error instanceof MidNightError
                    ? error.userMessage || 'An error occurred while removing the trigger channel.'
                    : 'An error occurred while removing the trigger channel.';
                    
                await replyUserError(buttonInteraction, {
                    type: ErrorTypes.CONFIGURATION,
                    message: errorMessage
                }).catch(() => {});
            }
        } else {
            await buttonInteraction.followUp({
                components: [successContainer({ title: 'Cancelled', body: 'Channel removal has been cancelled.' })],
                flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
                allowedMentions: NO_PINGS,
            });
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No response received. Removal cancelled.'
            }).catch(() => {});
        }
    });
}

async function handleViewSettings(interaction, triggerChannel, currentConfig, client) {
    const channelConfig = currentConfig.channelOptions?.[triggerChannel.id] || {};

    const card = container({
        parts: [
            text('### Current Settings'),
            text(`Configuration for ${triggerChannel}`),
            divider(),
            text([
                `**Trigger Channel**\n${triggerChannel} (${triggerChannel.id})`,
                `**Channel Name Template**\n\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate}\``,
                `**User Limit**\n${channelConfig.userLimit || currentConfig.userLimit === 0 ? 'No limit' : (channelConfig.userLimit || currentConfig.userLimit) + ' users'}`,
                `**Bitrate**\n${(channelConfig.bitrate || currentConfig.bitrate) / 1000} kbps`,
                `**Category**\n${currentConfig.categoryId ? `<#${currentConfig.categoryId}>` : 'Not set'}`,
                `**System Status**\n${currentConfig.enabled ? '✅ Enabled' : '❌ Disabled'}`,
                `**Active Temporary Channels**\n${Object.keys(currentConfig.temporaryChannels || {}).length.toString()}`,
            ].join('\n\n')),
        ],
    });

    await interaction.followUp({
        components: [card],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        allowedMentions: NO_PINGS,
    });
}