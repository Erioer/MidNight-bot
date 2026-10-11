import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { NO_PINGS, v2Flags } from '../../utils/componentsV2.js';
import { successContainer } from '../../services/economy/economyViews.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName('unixtime')
        .setDescription('Get the current Unix timestamp'),

    async execute(interaction) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                const now = new Date();
                const unixTimestamp = Math.floor(now.getTime() / 1000);

                const unixContainer = successContainer({
                    title: '⏱️ Current Unix Timestamp',
                    body: `**Seconds since Unix Epoch:** \`${unixTimestamp}\`\n` +
                    `**Milliseconds since Unix Epoch:** \`${now.getTime()}\`\n\n` +
                    `**Human-readable (UTC):** ${now.toUTCString()}\n` +
                    `**ISO String:** ${now.toISOString()}`,
                });

                await InteractionHelper.safeEditReply(interaction, {
                    components: [unixContainer],
                    flags: v2Flags(),
                    allowedMentions: NO_PINGS,
                });
            },
            'Failed to get unix timestamp. Please try again.',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
};