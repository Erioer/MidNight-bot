import { reactBackHandler } from '../../../handlers/reactButtons.js';

function fromCustomId(handler) {
  return {
    name: handler.customId,
    execute: handler.execute,
  };
}

export default [fromCustomId(reactBackHandler)];
