import { SlashCommandBuilder } from 'discord.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
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
    timeLeft,
} from '../../services/economy/economyViews.js';

const CRIME_COOLDOWN = 20 * 60 * 1000;
const JAIL_TIME = 2 * 60 * 60 * 1000;
const FINE_RATE = 0.2;

const CRIME_TYPES = [
    { name: 'Pickpocketing', min: 100, max: 500, risk: 0.3 },
    { name: 'Burglary', min: 300, max: 1000, risk: 0.4 },
    { name: 'Bank Heist', min: 1000, max: 5000, risk: 0.6 },
    { name: 'Art Theft', min: 2000, max: 10000, risk: 0.7 },
    { name: 'Cybercrime', min: 5000, max: 20000, risk: 0.8 },
];

export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('Commit a crime to earn money (risky)')
        .addStringOption((option) =>
            option
                .setName('type')
                .setDescription('Type of crime to commit')
                .setRequired(true)
                .addChoices(
                    { name: 'Pickpocketing', value: 'pickpocketing' },
                    { name: 'Burglary', value: 'burglary' },
                    { name: 'Bank Heist', value: 'bank-heist' },
                    { name: 'Art Theft', value: 'art-theft' },
                    { name: 'Cybercrime', value: 'cybercrime' },
                ),
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            logger.error('[ECONOMY] Failed to load economy data for crime', { userId, guildId });
            return sendEconomy(interaction, dataErrorContainer({ command: 'crime' }));
        }

        const jailed = jailRemainingMs(userData, now);
        if (jailed > 0) {
            return sendEconomy(interaction, jailContainer({ command: 'crime', msRemaining: jailed }));
        }

        const lastCrime = userData.cooldowns?.crime || 0;
        const remainingTime = lastCrime + CRIME_COOLDOWN - now;
        if (remainingTime > 0) {
            return sendEconomy(
                interaction,
                cooldownContainer({
                    body: 'You need to lay low before committing another crime.',
                    footer: cooldownFooter('commit a crime', remainingTime),
                }),
            );
        }

        const crimeType = interaction.options.getString('type').toLowerCase();
        const crime = CRIME_TYPES.find((c) => c.name.toLowerCase().replace(/\s+/g, '-') === crimeType);

        if (!crime) {
            return sendEconomy(
                interaction,
                failureContainer({
                    title: 'Invalid Crime type',
                    body: "This type of crime doesn't exist! Please select a valid crime type!",
                }),
            );
        }

        const isPremium = await hasPremiumRole(interaction, client, guildId);
        const isSuccess = Math.random() < applyPremiumChance(1 - crime.risk, isPremium);

        userData.cooldowns = userData.cooldowns || {};
        userData.cooldowns.crime = now;

        if (isSuccess) {
            const baseHaul = Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min;
            const bonus = isPremium ? Math.floor(baseHaul * 0.1) : 0;
            const amountEarned = applyPremiumCash(baseHaul, isPremium);

            userData.wallet = (userData.wallet || 0) + amountEarned;
            await setEconomyData(client, guildId, userId, userData);

            logger.info('[ECONOMY_TRANSACTION] Crime succeeded', {
                userId,
                guildId,
                crime: crime.name,
                amount: amountEarned,
                hasPremium: isPremium,
            });

            const body = `You successfully committed ${crime.name} and earned **$${amountEarned.toLocaleString()}**!`;

            return sendEconomy(
                interaction,
                successContainer({
                    title: 'Crime Successful!',
                    body: isPremium ? `${body}\n${premiumBonusLine(bonus)}` : body,
                    footer: cooldownFooter('commit a crime', CRIME_COOLDOWN),
                    premium: isPremium,
                }),
            );
        }

        // Fine is based on the potential haul of the attempted crime.
        const potentialHaul = Math.floor((crime.min + crime.max) / 2);
        const fine = Math.min(Math.floor(potentialHaul * FINE_RATE), userData.wallet || 0);
        userData.wallet = Math.max(0, (userData.wallet || 0) - fine);
        userData.jailedUntil = now + JAIL_TIME;

        await setEconomyData(client, guildId, userId, userData);

        return sendEconomy(
            interaction,
            failureContainer({
                title: 'Crime Failed!',
                body:
                    `You were caught while attempting ${crime.name} and have been sent to jail! ` +
                    `You were fined **$${fine.toLocaleString()}** and will be released in ${timeLeft(JAIL_TIME)}.`,
            }),
        );
    }, { command: 'crime' }),
};