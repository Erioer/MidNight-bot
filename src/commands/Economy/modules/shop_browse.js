import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { shopItems, formatOwned } from '../../../config/shop/items.js';
import { getEconomyData } from '../../../utils/economy.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';
import { NO_PINGS, container, divider, text } from '../../../utils/componentsV2.js';

/** Shop page. Neutral view, so no accent is set. */
function buildShopContainer(pageItems, page, totalPages, ownedOf = {}) {
    const lines = ['Use `/buy item_id:<id> quantity:<amount>` to purchase an item.', ''];

    pageItems.forEach((item) => {
        lines.push(`**${item.name}** \`${item.id}\``);
        lines.push(`* **Type:** ${item.type}`);
        lines.push(`* **Price:** \`$${item.price.toLocaleString()}\``);
        lines.push(`* **Owned:** \`${formatOwned(ownedOf[item.id] || 0, item)}\``);
        lines.push(`* ${item.description}`);
        lines.push('');
    });

    return container({
        parts: [
            text('### Store'),
            text(lines.join('\n')),
            divider(),
            text(`-# Page ${page}/${totalPages}`),
        ],
    });
}

export default {
    async execute(interaction, config, client) {
        try {
            const TARGET_MAX_PAGES = 3;
            const ITEMS_PER_PAGE = Math.max(1, Math.ceil(shopItems.length / TARGET_MAX_PAGES));
            const totalPages = Math.max(1, Math.ceil(shopItems.length / ITEMS_PER_PAGE));

            const pageItems = (page) => {
                const startIndex = (page - 1) * ITEMS_PER_PAGE;
                return shopItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
            };

            let currentPage = 1;

            // The listing shows the invoker's own holdings per item. A missing
            // economy row simply reads as owning nothing yet.
            const userData = await getEconomyData(client, interaction.guildId, interaction.user.id).catch(() => null);
            const ownedOf = userData?.inventory && typeof userData.inventory === 'object' ? userData.inventory : {};

            const page = () => buildShopContainer(pageItems(currentPage), currentPage, totalPages, ownedOf);

            const createShopComponents = (page, disabled = false) => {
                if (totalPages <= 1) return [];
                return [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('shop_prev')
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(disabled || page === 1),
                        new ButtonBuilder()
                            .setCustomId('shop_next')
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(disabled || page === totalPages),
                    ),
                ];
            };

            const message = await interaction.reply({
                components: [page(), ...createShopComponents(currentPage)],
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: NO_PINGS,
            });

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000,
            });

            collector.on('collect', async (buttonInteraction) => {
                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.reply({
                        components: [container({ parts: [text('### Not Your Shop')] })],
                        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
                        allowedMentions: NO_PINGS,
                    });
                    return;
                }
                const { customId } = buttonInteraction;
                if (customId === 'shop_prev' || customId === 'shop_next') {
                    await buttonInteraction.deferUpdate();
                    if (customId === 'shop_prev' && currentPage > 1) currentPage--;
                    else if (customId === 'shop_next' && currentPage < totalPages) currentPage++;
                    await buttonInteraction.editReply({
                        components: [
                            page(),
                            ...createShopComponents(currentPage),
                        ],
                    });
                }
            });

            collector.on('end', async () => {
                try {
                    // Re-send the page with disabled buttons. A V2 message's
                    // `components` IS the whole message, so editing with only
                    // the buttons would wipe the shop listing.
                    await message.edit({
                        components: [
                            page(),
                            ...createShopComponents(currentPage, true),
                        ],
                    });
                } catch (error) {
                    logger.debug('shop_browse: could not disable components on collector end', {
                        error: error.message,
                    });
                }
            });
        } catch (error) {
            await handleInteractionError(interaction, error, { command: 'shop_browse' });
        }
    },
};