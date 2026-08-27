import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../utils/logger.js';
import { createEmbed } from '../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';
import { fetchJson } from '../services/fun/funApi.js';
import { addActionCount } from '../services/fun/reactionStore.js';
import { EMOTIONS, buildReactionMessage } from '../config/commands/reactionEmotions.js';
import { db } from '../utils/database/wrapper.js';
import { getReactionBackKey } from '../utils/database/keys.js';

const NEKOS_BASE_URL = 'https://nekos.best/api/v2';
const NEKOS_USER_AGENT = 'MidNight (https://github.com/codebymitch/MidNight)';

export const reactBackHandler = {
  customId: 'react_back',

  async execute(interaction, client, args) {
    try {
      const [guildId, action, giverId, receiverId] = args;
      const emotion = EMOTIONS[action];

      if (!emotion) {
        return replyUserError(interaction, {
          type: ErrorTypes.USER_INPUT,
          message: 'That reaction is no longer available.',
        });
      }

      if (interaction.user.id !== receiverId) {
        return replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message: 'Only the person the reaction was directed at can return it.',
        });
      }

      if (!db.initialized) {
        await db.initialize();
      }

      const backKey = getReactionBackKey(guildId, interaction.message.id);
      const alreadyUsed = await db.get(backKey);
      if (alreadyUsed) {
        return replyUserError(interaction, {
          type: ErrorTypes.USER_INPUT,
          message: 'You have already returned that reaction.',
        });
      }

      const amount = Math.random() < 0.5 ? 1 : 2;
      const total = await addActionCount(guildId, action, receiverId, giverId, amount);

      let gifUrl = null;
      let animeName = null;
      try {
        const data = await fetchJson(`${NEKOS_BASE_URL}/${action}`, {
          headers: { 'User-Agent': NEKOS_USER_AGENT },
        });
        gifUrl = data.results?.[0]?.url || null;
        animeName = data.results?.[0]?.anime_name || null;
      } catch (error) {
        if (error.message?.includes('404')) {
          logger.warn(`error 404 reaction ${action} doesn't exist`);
        } else {
          logger.error('React back API error:', error);
        }
      }

      const receiver = interaction.member;
      const receiverName = receiver?.displayName || interaction.user.username || 'User';

      const giverMember = interaction.guild?.members.cache.get(giverId);
      const giverName =
        giverMember?.displayName ||
        (await client.users.fetch(giverId).catch(() => null))?.username ||
        'User';

      const content = buildReactionMessage({
        giverName: receiverName,
        receiverName: giverName,
        emotionName: action,
        amount,
        total,
        isSelf: false,
      });

      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(interaction.customId)
          .setLabel(`${emotion.emoji} ${emotion.noun.charAt(0).toUpperCase() + emotion.noun.slice(1)} back`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
      );

      await db.set(backKey, Date.now());
      await interaction.message.edit({ components: [disabledRow] }).catch(() => {});

      return interaction.reply({
        content,
        embeds: gifUrl
          ? [
              createEmbed({
                title: emotion.noun.charAt(0).toUpperCase() + emotion.noun.slice(1),
                image: gifUrl,
                color: 'primary',
                footer: animeName ? `From: ${animeName}` : null,
              }),
            ]
          : [],
      });
    } catch (error) {
      logger.error('Error handling react back button:', error);
      throw error;
    }
  },
};
