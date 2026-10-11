import { botConfig } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import { MidNightError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { getWelcomeConfig } from '../../../utils/database.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';
import {
    getVerificationPanelStatus,
    formatPanelStatusField,
} from '../../../utils/panelStatus.js';
import { NO_PINGS, container, divider, text, v2Flags } from '../../../utils/componentsV2.js';
import { failureContainer, successContainer } from '../../../services/economy/economyViews.js';

async function updateLivePanel(guild, cfg) {
    if (!cfg.channelId || !cfg.messageId) return;
    try {
        const channel = guild.channels.cache.get(cfg.channelId);
        if (!channel) return;
        const msg = await channel.messages.fetch(cfg.messageId).catch(() => null);
        if (!msg) return;

        const verifyPanel = successContainer({
            title: 'Server Verification',
            body: cfg.message || botConfig.verification.defaultMessage,
        });

        const verifyButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('verify_user')
                .setLabel(cfg.buttonText || botConfig.verification.defaultButtonText)
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
        );

        await msg.edit({ components: [verifyPanel, verifyButton], flags: MessageFlags.IsComponentsV2, allowedMentions: NO_PINGS });
    } catch (error) {
        logger.warn('Could not update live verification panel:', error.message);
    }
}

function buildDashboardEmbed(cfg, guild, verifiedUserCount = 0, conflictSummary = '', panelStatus = null) {
    const channel = cfg.channelId ? `<#${cfg.channelId}>` : '`Not set`';
    const role = cfg.roleId ? `<@&${cfg.roleId}>` : '`Not set`';
    const rawMsg = cfg.message || botConfig.verification.defaultMessage;
    const msgPreview = `\`${rawMsg.length > 60 ? rawMsg.substring(0, 60) + '…' : rawMsg}\``;
    const buttonText = cfg.buttonText || botConfig.verification.defaultButtonText;
    const panelStatusValue = cfg.channelId ? formatPanelStatusField(panelStatus) : '`Not configured`';

    const parts = [
        text('### Verification System Dashboard'),
        text(`Manage verification settings for **${guild.name}**.\nSelect an option below to modify a setting.`),
        divider(),
        text(`**Panel Status**\n${panelStatusValue}`),
        text(`**Verification Channel**\n${channel}`),
        text(`**Verified Role**\n${role}`),
        text(`**System Status**\n${cfg.enabled !== false ? 'Enabled' : 'Disabled'}`),
        text(`**Button Text**\n\`${buttonText}\``),
        text(`**Verified Users**\n${verifiedUserCount} users`),
        text(`**Verification Message**\n${msgPreview}`),
    ];

    if (conflictSummary) {
        parts.push(text(`**Setup Conflicts**\n${conflictSummary}`));
    }

    parts.push(divider(), text('-# Dashboard closes after 10 minutes of inactivity'));

    return container({ parts });
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`verif_cfg_${guildId}`)
        .setPlaceholder('Select a setting to configure...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Change Verification Channel')
                .setDescription('Set the channel where the verification panel is posted')
                .setValue('channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Change Verified Role')
                .setDescription('Set the role assigned when a user verifies')
                .setValue('role')
                .setEmoji('🏷️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Edit Verification Message')
                .setDescription('Customise the message shown on the verification panel embed')
                .setValue('message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Edit Button Text')
                .setDescription('Change the label on the verify button')
                .setValue('button_text')
                .setEmoji('🔘'),
        );
}

function buildButtonRow(cfg, guildId, disabled = false, panelStatus = null) {
    const systemOn = cfg.enabled !== false;
    const showRepost =
        systemOn && panelStatus?.exists === false && panelStatus?.reason === 'panel_deleted';

    const buttons = [];

    if (showRepost) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`verif_cfg_repost_${guildId}`)
                .setLabel('Repost Panel')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📌')
                .setDisabled(disabled),
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`verif_cfg_toggle_${guildId}`)
            .setLabel('Verification')
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji('🔒')
            .setDisabled(disabled),
    );

    return new ActionRowBuilder().addComponents(buttons);
}

