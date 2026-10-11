// $removeStarboard
// Removes the guild's starboard configuration and its tracked message
// mappings. Does not delete already-posted starboard messages (left as a
// historical record) — just stops tracking/updating them further.
// See setChannelStarboard.js for the prefix-only `data`/`prefixOnly` pattern.

import { PermissionFlagsBits } from 'discord.js';
import { NO_PINGS, v2Flags } from '../../utils/componentsV2.js';
import { failureContainer, noticeContainer, successContainer } from '../../services/economy/economyViews.js';
import {
  getStarboardConfig,
  deleteStarboardConfig,
  clearStarredMessages,
} from '../../services/starboard/starboardStore.js';

export default {
  data: {
    name: 'removestarboard',
    description: "Remove this server's starboard configuration and tracked messages.",
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
    options: [],
  },
  prefixOnly: true,

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      return interaction.reply({
        components: [failureContainer({ title: 'Server Only', body: 'This command can only be used in a server.' })],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });
    }

    const existingConfig = await getStarboardConfig(guild.id);
    if (!existingConfig) {
      return interaction.reply({
        components: [noticeContainer({ title: 'No Starboard Configured', body: 'There is no starboard configured for this server.' })],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });
    }

    await deleteStarboardConfig(guild.id);
    await clearStarredMessages(guild.id);

    return interaction.reply({
      components: [successContainer({
        title: 'Starboard Removed',
        body: 'Starboard configuration removed. Previously posted starboard messages will stay as-is but will no longer update.',
      })],
      flags: v2Flags(),
      allowedMentions: NO_PINGS,
    });
  },
};
