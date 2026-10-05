import { SlashCommandBuilder } from 'discord.js';
import { shopItems } from '../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { NO_PINGS, v2Flags } from '../../utils/componentsV2.js';
import {
    dataErrorContainer,
    failureContainer,
    successContainer,
} from '../../services/economy/economyViews.js';

const SHOP_ITEMS = shopItems;

// Convenience aliases so common short names resolve to the canonical item id.
const ITEM_ALIASES = { shield: 'counting_shield' };

export default {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Buy an item from the shop')
        .addStringOption((option) =>
            option
                .setName('item_id')
                .setDescription('ID of the item to buy')
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName('quantity')
                .setDescription('Quantity to buy (default: 1)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10),
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        // Ephemerality is fixed by the defer, so it must be requested here.
        const deferred = await InteractionHelper.safeDefer(interaction, {
            flags: v2Flags({ ephemeral: true }),
        });
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const requestedId = interaction.options.getString('item_id').toLowerCase().trim();
        const itemId = ITEM_ALIASES[requestedId] || requestedId;
        const quantity = interaction.options.getInteger('quantity') || 1;

        const item = SHOP_ITEMS.find((i) => i.id === itemId);

        if (!item) {
            return sendEconomyReply(
                interaction,
                failureContainer({
                    title: 'Purchase Failed',
                    body: `The item ID \`${itemId}\` does not exist in the shop.`,
                }),
            );
        }

        if (quantity < 1) {
            return sendEconomyReply(
                interaction,
                failureContainer({
                    title: 'Purchase Failed',
                    body: 'You must purchase a quantity of 1 or more.',
                }),
            );
        }

        const totalCost = item.price * quantity;
        const guildConfig = await getGuildConfig(client, guildId);
        const premiumRoleId = guildConfig?.premiumRoleId;

        const userData = await getEconomyData(client, guildId, userId);

        // Buying stays available while jailed, so a jailed member can still
        // purchase the items and upgrades they need.
        if (!userData) {
            logger.error('[ECONOMY] Failed to load economy data for buy', { userId, guildId });
            return sendEconomyReply(interaction, dataErrorContainer({ command: 'buy' }));
        }

        const wallet = userData.wallet || 0;
        if (wallet < totalCost) {
            return sendEconomyReply(
                interaction,
                failureContainer({
                    title: 'Insufficient Funds',
                    body:
                        `You need **$${totalCost.toLocaleString()}** to purchase ${quantity}x **${item.name}**, ` +
                        `but you only have **$${wallet.toLocaleString()}** in cash.`,
                }),
            );
        }

        const isPremiumRole = item.type === 'role' && itemId === 'premium_role';

        if (isPremiumRole) {
            if (!premiumRoleId) {
                return sendEconomyReply(
                    interaction,
                    failureContainer({
                        title: 'Purchase Failed',
                        body: 'The **Premium Shop Role** has not been configured by a server administrator yet.',
                    }),
                );
            }
            if (interaction.member?.roles?.cache?.has(premiumRoleId)) {
                return sendEconomyReply(
                    interaction,
                    failureContainer({
                        title: 'Purchase Failed',
                        body: `You already have the **${item.name}** role.`,
                    }),
                );
            }
            if (quantity > 1) {
                return sendEconomyReply(
                    interaction,
                    failureContainer({
                        title: 'Purchase Failed',
                        body: `You can only purchase the **${item.name}** role once.`,
                    }),
                );
            }
        }

        if (item.maxQuantity) {
            const owned = (userData.inventory || {})[itemId] || 0;
            if (owned >= item.maxQuantity) {
                return sendEconomyReply(
                    interaction,
                    failureContainer({
                        title: 'Purchase Failed',
                        body: `You already hold the maximum of **${item.maxQuantity}x ${item.name}**. Use them before buying more.`,
                    }),
                );
            }
            if (owned + quantity > item.maxQuantity) {
                return sendEconomyReply(
                    interaction,
                    failureContainer({
                        title: 'Purchase Failed',
                        body:
                            `You can only hold **${item.maxQuantity}x ${item.name}** and already own **${owned}**. ` +
                            `Lower the quantity to **${item.maxQuantity - owned}** or fewer.`,
                    }),
                );
            }
        }

        userData.wallet = wallet - totalCost;
        const notes = [];

        if (isPremiumRole) {
            const role = interaction.guild?.roles?.cache?.get(premiumRoleId);

            if (!role) {
                return sendEconomyReply(
                    interaction,
                    failureContainer({
                        title: 'Purchase Failed',
                        body: 'The configured premium role no longer exists in this guild.',
                    }),
                );
            }

            try {
                await interaction.member.roles.add(role, `Purchased role: ${item.name}`);
                notes.push(`**👑 The role ${role.toString()} has been granted to you!**`);
            } catch (roleError) {
                // Refund: the cash was taken but the role was never granted.
                userData.wallet = wallet;
                await setEconomyData(client, guildId, userId, userData);
                logger.error('[ECONOMY] Role assignment failed after taking payment', {
                    userId,
                    guildId,
                    roleId: premiumRoleId,
                    error: roleError.message,
                });
                return sendEconomyReply(
                    interaction,
                    failureContainer({
                        title: 'Purchase Failed',
                        body: 'Successfully deducted money, but failed to grant the role. Your cash has been refunded.',
                    }),
                );
            }
        } else if (item.type === 'upgrade') {
            userData.upgrades = userData.upgrades || {};
            userData.upgrades[itemId] = true;
            notes.push('**✨ Your upgrade is now active!**');
        } else if (item.type === 'consumable' || item.type === 'tool') {
            userData.inventory = userData.inventory || {};
            userData.inventory[itemId] = (userData.inventory[itemId] || 0) + quantity;
            if (item.type === 'tool') {
                notes.push(`**🛠️ ${item.name} added to your inventory!**`);
            }
        }

        await setEconomyData(client, guildId, userId, userData);

        const body = [
            `You successfully purchased ${quantity}x **${item.name}** for **$${totalCost.toLocaleString()}**!`,
            `**New balance:** \`$${userData.wallet.toLocaleString()}\``,
            ...notes,
        ].join('\n');

        // A premium purchase is the one success that wears the premium accent.
        return sendEconomyReply(interaction, successContainer({
            title: 'Purchase Successful',
            body,
            premium: isPremiumRole,
        }));
    }, { command: 'buy' }),
};

/**
 * `/buy` replies ephemerally.
 *
 * Ephemerality is only settable on the first response, so it is passed at defer
 * time via `v2Flags({ ephemeral: true })`; the component edit itself must not
 * carry it. See utils/componentsV2.js.
 */
function sendEconomyReply(interaction, ...containers) {
    return InteractionHelper.safeEditReply(interaction, {
        components: containers.flat().filter(Boolean),
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
    });
}