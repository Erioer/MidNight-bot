import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { NO_PINGS, v2Flags } from '../../utils/componentsV2.js';
import { successContainer } from '../../services/economy/economyViews.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { BOT_USER_AGENT } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("shorten")
        .setDescription("Shorten a URL using spoo.me")
        .addStringOption(option =>
            option
                .setName("url")
                .setDescription("The URL to shorten")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("custom")
                .setDescription("Custom ending, e.g. my-link (optional)")
                .setRequired(false)
        )
        .setDMPermission(false),
    category: "Tools",

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral
        });
        if (!deferSuccess) {
            logger.warn(`Shorten interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'shorten'
            });
            return;
        }

        const url = interaction.options.getString("url");
        const custom = interaction.options.getString("custom");

        try {
            new URL(url);
        } catch (e) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Invalid URL format. Include http:// or https://',
            });
        }

        if (custom && !/^[a-zA-Z0-9_-]+$/.test(custom)) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Custom ending can only contain letters, numbers, underscores, and hyphens.',
            });
        }

        // spoo.me requires 3-16 characters. Caught locally so the user gets a
        // readable message instead of a raw 422 from the API.
        if (custom && (custom.length < 3 || custom.length > 16)) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Custom ending must be between 3 and 16 characters.',
            });
        }

        // spoo.me is API-first: POST JSON, get JSON back. Errors arrive as
        // { error, code, field } with meaningful HTTP codes, so the status code
        // alone is trustworthy here.
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        let response;
        try {
            response = await fetch('https://spoo.me/api/v1/shorten', {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'User-Agent': BOT_USER_AGENT,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(custom ? { url, alias: custom } : { url })
            });
        } catch (networkError) {
            const message = networkError?.name === 'AbortError'
                ? 'The URL shortener timed out. Please try again in a moment.'
                : 'Unable to reach the URL shortener service right now. Please try again later.';
            return replyUserError(interaction, {
                type: ErrorTypes.NETWORK,
                message,
            });
        } finally {
            clearTimeout(timeout);
        }

        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }

        if (response.status === 409) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'That custom ending is already taken. Try a different one.',
            });
        }

        if (!response.ok) {
            const field = payload?.field;
            if (response.status === 400 || response.status === 422) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: field
                        ? `Shortener rejected the ${field.replace(/_/g, ' ')}.`
                        : 'The shortener rejected that URL.',
                });
            }
            return replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: `Shortener service returned HTTP ${response.status}. Please try again later.`,
            });
        }

        const shortUrl = payload?.short_url;
        if (typeof shortUrl !== 'string' || !/^https?:\/\//i.test(shortUrl)) {
            return replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'URL shortening failed: the service returned an unexpected response.',
            });
        }

        const shortenedContainer = successContainer({ title: 'URL Shortened', body: `Here's your shortened URL: ${shortUrl}` });
        await InteractionHelper.safeEditReply(interaction, {
            components: [shortenedContainer],
            flags: v2Flags(),
            allowedMentions: NO_PINGS,
        });
    },
};