async function repostVerificationPanel(guild, cfg) {
    const channel = await guild.channels.fetch(cfg.channelId).catch(() => null);
    if (!channel) {
        throw new MidNightError(
            'Panel channel missing',
            ErrorTypes.CONFIGURATION,
            'The configured verification channel no longer exists. Set a new channel from the dashboard.',
        );
    }

    const verifyPanel = successContainer({
        title: 'Server Verification',
        body: cfg.message || botConfig.verification.defaultMessage,
    });

    const verifyButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('verify_user')
            .setLabel(cfg.buttonText || botConfig.verification.defaultButtonText)
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
    );

    return channel.send({ components: [verifyPanel, verifyButton], flags: MessageFlags.IsComponentsV2, allowedMentions: NO_PINGS });
}

async function refreshDashboard(rootInteraction, cfg, guildId, client) {
    try {
        const selectMenu = buildSelectMenu(guildId);

        let verifiedUserCount = 0;
        let conflictSummary = '';
        let panelStatus = null;

        if (cfg.channelId && cfg.enabled !== false) {
            panelStatus = await getVerificationPanelStatus(client, rootInteraction.guild, cfg);
            if (panelStatus.recoveredId) {
                cfg.messageId = panelStatus.recoveredId;
                const latestConfig = await getGuildConfig(client, guildId);
                latestConfig.verification = cfg;
                await setGuildConfig(client, guildId, latestConfig);
            }
        }
        
        try {
            const verifiedRole = rootInteraction.guild.roles.cache.get(cfg.roleId);
            if (verifiedRole) {
                verifiedUserCount = verifiedRole.members.size;
            }
            
            const guildConfig = await getGuildConfig(client, guildId);
            const welcomeConfig = await getWelcomeConfig(client, guildId);
            const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
            const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);
            
            const conflicts = [
                autoVerifyEnabled ? 'AutoVerify is enabled' : null,
                autoRoleConfigured ? 'AutoRole is configured' : null
            ].filter(Boolean);
            
            if (conflicts.length > 0) {
                conflictSummary = conflicts.join('\n');
            }
        } catch (error) {
            logger.warn('Could not fetch verification dashboard details:', error.message);
        }
        
        await InteractionHelper.safeEditReply(rootInteraction, {
            components: [
                buildDashboardEmbed(cfg, rootInteraction.guild, verifiedUserCount, conflictSummary, panelStatus),
                buildButtonRow(cfg, guildId, false, panelStatus),
                new ActionRowBuilder().addComponents(selectMenu),
            ],
            flags: v2Flags(),
            allowedMentions: NO_PINGS,
        });
    } catch (error) {
        logger.debug('Could not refresh verification dashboard (interaction may have expired):', error.message);
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const guildConfig = await getGuildConfig(client, guildId);
            const cfg = guildConfig.verification;

            if (!cfg?.channelId) {
                throw new MidNightError(
                    'Verification not configured',
                    ErrorTypes.CONFIGURATION,
                    'The verification system has not been set up yet. Run `/verification setup` first.',
                );
            }

            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            let verifiedUserCount = 0;
            let conflictSummary = '';
            let panelStatus = null;

            if (cfg.channelId && cfg.enabled !== false) {
                panelStatus = await getVerificationPanelStatus(client, interaction.guild, cfg);
                if (panelStatus.recoveredId) {
                    cfg.messageId = panelStatus.recoveredId;
                    guildConfig.verification = cfg;
                    await setGuildConfig(client, guildId, guildConfig);
                }
            }
            
            try {
                const verifiedRole = interaction.guild.roles.cache.get(cfg.roleId);
                if (verifiedRole) {
                    verifiedUserCount = verifiedRole.members.size;
                }
                
                const welcomeConfig = await getWelcomeConfig(client, guildId);
                const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
                const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);
                
                const conflicts = [
                    autoVerifyEnabled ? 'AutoVerify is enabled' : null,
                    autoRoleConfigured ? 'AutoRole is configured' : null
                ].filter(Boolean);
                
                if (conflicts.length > 0) {
                    conflictSummary = conflicts.join('\n');
                }
            } catch (error) {
                logger.warn('Could not fetch verification dashboard details:', error.message);
            }

            await InteractionHelper.safeEditReply(interaction, {
                components: [
                    buildDashboardEmbed(cfg, interaction.guild, verifiedUserCount, conflictSummary, panelStatus),
                    buildButtonRow(cfg, guildId, false, panelStatus),
                    new ActionRowBuilder().addComponents(buildSelectMenu(guildId)),
                ],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });

            // Inline dashboard session (mirrors utils/dashboardSession.js) so the
            // payload can carry V2 flags + NO_PINGS, which the shared helper drops.
            const replyMessage = await interaction.fetchReply().catch(() => null);
            const replyMessageId = replyMessage?.id;
            const belongsToDashboard = (componentInteraction) =>
                componentInteraction.user.id === interaction.user.id &&
                (!replyMessageId || componentInteraction.message.id === replyMessageId);

            const onSelect = async (selectInteraction) => {
                const selectedOption = selectInteraction.values[0];
                switch (selectedOption) {
                    case 'channel':
                        await handleChannel(selectInteraction, interaction, cfg, guildId, client);
                        break;
                    case 'role':
                        await handleRole(selectInteraction, interaction, cfg, guildId, client);
                        break;
                    case 'message':
                        await handleMessage(selectInteraction, interaction, cfg, guildId, client);
                        break;
                    case 'button_text':
                        await handleButtonText(selectInteraction, interaction, cfg, guildId, client);
                        break;
                }
            };

            const onButton = async (btnInteraction) => {
                if (btnInteraction.customId === `verif_cfg_repost_${guildId}`) {
                    await btnInteraction.deferUpdate();
                    const newMsg = await repostVerificationPanel(interaction.guild, cfg);
                    cfg.messageId = newMsg.id;
                    const latestConfig = await getGuildConfig(client, guildId);
                    latestConfig.verification = cfg;
                    await setGuildConfig(client, guildId, latestConfig);
                    await btnInteraction.followUp({
                        components: [
                            successContainer({
                                title: 'Panel Reposted',
                                body: `Verification panel restored in ${newMsg.channel}.`,
                            }),
                        ],
                        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
                        allowedMentions: NO_PINGS,
                    });
                    await refreshDashboard(interaction, cfg, guildId, client);
                    return;
                }

                await btnInteraction.deferUpdate().catch(() => null);

                const wasEnabled = cfg.enabled !== false;
                const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);

                if (!wasEnabled && autoVerifyEnabled) {
                    await replyUserError(btnInteraction, {
                        type: ErrorTypes.CONFIGURATION,
                        message: 'AutoVerify is currently enabled. Please disable AutoVerify first before enabling the manual Verification system.\n\nRun `/autoverify` to access the AutoVerify dashboard.',
                    });
                    return;
                }

                cfg.enabled = !wasEnabled;

                if (!cfg.enabled && cfg.channelId && cfg.messageId) {
                    const channel = interaction.guild.channels.cache.get(cfg.channelId);
                    if (channel) {
                        const msg = await channel.messages.fetch(cfg.messageId).catch(() => null);
                        if (msg) await msg.delete().catch(() => {});
                    }
                }

                if (cfg.enabled && cfg.channelId) {
                    try {
                        const newMsg = await repostVerificationPanel(interaction.guild, cfg);
                        cfg.messageId = newMsg.id;
                    } catch (error) {
                        logger.warn('Could not re-post verification panel on re-enable:', error.message);
                    }
                }

                const latestConfig = await getGuildConfig(client, guildId);
                latestConfig.verification = cfg;
                await setGuildConfig(client, guildId, latestConfig);

                await btnInteraction.followUp({
                    components: [
                        successContainer({
                            title: 'System Updated',
                            body: `The verification system is now **${cfg.enabled ? 'enabled' : 'disabled'}**.`,
                        }),
                    ],
                    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
                    allowedMentions: NO_PINGS,
                });

                await refreshDashboard(interaction, cfg, guildId, client);
            };

            const selectCollector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: (i) => belongsToDashboard(i) && i.customId === `verif_cfg_${guildId}`,
                time: 600_000,
            });

            const buttonCollector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: (i) =>
                    belongsToDashboard(i) &&
                    (i.customId === `verif_cfg_toggle_${guildId}` || i.customId === `verif_cfg_repost_${guildId}`),
                time: 600_000,
            });

            selectCollector.on('collect', async (selectInteraction) => {
                try {
                    await onSelect(selectInteraction);
                } catch (error) {
                    logger.debug(`verification dashboard select error: ${error.message}`);
                    if (!selectInteraction.replied && !selectInteraction.deferred) {
                        await selectInteraction.deferUpdate().catch(() => {});
                    }
                    await replyUserError(selectInteraction, {
                        type: ErrorTypes.CONFIGURATION,
                        message: error instanceof MidNightError
                            ? error.userMessage || 'An error occurred while processing your selection.'
                            : 'An unexpected error occurred while updating the configuration.',
                    }).catch(() => {});
                }
            });

            buttonCollector.on('collect', async (btnInteraction) => {
                try {
                    await onButton(btnInteraction);
                } catch (error) {
                    logger.debug(`verification dashboard button error: ${error.message}`);
                }
            });

            selectCollector.on('end', async (_collected, reason) => {
                buttonCollector.stop();
                if (reason !== 'time') return;
                await InteractionHelper.safeEditReply(interaction, {
                    components: [
                        failureContainer({
                            title: 'Dashboard Timed Out',
                            body: 'This dashboard has been closed due to inactivity. Please run the command again to continue.',
                        }),
                    ],
                    flags: v2Flags(),
                    allowedMentions: NO_PINGS,
                }).catch(() => {});
            });
        } catch (error) {
            if (error instanceof MidNightError) throw error;
            logger.error('Unexpected error in verification_dashboard:', error);
            throw new MidNightError(
                `Verification dashboard failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Failed to open the verification dashboard.',
            );
        }
    },
};

async function handleChannel(selectInteraction, rootInteraction, cfg, guildId, client) {
    await selectInteraction.deferUpdate();

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('verif_cfg_channel')
        .setPlaceholder('Select a text channel...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await selectInteraction.followUp({
        components: [
            container({
                parts: [
                    text('### Change Verification Channel'),
                    text(`**Current:** ${cfg.channelId ?`<#${cfg.channelId}>`: '`Not set`'}\n\nSelect the channel where the verification panel will be posted.\n\n> The existing panel will be deleted and re-posted in the new channel.`),
                ],
            }),
            new ActionRowBuilder().addComponents(channelSelect),
        ],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        allowedMentions: NO_PINGS,
    });

    const chanCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'verif_cfg_channel',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInteraction => {
        await chanInteraction.deferUpdate();
        const newChannel = chanInteraction.channels.first();

        if (!botHasPermission(newChannel, ['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
            await replyUserError(chanInteraction, {
                type: ErrorTypes.PERMISSION,
                message: `I need **View Channel**, **Send Messages**, and **Embed Links** permissions in ${newChannel}.`,
            });
            return;
        }

        if (cfg.channelId && cfg.messageId) {
            const oldChannel = rootInteraction.guild.channels.cache.get(cfg.channelId);
            if (oldChannel) {
                try {
                    const oldMsg = await oldChannel.messages.fetch(cfg.messageId).catch(() => null);
                    if (oldMsg) await oldMsg.delete();
                } catch {
                    
                }
            }
        }

        if (cfg.enabled !== false) {
            try {
                const verifyPanel = successContainer({
                    title: 'Server Verification',
                    body: cfg.message || botConfig.verification.defaultMessage,
                });

                const verifyButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('verify_user')
                        .setLabel(cfg.buttonText || botConfig.verification.defaultButtonText)
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅'),
                );

                const newMsg = await newChannel.send({ components: [verifyPanel, verifyButton], flags: MessageFlags.IsComponentsV2, allowedMentions: NO_PINGS });
                cfg.messageId = newMsg.id;
            } catch (error) {
                logger.warn('Could not post verification panel in new channel:', error.message);
            }
        }

        cfg.channelId = newChannel.id;
        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await chanInteraction.followUp({
            components: [
                successContainer({
                    title: 'Channel Updated',
                    body: `Verification panel moved to ${newChannel}.`,
                }),
            ],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            allowedMentions: NO_PINGS,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
    });

    chanCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No channel was selected. The setting was not changed.',
            }).catch(() => {});
        }
    });
}

async function handleRole(selectInteraction, rootInteraction, cfg, guildId, client) {
    await selectInteraction.deferUpdate();

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('verif_cfg_role')
        .setPlaceholder('Select a role...')
        .setMaxValues(1);

    await selectInteraction.followUp({
        components: [
            container({
                parts: [
                    text('### Change Verified Role'),
                    text(`**Current:** ${cfg.roleId ?`<@&${cfg.roleId}>`: '`Not set`'}\n\nSelect the role to assign when a user verifies.`),
                ],
            }),
            new ActionRowBuilder().addComponents(roleSelect),
        ],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        allowedMentions: NO_PINGS,
    });

    const roleCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'verif_cfg_role',
        time: 60_000,
        max: 1,
    });

    roleCollector.on('collect', async roleInteraction => {
        await roleInteraction.deferUpdate();
        const role = roleInteraction.roles.first();
        const guild = rootInteraction.guild;
        const botMember = guild.members.me;

        if (role.id === guild.id || role.managed) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.VALIDATION,
                message: 'Please choose a normal assignable role (not @everyone or a bot-managed role).',
            });
            return;
        }

        if (role.position >= botMember.roles.highest.position) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.PERMISSION,
                message: 'The verified role must be below my highest role in the server role hierarchy.',
            });
            return;
        }

        cfg.roleId = role.id;
        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await roleInteraction.followUp({
            components: [
                successContainer({
                    title: 'Role Updated',
                    body: `Verified role set to ${role}.`,
                }),
            ],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            allowedMentions: NO_PINGS,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
    });

    roleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No role was selected. The setting was not changed.',
            }).catch(() => {});
        }
    });
}

async function handleMessage(selectInteraction, rootInteraction, cfg, guildId, client) {
    try {
        const modal = new ModalBuilder()
            .setCustomId('verif_cfg_message')
            .setTitle('Edit Verification Message')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('message_input')
                        .setLabel('Message shown on the verification panel embed')
                        .setStyle(TextInputStyle.Paragraph)
                        .setValue(cfg.message || botConfig.verification.defaultMessage)
                        .setMaxLength(2000)
                        .setMinLength(1)
                        .setRequired(true),
                ),
            );

        await selectInteraction.showModal(modal);

        const submitted = await selectInteraction
            .awaitModalSubmit({
                filter: i =>
                    i.customId === 'verif_cfg_message' && i.user.id === selectInteraction.user.id,
                time: 120_000,
            })
            .catch(() => null);

        if (!submitted) return;

        cfg.message = submitted.fields.getTextInputValue('message_input').trim();

        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await updateLivePanel(rootInteraction.guild, cfg);

        await submitted.reply({
            components: [
                successContainer({
                    title: 'Message Updated',
                    body: 'The verification panel has been updated with the new message.',
                }),
            ],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            allowedMentions: NO_PINGS,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
    } catch (error) {
        logger.error('Error in handleMessage:', error);
        
    }
}

async function handleButtonText(selectInteraction, rootInteraction, cfg, guildId, client) {
    try {
        const modal = new ModalBuilder()
            .setCustomId('verif_cfg_button_text')
            .setTitle('Edit Button Text')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('button_text_input')
                        .setLabel('Button label (max 80 characters)')
                        .setStyle(TextInputStyle.Short)
                        .setValue(cfg.buttonText || botConfig.verification.defaultButtonText)
                        .setMaxLength(80)
                        .setMinLength(1)
                        .setRequired(true),
                ),
            );

        await selectInteraction.showModal(modal);

        const submitted = await selectInteraction
            .awaitModalSubmit({
                filter: i =>
                    i.customId === 'verif_cfg_button_text' && i.user.id === selectInteraction.user.id,
                time: 120_000,
            })
            .catch(() => null);

        if (!submitted) return;

        cfg.buttonText = submitted.fields.getTextInputValue('button_text_input').trim();

        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await updateLivePanel(rootInteraction.guild, cfg);

        await submitted.reply({
            components: [
                successContainer({
                    title: 'Button Text Updated',
                    body: `The verify button now reads **${cfg.buttonText}**.`,
                }),
            ],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            allowedMentions: NO_PINGS,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
    } catch (error) {
        logger.error('Error in handleButtonText:', error);
        
    }
}