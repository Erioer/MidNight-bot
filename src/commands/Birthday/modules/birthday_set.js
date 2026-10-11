import { setBirthday } from '../../../services/birthdayService.js';
import { NO_PINGS, v2Flags } from '../../../utils/componentsV2.js';
import { successContainer } from '../../../services/economy/economyViews.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const month = interaction.options.getInteger("month");
        const day = interaction.options.getInteger("day");
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        const result = await setBirthday(client, guildId, userId, month, day);

        const card = successContainer({
            title: 'Birthday Set!',
            body: `Your birthday has been set to **${result.data.monthName} ${result.data.day}**!`,
        });

        await InteractionHelper.safeEditReply(interaction, {
            components: [card],
            flags: v2Flags(),
            allowedMentions: NO_PINGS,
        });
    }
};
