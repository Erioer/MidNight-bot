import { SlashCommandBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { NO_PINGS, v2Flags } from '../../utils/componentsV2.js';
import { noticeContainer, successContainer } from '../../services/economy/economyViews.js';

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
// V2 total text budget is 4,000 characters; the battle log is trimmed to stay
// under it once the title and outcome lines are added.
const DESCRIPTION_LIMIT = 3900;

export default {
    data: new SlashCommandBuilder()
    .setName("fight")
    .setDescription("Starts a simulated 1v1 text-based battle.")
    .addUserOption((option) =>
      option
        .setName("opponent")
        .setDescription("The user to fight.")
        .setRequired(true),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const challenger = interaction.user;
    const opponent = interaction.options.getUser("opponent");
    const challengerName = interaction.member?.displayName || challenger.username;
    const opponentMember = await interaction.guild?.members?.fetch(opponent.id).catch(() => null);
    const opponentName = opponentMember?.displayName || opponent.username;

    if (challenger.id === opponent.id) {
      return await InteractionHelper.safeEditReply(interaction, {
        components: [
          noticeContainer({
            title: 'Invalid Challenge',
            body: `**${challengerName}**, you can't fight yourself! That's a draw before it even starts.`,
          }),
        ],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });
    }

    if (opponent.bot) {
      return await InteractionHelper.safeEditReply(interaction, {
        components: [
          noticeContainer({
            title: 'Invalid Opponent',
            body: "You can't fight bots! Challenge a real person instead.",
          }),
        ],
        flags: v2Flags(),
        allowedMentions: NO_PINGS,
      });
    }

    const winner = rand(0, 1) === 0 ? challenger : opponent;
    const loser = winner.id === challenger.id ? opponent : challenger;
    const winnerName = winner.id === challenger.id ? challengerName : opponentName;
    const loserName = loser.id === challenger.id ? challengerName : opponentName;
    const rounds = rand(3, 7);
    const damage = rand(10, 50);

    const log = [];
    log.push(
      `**${challengerName}** challenges **${opponentName}** to a duel! (Best of ${rounds} rounds)`,
    );

    for (let i = 1; i <= rounds; i++) {
      const attacker = rand(0, 1) === 0 ? challenger : opponent;
      const target = attacker.id === challenger.id ? opponent : challenger;
      const attackerName = attacker.id === challenger.id ? challengerName : opponentName;
      const targetName = target.id === challenger.id ? challengerName : opponentName;
      const action = [
        "throws a wild punch",
        "lands a critical hit",
        "uses a weak spell",
        "parries and counterattacks",
      ][rand(0, 3)];
      log.push(
        `\n**Round ${i}:** ${attackerName} ${action} on ${targetName} for ${rand(1, damage)} damage!`,
      );
    }

    const outcomeText = log.join("\n");
    const winnerText = `**${winnerName}** has defeated ${loserName} and claims the victory!`;
    const fullDescription = `${outcomeText}\n\n${winnerText}`;

    const description = fullDescription.length <= DESCRIPTION_LIMIT
      ? fullDescription
      : `${fullDescription.slice(0, DESCRIPTION_LIMIT - 15)}\n\n...`;

    await InteractionHelper.safeEditReply(interaction, {
      components: [
        successContainer({
          title: 'Duel Complete!',
          body: description,
        }),
      ],
      flags: v2Flags(),
      allowedMentions: NO_PINGS,
    });
    logger.debug(`Fight command executed between ${challenger.id} and ${opponent.id} in guild ${interaction.guildId}`);
  },
};