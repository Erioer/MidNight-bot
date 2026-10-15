import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, version } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { NO_PINGS, container, divider, section, text, thumbnail, v2Flags } from '../../utils/componentsV2.js';
import { failureContainer, successContainer } from '../../services/economy/economyViews.js';
import { checkApiHealth, formatHealthLine, getOverallStatus, HEALTH_SECTION_TITLE } from '../../services/health/apiHealth.js';
import { probeLavalinkNodes, buildNodePingContainer } from '../../services/music/nodeStatus.js';

const SNAPSHOT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * System status card. Pure given its inputs: section with the bot avatar,
 * runtime figures, reach, per-group API health, and a snapshot footer.
 */
export function buildStatusContainer({
  botAvatarUrl,
  statusLine,
  startedAt,
  memoryMb,
  botLatencyMs,
  nodeVersion,
  discordVersion,
  guilds,
  users,
  apiResults,
}) {
  const head = botAvatarUrl
    ? section([text('### System Status'), text(statusLine)], thumbnail(botAvatarUrl))
    : [text('### System Status'), text(statusLine)];

  const runtime = [
    `• **Online Since:** <t:${startedAt}:F> (<t:${startedAt}:R>)`,
    `• **Process Memory:** \`${memoryMb} MB\` • **Bot Latency:** \`${botLatencyMs}ms\``,
    `• **Runtime Environment:** Node.js \`${nodeVersion}\` • Discord.js \`v${discordVersion}\``,
  ].join('\n');

  const reach = [
    `• **Servers:** \`${guilds}\` • **Cached Users:** \`${users}\``,
  ].join('\n');

  const health = [
    `**${HEALTH_SECTION_TITLE}**`,
    ...apiResults.map((result) => formatHealthLine(result)),
  ];

  return container({
    parts: [
      head,
      divider(),
      text(runtime),
      divider(),
      text(reach),
      divider(),
      text(health.join('\n').trimEnd()),
      divider(),
      text(`-# Snapshot taken <t:${Math.floor(Date.now() / 1000)}:R>`),
    ],
  });
}

function snapshotButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('stats_refresh')
      .setLabel('Refresh Snapshot')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('stats_ping')
      .setLabel('Node Ping')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

async function renderSnapshot(interaction, startedAt) {
  // Snapshot the round trip BEFORE the health fan-out below: measuring after
  // would bill the dashboard's own ~2s of API probes as "bot latency".
  const botLatencyMs = Math.max(0, Date.now() - (interaction._commandStartTime || interaction.createdTimestamp));
  const results = await checkApiHealth();
  const status = getOverallStatus(results);

  return buildStatusContainer({
    botAvatarUrl: interaction.client.user?.displayAvatarURL?.({ size: 256 }) || null,
    statusLine: status.line,
    startedAt,
    memoryMb: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
    botLatencyMs,
    nodeVersion: process.version,
    discordVersion: version,
    guilds: interaction.client.guilds.cache.size.toLocaleString(),
    users: interaction.client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0).toLocaleString(),
    apiResults: results,
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View bot statistics and service health")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  category: 'Core',

  async execute(interaction) {
    try {
      const deferred = await InteractionHelper.safeDefer(interaction, {
        flags: v2Flags({ ephemeral: true }),
      });
      if (!deferred) return;

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message: 'You need the **Manage Server** permission to view system statistics.',
        });
      }

      const startedAt = Math.floor((Date.now() - interaction.client.uptime) / 1000);

      await InteractionHelper.safeEditReply(interaction, {
        components: [await renderSnapshot(interaction, startedAt), snapshotButtons()],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });

      const replyMessage = await interaction.fetchReply().catch(() => null);
      if (!replyMessage) return;

      const collector = replyMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: SNAPSHOT_TIMEOUT_MS,
      });

      collector.on('collect', async (buttonInteraction) => {
        if (buttonInteraction.user.id !== interaction.user.id) {
          await buttonInteraction.reply({
            components: [container({ parts: [text('### Not Your Snapshot')] })],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            allowedMentions: NO_PINGS,
          }).catch(() => {});
          return;
        }

        if (buttonInteraction.customId === 'stats_refresh') {
          await buttonInteraction.deferUpdate().catch(() => {});
          await buttonInteraction.editReply({
            components: [await renderSnapshot(interaction, startedAt), snapshotButtons()],
          }).catch(() => {});
          return;
        }

        if (buttonInteraction.customId === 'stats_ping') {
          await buttonInteraction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 }).catch(() => {});
          let rows = [];
          try {
            rows = await probeLavalinkNodes(interaction.client);
          } catch {
            rows = [];
          }
          await buttonInteraction.editReply({
            components: [buildNodePingContainer(rows)],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: NO_PINGS,
          }).catch(() => {});
        }
      });

      collector.on('end', async () => {
        try {
          // Resend the last snapshot with dead buttons: editing with only the
          // row would wipe the card.
          await replyMessage.edit({
            components: [await renderSnapshot(interaction, startedAt), snapshotButtons(true)],
          }).catch(() => {});
        } catch (error) {
          logger.debug('stats: could not disable components on collector end', {
            error: error.message,
          });
        }
      });
    } catch (error) {
      logger.error('Stats command error:', error);
      return InteractionHelper.safeEditReply(interaction, {
        components: [
          failureContainer({ title: 'System Error', body: 'Could not fetch system statistics.' }),
        ],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });
    }
  },
};


