import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { NO_PINGS, container, section, text, thumbnail } from '../../utils/componentsV2.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

/**
 * Components V2 random-user card. Embed fields become labeled text lines and
 * the avatar becomes a section thumbnail; the SUCCESS accent matches the old
 * success embed (the per-user displayHexColor accent has no V2 equivalent here).
 */
function buildRandomUserContainer({ title, body, avatarUrl, username, isBot, rolesLabel, rolesValue }) {
    return container({
        accentColor: 3066993,
        parts: [
            section(
                [text(`### ${title}`), text(body)],
                thumbnail(avatarUrl),
            ),
            text(`**Username:** ${username}\n**Bot:** ${isBot ? 'Yes' : 'No'}\n**${rolesLabel}:** ${rolesValue}`),
        ],
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName('randomuser')
        .setDescription('Select a random user from the server')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Limit selection to users with this role')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('bots')
                .setDescription('Include bots in the selection (default: false)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('online')
                .setDescription('Only select from online users (default: false)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('mention')
                .setDescription('Mention the selected user (default: false)')
                .setRequired(false)),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`RandomUser interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'randomuser'
            });
            return;
        }

        if (!interaction.guild) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'This command can only be used in a server/guild.',
            });
        }

        const role = interaction.options.getRole('role');
        const includeBots = interaction.options.getBoolean('bots') || false;
        const onlineOnly = interaction.options.getBoolean('online') || false;
        const shouldMention = interaction.options.getBoolean('mention') || false;

        let members = interaction.guild.members.cache.filter(member => {
            if (member.user.bot && !includeBots) return false;

            if (onlineOnly && member.presence?.status === 'offline') return false;

            if (role && !member.roles.cache.has(role.id)) return false;

            return true;
        });

        let memberArray = Array.from(members.values());

        if (!includeBots) {
            memberArray = memberArray.filter(member => !member.user.bot);
        }

        if (memberArray.length === 0) {
            let errorMessage = 'Could not find any users matching your filters:';
            if (role) errorMessage = `No users have the **${role.name}** role.`;
            if (onlineOnly) errorMessage = 'No users are currently online.';
            if (role && onlineOnly) errorMessage = `No **${role.name}** members are online.`;

            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: errorMessage + '\n\nTry adjusting your filters.',
            });
        }

        const randomIndex = Math.floor(Math.random() * memberArray.length);
        const selectedMember = memberArray[randomIndex];

        const user = selectedMember.user;
        const joinDate = selectedMember.joinedAt;
        const roles = selectedMember.roles.cache
            .filter(role => role.id !== interaction.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(role => role.toString())
            .slice(0, 10);

        const userContainer = buildRandomUserContainer({
            title: '🎲 Random User Selected',
            body: shouldMention ? `${selectedMember}` : `**${user.username}**`,
            avatarUrl: user.displayAvatarURL({ dynamic: true, size: 256 }),
            username: user.username,
            isBot: user.bot,
            rolesLabel: `Roles (${roles.length})`,
            rolesValue: roles.length > 0 ? roles.slice(0, 5).join('') + (roles.length > 5 ? `+${roles.length - 5} more` : '') : 'No roles',
        });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`randomuser_${interaction.user.id}_again`)
                    .setLabel('🎲 Pick Another User')
                    .setStyle(ButtonStyle.Primary)
            );

        let currentContainer = userContainer;
        const response = await interaction.editReply({
            components: [currentContainer, row],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: shouldMention ? { users: [user.id] } : NO_PINGS,
        });

        const filter = (i) => i.customId === `randomuser_${interaction.user.id}_again` && i.user.id === interaction.user.id;
        const collector = response.createMessageComponentCollector({ filter, time: 300000 });

        collector.on('collect', async (i) => {
            try {
                let newMembers = interaction.guild.members.cache.filter(member => {
                    if (member.user.bot && !includeBots) return false;

                    if (onlineOnly && member.presence?.status === 'offline') return false;

                    if (role && !member.roles.cache.has(role.id)) return false;

                    return true;
                });

                let newMemberArray = Array.from(newMembers.values());

                if (!includeBots) {
                    newMemberArray = newMemberArray.filter(member => !member.user.bot);
                }

                if (newMemberArray.length === 0) {
                    await replyUserError(i, {
                        type: ErrorTypes.USER_INPUT,
                        message: 'No users found matching the criteria.',
                    });
                    return;
                }

                const newRandomIndex = Math.floor(Math.random() * newMemberArray.length);
                const newSelectedMember = newMemberArray[newRandomIndex];
                const newUser = newSelectedMember.user;

                const newRoles = newSelectedMember.roles.cache
                    .filter(r => r.id !== interaction.guild.id)
                    .sort((a, b) => b.position - a.position)
                    .map(r => r.toString())
                    .slice(0, 10);

                const newUserContainer = buildRandomUserContainer({
                    title: '🎲 Random User Selected',
                    body: shouldMention ? `${newSelectedMember}` : `**${newUser.username}**`,
                    avatarUrl: newUser.displayAvatarURL({ dynamic: true, size: 256 }),
                    username: newUser.username,
                    isBot: newUser.bot,
                    rolesLabel: `Roles (${newRoles.length})`,
                    rolesValue: newRoles.length > 0 ? newRoles.slice(0, 5).join('') + (newRoles.length > 5 ? `+${newRoles.length - 5} more` : '') : 'No roles',
                });

                currentContainer = newUserContainer;
                await i.update({
                    components: [currentContainer, row],
                    flags: MessageFlags.IsComponentsV2,
                    allowedMentions: shouldMention ? { users: [newUser.id] } : NO_PINGS,
                });

            } catch (error) {
                logger.error('Button interaction error:', error);
                await i.reply({
                    content: 'An error occurred while selecting another user.',
                    flags: ['Ephemeral']
                });
            }
        });

        collector.on('end', () => {
            const disabledRow = ActionRowBuilder.from(row).setComponents(
                ButtonBuilder.from(row.components[0]).setDisabled(true)
            );

            interaction.editReply({ components: [disabledRow] }).catch(console.error);
        });
    },
};