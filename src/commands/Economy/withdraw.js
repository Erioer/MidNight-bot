import { SlashCommandBuilder } from 'discord.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import {
    dataErrorContainer,
    failureContainer,
    noticeContainer,
    sendEconomy,
    successContainer,
} from '../../services/economy/economyViews.js';

export default {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('Withdraw money from your bank to your wallet')
        .addIntegerOption((option) =>
            option
                .setName('amount')
                .setDescription('Amount to withdraw')
                .setRequired(true)
                .setMinValue(1),
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const requested = interaction.options.getInteger('amount');

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            logger.error('[ECONOMY] Failed to load economy data for withdraw', { userId, guildId });
            return sendEconomy(interaction, dataErrorContainer({ command: 'withdraw' }));
        }

        const maxBank = getMaxBankCapacity(userData);
        const wallet = userData.wallet || 0;
        const bank = userData.bank || 0;

        let withdrawAmount = requested;

        if (withdrawAmount <= 0) {
            return sendEconomy(
                interaction,
                failureContainer({
                    title: 'Invalid Withdrawal Amount',
                    body: 'You must withdraw a positive amount.',
                }),
            );
        }

        const notice = [];

        if (withdrawAmount > bank) {
            withdrawAmount = bank;
            notice.push(
                `You only had **$${withdrawAmount.toLocaleString()}** in your bank. Withdrawing the full available balance.`,
            );
        }

        if (withdrawAmount === 0) {
            return sendEconomy(
                interaction,
                failureContainer({ title: 'Empty Bank Account', body: 'Your bank account is empty.' }),
            );
        }

        userData.wallet = wallet + withdrawAmount;
        userData.bank = bank - withdrawAmount;
        await setEconomyData(client, guildId, userId, userData);

        const components = [];

        if (notice.length > 0) {
            components.push(
                noticeContainer({ title: 'Withdrawal Adjusted', body: notice.join('\n') }),
            );
        }

        components.push(
            successContainer({
                title: 'Withdrawal Successful',
                body: [
                    `You successfully withdrew **$${withdrawAmount.toLocaleString()}** from your bank.`,
                    `**Cash:** \`$${userData.wallet.toLocaleString()}\``,
                    `**Bank:** \`$${userData.bank.toLocaleString()}\` of \`$${maxBank.toLocaleString()}\``,
                ].join('\n'),
            }),
        );

        return sendEconomy(interaction, ...components);
    }, { command: 'withdraw' }),
};