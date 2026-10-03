import { countStatsHandler } from '../../../handlers/leaderboardButtons.js';

function fromCustomId(handler) {
  return {
    name: handler.customId,
    execute: handler.execute,
  };
}

export default [fromCustomId(countStatsHandler)];