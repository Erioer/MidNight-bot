import { SlashCommandBuilder } from 'discord.js';
import { getEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    balanceContainer,
    dataErrorContainer,
    failureContainer,
    getEconomyRank,
    resolveDisplayName,
    sendEconomy,
} from '../../services/economy/economyViews.js';

export default {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription("Check your or someone else's balance")
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('User to check balance for')
                .setRequired(false),
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userOption = interaction.options.getUser('user');
        const targetUser = userOption || interaction.user;
        const guildId = interaction.guildId;

        logger.debug(`[ECONOMY] Balance check for ${targetUser.id}`, {
            userId: targetUser.id,
            guildId,
        });

        if (targetUser.bot) {
            return sendEconomy(
                interaction,
                failureContainer({
                    title: 'Unsupported User',
                    body: "Bots don't have an economy balance.",
                }),
            );
        }

        const userData = await getEconomyData(client, guildId, targetUser.id);

        if (!userData) {
            logger.error('[ECONOMY] Failed to load economy data for balance', {
                userId: targetUser.id,
                guildId,
            });
            return sendEconomy(interaction, dataErrorContainer({ command: 'balance' }));
        }

        const maxBank = getMaxBankCapacity(userData);
        const wallet = typeof userData.wallet === 'number' ? userData.wallet : 0;
        const bank = typeof userData.bank === 'number' ? userData.bank : 0;
        const displayName = await resolveDisplayName(interaction, targetUser);

        const { rank, total } = await getEconomyRank(client, guildId, targetUser.id);

        logger.info('[ECONOMY] Balance retrieved', { userId: targetUser.id, wallet, bank });

        return sendEconomy(
            interaction,
            balanceContainer({
                displayName,
                avatarUrl: targetUser.displayAvatarURL({ size: 256 }),
                wallet,
                bank,
                maxBank,
                rank,
                totalMembers: total,
                isSelf: targetUser.id === interaction.user.id,
            }),
        );
    }, { command: 'balance' }),
};