import { SlashCommandBuilder } from 'discord.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { BotConfig } from '../../config/bot.js';
import {
    applyPremiumCash,
    applyPremiumChance,
    cooldownContainer,
    cooldownFooter,
    dataErrorContainer,
    failureContainer,
    hasPremiumRole,
    jailContainer,
    jailRemainingMs,
    premiumBonusLine,
    resolveDisplayName,
    sendEconomy,
    successContainer,
} from '../../services/economy/economyViews.js';

const ROB_COOLDOWN = BotConfig.economy?.cooldowns?.rob ?? 4 * 60 * 60 * 1000;
const BASE_ROB_SUCCESS_CHANCE = BotConfig.economy?.robSuccessRate ?? 0.4;
const ROB_PERCENTAGE = 0.15;
const FINE_PERCENTAGE = 0.1;

export default {
    data: new SlashCommandBuilder()
        .setName('rob')
        .setDescription('Attempt to rob another user (very risky)')
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('User to rob')
                .setRequired(true),
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const robberId = interaction.user.id;
        const victimUser = interaction.options.getUser('user');
        const guildId = interaction.guildId;
        const now = Date.now();

        if (robberId === victimUser.id) {
            return sendEconomy(
                interaction,
                failureContainer({ title: 'Robbery Failed', body: 'You cannot rob yourself.' }),
            );
        }

        if (victimUser.bot) {
            return sendEconomy(
                interaction,
                failureContainer({ title: 'Robbery Failed', body: 'You cannot rob a bot.' }),
            );
        }

        const robberData = await getEconomyData(client, guildId, robberId);
        const victimData = await getEconomyData(client, guildId, victimUser.id);

        if (!robberData || !victimData) {
            logger.error('[ECONOMY] Failed to load economy data for rob', {
                robberId,
                hasRobberData: !!robberData,
                victimId: victimUser.id,
                hasVictimData: !!victimData,
                guildId,
            });
            return sendEconomy(interaction, dataErrorContainer({ command: 'rob' }));
        }

        const jailed = jailRemainingMs(robberData, now);
        if (jailed > 0) {
            return sendEconomy(interaction, jailContainer({ command: 'rob', msRemaining: jailed }));
        }

        const lastRob = robberData.lastRob || 0;
        const remainingTime = lastRob + ROB_COOLDOWN - now;
        if (remainingTime > 0) {
            return sendEconomy(
                interaction,
                cooldownContainer({
                    body: 'You need to lay low before attempting another robbery.',
                    footer: cooldownFooter('rob', remainingTime),
                }),
            );
        }

        if ((victimData.wallet || 0) < 500) {
            const victimName = await resolveDisplayName(interaction, victimUser);
            return sendEconomy(
                interaction,
                failureContainer({
                    title: 'Robbery Failed',
                    body: `${victimName} is too poor. They need at least **$500** cash to be worth robbing.`,
                }),
            );
        }

        const hasSafe = (victimData.inventory || {})['personal_safe'] || 0;
        const hasPremium = await hasPremiumRole(interaction, client, guildId);

        if (hasSafe > 0) {
            robberData.lastRob = now;
            await setEconomyData(client, guildId, robberId, robberData);

            const victimName = await resolveDisplayName(interaction, victimUser);
            return sendEconomy(
                interaction,
                failureContainer({
                    title: 'Robbery Blocked',
                    body:
                        `${victimName} was prepared! Your attempt failed because they own a ` +
                        '**Personal Safe**. You got away clean but did not gain anything.',
                }),
            );
        }

        const isSuccessful = Math.random() < applyPremiumChance(BASE_ROB_SUCCESS_CHANCE, hasPremium);

        if (isSuccessful) {
            const baseStolen = Math.floor((victimData.wallet || 0) * ROB_PERCENTAGE);
            const bonus = hasPremium ? Math.floor(baseStolen * 0.1) : 0;
            const amountStolen = applyPremiumCash(baseStolen, hasPremium);

            robberData.wallet = (robberData.wallet || 0) + amountStolen;
            victimData.wallet = Math.max(0, (victimData.wallet || 0) - amountStolen);
            robberData.lastRob = now;

            await setEconomyData(client, guildId, robberId, robberData);
            await setEconomyData(client, guildId, victimUser.id, victimData);

            const victimName = await resolveDisplayName(interaction, victimUser);
            const lines = [
                `You successfully stole **$${amountStolen.toLocaleString()}** from ${victimName}!`,
                `**Your balance:** \`$${robberData.wallet.toLocaleString()}\``,
                `**${victimName}'s balance:** \`$${victimData.wallet.toLocaleString()}\``,
            ];
            if (hasPremium) lines.push(premiumBonusLine(bonus));

            return sendEconomy(
                interaction,
                successContainer({
                    title: 'Robbery Successful',
                    body: lines.join('\n'),
                    footer: cooldownFooter('rob', ROB_COOLDOWN),
                    premium: hasPremium,
                }),
            );
        }

        const wallet = robberData.wallet || 0;
        const fineAmount = Math.floor(wallet * FINE_PERCENTAGE);
        robberData.wallet = Math.max(0, wallet - fineAmount);
        robberData.lastRob = now;

        await setEconomyData(client, guildId, robberId, robberData);

        return sendEconomy(
            interaction,
            failureContainer({
                title: 'Robbery Failed',
                body:
                    `You failed the robbery and were caught! You were fined ` +
                    `**$${fineAmount.toLocaleString()}** of your own cash.\n` +
                    `**Your balance:** \`$${robberData.wallet.toLocaleString()}\``,
                footer: cooldownFooter('rob', ROB_COOLDOWN),
            }),
        );
    }, { command: 'rob' }),
};