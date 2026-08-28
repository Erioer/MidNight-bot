import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { fetchJson } from '../../services/fun/funApi.js';
import { addActionCount } from '../../services/fun/reactionStore.js';
import { EMOTIONS, IMAGE_EMOTIONS, buildReactionMessage } from '../../config/commands/reactionEmotions.js';

const NEKOS_BASE_URL = 'https://nekos.best/api/v2';
const NEKOS_USER_AGENT = 'MidNight (https://github.com/codebymitch/MidNight)';

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export default {
  data: {
    name: 'react',
    description: 'Send a reaction GIF (hug, kiss, cuddle, etc.) to someone.',
    options: [
      { name: 'emotion', description: 'The action to perform', type: 3, required: true },
      { name: 'target', description: 'Who to direct the action at', type: 6, required: false },
    ],
  },
  category: 'Fun',
  prefixOnly: true,

  async execute(interaction) {
    const emotionName = (interaction.options.getString('emotion') || '').toLowerCase().trim();
    const emotion = EMOTIONS[emotionName];
    const imageEmotion = IMAGE_EMOTIONS[emotionName];

    if (!emotion && !imageEmotion) {
      const available = [...Object.keys(EMOTIONS), ...Object.keys(IMAGE_EMOTIONS)].join(', ');
      return replyUserError(interaction, {
        type: ErrorTypes.USER_INPUT,
        message: `"${emotionName}" is not a supported reaction. Try one of these: ${available}`,
      });
    }

    const giver = interaction.member ?? interaction.user;
    const giverName = giver.displayName || giver.username || 'User';

    if (imageEmotion) {
      let imageUrl = null;
      let artistName = null;
      try {
        const data = await fetchJson(`${NEKOS_BASE_URL}/${emotionName}`, {
          headers: { 'User-Agent': NEKOS_USER_AGENT },
        });
        const result = data.results?.[0];
        imageUrl = result?.url || null;
        artistName = result?.artist_name || null;
      } catch (error) {
        if (error.message?.includes('404')) {
          logger.warn(`error 404 image ${emotionName} doesn't exist`);
        } else {
          logger.error('React image API error:', error);
        }
      }

      const content = `**${giverName}** ${imageEmotion.actionSelf(giverName)} ${imageEmotion.emoji}`;

      return interaction.reply({
        content,
        embeds: imageUrl
          ? [
              createEmbed({
                title: capitalize(emotionName),
                image: imageUrl,
                color: 'primary',
                footer: artistName ? `Artist: ${artistName}` : null,
              }),
            ]
          : [],
      });
    }

    const target = interaction.options.getUser('target');
    const isSelf = !target || target.id === giver.id;

    let receiverName = giverName;
    if (target && target.id !== giver.id) {
      const targetMember = interaction.guild?.members.cache.get(target.id);
      receiverName = targetMember?.displayName || target.username || 'User';
    }

    let gifUrl = null;
    let animeName = null;
    try {
      const data = await fetchJson(`${NEKOS_BASE_URL}/${emotionName}`, {
        headers: { 'User-Agent': NEKOS_USER_AGENT },
      });
      gifUrl = data.results?.[0]?.url || null;
      animeName = data.results?.[0]?.anime_name || null;
    } catch (error) {
      if (error.message?.includes('404')) {
        logger.warn(`error 404 reaction ${emotionName} doesn't exist`);
      } else {
        logger.error('React command API error:', error);
      }
    }

    const amount = Math.random() < 0.5 ? 1 : 2;

    const receiverId = target?.id ?? giver.id;
    const total = await addActionCount(interaction.guild.id, emotionName, giver.id, receiverId, amount);

    const content = buildReactionMessage({
      giverName,
      receiverName,
      emotionName,
      amount,
      total,
      isSelf,
    });

    const components = [];
    if (!isSelf) {
      const buttonLabel = `${emotion.emoji} ${capitalize(emotion.noun)} back`;
      const returnButton = new ButtonBuilder()
        .setCustomId(`react_back:${interaction.guild.id}:${emotionName}:${giver.id}:${receiverId}`)
        .setLabel(buttonLabel)
        .setStyle(ButtonStyle.Primary);
      components.push(new ActionRowBuilder().addComponents(returnButton));
    }

    return interaction.reply({
      content,
      embeds: gifUrl
        ? [
            createEmbed({
              title: capitalize(emotionName),
              image: gifUrl,
              color: 'primary',
              footer: animeName ? `From: ${animeName}` : null,
            }),
          ]
        : [],
      components,
    });
  },
};
