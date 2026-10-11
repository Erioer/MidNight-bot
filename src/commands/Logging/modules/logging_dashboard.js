import { MessageFlags, PermissionsBitField } from 'discord.js';
import { NO_PINGS, v2Flags, container, divider, text } from '../../../utils/componentsV2.js';
import { successContainer } from '../../../services/economy/economyViews.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { getLoggingStatus } from '../../../services/loggingService.js';
import {
  createLoggingDashboardComponents,
  createLoggingCategoryViewComponents,
  createLoggingFilterComponents,
  DASHBOARD_CATEGORIES,
  DASHBOARD_CATEGORY_LABELS,
  EVENT_TYPES_BY_CATEGORY,
} from '../../../utils/logging/loggingUi.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
export function getCategoryStatus(enabledEvents, category, auditEnabled) {
  if (!auditEnabled) return false;
  const events = enabledEvents || {};
  if (events[`${category}.*`] === false) return false;
  const categoryEvents = EVENT_TYPES_BY_CATEGORY[category] || [];
  if (categoryEvents.length === 0) return true;
  return categoryEvents.every((eventType) => events[eventType] !== false);
}

async function formatChannelMention(guild, id) {
  if (!id) return '`Not configured`';
  const channel = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
  return channel ? channel.toString() : `⚠️ Missing (${id})`;
}

function countEnabledCategories(enabledEvents, auditEnabled) {
  const enabled = DASHBOARD_CATEGORIES.filter((key) =>
    getCategoryStatus(enabledEvents, key, auditEnabled),
  ).length;
  return { enabled, total: DASHBOARD_CATEGORIES.length };
}

export async function buildLoggingDashboardView(interaction, client) {
  const guildConfig = await getGuildConfig(client, interaction.guildId);
  const loggingStatus = await getLoggingStatus(client, interaction.guildId);

  const auditEnabled = Boolean(loggingStatus.enabled);
  const channels = loggingStatus.channels || {};

  const auditChannel = await formatChannelMention(interaction.guild, channels.audit);
  const applicationsChannel = await formatChannelMention(interaction.guild, channels.applications);
  const reportsChannel = await formatChannelMention(interaction.guild, channels.reports);
  const lifecycleChannel = await formatChannelMention(interaction.guild, guildConfig.ticketLogsChannelId);
  const transcriptChannel = await formatChannelMention(interaction.guild, guildConfig.ticketTranscriptChannelId);

  const ignore = loggingStatus.ignore || { users: [], channels: [] };
  const { enabled: enabledCount, total } = countEnabledCategories(loggingStatus.enabledEvents, auditEnabled);

  const card = container({
    parts: [
      text('### 📝 Logging Dashboard'),
      text(`Manage server logging for **${interaction.guild.name}**. Use the menu below to configure channels, categories, and filters.`),
      divider(),
      text([
        `**Logging Status:** ${auditEnabled ? '✅ Enabled' : '❌ Disabled'}`,
        `**Event Categories:** ${auditEnabled ? `${enabledCount}/${total} enabled` : '`Logging disabled`'}`,
        `**Ignore Filters:** ${ignore.users?.length || 0} users · ${ignore.channels?.length || 0} channels`,
        '',
        '**Log Channels**',
        `**Audit:** ${auditChannel}`,
        `**Applications:** ${applicationsChannel}`,
        `**Reports:** ${reportsChannel}`,
        '',
        '**Ticket Channels (read-only)**',
        `**Ticket Logs:** ${lifecycleChannel}`,
        `**Transcripts:** ${transcriptChannel}`,
      ].join('\n')),
      divider(),
      text('-# Ticket channels: configure via /ticket dashboard'),
    ],
  });

  const components = createLoggingDashboardComponents(loggingStatus.enabledEvents, auditEnabled);
  return { card, components };
}

export async function buildLoggingCategoriesView(interaction, client) {
  const loggingStatus = await getLoggingStatus(client, interaction.guildId);
  const auditEnabled = Boolean(loggingStatus.enabled);

  const categoryLines = DASHBOARD_CATEGORIES.map((key) => {
    const on = getCategoryStatus(loggingStatus.enabledEvents, key, auditEnabled);
    const label = DASHBOARD_CATEGORY_LABELS[key] || key;
    return `${on ? '✅' : '❌'} ${label}`;
  }).join('\n');

  const card = container({
    parts: [
      text('### 📋 Event Categories'),
      text(
        auditEnabled
          ? 'Toggle which types of events are logged to your audit channel.'
          : '⚠️ Logging is disabled. Enable it from the main dashboard to send logs.',
      ),
      divider(),
      text(`**Category Status**\n${categoryLines}`),
      divider(),
      text('-# Green = logging on · Red = logging off'),
    ],
  });

  const components = createLoggingCategoryViewComponents(loggingStatus.enabledEvents, auditEnabled);
  return { card, components };
}

export async function buildLoggingFilterView(interaction, client) {
  const loggingStatus = await getLoggingStatus(client, interaction.guildId);
  const ignore = loggingStatus.ignore || { users: [], channels: [] };

  const userLines = (ignore.users || []).length
    ? ignore.users.map((id) => `• User \`${id}\``).join('\n')
    : '*No ignored users*';

  const channelLines = (ignore.channels || []).length
    ? ignore.channels.map((id) => `• Channel \`${id}\``).join('\n')
    : '*No ignored channels*';

  const card = container({
    parts: [
      text('### 🔇 Log Ignore Filters'),
      text('Users and channels on this list will be skipped when sending audit logs.'),
      divider(),
      text(`**Ignored Users**\n${userLines.slice(0, 1500)}`),
      divider(),
      text(`**Ignored Channels**\n${channelLines.slice(0, 1500)}`),
      divider(),
      text('-# Use the buttons below to add or remove filters'),
    ],
  });

  const components = createLoggingFilterComponents();
  return { card, components };
}

function getMessageText(interaction) {
  const parts = [];
  for (const row of interaction.message?.components || []) {
    for (const component of row.components || []) {
      if (component.content) {
        parts.push(component.content);
      }
      for (const nested of component.components || []) {
        if (nested.content) {
          parts.push(nested.content);
        }
      }
    }
  }
  return parts.join('\n');
}

export function isCategoriesView(interaction) {
  if (interaction.message?.embeds?.[0]?.title === '📋 Event Categories') {
    return true;
  }
  return getMessageText(interaction).includes('### 📋 Event Categories');
}

export function isFilterView(interaction) {
  if (interaction.message?.embeds?.[0]?.title === '🔇 Log Ignore Filters') {
    return true;
  }
  return getMessageText(interaction).includes('### 🔇 Log Ignore Filters');
}

export async function refreshDashboardMessage(interaction, client) {
  let view;
  if (isCategoriesView(interaction)) {
    view = await buildLoggingCategoriesView(interaction, client);
  } else if (isFilterView(interaction)) {
    view = await buildLoggingFilterView(interaction, client);
  } else {
    view = await buildLoggingDashboardView(interaction, client);
  }

  await interaction.message.edit({
    components: [view.card, ...view.components],
    flags: MessageFlags.IsComponentsV2,
  }).catch(() => {});
}

export default {
  prefixOnly: false,
  async execute(interaction, config, client) {
    try {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need **Manage Server** permissions to view the logging dashboard.' });
      }

      await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      const { card, components } = await buildLoggingDashboardView(interaction, client);
      await InteractionHelper.safeEditReply(interaction, {
        components: [card, ...components],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });
    } catch (error) {
      logger.error('logging_dashboard error:', error);
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Failed to load the logging dashboard.' });
    }
  },
};
