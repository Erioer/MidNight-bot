import { SlashCommandBuilder } from 'discord.js';
import { code } from '../../utils/componentsV2.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { botConfig } from '../../config/bot.js';
import {
    applyPremiumCash,
    cooldownContainer,
    cooldownFooter,
    dataErrorContainer,
    hasPremiumRole,
    jailContainer,
    jailRemainingMs,
    premiumBonusLine,
    sendEconomy,
    successContainer,
} from '../../services/economy/economyViews.js';

const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
const DAILY_AMOUNT = botConfig.economy?.dailyAmount ?? 100;

export default {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily cash reward'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        logger.debug(`[ECONOMY] Daily claimed started for ${userId}`, { userId, guildId });

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            logger.error('[ECONOMY] Failed to load economy data for daily', { userId, guildId });
            return sendEconomy(interaction, dataErrorContainer({ command: 'daily' }));
        }

        const jailed = jailRemainingMs(userData, now);
        if (jailed > 0) {
            return sendEconomy(interaction, jailContainer({ command: 'daily', msRemaining: jailed }));
        }

        const lastDaily = userData.lastDaily || 0;
        const remainingTime = lastDaily + DAILY_COOLDOWN - now;

        if (remainingTime > 0) {
            return sendEconomy(
                interaction,
                cooldownContainer({
                    body: 'You need to wait before claiming daily again.',
                    footer: cooldownFooter('claim your daily rewards', remainingTime),
                }),
            );
        }

        const isPremium = await hasPremiumRole(interaction, client, guildId);
        const bonus = isPremium ? Math.floor(DAILY_AMOUNT * 0.1) : 0;
        const earned = applyPremiumCash(DAILY_AMOUNT, isPremium);

        userData.wallet = (userData.wallet || 0) + earned;
        userData.lastDaily = now;

        await setEconomyData(client, guildId, userId, userData);

        logger.info('[ECONOMY_TRANSACTION] Daily claimed', {
            userId,
            guildId,
            amount: earned,
            newWallet: userData.wallet,
            hasPremium: isPremium,
            timestamp: new Date().toISOString(),
        });

        const body =
            `You have claimed daily rewards **$${earned.toLocaleString()}**\n` +
            `**New balance:** ${code(`$${userData.wallet.toLocaleString()}`)}` +
            (isPremium ? `\n${premiumBonusLine(bonus)}` : '');

        return sendEconomy(
            interaction,
            successContainer({
                title: 'Daily Claimed!',
                body,
                footer: cooldownFooter('claim your daily rewards', DAILY_COOLDOWN),
                premium: isPremium,
            }),
        );
    }, { command: 'daily' }),
};