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
        .setName('deposit')
        .setDescription('Deposit money from your wallet into your bank')
        .addStringOption((option) =>
            option
                .setName('amount')
                .setDescription('Amount to deposit (number or "all")')
                .setRequired(true),
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const amountInput = interaction.options.getString('amount');
        const isAll = amountInput.toLowerCase() === 'all';

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            logger.error('[ECONOMY] Failed to load economy data for deposit', { userId, guildId });
            return sendEconomy(interaction, dataErrorContainer({ command: 'deposit' }));
        }

        const maxBank = getMaxBankCapacity(userData);
        const wallet = userData.wallet || 0;
        const bank = userData.bank || 0;

        let depositAmount;

        if (isAll) {
            depositAmount = wallet;
        } else {
            depositAmount = parseInt(amountInput, 10);

            if (Number.isNaN(depositAmount) || depositAmount <= 0) {
                return sendEconomy(
                    interaction,
                    failureContainer({
                        title: 'Invalid Deposit Amount',
                        body: `Please enter a valid number or \`all\`. You entered: \`${amountInput}\``,
                    }),
                );
            }
        }

        if (depositAmount === 0) {
            return sendEconomy(
                interaction,
                failureContainer({ title: 'Nothing to Deposit', body: 'You have no cash to deposit.' }),
            );
        }

        const availableSpace = maxBank - bank;
        if (availableSpace <= 0) {
            return sendEconomy(
                interaction,
                failureContainer({
                    title: 'Bank is Full',
                    body:
                        `Your bank is currently full (Max Capacity: \`$${maxBank.toLocaleString()}\`). ` +
                        'Purchase a **Bank Upgrade** to increase your limit.',
                }),
            );
        }

        // Clamping is surfaced as a notice in the same reply rather than a
        // separate V1 followUp, so the whole result stays one V2 message.
        const notice = [];

        if (depositAmount > wallet) {
            depositAmount = wallet;
            notice.push(
                `You tried to deposit more than you have. Depositing your remaining cash: **$${depositAmount.toLocaleString()}**`,
            );
        }

        if (depositAmount > availableSpace) {
            depositAmount = availableSpace;
            if (!isAll) {
                notice.push(
                    `You only had space for **$${depositAmount.toLocaleString()}** in your bank account ` +
                        `(Max: \`$${maxBank.toLocaleString()}\`). The rest remains in your cash.`,
                );
            }
        }

        if (depositAmount <= 0) {
            return sendEconomy(
                interaction,
                failureContainer({
                    title: 'Nothing to Deposit',
                    body: 'The amount you tried to deposit was either 0 or exceeded your bank capacity after checking your cash balance.',
                }),
            );
        }

        userData.wallet = wallet - depositAmount;
        userData.bank = bank + depositAmount;
        await setEconomyData(client, guildId, userId, userData);

        const components = [];

        if (notice.length > 0) {
            components.push(
                noticeContainer({ title: 'Deposit Adjusted', body: notice.join('\n') }),
            );
        }

        components.push(
            successContainer({
                title: 'Deposit Successful',
                body: [
                    `You successfully deposited **$${depositAmount.toLocaleString()}** into your bank.`,
                    `**Cash:** \`$${userData.wallet.toLocaleString()}\``,
                    `**Bank:** \`$${userData.bank.toLocaleString()}\` of \`$${maxBank.toLocaleString()}\``,
                ].join('\n'),
            }),
        );

        return sendEconomy(interaction, ...components);
    }, { command: 'deposit' }),
};