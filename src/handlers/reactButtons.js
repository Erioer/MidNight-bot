import { ButtonStyle, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';
import { fetchJson } from '../services/fun/funApi.js';
import { addActionCount } from '../services/fun/reactionStore.js';
import { EMOTIONS, buildReactionMessage } from '../config/commands/reactionEmotions.js';
import { db } from '../utils/database/wrapper.js';
import { getReactionBackKey } from '../utils/database/keys.js';
import { container, gallery, NO_PINGS, text, v2Flags } from '../utils/componentsV2.js';

const NEKOS_BASE_URL = 'https://nekos.best/api/v2';
const NEKOS_USER_AGENT = 'MidNight (https://github.com/Erioer/MidNight-bot)';

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

// Claim the interaction before any DB or network work. The nekos.best
      // lookup can stall, and an unacknowledged token dies the moment Discord
      // decides it waited too long -- which is what left the button greyed out
      // with no GIF. Deferring first means the worst case is a text-only
      // reply instead of nothing at all.
      await InteractionHelper.safeDefer(interaction, { flags: v2Flags() });

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
      // Argument order must match react.js and the addActionCount signature
// (guildId, action, giverId, receiverId). Passing receiverId/giverId swapped
// here incremented the mirrored key, so a returned reaction never counted
// towards the pair it belonged to.
const total = await addActionCount(guildId, action, giverId, receiverId, amount);

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

      // Responds through the deferred message when the defer above succeeded,
      // or as a fresh reply when it did not.
      await interaction.reply({
        components: [
          container({
            parts: [
              text(`### ${emotion.noun.charAt(0).toUpperCase() + emotion.noun.slice(1)}\n${content}`),
              ...(gifUrl ? [gallery(gifUrl)] : []),
              ...(animeName ? [text(`-# From: ${animeName}`)] : []),
            ],
          }),
        ],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });

      // Only burn the one-shot and disable the button once the reaction has
      // actually been delivered, so a failed response stays retryable.
      await db.set(backKey, Date.now()).catch((error) => {
        logger.error('Failed to record react back usage:', error);
      });

      // Flip the existing button to disabled instead of sending a fresh
      // components array. On a Components V2 message `components` IS the whole
      // message, so replacing it with just the button wiped the Text Display
      // and the Media Gallery and left a bare grey button on the original.
      const updatedComponents = interaction.message.components.map((component) =>
        structuredClone(component.toJSON()),
      );

      let buttonFound = false;
      const disableMatchingButton = (components) => {
        for (const component of components) {
          if (Array.isArray(component.components)) {
            disableMatchingButton(component.components);
          }

          if (component.custom_id === interaction.customId) {
            component.disabled = true;
            component.style = ButtonStyle.Secondary;
            buttonFound = true;
          }
        }
      };
      disableMatchingButton(updatedComponents);

      if (buttonFound && updatedComponents.length > 0) {
        // The source message is Components V2, so the edit has to carry the V2
        // flag as well; Discord refuses to convert a message between V1 and V2.
        await interaction.message.edit({
          components: updatedComponents,
          flags: MessageFlags.IsComponentsV2,
        }).catch((error) => {
          logger.warn('Could not disable react back button:', error?.message);
        });
      } else {
        logger.warn('react back button not found in message components, leaving it untouched');
      }
    } catch (error) {
      logger.error('Error handling react back button:', error);
      throw error;
    }
  },
};
