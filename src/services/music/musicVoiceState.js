import { successEmbed } from '../../utils/embeds.js';
import { getGuildMusicData, clearAutoLeaveTimer } from './playerStore.js';
import { applyPause, applyResume, getPlayer, destroyPlayerSession } from './musicActions.js';
import { clearVoiceChannelStatus } from './voiceStatus.js';
import { logger } from '../../utils/logger.js';

const AUTO_LEAVE_DELAY_MS = 7 * 1000;

async function sendPlayerMessage(client, channelId, embed) {
    if (!channelId) {
        return;
    }
    const channel = client.channels.cache.get(channelId);
    if (channel) {
        channel.send({ embeds: [embed] }).catch(() => null);
    }
}

function scheduleAutoLeave(client, guildId, guildData) {
    if (guildData.autoLeaveTimer) {
        return;
    }

    guildData.autoLeaveTimer = setTimeout(async () => {
        guildData.autoLeaveTimer = null;
        try {
            const player = getPlayer(client, guildId);
            if (!player) {
                return;
            }
            const voiceChannel = client.channels.cache.get(player.voiceChannel);
            if (!voiceChannel) {
                return;
            }
            const humansInChannel = voiceChannel.members.filter((member) => !member.user.bot);
            if (humansInChannel.size > 0) {
                return;
            }
            clearVoiceChannelStatus(client, guildId).catch(() => null);
            await destroyPlayerSession(client, guildId, player, getGuildMusicData(guildId), { forceDisconnect: true });
        } catch (error) {
            logger.error(`Auto-leave failed for guild ${guildId}:`, error);
        }
    }, AUTO_LEAVE_DELAY_MS);
}

export async function handleMusicVoiceState(client, oldState, newState) {
    if (!client.riffy) {
        return;
    }

    const guildId = newState.guild?.id || oldState.guild?.id;
    if (!guildId) {
        return;
    }

    const player = getPlayer(client, guildId);
    if (!player?.voiceChannel) {
        return;
    }

    const voiceChannel = client.channels.cache.get(player.voiceChannel);
    if (!voiceChannel) {
        return;
    }

    const guildData = getGuildMusicData(guildId);
    const humansInChannel = voiceChannel.members.filter((member) => !member.user.bot);
    const hasUsers = humansInChannel.size > 0;

    if (!hasUsers) {
        if (guildData.twentyFourSeven) {
            if (!player.paused && player.playing) {
                guildData.autoPaused = true;
                await applyPause(client, guildId);
                await sendPlayerMessage(client, guildData.playerChannelId, successEmbed('Paused', 'Voice channel is empty. Music paused until someone joins.'));
            }
            return;
        }

        scheduleAutoLeave(client, guildId, guildData);
        return;
    }

    clearAutoLeaveTimer(guildData);

    if (guildData.autoPaused && player.paused) {
        await applyResume(client, guildId);
        guildData.autoPaused = false;
        await sendPlayerMessage(client, guildData.playerChannelId, successEmbed('Resumed', 'Someone joined the voice channel. Playback resumed.'));
    }
}
