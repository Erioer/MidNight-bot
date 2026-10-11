import { handleMusicSearchSelect } from '../../../services/music/musicSearchService.js';

export default {
  name: 'music_search_select',
  async execute(interaction, client, args) {
    await handleMusicSearchSelect(interaction, client, args[0]);
  },
};
