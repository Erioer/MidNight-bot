import { SlashCommandBuilder } from 'discord.js';
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

const WORK_COOLDOWN = botConfig.economy?.cooldowns?.work ?? 30 * 60 * 1000;
const MIN_WORK_AMOUNT = botConfig.economy?.workMin ?? 10;
const MAX_WORK_AMOUNT = botConfig.economy?.workMax ?? 100;
const LAPTOP_MULTIPLIER = 1.5;

const WORK_JOBS = [
    'Software Developer',
    'Barista',
    'Janitor',
    'YouTuber',
    'Discord Bot Developer',
    'Cashier',
    'Pizza Delivery Driver',
    'Librarian',
    'Gardener',
    'Data Analyst',
];

export default {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Work to earn some money'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            logger.error('[ECONOMY] Failed to load economy data for work', { userId, guildId });
            return sendEconomy(interaction, dataErrorContainer({ command: 'work' }));
        }

        logger.debug(`[ECONOMY] Work command started for ${userId}`, { userId, guildId });

        const jailed = jailRemainingMs(userData, now);
        if (jailed > 0) {
            return sendEconomy(interaction, jailContainer({ command: 'work', msRemaining: jailed }));
        }

        const lastWork = userData.lastWork || 0;
        const inventory = userData.inventory || {};
        const hasLaptop = inventory['laptop'] || 0;
        const hasPremium = await hasPremiumRole(interaction, client, guildId);

        let usedConsumable = false;
        const remainingTime = lastWork + WORK_COOLDOWN - now;

        if (remainingTime > 0) {
            const shifts = inventory['extra_work'] || 0;
            if (shifts > 0) {
                // An extra shift overrides the cooldown, so the new timer still
                // restarts from now.
                inventory['extra_work'] = shifts - 1;
                usedConsumable = true;
            } else {
                return sendEconomy(
                    interaction,
                    cooldownContainer({
                        body: "You're working too fast! Take a break before your next shift.",
                        footer: cooldownFooter('work', remainingTime),
                    }),
                );
            }
        }

        const baseEarned = Math.floor(Math.random() * (MAX_WORK_AMOUNT - MIN_WORK_AMOUNT + 1)) + MIN_WORK_AMOUNT;
        const gearEarned = hasLaptop > 0 ? Math.floor(baseEarned * LAPTOP_MULTIPLIER) : baseEarned;
        const bonus = hasPremium ? Math.floor(gearEarned * 0.1) : 0;
        const earned = applyPremiumCash(gearEarned, hasPremium);
        const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];

        userData.wallet = (userData.wallet || 0) + earned;
        userData.lastWork = now;
        await setEconomyData(client, guildId, userId, userData);

        logger.info('[ECONOMY_TRANSACTION] Work completed', {
            userId,
            guildId,
            amount: earned,
            job,
            usedConsumable,
            hasLaptop: hasLaptop > 0,
            hasPremium,
            newWallet: userData.wallet,
            timestamp: new Date().toISOString(),
        });

        const lines = [
            `You worked as a **${job}** and earned **$${earned.toLocaleString()}**!`,
            `**New balance:** \`$${userData.wallet.toLocaleString()}\``,
        ];
        if (hasLaptop > 0) lines.push('💻 **Laptop Bonus: +50% earnings!**');
        if (usedConsumable) lines.push('⏩ **Extra Work Shift Consumed**');
        if (hasPremium) lines.push(premiumBonusLine(bonus));

        return sendEconomy(
            interaction,
            successContainer({
                title: 'Work Complete!',
                body: lines.join('\n'),
                footer: cooldownFooter('work', WORK_COOLDOWN),
                premium: hasPremium,
            }),
        );
    }, { command: 'work' }),
};