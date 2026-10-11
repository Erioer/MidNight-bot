import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { NO_PINGS, v2Flags } from '../../utils/componentsV2.js';
import { successContainer } from '../../services/economy/economyViews.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
export default {
    data: new SlashCommandBuilder()
        .setName("firstmsg")
        .setDescription("Get a link to the first message in this channel")
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    category: "Utility",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`FirstMsg interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'firstmsg'
            });
            return;
        }

        const messages = await interaction.channel.messages.fetch({
            limit: 1,
            after: '1',
            cache: false
        });

        const firstMessage = messages.first();

        if (!firstMessage) {
            logger.info(`FirstMsg - no messages found in channel`, {
                userId: interaction.user.id,
                channelId: interaction.channelId,
                guildId: interaction.guildId
            });
            return await InteractionHelper.safeEditReply(interaction, {
                components: [successContainer({ title: 'First Message', body: 'No messages found in this channel!' })],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });
        }

        const messageLink = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${firstMessage.id}`;

        await InteractionHelper.safeEditReply(interaction, {
            components: [
                successContainer({
                    title: "First Message in #" + interaction.channel.name,
                    body: `Message Link: ${messageLink}`,
                }),
            ],
            flags: v2Flags(),
            allowedMentions: NO_PINGS,
        });

        logger.info(`FirstMsg command executed`, {
            userId: interaction.user.id,
            channelId: interaction.channelId,
            messageId: firstMessage.id,
            guildId: interaction.guildId
        });
    },
};