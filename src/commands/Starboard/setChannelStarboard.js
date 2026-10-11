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
import { NO_PINGS, v2Flags } from '../../utils/componentsV2.js';
import { failureContainer, noticeContainer, successContainer } from '../../services/economy/economyViews.js';
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
        components: [failureContainer({ title: 'Server Only', body: 'This command can only be used in a server.' })],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });
    }

    // --- Strict single-starboard-per-guild limit (required) ---
    const existingConfig = await getStarboardConfig(guild.id);
    if (existingConfig) {
      return interaction.reply({
        components: [noticeContainer({
          title: 'Starboard Already Configured',
          body: 'A starboard is already configured for this server. Run `$removeStarboard` first if you want to reconfigure it.',
        })],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });
    }

    const channel = await interaction.options.getChannel('channel');
    if (!channel || !ALLOWED_CHANNEL_TYPES.includes(channel.type)) {
      return interaction.reply({
        components: [failureContainer({ title: 'Invalid Channel', body: 'Please mention a valid text channel for the starboard.' })],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
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
        components: [failureContainer({
          title: 'Missing Permissions',
          body: `I need **View Channel**, **Send Messages**, **Embed Links**, and **Read Message History** permissions in ${channel} to run the starboard there.`,
        })],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });
    }

    const parsedEmoji = parseEmojiInput(interaction.options.getString('emoji'));
    if (!parsedEmoji) {
      return interaction.reply({
        components: [failureContainer({ title: 'Invalid Emoji', body: "That doesn't look like a valid emoji. Use a standard emoji (e.g. ⭐) or a custom server emoji." })],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });
    }

    const threshold = interaction.options.getInteger('threshold');
    if (!Number.isInteger(threshold) || threshold < MIN_THRESHOLD || threshold > MAX_THRESHOLD) {
      return interaction.reply({
        components: [failureContainer({ title: 'Invalid Threshold', body: `Threshold must be a whole number between ${MIN_THRESHOLD} and ${MAX_THRESHOLD}.` })],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });
    }

    await saveStarboardConfig(guild.id, {
      channelId: channel.id,
      emoji: parsedEmoji,
      threshold,
    });

    return interaction.reply({
      components: [successContainer({
        title: 'Starboard Configured',
        body: `Messages with **${threshold}+** ${displayEmoji(parsedEmoji)} reactions will be posted to ${channel}.`,
      })],
      flags: v2Flags(),
      allowedMentions: NO_PINGS,
    });
  },
};
