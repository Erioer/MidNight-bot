import { handleMusicSearchPage } from '../../../services/music/musicSearchService.js';

export default [
  {
    name: 'music_search_prev',
    async execute(interaction, client, args) {
      await handleMusicSearchPage(interaction, client, args[0], -1);
    },
  },
  {
    name: 'music_search_next',
    async execute(interaction, client, args) {
      await handleMusicSearchPage(interaction, client, args[0], 1);
    },
  },
];
