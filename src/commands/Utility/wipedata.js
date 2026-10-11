import { SlashCommandBuilder } from 'discord.js';
import { NO_PINGS, container, text, v2Flags } from '../../utils/componentsV2.js';
import { getConfirmationButtons } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('wipedata')
        .setDescription('Delete all your personal data from the bot (irreversible)'),

    async execute(interaction, guildConfig, client) {
        const warningMessage = 
            `⚠️ **THIS ACTION IS IRREVERSIBLE!** ⚠️\n\n` +
            `This will permanently delete **ALL** your data from this server including:\n` +
            `• 💰 Economy balance (wallet & bank)\n` +
            `• 📊 Levels and XP\n` +
            `• 🎒 Inventory items\n` +
            `• 🛍️ Shop purchases\n` +
            `• 🎂 Birthday information\n` +
            `• 🔢 Counter data\n` +
            `• 📋 All other personal data\n\n` +
            `**This cannot be undone. Are you absolutely sure?**`;

        const wipeContainer = container({
            accentColor: 16705372,
            parts: [
                text('### Wipe All Data'),
                text(warningMessage),
            ],
        });

        const confirmButtons = getConfirmationButtons('wipedata');

        await InteractionHelper.safeReply(interaction, {
            components: [wipeContainer, confirmButtons],
            flags: v2Flags({ ephemeral: true }),
            allowedMentions: NO_PINGS,
        });

        logger.info(`Wipedata command executed - confirmation prompt shown`, {
            userId: interaction.user.id,
            guildId: interaction.guildId
        });
    }
};