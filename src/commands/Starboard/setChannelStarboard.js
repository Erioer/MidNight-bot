// $setchannelStarboard <#channel> <emoji> <threshold>
//
// `data` is a plain object, deliberately NOT a SlashCommandBuilder instance.
// commandLoader.js's collectCommandPayloads() only sends commands whose
// `.data.toJSON` exists to Discord's REST API for slash registration; a
// plain object has no `.toJSON`, so this command loads into client.commands
// (reachable via the $ prefix through messageCreate.js -> messageAdapter.js)
// but never counts toward Discord's 100-command global slash limit.
//
// `default_member_permissions` is read by utils/permissionGuard.js's
// enforceDefaultCommandPermissions(), which messageAdapter.js's
// executePrefixCommand() already calls before this execute() runs — so the
// Manage Server permission check happens automatically, same as every other
// command in the bot.

import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getStarboardConfig, saveStarboardConfig } from '../../services/starboard/starboardStore.js';
import { parseEmojiInput, displayEmoji } from '../../services/starboard/emoji.js';

const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 1000;
const ALLOWED_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

export default {
  data: {
    name: 'setchannelstarboard',
    description: "Configure this server's starboard channel, trigger emoji, and reaction threshold.",
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
    options: [
      { name: 'channel', description: 'Channel to post starred messages in', type: 7, required: true },
      { name: 'emoji', description: 'Reaction emoji that triggers the starboard', type: 3, required: true },
      { name: 'threshold', description: 'Number of reactions required', type: 4, required: true },
    ],
  },
  // Self-documenting flag consumed by commandLoader.js (skip-registration
  // logging) — the actual REST-registration skip is driven by the absence
  // of `data.toJSON` above, this flag just makes the intent explicit.
  prefixOnly: true,

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      return interaction.reply({
        embeds: [createEmbed({ title: 'Server Only', description: 'This command can only be used in a server.', color: 'error' })],
      });
    }

    // --- Strict single-starboard-per-guild limit (required) ---
    const existingConfig = await getStarboardConfig(guild.id);
    if (existingConfig) {
      return interaction.reply({
        embeds: [createEmbed({
          title: 'Starboard Already Configured',
          description: 'A starboard is already configured for this server. Run `$removeStarboard` first if you want to reconfigure it.',
          color: 'warning',
        })],
      });
    }

    const channel = await interaction.options.getChannel('channel');
    if (!channel || !ALLOWED_CHANNEL_TYPES.includes(channel.type)) {
      return interaction.reply({
        embeds: [createEmbed({ title: 'Invalid Channel', description: 'Please mention a valid text channel for the starboard.', color: 'error' })],
      });
    }

    const botMember = guild.members.me;
    const channelPerms = channel.permissionsFor(botMember);
    const requiredPerms = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.ReadMessageHistory,
    ];
    if (!channelPerms || !requiredPerms.every((p) => channelPerms.has(p))) {
      return interaction.reply({
        embeds: [createEmbed({
          title: 'Missing Permissions',
          description: `I need **View Channel**, **Send Messages**, **Embed Links**, and **Read Message History** permissions in ${channel} to run the starboard there.`,
          color: 'error',
        })],
      });
    }

    const parsedEmoji = parseEmojiInput(interaction.options.getString('emoji'));
    if (!parsedEmoji) {
      return interaction.reply({
        embeds: [createEmbed({
          title: 'Invalid Emoji',
          description: "That doesn't look like a valid emoji. Use a standard emoji (e.g. ⭐) or a custom server emoji.",
          color: 'error',
        })],
      });
    }

    const threshold = interaction.options.getInteger('threshold');
    if (!Number.isInteger(threshold) || threshold < MIN_THRESHOLD || threshold > MAX_THRESHOLD) {
      return interaction.reply({
        embeds: [createEmbed({
          title: 'Invalid Threshold',
          description: `Threshold must be a whole number between ${MIN_THRESHOLD} and ${MAX_THRESHOLD}.`,
          color: 'error',
        })],
      });
    }

    await saveStarboardConfig(guild.id, {
      channelId: channel.id,
      emoji: parsedEmoji,
      threshold,
    });

    return interaction.reply({
      embeds: [createEmbed({
        title: 'Starboard Configured',
        description: `Messages with **${threshold}+** ${displayEmoji(parsedEmoji)} reactions will be posted to ${channel}.`,
        color: 'success',
      })],
    });
  },
};
