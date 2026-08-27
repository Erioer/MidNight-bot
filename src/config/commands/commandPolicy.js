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
    for (const key of ['enabled', 'slash', 'prefix', 'adminOnly']) {
      if (raw[key] !== undefined) {
        entry[key] = toBool(raw[key], DEFAULT_POLICY[key]);
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

const RAW_POLICY = loadRawPolicy();

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
