import { inventorySelectHandler } from '../../../handlers/inventoryButtons.js';

function fromCustomId(handler) {
    return {
        name: handler.customId,
        execute: handler.execute,
    };
}

export default [fromCustomId(inventorySelectHandler)];