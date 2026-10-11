import axios from 'axios';
import { BOT_USER_AGENT } from '../../../config/bot.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { chunkText, sendPaginated } from './searchPager.js';

export default {
    async execute(interaction) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction);
            if (!deferred) {
                return;
            }

            const term = interaction.options.getString('term');

            if (term.length < 2) {
                logger.warn('Urban command - term too short', {
                    userId: interaction.user.id,
                    term: term,
                    guildId: interaction.guildId
                });
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Please enter a term with at least 2 characters.' });
            }

            const response = await axios.get(
                `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`,
                { timeout: 5000, headers: { 'User-Agent': BOT_USER_AGENT } }
            );

            if (!response.data?.list?.length) {
                return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `No definitions found for "${term}" on Urban Dictionary.` });
            }

            const definition = response.data.list[0];
            const cleanDefinition = definition.definition.replace(/\[|\]/g, '');
            const cleanExample = definition.example.replace(/\[|\]/g, '');

            const formattedDefinition = cleanDefinition
                .replace(/\n\s*\n/g, '\n\n');

            const formattedExample = cleanExample
                ? `*"${cleanExample.replace(/\n/g, ' ').slice(0, 500)}..."*`
                : '*No example provided*';

            const lines = [
                formattedDefinition,
                '',
                formattedExample,
                '',
                `**Thumbs:** \`${(definition.thumbs_up || 0).toLocaleString()} up\` • \`${(definition.thumbs_down || 0).toLocaleString()} down\``,
                `**Author:** ${definition.author || 'Anonymous'}`,
            ];
            if (definition.permalink) lines.push('', `[View on Urban Dictionary](${definition.permalink})`);

            logger.info('Urban Dictionary definition retrieved', {
                userId: interaction.user.id,
                term: term,
                guildId: interaction.guildId,
                commandName: 'urban'
            });

            return await sendPaginated(interaction, {
                title: definition.word || term,
                pages: chunkText(lines.join('\n')),
                footer: 'Provided by Urban Dictionary',
            });

        } catch (error) {
            if (error.response?.status === 404 || !error.response) {
                await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `No definitions found for "${interaction.options.getString('term')}" on Urban Dictionary.` });
            } else if (error.response?.status === 429) {
                await replyUserError(interaction, { type: ErrorTypes.RATE_LIMIT, message: 'Too many requests to Urban Dictionary. Please try again in a few minutes.' });
            } else {
                // Delegated: handleInteractionError logs with full context, so
                // logging here as well would print every failure twice.
                await handleInteractionError(interaction, error, {
                    commandName: 'urban',
                    source: 'urban_dictionary_api'
                });
            }
        }
    },
};