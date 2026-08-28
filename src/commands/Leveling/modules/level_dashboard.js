import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    LabelBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { MidNightError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { getLevelingConfig, saveLevelingConfig } from '../../../services/leveling/leveling.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';
import { startDashboardSession } from '../../../utils/dashboardSession.js';

function buildDashboardEmbed(cfg, guild) {
    const xpMin = cfg.xpRange?.min ?? cfg.xpPerMessage?.min ?? 15;
    const xpMax = cfg.xpRange?.max ?? cfg.xpPerMessage?.max ?? 40;
    const cooldown = cfg.xpCooldown ?? 60;
    const rawMsg = cfg.levelUpMessage || '{user} has earned the {role} role!';
    const msgPreview = `\`${rawMsg.length > 60 ? rawMsg.substring(0, 60) + '…' : rawMsg}\``;
    const firstPlaceRole = cfg.firstPlaceRoleId ? `<@&${cfg.firstPlaceRoleId}>` : '`Not set`';
    const boosterRole = cfg.boosterRoleId ? `<@&${cfg.boosterRoleId}>` : '`Not set`';
    const reactionXpOn = cfg.reactionXp?.enabled === true;

    const rewards = cfg.roleRewards ?? {};
    const rewardEntries = Object.entries(rewards).sort(([a], [b]) => Number(a) - Number(b));
    const rewardsValue = rewardEntries.length > 0
        ? rewardEntries.map(([lvl, roleId]) => `Level **${lvl}** → <@&${roleId}>`).join('\n')
        : '`None configured`';

    const ignoredChannels = cfg.ignoredChannels ?? [];
    const ignoredRoles = cfg.ignoredRoles ?? [];
    const ignoredChValue = ignoredChannels.length > 0 ? ignoredChannels.map(id => `<#${id}>`).join(',') : '`None`';
    const ignoredRoValue = ignoredRoles.length > 0 ? ignoredRoles.map(id => `<@&${id}>`).join(',') : '`None`';

    return new EmbedBuilder()
        .setTitle('⚡ Leveling System Dashboard')
        .setDescription(`Manage leveling settings for **${guild.name}**.\nSelect an option below to modify a setting.`)
        .setColor(getColor('info'))
        .addFields(
            { name: 'System Status', value: cfg.enabled ? '**Enabled**' : '**Disabled**', inline: true },
            { name: 'Announcements', value: cfg.announceLevelUp !== false ? '**Enabled**' : '**Disabled**', inline: true },
            { name: 'Reaction XP', value: reactionXpOn ? '**Enabled**' : '**Disabled**', inline: true },
            { name: 'XP per Message', value: `\`${xpMin} – ${xpMax}\``, inline: true },
            { name: 'XP Cooldown', value: `\`${cooldown}s\``, inline: true },
            { name: 'First-Place Role', value: firstPlaceRole, inline: true },
            { name: 'Booster Role', value: boosterRole, inline: true },
            { name: 'Level-up Message', value: msgPreview, inline: false },
            { name: 'Role Rewards', value: rewardsValue, inline: false },
            { name: 'Ignored Channels', value: ignoredChValue, inline: true },
            { name: 'Ignored Roles', value: ignoredRoValue, inline: true },
        )
        .setFooter({ text: 'Dashboard closes after 10 minutes of inactivity' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`level_cfg_${guildId}`)
        .setPlaceholder('Select a setting to configure...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Edit Level-up Message')
                .setDescription('Customise the message shown when a user earns a role')
                .setValue('message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Set XP Range')
                .setDescription('Set the minimum and maximum XP rewarded per message')
                .setValue('xp_range')
                .setEmoji('🎲'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Set XP Cooldown')
                .setDescription('Seconds between XP grants for the same user')
                .setValue('xp_cooldown')
                .setEmoji('⏱️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Add Role Reward')
                .setDescription('Award a role when a user reaches a specific level')
                .setValue('role_reward_add')
                .setEmoji('🏆'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Remove Role Reward')
                .setDescription('Remove a role reward from a specific level')
                .setValue('role_reward_remove')
                .setEmoji('\ud83d\uddd1\ufe0f'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Set First-Place Role')
                .setDescription('Role given to whoever is currently #1 on the XP leaderboard')
                .setValue('first_place_role')
                .setEmoji('👑'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Set Booster Role')
                .setDescription('Role that grants a 10% XP bonus (alongside native server boosters)')
                .setValue('booster_role')
                .setEmoji('🚀'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Ignored Channels')
                .setDescription('Toggle channels where XP will not be awarded')
                .setValue('ignore_channels')
                .setEmoji('\ud83d\udeab'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Ignored Roles')
                .setDescription('Toggle roles that will not receive XP')
                .setValue('ignore_roles')
                .setEmoji('\ud83d\udeab'),
        );
}

function buildButtonRow(cfg, guildId, disabled = false) {
    const announceOn = cfg.announceLevelUp !== false;
    const systemOn = cfg.enabled !== false;
    const reactionXpOn = cfg.reactionXp?.enabled === true;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`level_cfg_toggle_announce_${guildId}`)
            .setLabel('Announcements')
            .setStyle(announceOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji('📣')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`level_cfg_toggle_system_${guildId}`)
            .setLabel('Leveling')
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji('⚡')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`level_cfg_toggle_reactionxp_${guildId}`)
            .setLabel('Reaction XP')
            .setStyle(reactionXpOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji('🚀')
            .setDisabled(disabled),
    );
}

async function refreshDashboard(rootInteraction, cfg, guildId) {
    const selectMenu = buildSelectMenu(guildId);
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [buildDashboardEmbed(cfg, rootInteraction.guild)],
        components: [
            buildButtonRow(cfg, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    }).catch(() => {});
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const cfg = await getLevelingConfig(client, guildId);

            await startDashboardSession({
                interaction,
                embeds: [buildDashboardEmbed(cfg, interaction.guild)],
                components: [
                    buildButtonRow(cfg, guildId),
                    new ActionRowBuilder().addComponents(buildSelectMenu(guildId)),
                ],
                selectMenuId: `level_cfg_${guildId}`,
                buttonMatcher: (customId) =>
                    customId === `level_cfg_toggle_announce_${guildId}` ||
                    customId === `level_cfg_toggle_system_${guildId}` ||
                    customId === `level_cfg_toggle_reactionxp_${guildId}`,
                onSelect: async (selectInteraction) => {
                    const selectedOption = selectInteraction.values[0];
                    switch (selectedOption) {
                        case 'message':
                            await handleMessage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'xp_range':
                            await handleXpRange(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'xp_cooldown':
                            await handleXpCooldown(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'role_reward_add':
                            await handleRoleRewardAdd(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'role_reward_remove':
                            await handleRoleRewardRemove(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'first_place_role':
                            await handleFirstPlaceRole(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'booster_role':
                            await handleBoosterRole(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'ignore_channels':
                            await handleIgnoreChannels(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'ignore_roles':
                            await handleIgnoreRoles(selectInteraction, interaction, cfg, guildId, client);
                            break;
                    }
                },
                onButton: async (btnInteraction) => {
                    await btnInteraction.deferUpdate().catch(() => null);
                    const isAnnounce = btnInteraction.customId === `level_cfg_toggle_announce_${guildId}`;
                    const isReactionXp = btnInteraction.customId === `level_cfg_toggle_reactionxp_${guildId}`;

                    if (isAnnounce) {
                        cfg.announceLevelUp = cfg.announceLevelUp === false;
                        await saveLevelingConfig(client, guildId, cfg);
                        await btnInteraction.followUp({
                            embeds: [
                                successEmbed(
                                    '✅ Announcements Updated',
                                    `Level-up announcements are now **${cfg.announceLevelUp ? 'enabled' : 'disabled'}**.`,
                                ),
                            ],
                            flags: MessageFlags.Ephemeral,
                        });
                    } else if (isReactionXp) {
                        cfg.reactionXp = cfg.reactionXp ?? { min: 25, max: 25, cooldown: 300 };
                        cfg.reactionXp.enabled = cfg.reactionXp.enabled !== true;
                        await saveLevelingConfig(client, guildId, cfg);
                        await btnInteraction.followUp({
                            embeds: [
                                successEmbed(
                                    '✅ Reaction XP Updated',
                                    `Reaction XP is now **${cfg.reactionXp.enabled ? 'enabled' : 'disabled'}**.${cfg.reactionXp.enabled ? `\nBoth the reactor and the message author earn **${cfg.reactionXp.min}–${cfg.reactionXp.max} XP** (${cfg.reactionXp.cooldown}s cooldown each).` : ''}`,
                                ),
                            ],
                            flags: MessageFlags.Ephemeral,
                        });
                    } else {
                        const wasEnabled = cfg.enabled !== false;
                        cfg.enabled = !wasEnabled;
                        await saveLevelingConfig(client, guildId, cfg);
                        await btnInteraction.followUp({
                            embeds: [
                                successEmbed(
                                    '✅ System Updated',
                                    `The leveling system is now **${cfg.enabled ? 'enabled' : 'disabled'}**.${!cfg.enabled ? '\nUsers will not earn XP until the system is re-enabled.' : ''}`,
                                ),
                            ],
                            flags: MessageFlags.Ephemeral,
                        });
                    }

                    await refreshDashboard(interaction, cfg, guildId);
                },
            });
        } catch (error) {
            if (error instanceof MidNightError) throw error;
            logger.error('Unexpected error in level_dashboard:', error);
            throw new MidNightError(
                `Level dashboard failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Failed to open the leveling dashboard.',
            );
        }
    },
};

async function handleRoleRewardAdd(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_role_reward_add_${guildId}`)
        .setTitle('🏆 Add Role Reward');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('reward_role')
        .setPlaceholder('Select a role to award...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Role to Award')
        .setDescription('This role will be given when the user reaches the level')
        .setRoleSelectMenuComponent(roleSelect);

    const levelInput = new TextInputBuilder()
        .setCustomId('reward_level')
        .setLabel('Level required (1–500)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('10')
        .setMaxLength(3)
        .setMinLength(1)
        .setRequired(true);

    modal.addLabelComponents(roleLabel);
    modal.addComponents(new ActionRowBuilder().addComponents(levelInput));

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === `level_cfg_role_reward_add_${guildId}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const rawLevel = submitted.fields.getTextInputValue('reward_level').trim();
    const level = parseInt(rawLevel, 10);

    if (isNaN(level) || level < 1 || level > 500) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Level must be a whole number between **1** and **500**.' });
        return;
    }

    const roleId = submitted.fields.getField('reward_role').values[0];

    cfg.roleRewards = cfg.roleRewards ?? {};
    cfg.roleRewards[level] = roleId;
    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('Role Reward Added', `<@&${roleId}> will now be awarded at level **${level}**.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleRoleRewardRemove(selectInteraction, rootInteraction, cfg, guildId, client) {
    const rewards = cfg.roleRewards ?? {};
    const entries = Object.entries(rewards).sort(([a], [b]) => Number(a) - Number(b));

    if (entries.length === 0) {
        await selectInteraction.deferUpdate();
        await replyUserError(selectInteraction, {
            type: ErrorTypes.USER_INPUT,
            message: 'There are no role rewards configured to remove.',
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_role_reward_remove_${guildId}`)
        .setTitle('🗑️ Remove Role Reward');

    const infoInput = new TextInputBuilder()
        .setCustomId('current_rewards')
        .setLabel('Current rewards (read-only)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(entries.map(([lvl, roleId]) => `Level ${lvl}: <@&${roleId}>`).join('\n'))
        .setRequired(false);

    const levelInput = new TextInputBuilder()
        .setCustomId('remove_level')
        .setLabel('Level to remove reward from')
        .setStyle(TextInputStyle.Short)
        .setValue(entries[0][0])
        .setMaxLength(3)
        .setMinLength(1)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(infoInput),
        new ActionRowBuilder().addComponents(levelInput),
    );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === `level_cfg_role_reward_remove_${guildId}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const rawLevel = submitted.fields.getTextInputValue('remove_level').trim();
    const level = parseInt(rawLevel, 10);

    if (isNaN(level) || !cfg.roleRewards?.[level]) {
        await replyUserError(submitted, { type: ErrorTypes.USER_INPUT, message: `No role reward is configured for level **${rawLevel}**.` });
        return;
    }

    delete cfg.roleRewards[level];
    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('Role Reward Removed', `The role reward for level **${level}** has been removed.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleFirstPlaceRole(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_first_place_${guildId}`)
        .setTitle('\ud83d\udce2 Set First-Place Role');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('first_place_role')
        .setPlaceholder('Select the role for #1 on the leaderboard...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('First-Place Role')
        .setDescription('Automatically moves to whoever is currently #1 on the XP leaderboard')
        .setRoleSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === `level_cfg_first_place_${guildId}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const roleId = submitted.fields.getField('first_place_role').values[0];

    cfg.firstPlaceRoleId = roleId;
    cfg.topXpHolder = null;
    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('\u2705 Role Set', `<@&${roleId}> will now be given to whoever reaches #1 on the XP leaderboard.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleBoosterRole(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_booster_role_${guildId}`)
        .setTitle('🚀 Set Booster Role');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('booster_role')
        .setPlaceholder('Select the role that grants the 10% XP bonus...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Booster Role')
        .setDescription('Members with this role earn a flat 10% XP bonus (alongside native server boosters)')
        .setRoleSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === `level_cfg_booster_role_${guildId}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const roleId = submitted.fields.getField('booster_role').values[0];

    cfg.boosterRoleId = roleId;
    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('✅ Role Set', `<@&${roleId}> will now receive a **+10%** XP bonus on all XP earned.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleIgnoreChannels(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_ignore_channels_${guildId}`)
        .setTitle('\ud83d\udeab Ignored Channels');

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ignore_channel')
        .setPlaceholder('Select channels to toggle...')
        .setMinValues(1)
        .setMaxValues(10)
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true);

    const channelLabel = new LabelBuilder()
        .setLabel('Toggle Ignored Channels')
        .setDescription('Selected channels will be toggled — XP will not be awarded in them')
        .setChannelSelectMenuComponent(channelSelect);

    modal.addLabelComponents(channelLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === `level_cfg_ignore_channels_${guildId}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const selectedIds = submitted.fields.getField('ignore_channel').values;
    const ignoreSet = new Set(cfg.ignoredChannels ?? []);

    for (const id of selectedIds) {
        if (ignoreSet.has(id)) {
            ignoreSet.delete(id);
        } else {
            ignoreSet.add(id);
        }
    }

    cfg.ignoredChannels = Array.from(ignoreSet);
    await saveLevelingConfig(client, guildId, cfg);

    const list = cfg.ignoredChannels.length > 0
        ? cfg.ignoredChannels.map(id => `<#${id}>`).join(',')
        : '`None`';

    await submitted.reply({
        embeds: [successEmbed('\u2705 Ignored Channels Updated', `XP will not be awarded in: ${list}`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleIgnoreRoles(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_ignore_roles_${guildId}`)
        .setTitle('\ud83d\udeab Ignored Roles');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('ignore_role')
        .setPlaceholder('Select roles to toggle...')
        .setMinValues(1)
        .setMaxValues(10)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Toggle Ignored Roles')
        .setDescription('Selected roles will be toggled — members with them will not earn XP')
        .setRoleSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === `level_cfg_ignore_roles_${guildId}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const selectedIds = submitted.fields.getField('ignore_role').values;
    const ignoreSet = new Set(cfg.ignoredRoles ?? []);

    for (const id of selectedIds) {
        if (ignoreSet.has(id)) {
            ignoreSet.delete(id);
        } else {
            ignoreSet.add(id);
        }
    }

    cfg.ignoredRoles = Array.from(ignoreSet);
    await saveLevelingConfig(client, guildId, cfg);

    const list = cfg.ignoredRoles.length > 0
        ? cfg.ignoredRoles.map(id => `<@&${id}>`).join(',')
        : '`None`';

    await submitted.reply({
        embeds: [successEmbed('\u2705 Ignored Roles Updated', `These roles will not earn XP: ${list}`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleMessage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('level_cfg_message')
        .setTitle('💬 Edit Level-up Message')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('message_input')
                    .setLabel('Message ({user}, {role}, {level} available)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(cfg.levelUpMessage || '{user} has earned the {role} role!')
                    .setMaxLength(500)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('{user} has earned the {role} role!'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'level_cfg_message' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newMessage = submitted.fields.getTextInputValue('message_input').trim();

    if (!newMessage.includes('{user}') && !newMessage.includes('{role}')) {
        logger.warn(
            `Level-up message set without {user} or {role} placeholders in guild ${guildId}`,
        );
    }

    cfg.levelUpMessage = newMessage;
    await saveLevelingConfig(client, guildId, cfg);

    const preview = newMessage.replace('{user}', '@User').replace('{role}', 'Champion').replace('{level}', '5');

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Message Updated',
                `Level-up message saved.\n**Preview:** ${preview}`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleXpRange(selectInteraction, rootInteraction, cfg, guildId, client) {
    const currentMin = cfg.xpRange?.min ?? cfg.xpPerMessage?.min ?? 15;
    const currentMax = cfg.xpRange?.max ?? cfg.xpPerMessage?.max ?? 40;

    const modal = new ModalBuilder()
        .setCustomId('level_cfg_xp_range')
        .setTitle('Set XP Range per Message')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('xp_min_input')
                    .setLabel('Minimum XP (1–500)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(currentMin))
                    .setMaxLength(3)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('15'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('xp_max_input')
                    .setLabel('Maximum XP (1–500)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(currentMax))
                    .setMaxLength(3)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('40'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'level_cfg_xp_range' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const rawMin = submitted.fields.getTextInputValue('xp_min_input').trim();
    const rawMax = submitted.fields.getTextInputValue('xp_max_input').trim();
    const newMin = parseInt(rawMin, 10);
    const newMax = parseInt(rawMax, 10);

    if (isNaN(newMin) || isNaN(newMax) || newMin < 1 || newMax < 1 || newMin > 500 || newMax > 500) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Both XP values must be whole numbers between **1** and **500**.' });
        return;
    }

    if (newMin > newMax) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Minimum XP cannot be greater than maximum XP.' });
        return;
    }

    cfg.xpRange = { min: newMin, max: newMax };
    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ XP Range Updated',
                `Users will now earn between **${newMin}** and **${newMax}** XP per message.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleXpCooldown(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('level_cfg_cooldown')
        .setTitle('⏱️ Set XP Cooldown')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('cooldown_input')
                    .setLabel('Cooldown in seconds (0–3600)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(cfg.xpCooldown ?? 60))
                    .setMaxLength(4)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('60'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'level_cfg_cooldown' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const raw = submitted.fields.getTextInputValue('cooldown_input').trim();
    const newCooldown = parseInt(raw, 10);

    if (isNaN(newCooldown) || newCooldown < 0 || newCooldown > 3600) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Cooldown must be a whole number between **0** and **3600** seconds.' });
        return;
    }

    cfg.xpCooldown = newCooldown;
    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Cooldown Updated',
                `XP cooldown set to **${newCooldown} second${newCooldown !== 1 ? 's' : ''}**.${newCooldown === 0 ? '\n> ⚠️ A cooldown of 0 means XP is granted on every message.' : ''}`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}