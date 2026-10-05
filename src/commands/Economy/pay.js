import { SlashCommandBuilder } from 'discord.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import EconomyService from '../../services/economyService.js';
import { NO_PINGS, v2Flags } from '../../utils/componentsV2.js';
import {
    dataErrorContainer,
    failureContainer,
    resolveDisplayName,
    sendEconomy,
    successContainer,
} from '../../services/economy/economyViews.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Pay another user some of your cash')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to pay')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount to pay')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const senderId = interaction.user.id;
            const receiver = interaction.options.getUser("user");
            const amount = interaction.options.getInteger("amount");
            const guildId = interaction.guildId;

            logger.debug(`[ECONOMY] Pay command initiated`, { 
                senderId, 
                receiverId: receiver.id,
                amount,
                guildId
            });

            // `/pay` stays open while jailed: a jailed member must still be able
            // to settle a fine, so only the earning commands are locked.
            if (receiver.bot) {
                return sendEconomy(
                    interaction,
                    failureContainer({ title: 'Payment Failed', body: 'You cannot pay a bot.' }),
                );
            }

            if (receiver.id === senderId) {
                return sendEconomy(
                    interaction,
                    failureContainer({ title: 'Payment Failed', body: 'You cannot pay yourself.' }),
                );
            }

            if (amount <= 0) {
                return sendEconomy(
                    interaction,
                    failureContainer({
                        title: 'Payment Failed',
                        body: 'Amount must be greater than zero.',
                    }),
                );
            }

            const [senderData, receiverData] = await Promise.all([
                getEconomyData(client, guildId, senderId),
                getEconomyData(client, guildId, receiver.id)
            ]);

            if (!senderData || !receiverData) {
                logger.error('[ECONOMY] Failed to load economy data for pay', {
                    senderId,
                    hasSenderData: !!senderData,
                    receiverId: receiver.id,
                    hasReceiverData: !!receiverData,
                    guildId,
                });
                return sendEconomy(interaction, dataErrorContainer({ command: 'pay' }));
            }

await EconomyService.transferMoney(client, guildId, senderId, receiver.id, amount);

            const updatedSenderData = await getEconomyData(client, guildId, senderId);
            const updatedReceiverData = await getEconomyData(client, guildId, receiver.id);

            await sendEconomy(
                interaction,
                successContainer({
                    title: 'Payment Successful',
                    body: [
                        `You successfully paid **${await resolveDisplayName(interaction, receiver)}** **$${amount.toLocaleString()}**!`,
                        `**Your balance:** \`$${(updatedSenderData?.wallet || 0).toLocaleString()}\``,
                    ].join('\n'),
                    footer: `Paid to ${receiver.tag}`,
                }),
            );

            logger.info('[ECONOMY] Payment sent successfully', {
                senderId,
                receiverId: receiver.id,
                amount,
                senderBalance: updatedSenderData?.wallet,
                receiverBalance: updatedReceiverData?.wallet,
            });

            try {
                await receiver.send({
                    components: [
                        successContainer({
                            title: 'Incoming Payment!',
                            body: [
                                `${await resolveDisplayName(interaction, interaction.user)} paid you **$${amount.toLocaleString()}**.`,
                                `**Your balance:** \`$${(updatedReceiverData?.wallet || 0).toLocaleString()}\``,
                            ].join('\n'),
                        }),
                    ],
                    flags: v2Flags(),
                    allowedMentions: NO_PINGS,
                });
            } catch (error) {
                logger.warn(`Could not DM user ${receiver.id}: ${error.message}`);
            }
    }, { command: 'pay' })
};