import { SlashCommandBuilder } from 'discord.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { botConfig } from '../../config/bot.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
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
    sendEconomy,
    successContainer,
} from '../../services/economy/economyViews.js';

const COOLDOWN = 2 * 60 * 1000;
const MIN_WIN = Number(botConfig?.economy?.begMin) || 50;
const MAX_WIN = Number(botConfig?.economy?.begMax) || 200;
const SUCCESS_CHANCE = 0.7;

const SUCCESS_MESSAGES = [
    'A kind stranger drops {amount} into your cup.',
    'You spotted an unattended wallet! You grab {amount} and run.',
    'Someone took pity on you and gave you {amount}!',
    'You found {amount} under a park bench.',
];

const FAIL_MESSAGES = [
    'The police chased you off. You got nothing.',
    "Someone yelled, 'Get a job!' and walked past.",
    'A squirrel stole the single coin you had.',
    'You tried to beg, but you were too embarrassed and gave up.',
];

export default {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Beg for a small amount of money'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            logger.error('[ECONOMY] Failed to load economy data for beg', { userId, guildId });
            return sendEconomy(interaction, dataErrorContainer({ command: 'beg' }));
        }

        const jailed = jailRemainingMs(userData);
        if (jailed > 0) {
            return sendEconomy(interaction, jailContainer({ command: 'beg', msRemaining: jailed }));
        }

        const remainingTime = (userData.lastBeg || 0) + COOLDOWN - Date.now();
        if (remainingTime > 0) {
            return sendEconomy(
                interaction,
                cooldownContainer({
                    body: 'You are tired from begging! Rest up before trying again.',
                    footer: cooldownFooter('beg', remainingTime),
                }),
            );
        }

        const isPremium = await hasPremiumRole(interaction, client, guildId);
        const success = Math.random() < applyPremiumChance(SUCCESS_CHANCE, isPremium);

        let newCash = userData.wallet || 0;

        if (success) {
            const baseWin = Math.floor(Math.random() * (MAX_WIN - MIN_WIN + 1)) + MIN_WIN;
            const bonus = isPremium ? Math.floor(baseWin * 0.1) : 0;
            const amountWon = applyPremiumCash(baseWin, isPremium);

            newCash += amountWon;

            const template = SUCCESS_MESSAGES[Math.floor(Math.random() * SUCCESS_MESSAGES.length)];
            const body = template.replace('{amount}', `**$${amountWon.toLocaleString()}**`);
            const footer = cooldownFooter('beg', COOLDOWN);

            userData.wallet = newCash;
            userData.lastBeg = Date.now();
            await setEconomyData(client, guildId, userId, userData);

            return sendEconomy(
                interaction,
                successContainer({
                    title: 'Begging Successful!',
                    body: isPremium ? `${body}\n${premiumBonusLine(bonus)}` : body,
                    footer,
                    premium: isPremium,
                }),
            );
        }

        const body = FAIL_MESSAGES[Math.floor(Math.random() * FAIL_MESSAGES.length)];

        userData.wallet = newCash;
        userData.lastBeg = Date.now();
        await setEconomyData(client, guildId, userId, userData);

        return sendEconomy(
            interaction,
            failureContainer({
                title: "You've failed to beg!",
                body,
                footer: cooldownFooter('beg', COOLDOWN),
            }),
        );
    }, { command: 'beg' }),
};