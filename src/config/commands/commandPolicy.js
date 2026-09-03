import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POLICY_FILE = path.join(__dirname, 'commands.yml');

const DEFAULT_POLICY = Object.freeze({
  enabled: true,
  slash: true,
  prefix: true,
  adminOnly: false,
});

const PROTECTED_CATEGORIES = new Set(['core']);
const PROTECTED_COMMANDS = new Set(['commands', 'configwizard']);

const DEFAULT_TEMPLATE = `# ============================================================
# MidNight Command Policy
# ============================================================
# Controls every command in the bot from one file.
# Settings cascade:  defaults  ->  category  ->  command
# Only list what you want to change. Everything defaults to on.
#
# Key meanings:
#   isEnabled      - Whether the command/category loads at all.
#                    false removes it from slash, prefix, and the
#                    /commands dashboard entirely.
#   isSlashEnabled - Register as a slash command.
#   isPrefixEnabled - Usable via the text prefix (e.g. $help).
#   isAdminOnly    - Require the Manage Server permission.
#
# For commands that are structurally prefix-only (e.g. starboard,
# dogfact, fact, react) the isSlashEnabled key is ignored.
# For commands that are structurally slash-only (e.g. help,
# configwizard, play, queue, greet, wipedata) the isPrefixEnabled
# key is ignored.
#
# Restart the bot to apply changes. Slash-registration changes
# can take up to an hour to show on Discord's side.
#
# Set restoreDefaults to true to reset everything back to defaults.
# It will automatically reset itself after.
# ============================================================

restoreDefaults: false

# ============================================================
# Default values for every command in the bot.
# These apply unless overridden by a category or command entry.
# ============================================================
defaults:
  isEnabled: true
  isAdminOnly: false
  isSlashEnabled: true
  isPrefixEnabled: true

categories:
  # ------------------------------------------------
  # Birthday
  # ------------------------------------------------
  # birthday:
  #   isEnabled: true
  #   isAdminOnly: false
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # Community
  # ------------------------------------------------
  # community:
  #   isEnabled: true
  #   isAdminOnly: false
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # Core  (protected - cannot be disabled)
  # ------------------------------------------------
  # core:
  #   isEnabled: true
  #   isAdminOnly: false
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # Economy
  # ------------------------------------------------
  # economy:
  #   isEnabled: true
  #   isAdminOnly: false
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # Fun
  # ------------------------------------------------
  # fun:
  #   isEnabled: true
  #   isAdminOnly: false
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # Giveaway
  # ------------------------------------------------
  # giveaway:
  #   isEnabled: true
  #   isAdminOnly: false
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # JoinToCreate
  # ------------------------------------------------
  # jointocreate:
  #   isEnabled: true
  #   isAdminOnly: true
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # Leveling
  # ------------------------------------------------
  # leveling:
  #   isEnabled: true
  #   isAdminOnly: false
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # Logging
  # ------------------------------------------------
  # logging:
  #   isEnabled: true
  #   isAdminOnly: true
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # Moderation
  # ------------------------------------------------
  # moderation:
  #   isEnabled: true
  #   isAdminOnly: true
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # Music
  # ------------------------------------------------
  # music:
  #   isEnabled: true
  #   isAdminOnly: false
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # Reaction_roles
  # ------------------------------------------------
  # reaction_roles:
  #   isEnabled: true
  #   isAdminOnly: true
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # Search
  # ------------------------------------------------
  # search:
  #   isEnabled: true
  #   isAdminOnly: false
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # ServerStats
  # ------------------------------------------------
  # serverstats:
  #   isEnabled: true
  #   isAdminOnly: true
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # Starboard  (prefix-only commands)
  # ------------------------------------------------
  # starboard:
  #   isEnabled: true
  #   isAdminOnly: true
  #   isSlashEnabled: false
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # Ticket
  # ------------------------------------------------
  # ticket:
  #   isEnabled: true
  #   isAdminOnly: true
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # Tools
  # ------------------------------------------------
  # tools:
  #   isEnabled: true
  #   isAdminOnly: false
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # Utility
  # ------------------------------------------------
  # utility:
  #   isEnabled: true
  #   isAdminOnly: false
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # Verification
  # ------------------------------------------------
  # verification:
  #   isEnabled: true
  #   isAdminOnly: false
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

  # ------------------------------------------------
  # Welcome
  # ------------------------------------------------
  # welcome:
  #   isEnabled: true
  #   isAdminOnly: true
  #   isSlashEnabled: true
  #   isPrefixEnabled: true

commands:
  # ========================
  # Birthday
  # ========================
  birthday:
    # subcommands: set, info, list, remove, next, setchannel

  # ========================
  # Community
  # ========================
  apply:
    # subcommands: submit, status, list
  app-admin:
    isAdminOnly: true
    # subcommands: setup, review, list, dashboard

  # ========================
  # Core  (protected - cannot be disabled)
  # ========================
  help:
    isSlashEnabled: true
    isPrefixEnabled: false
  commands:
    isAdminOnly: true
    # subcommands: dashboard, disable, enable
  configwizard:
    isAdminOnly: true
    isSlashEnabled: true
    isPrefixEnabled: false
  ping:
  stats:
  uptime:
  support:

  # ========================
  # Economy
  # ========================
  balance:
  beg:
  buy:
  crime:
  daily:
  deposit:
  economy:
    isAdminOnly: true
    isSlashEnabled: true
    isPrefixEnabled: false
    # subcommand: dashboard
  eleaderboard:
  fish:
  gamble:
  inventory:
  mine:
  pay:
  rob:
  shop:
    isSlashEnabled: true
    isPrefixEnabled: false
  shop-config:
    isSlashEnabled: true
    isPrefixEnabled: false
    isAdminOnly: true
    # subcommand: setrole
  slut:
  withdraw:
  work:

  # ========================
  # Fun
  # ========================
  catfact:
    isSlashEnabled: false
    isPrefixEnabled: true
  count:
    isAdminOnly: true
    # subcommands: setup, disable, status, reset, leaderboard
  dogfact:
    isSlashEnabled: false
    isPrefixEnabled: true
  fact:
    isSlashEnabled: false
    isPrefixEnabled: true
  fight:
  flip:
  react:
    isSlashEnabled: false
    isPrefixEnabled: true
  roll:

  # ========================
  # Giveaway
  # ========================
  gcreate:
  gdelete:
    isAdminOnly: true
  gend:
    isAdminOnly: true
  greroll:
    isAdminOnly: true

  # ========================
  # JoinToCreate
  # ========================
  jointocreate:
    isAdminOnly: true
    # subcommands: setup, dashboard

  # ========================
  # Leveling
  # ========================
  level:
    isAdminOnly: true
    # subcommands: setup, dashboard
  leveladd:
    isAdminOnly: true
  levelremove:
    isAdminOnly: true
  levelset:
    isAdminOnly: true
  leaderboard:
  rank:

  # ========================
  # Logging
  # ========================
  logging:
    isAdminOnly: true
    # subcommands: dashboard, channel

  # ========================
  # Moderation
  # ========================
  ban:
    isAdminOnly: true
  cases:
    isAdminOnly: true
  dm:
    isAdminOnly: true
  kick:
    isAdminOnly: true
  lock:
    isAdminOnly: true
  massban:
    isAdminOnly: true
  masskick:
    isAdminOnly: true
  purge:
    isAdminOnly: true
  say:
    isAdminOnly: true
  timeout:
    isAdminOnly: true
  unban:
    isAdminOnly: true
  unlock:
    isAdminOnly: true
  untimeout:
    isAdminOnly: true
  usernotes:
    isAdminOnly: true
    # subcommands: add, view, remove, clear
  warn:
    isAdminOnly: true
  warnings:
    isAdminOnly: true

  # ========================
  # Music
  # ========================
  join:
  music:
    # subcommands: pause, resume, skip, stop, shuffle, loop,
    #              volume, seek, remove, move, clear, leave, 247,
    #              likes add, likes list, likes remove, likes play
  nowplaying:
  play:
    isSlashEnabled: true
    isPrefixEnabled: false
  queue:
    isSlashEnabled: true
    isPrefixEnabled: false

  # ========================
  # Reaction_roles
  # ========================
  reactroles:
    isAdminOnly: true
    # subcommands: setup, dashboard

  # ========================
  # Search
  # ========================
  search:
    # subcommands: define, google, urban

  # ========================
  # ServerStats
  # ========================
  serverstats:
    isAdminOnly: true
    # subcommands: create, list, update, delete

  # ========================
  # Starboard  (prefix-only commands)
  # ========================
  setchannelstarboard:
    isAdminOnly: true
    isSlashEnabled: false
    isPrefixEnabled: true
  removestarboard:
    isAdminOnly: true
    isSlashEnabled: false
    isPrefixEnabled: true

  # ========================
  # Ticket
  # ========================
  ticket:
    isAdminOnly: true
    # subcommands: setup, dashboard
  claim:
  close:
  priority:

  # ========================
  # Tools
  # ========================
  baseconvert:
  calculate:
  countdown:
  embedbuilder:
  generatepassword:
  hexcolor:
  poll:
  randomuser:
  shorten:
  time:
  unixtime:

  # ========================
  # Utility
  # ========================
  avatar:
  firstmsg:
  report:
    # subcommands: file, setchannel
  serverinfo:
  todo:
    # subcommands: add, list, complete, remove,
    #              share create, share add, share view,
    #              share addtask, share remove
  userinfo:
  weather:
  wipedata:
    isSlashEnabled: true
    isPrefixEnabled: false

  # ========================
  # Verification
  # ========================
  autoverify:
    isAdminOnly: true
    # subcommands: setup, dashboard
  verify:
  verification:
    isAdminOnly: true
    # subcommands: setup, remove, dashboard

  # ========================
  # Welcome
  # ========================
  autorole:
    isAdminOnly: true
    # subcommands: add, remove, list
  goodbye:
    isAdminOnly: true
    # subcommand: setup
  greet:
    isAdminOnly: true
    isSlashEnabled: true
    isPrefixEnabled: false
    # subcommand: dashboard
  welcome:
    isAdminOnly: true
    # subcommand: setup
`;

function normalizeKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toBool(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return Boolean(value);
}

function parsePartialPolicy(raw) {
  const entry = {};

  if (raw && typeof raw === 'object') {
    const KEY_MAP = {
      isEnabled: 'enabled',
      enabled: 'enabled',
      isAdminOnly: 'adminOnly',
      adminOnly: 'adminOnly',
      isSlashEnabled: 'slash',
      slash: 'slash',
      isPrefixEnabled: 'prefix',
      prefix: 'prefix',
    };

    for (const [rawKey, policyKey] of Object.entries(KEY_MAP)) {
      if (raw[rawKey] !== undefined) {
        entry[policyKey] = toBool(raw[rawKey], DEFAULT_POLICY[policyKey]);
      }
    }
  }

  return entry;
}

function loadRawPolicy() {
  try {
    if (!fs.existsSync(POLICY_FILE)) {
      logger.info('commands.yml not found - using default command policy');
      return { defaults: {}, categories: {}, commands: {} };
    }

    const contents = fs.readFileSync(POLICY_FILE, 'utf8');
    const parsed = yaml.load(contents);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    logger.error('Failed to load commands.yml - using default command policy:', error);
    return { defaults: {}, categories: {}, commands: {} };
  }
}

let RAW_POLICY = loadRawPolicy();

