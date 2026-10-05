import { SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { shopItems, formatOwned } from '../../config/shop/items.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { container, divider, section, text, thumbnail, row } from '../../utils/componentsV2.js';
import { dataErrorContainer, sendEconomy, timeLeft } from '../../services/economy/economyViews.js';

const SHOP_ITEMS = shopItems;

/** Select menus hold at most 25 options, so long inventories are truncated. */
const SELECT_OPTION_LIMIT = 25;

/** Neutral list view with an item-inspection dropdown. */
export function inventoryContainer({ displayName, avatarUrl, entries, totalValue = 0, ownedTypes = 0, totalTypes = 0, boostExpiresAt = 0, selectRow = null, isSelf = true }) {
    const title = isSelf ? 'Your Inventory' : `${displayName || 'This member'}'s Inventory`;
    const totalQty = entries.reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0);
    const lines = entries.length > 0
        ? entries.map(({ name, quantity, item }) => `**${name}:** ${formatOwned(quantity, item)}`)
        : ['Your inventory is currently empty.'];

    lines.push(
        '',
        `**Inventory Value:** \`$${(Number(totalValue) || 0).toLocaleString()}\``,
        `**Items:** \`${ownedTypes}/${totalTypes} types\``,
        `**Owned:** \`${totalQty} total\``,
    );

    if (boostExpiresAt > Date.now()) {
        lines.push(`\n**XP Boost active** until ${timeLeft(boostExpiresAt - Date.now())}`);
    }

    const content = [text(`### ${title}`), text(lines.join('\n'))];
    const head = avatarUrl
        ? section(content, thumbnail(avatarUrl))
        : content;

    // The counts above already carry the totals, so no summary footer.
    const parts = [head, divider()];

    // The dropdown opens each item's detail card; usable items get their
    // "Use" button there instead of crowding this list.
    if (selectRow) parts.push(selectRow);

    return container({ parts });
}

/** Dropdown listing owned items; picking one opens its ephemeral detail card. */
function buildInventorySelectRow(inventory) {
    const options = Object.entries(inventory || {})
        .map(([itemId, quantity]) => ({ item: SHOP_ITEMS.find((i) => i.id === itemId), quantity, itemId }))
        .filter(({ item, quantity }) => quantity > 0 && item)
        .slice(0, SELECT_OPTION_LIMIT)
        .map(({ item, quantity }) => new StringSelectMenuOptionBuilder()
            .setLabel(item.name.slice(0, 100))
            .setValue(item.id)
            .setDescription(`Owned: ${formatOwned(quantity, item)}`.slice(0, 100)));

    if (options.length === 0) return null;

    const menu = new StringSelectMenuBuilder()
        .setCustomId('inventory_select')
        .setPlaceholder('Inspect an item…')
        .addOptions(options);

    return row(menu);
}

export default {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('View your economy inventory'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        logger.debug(`[ECONOMY] Inventory requested for ${userId}`, { userId, guildId });

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            logger.error('[ECONOMY] Failed to load economy data for inventory', { userId, guildId });
            return sendEconomy(interaction, dataErrorContainer({ command: 'inventory' }));
        }

        const inventory = userData.inventory || {};

        // Only items that still exist in the shop config and have stock left are
        // listed, so removed items cannot linger in the display.
        const owned = Object.entries(inventory)
            .map(([itemId, quantity]) => ({ item: SHOP_ITEMS.find((i) => i.id === itemId), quantity }))
            .filter(({ item, quantity }) => quantity > 0 && item);

        const entries = owned.map(({ item, quantity }) => ({ name: item.name, quantity, item }));
        const totalValue = owned.reduce((sum, { item, quantity }) => sum + (item.price || 0) * quantity, 0);

        const selectRow = buildInventorySelectRow(inventory);
        const displayName = interaction.member?.displayName || interaction.user.username;

        logger.info('[ECONOMY] Inventory retrieved', {
            userId,
            guildId,
            itemCount: entries.length,
        });

        return sendEconomy(
            interaction,
            inventoryContainer({
                displayName,
                avatarUrl: interaction.user.displayAvatarURL({ size: 256 }),
                entries,
                totalValue,
                ownedTypes: entries.length,
                totalTypes: SHOP_ITEMS.length,
                boostExpiresAt: Number(userData.xpBoostExpiresAt) || 0,
                selectRow,
                isSelf: true,
            }),
        );
    }, { command: 'inventory' }),
};