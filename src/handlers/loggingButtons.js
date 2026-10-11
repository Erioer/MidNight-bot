import {
  PermissionFlagsBits,
  ChannelSelectMenuBuilder,
  ChannelType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import {
  toggleEventLogging,
  getLoggingStatus,
  EVENT_TYPES,
  setLoggingEnabled,
  setLogChannel,
  updateIgnoreList,
  getIgnoreList,
  logEvent,
} from '../services/loggingService.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { NO_PINGS } from '../utils/componentsV2.js';
import { successContainer } from '../services/economy/economyViews.js';
import { replyUserError, ErrorTypes, handleInteractionError } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import {
  buildLoggingDashboardView,
  buildLoggingCategoriesView,
  buildLoggingFilterView,
  isCategoriesView,
  isFilterView,
  refreshDashboardMessage,
} from '../commands/Logging/modules/logging_dashboard.js';

const LOGGING_CATEGORIES = [...new Set(Object.values(EVENT_TYPES).map((eventType) => eventType.split('.')[0]))];

const DESTINATION_LABELS = {
  audit: 'Audit Log',
  applications: 'Applications',
  reports: 'Reports',
};

export default {
  customIds: [
    'log_dash_toggle',
    'log_dash_refresh',
    'log_dash_back',
    'log_dash_add_filter',
    'log_dash_remove_filter',
  ],

  async execute(interaction) {
    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          content: '❌ You need **Manage Server** permissions to use this.',
          ephemeral: true,
        });
      }

      if (interaction.customId === 'log_dash_refresh') {
        return handleRefresh(interaction);
      }

      if (interaction.customId === 'log_dash_back') {
        return handleBackToMain(interaction);
      }

      if (interaction.customId === 'log_dash_remove_filter') {
        return handleRemoveFilterModal(interaction);
      }

      if (interaction.customId.startsWith('log_dash_add_filter:')) {
        return handleAddFilterModal(interaction);
      }

      if (interaction.customId.startsWith('log_dash_toggle')) {
        return handleToggle(interaction);
      }
    } catch (error) {
      await handleInteractionError(interaction, error, {
        type: 'button',
        customId: interaction.customId,
        handler: 'logging',
      });
    }
  },
};

async function handleRefresh(interaction) {
  if (isCategoriesView(interaction)) {
    const { card, components } = await buildLoggingCategoriesView(interaction, interaction.client);
    return interaction.update({ components: [card, ...components], flags: MessageFlags.IsComponentsV2 });
  }

  if (isFilterView(interaction)) {
    const { card, components } = await buildLoggingFilterView(interaction, interaction.client);
    return interaction.update({ components: [card, ...components], flags: MessageFlags.IsComponentsV2 });
  }

  const { card, components } = await buildLoggingDashboardView(interaction, interaction.client);
  await interaction.update({ components: [card, ...components], flags: MessageFlags.IsComponentsV2 });
}

async function handleBackToMain(interaction) {
  const { card, components } = await buildLoggingDashboardView(interaction, interaction.client);
  await interaction.update({ components: [card, ...components], flags: MessageFlags.IsComponentsV2 });
}

async function handleToggle(interaction) {
  const eventType = interaction.customId.replace('log_dash_toggle:', '');
  if (!eventType) {
    return interaction.reply({ content: '❌ Invalid event type.', ephemeral: true });
  }

  const status = await getLoggingStatus(interaction.client, interaction.guildId);
  const onCategoriesView = isCategoriesView(interaction);

  if (eventType === 'audit_enabled') {
    await setLoggingEnabled(interaction.client, interaction.guildId, !Boolean(status.enabled));
  } else if (eventType === 'all') {
    const newState = !Object.values(status.enabledEvents).every((v) => v !== false);
    const allTypes = Object.values(EVENT_TYPES);
    const categoryTypes = LOGGING_CATEGORIES.map((c) => `${c}.*`);
    await toggleEventLogging(interaction.client, interaction.guildId, [...allTypes, ...categoryTypes], newState);
  } else {
    const currentState = status.enabledEvents[eventType] !== false;
    await toggleEventLogging(interaction.client, interaction.guildId, eventType, !currentState);
  }

  if (onCategoriesView || (eventType !== 'audit_enabled' && eventType.includes('.*'))) {
    const { card, components } = await buildLoggingCategoriesView(interaction, interaction.client);
    return interaction.update({ components: [card, ...components], flags: MessageFlags.IsComponentsV2 });
  }

  const { card, components } = await buildLoggingDashboardView(interaction, interaction.client);
  await interaction.update({ components: [card, ...components], flags: MessageFlags.IsComponentsV2 });
}

