// economyViews.js
// Shared Components V2 layouts for the Economy category.
//
// Every economy outcome is rendered through `outcomeContainer()` so the
// skeleton cannot drift between commands: title, optional body, then a small
// divider, then an optional footer. Commands supply wording and accent only.
//
// Conventions enforced here:
//   - Accents are off unless the colour carries meaning. Neutral views
//     (balance, inventory, shop) pass no accent at all.
//   - Only these four colours are ever used:
//       success #2ECC71, failure #FF0000, cooldown #FEE75C, premium #D208FC.
//     A premium *failure* stays red.
//   - Titles are `### Sentence Case`.
//   - Cooldown footers always read "You can <verb> again in <t:...:R>".
//   - No emoji in titles, matching the sanitised V1 look.
//
// Discord rules (see utils/componentsV2.js): callers must send
// `flags: v2Flags(...)` and must not add `content` or `embeds`.

import {
  NO_PINGS,
  code,
  container,
  divider,
  ratioBar,
  section,
  text,
  thumbnail,
  v2Flags,
} from '../../utils/componentsV2.js';
import { getGuildConfig } from '../config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyPrefix } from '../../utils/database/keys.js';

/** Semantic accent colours. Nothing else may be passed to these builders. */
export const ECONOMY_ACCENT = Object.freeze({
  SUCCESS: 3066993, // #2ECC71
  FAILURE: 16711680, // #FF0000
  COOLDOWN: 16705372, // #FEE75C
  PREMIUM: 0xd208fc, // #D208FC
});

/** Cash multiplier applied to a payout for premium members. */
export const PREMIUM_CASH_BONUS = 0.1;

/** Flat success-rate bonus for premium members, in percentage points. */
export const PREMIUM_SUCCESS_BONUS = 0.05;

/** Discord relative timestamp, e.g. `<t:1712345678:R>`. */
export function timestamp(ms, style = 'R') {
  return `<t:${Math.floor(Number(ms) / 1000)}:${style}>`;
}

/**
 * Relative timestamp for a duration measured from now.
 *
 * Negative input is clamped so an already-expired cooldown renders as "now"
 * rather than a time in the past.
 */
export function timeLeft(msRemaining, style = 'R') {
  return timestamp(Date.now() + Math.max(0, Number(msRemaining) || 0), style);
}

/** Milliseconds of jail left, or 0 when the user is free. */
export function jailRemainingMs(userData, now = Date.now()) {
  const until = Number(userData?.jailedUntil) || 0;
  return until > now ? until - now : 0;
}

/** True when the member currently holds the guild's premium role. */
export async function hasPremiumRole(interaction, client, guildId) {
  const guildConfig = await getGuildConfig(client, guildId);
  const roleId = guildConfig?.premiumRoleId;
  if (!roleId || !interaction.member?.roles?.cache) return false;
  return interaction.member.roles.cache.has(roleId);
}

/** Adds the premium cash bonus to a payout. */
export function applyPremiumCash(amount, isPremium) {
  const base = Math.max(0, Number(amount) || 0);
  return isPremium ? base + Math.floor(base * PREMIUM_CASH_BONUS) : base;
}

/** Adds the premium success bonus, clamped to a 0-1 probability. */
export function applyPremiumChance(chance, isPremium) {
  const base = Number(chance) || 0;
  return Math.max(0, Math.min(1, base + (isPremium ? PREMIUM_SUCCESS_BONUS : 0)));
}

/**
 * Server display name for a user, falling back to the account username.
 *
 * All user-facing economy text uses this so output reads cleanly instead of
 * showing raw `username` handles everywhere.
 */
export async function resolveDisplayName(interaction, user) {
  if (!user) return 'Unknown member';
  try {
    const member = await interaction.guild?.members?.fetch(user.id).catch(() => null);
    if (member?.displayName) return member.displayName;
  } catch {
    // Fall through to the username below.
  }
  return user.username || 'Unknown member';
}



/**
 * The single outcome skeleton every economy embed is built from.
 *
 * `footer` is rendered under a small divider so cooldown and next-step lines
 * always land in the same place.
 */
export function outcomeContainer({ accentColor, title, body, footer }) {
  const parts = [text(`### ${title}`)];
  if (body) parts.push(text(body));
  if (footer) parts.push(divider(), text(footer));
  return container({ accentColor, parts });
}

/** Successful outcome. Premium successes reuse this with a premium accent. */
export function successContainer({ title, body, footer, premium = false }) {
  return outcomeContainer({
    accentColor: premium ? ECONOMY_ACCENT.PREMIUM : ECONOMY_ACCENT.SUCCESS,
    title,
    body,
    footer,
  });
}

/** Failed outcome. Stays red even for premium members. */
export function failureContainer({ title, body, footer }) {
  return outcomeContainer({
    accentColor: ECONOMY_ACCENT.FAILURE,
    title,
    body,
    footer,
  });
}

