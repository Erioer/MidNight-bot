// inventoryButtons.js
// Button handlers for inventory item usage.

import { ButtonStyle } from 'discord.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';
import { NO_PINGS, button, container, divider, row, text, v2Flags } from '../utils/componentsV2.js';
import { dataErrorContainer, successContainer, failureContainer, cooldownContainer, cooldownFooter } from '../services/economy/economyViews.js';

/** Reuse cooldown between XP Boost activations. The 6h effect is unchanged. */
const XP_BOOST_USE_COOLDOWN = 12 * 60 * 60 * 1000;

/** Item effects that can be activated from the inventory detail card. */
export const USABLE_ITEM_TYPES = new Set(['xp_boost']);

/** True when the shop item can be consumed via the "Use" button. */
export function isUsableItem(item) {
    return Boolean(item?.effect) && USABLE_ITEM_TYPES.has(item.effect.type);
}

/** Consumable item effects that can be activated from inventory. */
const USABLE_EFFECTS = {
    xp_boost: {
        apply: async (userData, effect) => {
            const now = Date.now();
            const cooldownUntil = Number(userData.xpBoostCooldownUntil) || 0;
            if (cooldownUntil > now) {
                return { success: false, cooldown: true, msRemaining: cooldownUntil - now };
            }
            const duration = effect.duration || 6 * 60 * 60 * 1000;
            userData.xpBoostExpiresAt = now + duration;
            userData.xpBoostCooldownUntil = now + XP_BOOST_USE_COOLDOWN;
            return { success: true, message: `⚡ XP Boost activated! You'll earn 10% more XP for 6 hours.` };
        },
    },
};

/** "Use Item" button handler. Custom ID format: use_item:<itemId> */
export const useItemHandler = {
    customId: 'use_item',

    async execute(interaction, client, args) {
        try {
            const itemId = args[0];
            if (!itemId) {
                return replyUserError(interaction, {
                    type: ErrorTypes.USER_INPUT,
                    message: 'Invalid item.',
                });
            }

            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            const deferred = await InteractionHelper.safeDefer(interaction, { flags: v2Flags() });
            if (!deferred) return;

            const reply = (components) => InteractionHelper.safeEditReply(interaction, {
                components: Array.isArray(components) ? components : [components],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });

            const userData = await getEconomyData(client, guildId, userId);

            if (!userData) {
                logger.error('[ECONOMY] Failed to load economy data for use_item', { userId, guildId });
                return reply(dataErrorContainer({ command: 'inventory' }));
            }

            const inventory = userData.inventory || {};
            const quantity = inventory[itemId] || 0;

            if (quantity <= 0) {
                return reply(failureContainer({
                    title: 'Item Unavailable',
                    body: 'You no longer have this item in your inventory.',
                }));
            }

            // Find the item definition
            const { shopItems } = await import('../config/shop/items.js');
            const item = shopItems.find((i) => i.id === itemId);

            if (!item || !item.effect || !USABLE_EFFECTS[item.effect.type]) {
                return reply(failureContainer({
                    title: 'Cannot Use',
                    body: 'This item cannot be used directly from your inventory.',
                }));
            }

            // Apply the effect (mutates userData; persisted once below).
            const effectHandler = USABLE_EFFECTS[item.effect.type];
            const result = await effectHandler.apply(userData, item.effect);

            if (!result.success) {
                if (result.cooldown) {
                    return reply(cooldownContainer({
                        body: 'Your XP Boost is recharging. Each boost can only be activated once every 12 hours.',
                        footer: cooldownFooter('activate another XP Boost', result.msRemaining),
                    }));
                }
                return reply(failureContainer({ title: 'Failed', body: result.message }));
            }

            // Decrement inventory, then persist effect + consumption together.
            inventory[itemId] = quantity - 1;
            if (inventory[itemId] <= 0) delete inventory[itemId];
            userData.inventory = inventory;
            await setEconomyData(client, guildId, userId, userData);

            // Send success reply
            await reply(successContainer({
                title: 'Item Used',
                body: result.message,
            }));

            logger.info('[ECONOMY] Item used', { userId, guildId, itemId, effect: item.effect.type });
        } catch (error) {
            logger.error('Error handling use_item button:', error);
            throw error;
        }
    },
};

/** Item detail card shown ephemerally after picking from the dropdown. */
function itemDetailContainer({ item, quantity }) {
    const lines = [
        item.description || 'No description available.',
        '',
        `* **Price:** \`$${(item.price || 0).toLocaleString()}\``,
        `* **Owned:** \`${quantity}x\``,
    ];

    const parts = [text(`### ${item.name}`), text(lines.join('\n'))];

    // Usable items get their "Use" button on the detail card, so the main
    // inventory list stays a compact dropdown instead of a wall of buttons.
    if (isUsableItem(item)) {
        parts.push(
            divider(),
            row(button({
                label: `Use ${item.name}`,
                customId: `use_item:${item.id}`,
                style: ButtonStyle.Success,
            })),
        );
    }

    return container({ parts });
}

/** Inventory dropdown handler. Replies ephemerally with the item's card. */
export const inventorySelectHandler = {
    customId: 'inventory_select',

    async execute(interaction, client) {
        try {
            const itemId = interaction.values?.[0];
            if (!itemId) {
                return replyUserError(interaction, {
                    type: ErrorTypes.USER_INPUT,
                    message: 'Select an item to inspect it.',
                });
            }

            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            // Ephemerality is fixed by the defer, so it is requested here.
            const deferred = await InteractionHelper.safeDefer(interaction, {
                flags: v2Flags({ ephemeral: true }),
            });
            if (!deferred) return;

            const userData = await getEconomyData(client, guildId, userId);
            if (!userData) {
                logger.error('[ECONOMY] Failed to load economy data for inventory_select', { userId, guildId });
                return InteractionHelper.safeEditReply(interaction, {
                    components: [dataErrorContainer({ command: 'inventory' })],
                    flags: v2Flags(),
                    allowedMentions: NO_PINGS,
                });
            }

            const { shopItems } = await import('../config/shop/items.js');
            const item = shopItems.find((i) => i.id === itemId);
            if (!item) {
                return InteractionHelper.safeEditReply(interaction, {
                    components: [failureContainer({
                        title: 'Unknown Item',
                        body: 'That item no longer exists in the shop.',
                    })],
                    flags: v2Flags(),
                    allowedMentions: NO_PINGS,
                });
            }

            const quantity = (userData.inventory || {})[itemId] || 0;

            return InteractionHelper.safeEditReply(interaction, {
                components: [itemDetailContainer({ item, quantity })],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });
        } catch (error) {
            logger.error('Error handling inventory_select:', error);
            throw error;
        }
    },
};