async function handleAddFilterModal(interaction) {
  const filterType = interaction.customId.replace('log_dash_add_filter:', '');
  if (filterType !== 'user' && filterType !== 'channel') {
    return interaction.reply({ content: '❌ Invalid filter type.', ephemeral: true });
  }

  const modalCustomId = `log_dash_filter_modal:add:${filterType}`;

  let modal;
  if (filterType === 'user') {
    const userSelect = new UserSelectMenuBuilder()
      .setCustomId('ignore_user')
      .setPlaceholder('Select a user to ignore…')
      .setMinValues(1)
      .setMaxValues(1);

    const userLabel = new LabelBuilder()
      .setLabel('User to Ignore')
      .setDescription('Choose a user whose actions should not be logged')
      .setUserSelectMenuComponent(userSelect);

    modal = new ModalBuilder()
      .setCustomId(modalCustomId)
      .setTitle('Add User Filter')
      .addLabelComponents(userLabel);
  } else {
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId('ignore_channel')
      .setPlaceholder('Select a channel to ignore…')
      .setMinValues(1)
      .setMaxValues(1)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice);

    const channelLabel = new LabelBuilder()
      .setLabel('Channel to Ignore')
      .setDescription('Choose a channel whose events should not be logged')
      .setChannelSelectMenuComponent(channelSelect);

    modal = new ModalBuilder()
      .setCustomId(modalCustomId)
      .setTitle('Add Channel Filter')
      .addLabelComponents(channelLabel);
  }

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 5 * 60 * 1000,
      filter: (i) => i.user.id === interaction.user.id && i.customId === modalCustomId,
    });

    let id;
    if (filterType === 'user') {
      id = modalSubmission.fields.getField('ignore_user')?.values?.[0];
    } else {
      id = modalSubmission.fields.getField('ignore_channel')?.values?.[0];
    }

    if (!id) {
      return replyUserError(modalSubmission, {
        type: ErrorTypes.VALIDATION,
        message: `Please select a ${filterType} to ignore.`,
      });
    }

    await updateIgnoreList(interaction.client, interaction.guildId, { action: 'add', type: filterType, id });

    await modalSubmission.reply({
      components: [
        successContainer({
          title: 'Filter Added',
          body: `${filterType === 'user' ? 'User' : 'Channel'} \`${id}\` will be ignored in audit logs.`,
        }),
      ],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      allowedMentions: NO_PINGS,
    });

    if (isFilterView(interaction)) {
      await refreshDashboardMessage(interaction, interaction.client);
    }
  } catch (error) {
    if (error.code === 'INTERACTION_TIMEOUT') {
      return;
    }
    logger.error('Error in add filter modal:', error);
  }
}

async function handleRemoveFilterModal(interaction) {
  const config = await getGuildConfig(interaction.client, interaction.guildId);
  const ignore = getIgnoreList(config);
  const options = [];

  for (const userId of ignore.users || []) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`User ${userId}`)
        .setDescription('Remove this user from the ignore list')
        .setValue(`user:${userId}`),
    );
  }

  for (const channelId of ignore.channels || []) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`Channel ${channelId}`)
        .setDescription('Remove this channel from the ignore list')
        .setValue(`channel:${channelId}`),
    );
  }

  if (options.length === 0) {
    return replyUserError(interaction, {
      type: ErrorTypes.USER_INPUT,
      message: 'There are no ignore filters to remove.',
    });
  }

  const modalCustomId = 'log_dash_filter_modal:remove';

  const filterSelect = new StringSelectMenuBuilder()
    .setCustomId('filter_entry')
    .setPlaceholder('Select a filter to remove…')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options.slice(0, 25));

  const filterLabel = new LabelBuilder()
    .setLabel('Filter to Remove')
    .setDescription('Choose a user or channel to un-ignore')
    .setStringSelectMenuComponent(filterSelect);

  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle('Remove Ignore Filter')
    .addLabelComponents(filterLabel);

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 5 * 60 * 1000,
      filter: (i) => i.user.id === interaction.user.id && i.customId === modalCustomId,
    });

    const entry = modalSubmission.fields.getField('filter_entry')?.values?.[0];
    if (!entry) {
      return replyUserError(modalSubmission, {
        type: ErrorTypes.VALIDATION,
        message: 'Please select a filter to remove.',
      });
    }

    const [type, id] = entry.split(':');
    await updateIgnoreList(interaction.client, interaction.guildId, { action: 'remove', type, id });

    await modalSubmission.reply({
      components: [
        successContainer({
          title: 'Filter Removed',
          body: `Removed ${type} \`${id}\` from the ignore list.`,
        }),
      ],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      allowedMentions: NO_PINGS,
    });

    if (isFilterView(interaction)) {
      await refreshDashboardMessage(interaction, interaction.client);
    }
  } catch (error) {
    if (error.code === 'INTERACTION_TIMEOUT') {
      return;
    }
    logger.error('Error in remove filter modal:', error);
  }
}

