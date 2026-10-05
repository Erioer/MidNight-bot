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
    failureContainer,
    hasPremiumRole,
    jailContainer,
    jailRemainingMs,
    premiumBonusLine,
    sendEconomy,
    successContainer,
} from '../../services/economy/economyViews.js';

const FISH_COOLDOWN = 20 * 60 * 1000;
const BASE_MIN_REWARD = 300;
const BASE_MAX_REWARD = 900;
const FISHING_ROD_MULTIPLIER = 1.5;

const FISH_TYPES = [
    { name: 'Bass', emoji: '🐟', rarity: 'common' },
    { name: 'Salmon', emoji: '🐟', rarity: 'common' },
    { name: 'Trout', emoji: '🐟', rarity: 'common' },
    { name: 'Tuna', emoji: '🐠', rarity: 'uncommon' },
    { name: 'Swordfish', emoji: '🐠', rarity: 'uncommon' },
    { name: 'Octopus', emoji: '🐙', rarity: 'rare' },
    { name: 'Lobster', emoji: '🦞', rarity: 'rare' },
    { name: 'Shark', emoji: '🦈', rarity: 'epic' },
    { name: 'Whale', emoji: '🐋', rarity: 'legendary' },
];

const CATCH_MESSAGES = [
    'You cast your line into the crystal clear waters...',
    'You wait patiently as your bobber floats...',
    'After a few minutes of waiting, you feel a tug...',
    'The water ripples as something takes your bait...',
    'You reel in your catch with expert precision...',
];

function pickFish() {
    const rand = Math.random();
    const ofRarity = (rarity) => FISH_TYPES.filter((f) => f.rarity === rarity);
    if (rand < 0.5) {
        const pool = ofRarity('common');
        return pool[Math.floor(Math.random() * pool.length)];
    }
    if (rand < 0.75) {
        const pool = ofRarity('uncommon');
        return pool[Math.floor(Math.random() * pool.length)];
    }
    if (rand < 0.9) {
        const pool = ofRarity('rare');
        return pool[Math.floor(Math.random() * pool.length)];
    }
    return rand < 0.98 ? ofRarity('epic')[0] : ofRarity('legendary')[0];
}

export default {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('Go fishing to catch fish and earn money'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            logger.error('[ECONOMY] Failed to load economy data for fish', { userId, guildId });
            return sendEconomy(interaction, dataErrorContainer({ command: 'fish' }));
        }

        const jailed = jailRemainingMs(userData, now);
        if (jailed > 0) {
            return sendEconomy(interaction, jailContainer({ command: 'fish', msRemaining: jailed }));
        }

        const lastFish = userData.lastFish || 0;
        const remainingTime = lastFish + FISH_COOLDOWN - now;
        if (remainingTime > 0) {
            return sendEconomy(
                interaction,
                cooldownContainer({
                    body: "You're too tired to fish right now. Rest before casting again.",
                    footer: cooldownFooter('fish', remainingTime),
                }),
            );
        }

        const hasFishingRod = (userData.inventory || {})['fishing_rod'] || 0;
        const hasPremium = await hasPremiumRole(interaction, client, guildId);
        const fishCaught = pickFish();

        const baseEarned = Math.floor(Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1)) + BASE_MIN_REWARD;
        const gearEarned = hasFishingRod > 0 ? Math.floor(baseEarned * FISHING_ROD_MULTIPLIER) : baseEarned;
        const bonus = hasPremium ? Math.floor(gearEarned * 0.1) : 0;
        const finalEarned = applyPremiumCash(gearEarned, hasPremium);

        const catchMessage = CATCH_MESSAGES[Math.floor(Math.random() * CATCH_MESSAGES.length)];

        userData.wallet = (userData.wallet || 0) + finalEarned;
        userData.lastFish = now;
        await setEconomyData(client, guildId, userId, userData);

        const lines = [
            catchMessage,
            '',
            `You caught a **${fishCaught.emoji} ${fishCaught.name}** (${fishCaught.rarity}) and sold it for **$${finalEarned.toLocaleString()}**!`,
            `**New balance:** \`$${userData.wallet.toLocaleString()}\``,
        ];

        if (hasFishingRod > 0) lines.push('🎣 **Fishing Rod Bonus: +50%**');
        if (hasPremium) lines.push(premiumBonusLine(bonus));

        return sendEconomy(
            interaction,
            successContainer({
                title: 'Fishing Success!',
                body: lines.join('\n'),
                footer: cooldownFooter('fish', FISH_COOLDOWN),
                premium: hasPremium,
            }),
        );
    }, { command: 'fish' }),
};