import { SlashCommandBuilder } from 'discord.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
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

const MINE_COOLDOWN = 60 * 60 * 1000;
const BASE_MIN_REWARD = 400;
const BASE_MAX_REWARD = 1200;
const PICKAXE_MULTIPLIER = 1.2;
const DIAMOND_PICKAXE_MULTIPLIER = 2.0;

const MINE_LOCATIONS = [
    'abandoned gold mine',
    'dark, damp cave',
    'backyard rock quarry',
    'volcanic obsidian vent',
    'deep-sea mineral trench',
];

export default {
    data: new SlashCommandBuilder()
        .setName('mine')
        .setDescription('Go mining to earn money'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            logger.error('[ECONOMY] Failed to load economy data for mine', { userId, guildId });
            return sendEconomy(interaction, dataErrorContainer({ command: 'mine' }));
        }

        const jailed = jailRemainingMs(userData, now);
        if (jailed > 0) {
            return sendEconomy(interaction, jailContainer({ command: 'mine', msRemaining: jailed }));
        }

        const lastMine = userData.lastMine || 0;
        const remainingTime = lastMine + MINE_COOLDOWN - now;
        if (remainingTime > 0) {
            return sendEconomy(
                interaction,
                cooldownContainer({
                    body: 'Your pickaxe is cooling down. Give it a break before mining again.',
                    footer: cooldownFooter('mine', remainingTime),
                }),
            );
        }

        const inventory = userData.inventory || {};
        const hasDiamondPickaxe = inventory['diamond_pickaxe'] || 0;
        const hasPickaxe = inventory['pickaxe'] || 0;
        const hasPremium = await hasPremiumRole(interaction, client, guildId);

        const baseEarned = Math.floor(Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1)) + BASE_MIN_REWARD;

        let gearEarned = baseEarned;
        let gearLine = '';
        if (hasDiamondPickaxe > 0) {
            gearEarned = Math.floor(baseEarned * DIAMOND_PICKAXE_MULTIPLIER);
            gearLine = '💎 **Diamond Pickaxe Bonus: +100%**';
        } else if (hasPickaxe > 0) {
            gearEarned = Math.floor(baseEarned * PICKAXE_MULTIPLIER);
            gearLine = '⛏️ **Pickaxe Bonus: +20%**';
        }

        const bonus = hasPremium ? Math.floor(gearEarned * 0.1) : 0;
        const finalEarned = applyPremiumCash(gearEarned, hasPremium);
        const location = MINE_LOCATIONS[Math.floor(Math.random() * MINE_LOCATIONS.length)];

        userData.wallet = (userData.wallet || 0) + finalEarned;
        userData.lastMine = now;
        await setEconomyData(client, guildId, userId, userData);

        const lines = [
            `You explored a **${location}** and found minerals worth **$${finalEarned.toLocaleString()}**!`,
            `**New balance:** \`$${userData.wallet.toLocaleString()}\``,
        ];
        if (gearLine) lines.push(gearLine);
        if (hasPremium) lines.push(premiumBonusLine(bonus));

        return sendEconomy(
            interaction,
            successContainer({
                title: 'Mining Expedition Successful!',
                body: lines.join('\n'),
                footer: cooldownFooter('mine', MINE_COOLDOWN),
                premium: hasPremium,
            }),
        );
    }, { command: 'mine' }),
};