async function showChannelModal(interaction, destination) {
  const label = DESTINATION_LABELS[destination] || destination;
  const modalCustomId = `log_dash_channel_modal:${destination}`;

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('log_channel')
    .setPlaceholder('Select a text channel…')
    .setMinValues(1)
    .setMaxValues(1)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setRequired(true);

  const channelLabel = new LabelBuilder()
    .setLabel(`${label} Channel`)
    .setDescription(`Channel where ${label.toLowerCase()} logs will be sent`)
    .setChannelSelectMenuComponent(channelSelect);

  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle(`Set ${label} Channel`)
    .addLabelComponents(channelLabel);

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 5 * 60 * 1000,
      filter: (i) => i.user.id === interaction.user.id && i.customId === modalCustomId,
    });

    const channelId = modalSubmission.fields.getField('log_channel').values[0];
    const channel = interaction.guild.channels.cache.get(channelId)
      ?? await interaction.guild.channels.fetch(channelId).catch(() => null);

    if (!channel) {
      return modalSubmission.reply({
        content: '❌ That channel could not be found.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const botPerms = channel.permissionsFor(interaction.guild.members.me);
    if (!botPerms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
      return modalSubmission.reply({
        content: '❌ I need View Channel, Send Messages, and Embed Links in that channel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await setLogChannel(interaction.client, interaction.guildId, destination, channel.id);

    await logEvent({
      client: interaction.client,
      guildId: interaction.guildId,
      eventType: EVENT_TYPES.LOGGING_CONFIG,
      data: {
        title: 'Log Channel Updated',
        lines: [
          `**Destination:** ${label}`,
          `**Channel:** ${channel}`,
        ],
        actor: {
          id: interaction.user.id,
          displayName: interaction.member?.displayName || interaction.user.username,
          avatarUrl: interaction.user.displayAvatarURL(),
        },
      },
    }).catch(() => null);

    await modalSubmission.reply({
      components: [
        successContainer({
          title: 'Channel Updated',
          body: `**${label}** logs will be sent to ${channel}.`,
        }),
      ],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      allowedMentions: NO_PINGS,
    });

    await refreshDashboardMessage(interaction, interaction.client);
  } catch (error) {
    if (error.code === 'INTERACTION_TIMEOUT') {
      return;
    }
    await handleInteractionError(interaction, error, {
      type: 'modal',
      customId: interaction.customId,
      handler: 'logging_channel',
    });
  }
}

export async function handleLoggingMenuSelect(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: '❌ You need **Manage Server** permissions to use this.',
      ephemeral: true,
    });
  }

  const value = interaction.values[0];

  if (value.startsWith('set:')) {
    const destination = value.replace('set:', '');
    return showChannelModal(interaction, destination);
  }

  if (value.startsWith('clear:')) {
    const destination = value.replace('clear:', '');
    await setLogChannel(interaction.client, interaction.guildId, destination, null);
    const { card, components } = await buildLoggingDashboardView(interaction, interaction.client);
    return interaction.update({
      components: [card, ...components],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  if (value === 'view:categories') {
    const { card, components } = await buildLoggingCategoriesView(interaction, interaction.client);
    return interaction.update({ components: [card, ...components], flags: MessageFlags.IsComponentsV2 });
  }

  if (value === 'view:filters') {
    const { card, components } = await buildLoggingFilterView(interaction, interaction.client);
    return interaction.update({ components: [card, ...components], flags: MessageFlags.IsComponentsV2 });
  }

  return interaction.reply({ content: '❌ Unknown option.', ephemeral: true });
}

