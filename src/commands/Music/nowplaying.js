import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { buildNowPlayingReply } from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';
import { NO_PINGS } from '../../utils/componentsV2.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the currently playing track'),

    async execute(interaction, config, client) {
        await deferMusicCommand(interaction);
        const payload = buildNowPlayingReply(client, interaction.guild.id);
        await InteractionHelper.safeEditReply(interaction, {
            components: payload.components,
            flags: payload.flags,
            allowedMentions: NO_PINGS,
        });
    },
};
