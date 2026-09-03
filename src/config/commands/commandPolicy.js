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

const DEFAULT_TEMPLATE = `# MidNight Command Policy
#
# Controls every command in the bot from one file. Settings cascade:
#   defaults -> categories -> commands
# Only list what you want to change. Everything defaults to "on".
#
# Restart the bot to apply changes. Slash-registration changes can take
# up to an hour to show on Discord's side.
#
# Use # to comment out values you want to keep at default.
# Uncomment a line to override the default for that setting.
#   isEnabled      - enable/disable the command or category
#   isAdminOnly    - require Manage Server permission
#   isSlashEnabled - register as a slash command
#   isPrefixEnabled - usable via the text prefix
#
# Category keys match the command folder names (case-insensitive):
#   birthday, community, core, economy, fun, giveaway, jointocreate,
#   leveling, logging, moderation, music, reaction_roles, search,
#   serverstats, starboard, ticket, tools, utility, verification, welcome

#restoreDefaults: false

defaults:
  isEnabled: true
  isAdminOnly: false
  isSlashEnabled: true
  isPrefixEnabled: true

categories:
  # \u2500\u2500 Birthday \u2500\u2500
  birthday:
    #isEnabled: true
    #isAdminOnly: false
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Community (Applications) \u2500\u2500
  community:
    #isEnabled: true
    #isAdminOnly: false
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Core \u2500\u2500
  core:
    #isEnabled: true
    #isAdminOnly: false
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Economy \u2500\u2500
  economy:
    #isEnabled: true
    #isAdminOnly: false
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Fun \u2500\u2500
  fun:
    #isEnabled: true
    #isAdminOnly: false
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Giveaway \u2500\u2500
  giveaway:
    #isEnabled: true
    #isAdminOnly: false
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Join to Create \u2500\u2500
  jointocreate:
    #isEnabled: true
    isAdminOnly: true
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Leveling \u2500\u2500
  leveling:
    #isEnabled: true
    #isAdminOnly: false
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Logging \u2500\u2500
  logging:
    #isEnabled: true
    isAdminOnly: true
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Moderation \u2500\u2500
  moderation:
    #isEnabled: true
    isAdminOnly: true
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Music \u2500\u2500
  music:
    #isEnabled: true
    #isAdminOnly: false
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Reaction Roles \u2500\u2500
  reaction_roles:
    #isEnabled: true
    isAdminOnly: true
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Search \u2500\u2500
  search:
    #isEnabled: true
    #isAdminOnly: false
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Server Stats \u2500\u2500
  serverstats:
    #isEnabled: true
    isAdminOnly: true
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Starboard \u2500\u2500
  starboard:
    #isEnabled: true
    isAdminOnly: true
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Ticket \u2500\u2500
  ticket:
    #isEnabled: true
    isAdminOnly: true
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Tools \u2500\u2500
  tools:
    #isEnabled: true
    #isAdminOnly: false
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Utility \u2500\u2500
  utility:
    #isEnabled: true
    #isAdminOnly: false
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Verification \u2500\u2500
  verification:
    #isEnabled: true
    #isAdminOnly: false
    #isSlashEnabled: true
    #isPrefixEnabled: true

  # \u2500\u2500 Welcome \u2500\u2500
  welcome:
    #isEnabled: true
    isAdminOnly: true
    #isSlashEnabled: true
    #isPrefixEnabled: true

commands:
  # \u2500\u2500 Community \u2500\u2500
  #   app-admin (admin dashboard) | apply (user-facing)
  app-admin:
    isAdminOnly: true
  apply:
    isPrefixEnabled: false

  # \u2500\u2500 Core \u2500\u2500
  #   commands | configwizard | help | ping | stats | support | uptime
  commands:
    isAdminOnly: true
  configwizard:
    isAdminOnly: true
    isPrefixEnabled: false
  help:
    isPrefixEnabled: false

  # \u2500\u2500 Economy \u2500\u2500
  #   balance | beg | buy | crime | daily | deposit | economy | eleaderboard
  #   fish | gamble | inventory | mine | pay | rob | shop | shop-config
  #   slut | withdraw | work
  economy:
    isAdminOnly: true
    isPrefixEnabled: false
  shop:
    isPrefixEnabled: false
  shop-config:
    isAdminOnly: true
    isPrefixEnabled: false

  # \u2500\u2500 Fun (prefix-only commands) \u2500\u2500
  #   catfact | count | dogfact | fact | fight | flip | react | roll
  catfact:
    isSlashEnabled: false
  dogfact:
    isSlashEnabled: false
  fact:
    isSlashEnabled: false
  react:
    isSlashEnabled: false

  # \u2500\u2500 Leveling (admin commands) \u2500\u2500
  #   leaderboard | level | leveladd | levelremove | levelset | rank
  leveladd:
    isAdminOnly: true
  levelremove:
    isAdminOnly: true
  levelset:
    isAdminOnly: true

  # \u2500\u2500 Music (slash-only commands) \u2500\u2500
  #   join | music | nowplaying | play | queue
  play:
    isPrefixEnabled: false
  queue:
    isPrefixEnabled: false

  # \u2500\u2500 Starboard (prefix-only commands) \u2500\u2500
  #   setchannelstarboard | removestarboard
  setchannelstarboard:
    isSlashEnabled: false
  removestarboard:
    isSlashEnabled: false

  # \u2500\u2500 Tools (slash-only commands) \u2500\u2500
  #   baseconvert | calculate | countdown | embedbuilder | generatepassword
  #   hexcolor | poll | randomuser | shorten | time | unixtime
  embedbuilder:
    isPrefixEnabled: false

  # \u2500\u2500 Utility \u2500\u2500
  #   avatar | firstmsg | report | serverinfo | todo | userinfo | weather
  #   wipedata
  wipedata:
    isPrefixEnabled: false

  # \u2500\u2500 Verification (admin commands) \u2500\u2500
  #   autoverify | verification | verify
  autoverify:
    isAdminOnly: true
  verification:
    isAdminOnly: true
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
