// Per-guild music session state (in-memory). Adapted from Musicify playerStore (Apache-2.0).

export class GuildMusicData {
    constructor() {
        this.playerMessage = null;
        this.playerMessageId = null;
        this.playerChannelId = null;
        this.summaryMessageId = null;
        this.summaryChannelId = null;
        this.summaryTimeout = null;
        this.summaryExpiresAt = 0;
        this.lastTrackTitle = null;
        this.lastTrackInfo = null;
        this.lastSessionStats = null;
        this.sessionTrackCount = 0;
        this.filterPreset = 'clear';
        this.autoplay = false;
        this.loop = 'none';
        this.volume = 75;
        this.shuffle = false;
        this.previousTracks = [];
        this.twentyFourSeven = false;
        this.queuePages = new Map();
        this.updateInterval = null;
        this.idleTimeout = null;
        this.autoPaused = false;
        this.autoLeaveTimer = null;
        this.stopConfirmPending = null;
    }
}

export function clearAutoLeaveTimer(guildData) {
    if (guildData.autoLeaveTimer) {
        clearTimeout(guildData.autoLeaveTimer);
        guildData.autoLeaveTimer = null;
    }
}

export function clearUpdateInterval(guildData) {
    if (guildData.updateInterval) {
        clearInterval(guildData.updateInterval);
        guildData.updateInterval = null;
    }
}

export function clearSummaryTimeout(guildData) {
    if (guildData.summaryTimeout) {
        clearTimeout(guildData.summaryTimeout);
        guildData.summaryTimeout = null;
    }
}

export function clearSummaryState(guildData) {
    clearSummaryTimeout(guildData);
    guildData.summaryMessageId = null;
    guildData.summaryChannelId = null;
    guildData.summaryExpiresAt = 0;
}

const guildStore = new Map();

export function getGuildMusicData(guildId) {
    if (!guildStore.has(guildId)) {
        guildStore.set(guildId, new GuildMusicData());
    }
    return guildStore.get(guildId);
}

export function deleteGuildMusicData(guildId) {
    const guildData = guildStore.get(guildId);
    if (guildData) {
        clearUpdateInterval(guildData);
        if (guildData.idleTimeout) {
            clearTimeout(guildData.idleTimeout);
        }
        clearAutoLeaveTimer(guildData);
        clearSummaryTimeout(guildData);
    }
    guildStore.delete(guildId);
}
