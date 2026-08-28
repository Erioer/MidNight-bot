// $removeStarboard
// Removes the guild's starboard configuration and its tracked message
// mappings. Does not delete already-posted starboard messages (left as a
// historical record) — just stops tracking/updating them further.
// See setChannelStarboard.js for the prefix-only `data`/`prefixOnly` pattern.

import { PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
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
        embeds: [createEmbed({ title: 'Server Only', description: 'This command can only be used in a server.', color: 'error' })],
      });
    }

    const existingConfig = await getStarboardConfig(guild.id);
    if (!existingConfig) {
      return interaction.reply({
        embeds: [createEmbed({ title: 'No Starboard Configured', description: 'There is no starboard configured for this server.', color: 'warning' })],
      });
    }

    await deleteStarboardConfig(guild.id);
    await clearStarredMessages(guild.id);

    return interaction.reply({
      embeds: [createEmbed({
        title: 'Starboard Removed',
        description: 'Starboard configuration removed. Previously posted starboard messages will stay as-is but will no longer update.',
        color: 'success',
      })],
    });
  },
};
