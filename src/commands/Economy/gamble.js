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
} from '../../services/economy/economyViews.js';

const BASE_WIN_CHANCE = 0.4;
const CLOVER_WIN_BONUS = 0.1;
const CHARM_WIN_BONUS = 0.08;
const PAYOUT_MULTIPLIER = 2.0;
const GAMBLE_COOLDOWN = 5 * 60 * 1000;

export default {
    data: new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('Gamble your money for a chance to win more')
        .addIntegerOption((option) =>
            option
                .setName('amount')
                .setDescription('Amount of cash to gamble')
                .setRequired(true)
                .setMinValue(1),
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const betAmount = interaction.options.getInteger('amount');
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            logger.error('[ECONOMY] Failed to load economy data for gamble', { userId, guildId });
            return sendEconomy(interaction, dataErrorContainer({ command: 'gamble' }));
        }

        const jailed = jailRemainingMs(userData, now);
        if (jailed > 0) {
            return sendEconomy(interaction, jailContainer({ command: 'gamble', msRemaining: jailed }));
        }

        const lastGamble = userData.lastGamble || 0;
        const remainingTime = lastGamble + GAMBLE_COOLDOWN - now;
        if (remainingTime > 0) {
            return sendEconomy(
                interaction,
                cooldownContainer({
                    body: 'You need to cool down before gambling again.',
                    footer: cooldownFooter('gamble', remainingTime),
                }),
            );
        }

        const wallet = userData.wallet || 0;
        if (wallet < betAmount) {
            return sendEconomy(
                interaction,
                failureContainer({
                    title: 'Insufficient Funds',
                    body:
                        `You only have **$${wallet.toLocaleString()}** in your wallet, ` +
                        `but you are trying to bet **$${betAmount.toLocaleString()}**.`,
                }),
            );
        }

        userData.inventory = userData.inventory || {};
        const hasPremium = await hasPremiumRole(interaction, client, guildId);

        let winChance = applyPremiumChance(BASE_WIN_CHANCE, hasPremium);
        let boosterLine = '';

        const clovers = userData.inventory['lucky_clover'] || 0;
        const charms = userData.inventory['lucky_charm'] || 0;

        if (clovers > 0) {
            userData.inventory['lucky_clover'] = clovers - 1;
            winChance += CLOVER_WIN_BONUS;
            boosterLine = `🍀 **Lucky Clover Consumed:** You have **${clovers - 1}** left.`;
        } else if (charms > 0) {
            userData.inventory['lucky_charm'] = charms - 1;
            winChance += CHARM_WIN_BONUS;
            boosterLine = `🍀 **Lucky Charm Used:** You have **${charms - 1}** uses left.`;
        }

        const win = Math.random() < Math.min(1, winChance);
        let cashChange;
        let lines;

        if (win) {
            const basePayout = Math.floor(betAmount * PAYOUT_MULTIPLIER);
            const bonus = hasPremium ? Math.floor(basePayout * 0.1) : 0;
            const amountWon = applyPremiumCash(basePayout, hasPremium);

            // The bet was at stake, not pre-deducted, so the net change is the
            // payout minus the original stake.
            cashChange = amountWon - betAmount;

            lines = [
                `You turned your **$${betAmount.toLocaleString()}** bet into **$${amountWon.toLocaleString()}**!`,
            ];
            if (boosterLine) lines.push(boosterLine);
            if (hasPremium) lines.push(premiumBonusLine(bonus));
        } else {
            cashChange = -betAmount;
            lines = [`The dice rolled against you. You lost your **$${betAmount.toLocaleString()}** bet.`];
            if (boosterLine) lines.push(boosterLine);
        }

        userData.wallet = wallet + cashChange;
        userData.lastGamble = now;
        await setEconomyData(client, guildId, userId, userData);

        lines.push(`**New balance:** \`$${userData.wallet.toLocaleString()}\``);

        const footer = win
            ? `Win chance was ${Math.round(Math.min(1, winChance) * 100)}%`
            : cooldownFooter('gamble', GAMBLE_COOLDOWN);

        if (win) {
            return sendEconomy(
                interaction,
                successContainer({
                    title: 'You Won!',
                    body: lines.join('\n'),
                    footer,
                    premium: hasPremium,
                }),
            );
        }

        // Premium members still get a red failure: the colour reports the
        // outcome, not the membership.
        return sendEconomy(
            interaction,
            failureContainer({
                title: 'You Lost...',
                body: lines.join('\n'),
                footer,
            }),
        );
    }, { command: 'gamble' }),
};