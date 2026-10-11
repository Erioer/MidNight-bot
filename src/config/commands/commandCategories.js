/**
 * Command category metadata for the command access manager.
 */

/**
 * Keys are the command folder names from `src/commands` — `commandLoader.js`
 * derives the category from the directory, so these must match it exactly.
 */
export const CATEGORY_ICONS = {
  Birthday: '🎂',
  Community: '👥',
  Core: 'ℹ️',
  Economy: '💰',
  Fun: '🎮',
  Giveaway: '🎉',
  JoinToCreate: '🔌',
  Leveling: '📊',
  Logging: '📝',
  Moderation: '🛡️',
  Music: '🎵',
  Reaction_roles: '🎭',
  Search: '🔍',
  ServerStats: '📈',
  Starboard: '⭐',
  Ticket: '🎫',
  Tools: '🛠️',
  Utility: '🔧',
  Verification: '✅',
  Welcome: '👋',
};

/** Commands that always stay available so admins can recover access. */
export const PROTECTED_COMMANDS = new Set(['commands', 'configwizard']);

export function normalizeCategoryKey(category) {
  return String(category || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function formatCategoryName(rawCategory) {
  return String(rawCategory || '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Collapses `Reaction_roles`, `Reaction Roles`, `reactionroles` to one key. */
function normalizeIconKey(category) {
  return String(category || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const ICONS_BY_NORMALIZED_KEY = new Map(
  Object.entries(CATEGORY_ICONS).map(([key, icon]) => [normalizeIconKey(key), icon]),
);

export function getCategoryIcon(category) {
  return (
    CATEGORY_ICONS[category] ||
    ICONS_BY_NORMALIZED_KEY.get(normalizeIconKey(category)) ||
    CATEGORY_ICONS[formatCategoryName(category)] ||
    '📁'
  );
}
