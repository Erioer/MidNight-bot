import { COUNTING_SHIELD } from '../countingGameConfig.js';

export const shopItems = [
    {
        id: 'extra_work',
        name: '📋 Extra Work Shift',
        price: 5000,
        description: 'Allows 1 extra use of the `/work` command.',
        type: 'consumable',
        maxQuantity: 5,
cooldown: 86400000,
        effect: {
            type: 'command_boost',
            command: 'work',
            uses: 1
        }
    },
    {
        id: 'bank_upgrade_1',
        name: '🏦 Bank Upgrade I',
        price: 15000,
        description: 'Increases bank capacity and allows more funds to be deposited.',
        type: 'upgrade',
        maxLevel: 5,
        effect: {
            type: 'bank_capacity',
            multiplier: 1.5
        }
    },
    {
        id: 'diamond_pickaxe',
        name: '💎 Diamond Pickaxe',
        price: 50000,
        description: 'Increases yield from `/mine`',
        type: 'tool',
        durability: 100,
        maxQuantity: 1,
        effect: {
            type: 'mining_yield',
            multiplier: 2.0
        }
    },
    {
        id: 'premium_role',
        name: '👑 Premium Server Role',
        price: 15000,
        description: 'A special role granting a fancy color and a 10% daily bonus.',
        type: 'role',
roleId: null,
        effect: {
            type: 'daily_bonus',
            multiplier: 1.1
        }
    },
    {
        id: 'lucky_clover',
        name: '🍀 Lucky Clover',
        price: 10000,
        description: 'Increases the chance of winning a higher payout on `/gamble` once.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'gamble_boost',
            multiplier: 1.5,
            uses: 1
        }
    },
    {
        id: 'fishing_rod',
        name: '🎣 Fishing Rod',
        price: 5000,
        description: 'Used for fishing commands',
        type: 'tool',
        durability: 100,
        maxQuantity: 1,
        effect: {
            type: 'fishing_yield',
            multiplier: 1.0
        }
    },
    {
        id: 'pickaxe',
        name: '⛏️ Pickaxe',
        price: 7500,
        description: 'Used for mining commands',
        type: 'tool',
        durability: 100,
        maxQuantity: 1,
        effect: {
            type: 'mining_yield',
            multiplier: 1.2
        }
    },
    {
        id: 'laptop',
        name: '💻 Laptop',
        price: 15000,
        description: 'Increases work earnings',
        type: 'tool',
        durability: 200,
        maxQuantity: 1,
        effect: {
            type: 'work_yield',
            multiplier: 1.5
        }
    },
    {
        id: 'lucky_charm',
        name: '🍀 Lucky Charm',
        price: 10000,
        description: 'Increases luck for gambling. Has 3 uses before being consumed.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'gamble_boost',
            multiplier: 1.3,
            uses: 3
        }
    },
    {
        id: 'bank_note',
        name: '📜 Bank Note',
        price: 25000,
        description: 'Increases bank capacity by 10,000. Can be purchased multiple times.',
        type: 'tool',
        durability: null,
        effect: {
            type: 'bank_capacity',
            increase: 10000
        }
    },
    {
        id: 'personal_safe',
        name: '🔒 Personal Safe',
        price: 30000,
        description: 'Protects your money from theft. Prevents others from robbing you.',
        type: 'tool',
        durability: null,
        maxQuantity: 1,
        effect: {
            type: 'robbery_protection',
            protection: true
        }
    },
    {
        id: COUNTING_SHIELD.shopItemId,
        name: '🛡️ Counting Shield',
        price: COUNTING_SHIELD.price,
        description: `Protects the counting game. If you post a wrong number while holding a shield, it is consumed automatically and the count is preserved. Hold up to ${COUNTING_SHIELD.max}.`,
        type: 'consumable',
        maxQuantity: COUNTING_SHIELD.max,
        effect: {
            type: 'counting_shield',
            uses: 1
        }
    },
    {
        id: 'xpboost',
        name: '⚡ XP Boost (6h)',
        price: 15000,
        description: 'Grants 10% more XP from all sources for 6 hours.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'xp_boost',
            duration: 6 * 60 * 60 * 1000,
            multiplier: 1.1
        }
    }
];

export function getItemById(itemId) {
    return shopItems.find(item => item.id === itemId);
}

export function getItemsByType(type) {
    return shopItems.filter(item => item.type === type);
}

export function getItemPrice(itemId) {
    const item = getItemById(itemId);
    return item ? item.price : 0;
}

/**
 * Maximum units of an item one member may hold at once, or null when uncapped.
 *
 * Single-hold tools, roles and upgrades resolve to 1 even without an explicit
 * `maxQuantity`; only deliberately repeatable items (bank notes) are uncapped.
 */
export function getItemHoldLimit(item) {
    if (!item) return null;
    if (item.maxQuantity) return item.maxQuantity;
    if (item.type === 'role' || item.type === 'upgrade') return 1;
    if (item.type === 'tool') return item.id === 'bank_note' ? null : 1;
    return null;
}

/**
 * `2/5` when capped, `3x` when uncapped — the same shape on the inventory
 * card, the dropdown description and the shop listing.
 */
export function formatOwned(quantity, item) {
    const limit = getItemHoldLimit(item);
    return limit ? `${quantity}/${limit}` : `${quantity}x`;
}

export function validatePurchase(itemId, userData) {
    const item = getItemById(itemId);
    if (!item) {
        return { valid: false, reason: 'Item not found' };
    }

    const inventory = userData.inventory || {};
    const upgrades = userData.upgrades || {};

    if (item.type === 'consumable' && item.maxQuantity) {
        const currentQuantity = inventory[itemId] || 0;
        if (currentQuantity >= item.maxQuantity) {
            return { 
                valid: false, 
                reason: `You can only have a maximum of ${item.maxQuantity} ${item.name}s` 
            };
        }
    }

    if (item.type === 'upgrade' && item.maxLevel) {
        
        if (upgrades[itemId]) {
            return { 
                valid: false, 
                reason: `You've already purchased ${item.name}` 
            };
        }
    }

    if (item.type === 'tool') {
        
        const currentQuantity = inventory[itemId] || 0;
        if (itemId !== 'bank_note' && currentQuantity > 0) {
            return { 
                valid: false, 
                reason: `You already have a ${item.name}` 
            };
        }
    }

    if (item.type === 'role' && item.roleId) {
        if (userData.roles?.includes(item.roleId)) {
            return { 
                valid: false, 
                reason: `You already have the ${item.name} role` 
            };
        }
    }

    return { valid: true };
}