if (RAW_POLICY.restoreDefaults === true ||
    (typeof RAW_POLICY.restoreDefaults === 'string' &&
     RAW_POLICY.restoreDefaults.toLowerCase() === 'true')) {
  logger.info('restoreDefaults is true - resetting commands.yml to defaults');
  try {
    fs.writeFileSync(POLICY_FILE, DEFAULT_TEMPLATE, 'utf8');
    RAW_POLICY = yaml.load(DEFAULT_TEMPLATE) || {};
  } catch (error) {
    logger.error('Failed to write default commands.yml:', error);
  }
}

const DEFAULTS = {
  ...DEFAULT_POLICY,
  ...parsePartialPolicy(RAW_POLICY.defaults),
};

const categoryPolicies = new Map();
for (const [key, value] of Object.entries(RAW_POLICY.categories || {})) {
  categoryPolicies.set(normalizeKey(key), parsePartialPolicy(value));
}

const commandPolicies = new Map();
for (const [key, value] of Object.entries(RAW_POLICY.commands || {})) {
  commandPolicies.set(normalizeKey(key), parsePartialPolicy(value));
}

export function getCommandPolicy(category, commandName) {
  const categoryKey = normalizeKey(category);
  const commandKey = normalizeKey(commandName);

  let policy = { ...DEFAULTS };

  const categoryPolicy = categoryPolicies.get(categoryKey);
  if (categoryPolicy) {
    policy = { ...policy, ...categoryPolicy };
  }

  const commandPolicy = commandPolicies.get(commandKey);
  if (commandPolicy) {
    policy = { ...policy, ...commandPolicy };
  }

  if (PROTECTED_CATEGORIES.has(categoryKey) || PROTECTED_COMMANDS.has(commandKey)) {
    policy.enabled = true;
  }

  return policy;
}

export function isCommandEnabled(category, commandName) {
  return getCommandPolicy(category, commandName).enabled;
}

export function isSlashEnabled(category, commandName) {
  return getCommandPolicy(category, commandName).slash;
}

export function isPrefixEnabled(category, commandName) {
  return getCommandPolicy(category, commandName).prefix;
}

export function isAdminOnly(category, commandName) {
  return getCommandPolicy(category, commandName).adminOnly;
}
