import { logger } from '../../utils/logger.js';

const MAX_STATUS_LENGTH = 500;

function getVoiceChannel(client, guildId) {
    try {
        const player = client.riffy?.players?.get(guildId);
        if (!player?.voiceChannel) {
            return null;
        }
        return client.channels.cache.get(player.voiceChannel) || null;
    } catch (error) {
        logger.warn(`Unable to resolve voice channel for guild ${guildId}:`, error?.message || error);
        return null;
    }
}

export async function setVoiceChannelStatus(client, guildId, status) {
    try {
        const channel = getVoiceChannel(client, guildId);
        if (!channel) {
            return false;
        }

        const text = status == null ? null : String(status).trim().substring(0, MAX_STATUS_LENGTH);
        // discord.js has no VoiceChannel.setStatus; hit the voice-status REST
        // endpoint directly. Requires SET_VOICE_CHANNEL_STATUS (bot is connected
        // while playing, so MANAGE_CHANNELS is not needed).
        await client.rest.put(`/channels/${channel.id}/voice-status`, {
            body: { status: text },
        });
        return true;
    } catch (error) {
        logger.warn(
            `Failed to ${status == null ? 'clear' : 'set'} voice channel status for guild ${guildId}:`,
            error?.message || error,
        );
        return false;
    }
}

export async function clearVoiceChannelStatus(client, guildId) {
    return setVoiceChannelStatus(client, guildId, null);
}