/** Cooldown notice. `body` carries the command-specific explanation. */
export function cooldownContainer({ body, footer }) {
  return outcomeContainer({
    accentColor: ECONOMY_ACCENT.COOLDOWN,
    title: 'Cooldown Active',
    body,
    footer,
  });
}

/**
 * Attention notice that is not a cooldown — clamped amounts, partial results.
 *
 * Reuses the same yellow accent so "something was adjusted" reads the same
 * everywhere, without inventing a fifth colour.
 */
export function noticeContainer({ title = 'Heads Up', body, footer }) {
  return outcomeContainer({
    accentColor: ECONOMY_ACCENT.COOLDOWN,
    title,
    body,
    footer,
  });
}

/** Standard cooldown footer so every command phrases it identically. */
export function cooldownFooter(verb, msRemaining) {
  return `You can ${verb} again in ${timeLeft(msRemaining)}`;
}

/** Jail notice. Red, and names the command the user actually typed. */
export function jailContainer({ command, msRemaining }) {
  return outcomeContainer({
    accentColor: ECONOMY_ACCENT.FAILURE,
    title: "You're currently in jail",
    body: `You can't use \`/${command}\` for ${timeLeft(msRemaining)}!`,
  });
}

/**
 * The one data-error embed, reused by every economy command.
 *
 * `message` keeps the command's original wording; only the title and accent
 * are fixed, per spec.
 */
export function dataErrorContainer({ command, message } = {}) {
  return outcomeContainer({
    accentColor: ECONOMY_ACCENT.FAILURE,
    title: 'Economy: Data Error',
    body: message || `Failed to load economy data for \`/${command}\`. Please try again later.`,
  });
}

/** Identical premium line for every premium-aware command. */
export function premiumBonusLine(bonusAmount) {
  return `✨ **Premium Bonus:** +${code(`$${(Number(bonusAmount) || 0).toLocaleString()}`)}`;
}

/**
 * Server-wide net-worth rank, matching `/eleaderboard`'s ordering.
 *
 * Used for the balance card's footer. Returns `rank: null` when the member has
 * no economy account on this server, so the footer can be omitted entirely
 * rather than claiming a position the user does not hold.
 */
export async function getEconomyRank(client, guildId, userId) {
  const prefix = getEconomyPrefix(guildId);
  const keys = await client.db.list(prefix);
  if (!Array.isArray(keys) || keys.length === 0) return { rank: null, total: 0 };

  const standings = [];
  for (const key of keys) {
    const data = await client.db.get(key);
    if (data) {
      standings.push({
        userId: key.replace(prefix, ''),
        net: (data.wallet || 0) + (data.bank || 0),
      });
    }
  }

  standings.sort((a, b) => b.net - a.net);
  const index = standings.findIndex((entry) => entry.userId === userId);
  return { rank: index === -1 ? null : index + 1, total: standings.length };
}

/**
 * Single reply path for economy views.
 *
 * `v2Flags()` is required because a V2 payload may not carry `content` or
 * `embeds`, and `NO_PINGS` because Text Display mentions ping like content.
 */
export async function sendEconomy(interaction, ...containers) {
  await InteractionHelper.safeEditReply(interaction, {
    components: containers.flat().filter(Boolean),
    flags: v2Flags(),
    allowedMentions: NO_PINGS,
  });
}

/** Wallet/bank card shared by `/balance` and the leaderboard balance button. */
export function balanceContainer({
  displayName,
  avatarUrl,
  wallet,
  bank,
  maxBank,
  rank,
  totalMembers,
  isSelf = true,
}) {
  const title = isSelf ? 'Your Balance' : `${displayName || 'This member'}'s Balance`;
  const netWorth = (Number(wallet) || 0) + (Number(bank) || 0);

  const details = [
    `Here's the current financial status for ${displayName || 'this member'}`,
    `* **Wallet:** ${code(`$${(Number(wallet) || 0).toLocaleString()}`)}`,
    `* **Bank:** ${code(`$${(Number(bank) || 0).toLocaleString()}`)} of ${code(`$${(Number(maxBank) || 0).toLocaleString()}`)}`,
    `* **Total Net worth:** ${code(`$${netWorth.toLocaleString()}`)}`,
    ratioBar(wallet, netWorth),
  ].join('\n');

  // A Section always requires an accessory, so fall back to plain text
  // displays when the target has no avatar to show.
  const body = avatarUrl
    ? section([text(`### ${title}`), text(details)], thumbnail(avatarUrl))
    : [text(`### ${title}`), text(details)];

  const parts = [body, divider()];

  if (rank !== null && rank !== undefined && totalMembers) {
    const subject = isSelf ? 'You' : displayName || 'This member';
    parts.push(text(`-# ${subject} rank #${rank} of ${totalMembers} members on this server`));
  }

  return container({ parts });
}