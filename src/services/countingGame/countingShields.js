// countingShields.js
// Counting Shield inventory.
//
// Economy data (`guild:<guildId>:economy:<userId>` -> inventory) is the single
// source of truth for shield balances, so a shield bought from the shop and a
// shield awarded for milestone counts are the same object and can never drift.

import { COUNTING_SHIELD } from '../../config/countingGameConfig.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';

const SHOP_ITEM_ID = COUNTING_SHIELD.shopItemId;

/** Current shield balance for a user. */
export async function getShieldBalance(client, guildId, userId) {
  const economy = await getEconomyData(client, guildId, userId);
  return economy.inventory?.[SHOP_ITEM_ID] || 0;
}

/**
 * Grants one shield if the user is below the cap.
 * Returns `{ granted, shields }`.
 */
export async function grantShield(client, guildId, userId) {
  const economy = await getEconomyData(client, guildId, userId);
  const current = economy.inventory?.[SHOP_ITEM_ID] || 0;

  if (current >= COUNTING_SHIELD.max) {
    return { granted: false, shields: current };
  }

  const inventory = { ...economy.inventory, [SHOP_ITEM_ID]: current + 1 };
  await setEconomyData(client, guildId, userId, { ...economy, inventory });
  return { granted: true, shields: current + 1 };
}

/**
 * Consumes one shield. Returns `{ consumed, shields }` — `consumed` is false
 * when the user had none.
 */
export async function consumeShield(client, guildId, userId) {
  const economy = await getEconomyData(client, guildId, userId);
  const current = economy.inventory?.[SHOP_ITEM_ID] || 0;

  if (current <= 0) {
    return { consumed: false, shields: 0 };
  }

  const inventory = { ...economy.inventory };
  const remaining = current - 1;
  if (remaining > 0) {
    inventory[SHOP_ITEM_ID] = remaining;
  } else {
    delete inventory[SHOP_ITEM_ID];
  }

  await setEconomyData(client, guildId, userId, { ...economy, inventory });
  return { consumed: true, shields: remaining };
}

export { SHOP_ITEM_ID };