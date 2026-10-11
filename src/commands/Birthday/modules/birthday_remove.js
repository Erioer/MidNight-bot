import { deleteBirthday } from '../../../services/birthdayService.js';
import { NO_PINGS, v2Flags } from '../../../utils/componentsV2.js';
import { failureContainer, successContainer } from '../../../services/economy/economyViews.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        const result = await deleteBirthday(client, guildId, userId);

        if (result.status === 'not_found') {
            const card = failureContainer({
                title: 'No Birthday Found',
                body: 'You don\'t have a birthday set to remove.',
            });
            await InteractionHelper.safeEditReply(interaction, {
                components: [card],
                flags: v2Flags(),
                allowedMentions: NO_PINGS,
            });
            return;
        }

        const card = successContainer({
            title: 'Birthday Removed',
            body: 'Your birthday has been successfully removed from the server.',
        });
        await InteractionHelper.safeEditReply(interaction, {
            components: [card],
            flags: v2Flags(),
            allowedMentions: NO_PINGS,
        });
    }
};
