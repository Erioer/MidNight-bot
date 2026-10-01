// countingNumberParser.js
// Natural-language aware number extraction for the counting game.
//
// Responsibilities:
//   1. Split a raw message into the "countable" part and its comment (the
//      prefix is a single literal backslash, defined in countingGameConfig.js).
//   2. Parse the countable part as a literal number, a word-to-number phrase
//      ("one hundred", "twenty-four", "first"), or a safe math expression
//      ("4*4", "32/2", "10+6", "4^2").
//   3. Report how many distinct numbers appear in the whole message so the
//      caller can apply the multi-number penalty without re-scanning text.

import { COUNTING_COMMENT_PREFIX } from '../../config/countingGameConfig.js';

const SMALL_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};

const TENS_WORDS = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const SCALE_WORDS = {
  hundred: 100,
  thousand: 1000,
  million: 1000000,
  billion: 1000000000,
  trillion: 1000000000000,
};

const ORDINAL_WORDS = {
  zeroth: 0, first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
  sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19,
  twentieth: 20, thirtieth: 30, fortieth: 40, fiftieth: 50,
  sixtieth: 60, seventieth: 70, eightieth: 80, ninetieth: 90,
  hundredth: 100, thousandth: 1000,
};

const ALL_NUMBER_WORDS = new Map([
  ...Object.entries(SMALL_WORDS),
  ...Object.entries(TENS_WORDS),
  ...Object.entries(SCALE_WORDS),
  ...Object.entries(ORDINAL_WORDS),
]);

// `^` and `**` are both accepted for squaring, matching the documented input
// formats (`4^2`, `4**2`). `=` is accepted so `4*4=16` still validates.
const MATH_ALLOWED = /^[0-9+\-*/().^= ]+$/;
const MAX_MATH_OPERANDS = 12;
const MAX_MATH_LENGTH = 64;

/** True when the message body contains at least one character. */
function hasMeaningfulBody(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Recursive-descent evaluator for `+ - * / ^ ( )` with no identifiers,
 * no property access, and no function calls — only ever built from a
 * character whitelist, so there is nothing to inject.
 */
function evaluateMathExpression(expression) {
  // `**` is normalized to `^` so a single token covers both spellings.
  const normalized = expression.replace(/\*\*/g, '^');
  const tokens = normalized.match(/\d+\.?\d*|[+\-*/^()]/g);
  if (!tokens || tokens.length === 0) return null;

  let position = 0;

  const peek = () => tokens[position];

  function parsePrimary() {
    const token = tokens[position];
    if (token === undefined) throw new Error('Unexpected end of expression');

    if (token === '(') {
      position += 1;
      const value = parseAdditive();
      if (tokens[position] !== ')') throw new Error('Unbalanced parentheses');
      position += 1;
      return value;
    }

    if (token === '-') {
      position += 1;
      return -parsePrimary();
    }

    if (token === '+') {
      position += 1;
      return parsePrimary();
    }

    if (/^\d/.test(token)) {
      position += 1;
      return Number(token);
    }

    throw new Error(`Unexpected token: ${token}`);
  }

  function parsePower() {
    let base = parsePrimary();
    while (peek() === '^') {
      position += 1;
      const exponent = parsePrimary();
      base = base ** exponent;
      if (!Number.isFinite(base)) throw new Error('Result is not finite');
    }
    return base;
  }

  function parseMultiplicative() {
    let value = parsePower();
    while (peek() === '*' || peek() === '/') {
      const operator = tokens[position];
      position += 1;
      const right = parsePower();
      if (operator === '/') {
        if (right === 0) throw new Error('Division by zero');
        value /= right;
      } else {
        value *= right;
      }
    }
    return value;
  }

  function parseAdditive() {
    let value = parseMultiplicative();
    while (peek() === '+' || peek() === '-') {
      const operator = tokens[position];
      position += 1;
      const right = parseMultiplicative();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  const result = parseAdditive();
  if (position !== tokens.length) throw new Error('Trailing tokens');
  return result;
}

/**
 * Parses a math expression into a positive integer, or null when the input
 * is not a usable math expression. Decimal results are rejected because the
 * count sequence is integral.
 */
export function parseMathExpression(value) {
  if (typeof value !== 'string') return null;

  const expression = value.replace(/\s+/g, '');
  if (expression.length === 0 || expression.length > MAX_MATH_LENGTH) return null;
  if (!MATH_ALLOWED.test(value)) return null;

  const parts = expression.split('=');
  if (parts.length > 2) return null;
  if (parts.some((part) => part.length === 0)) return null;

  const operandCount = (expression.match(/\d+\.?\d*/g) || []).length;
  if (operandCount === 0 || operandCount > MAX_MATH_OPERANDS) return null;

  // An expression with no operator at all is a plain number, not math.
  const hasOperator = /[+\-*/^=]/.test(expression);
  if (!hasOperator) return null;

  try {
    const left = evaluateMathExpression(parts[0]);
    if (!Number.isFinite(left)) return null;

    if (parts.length === 2) {
      const right = evaluateMathExpression(parts[1]);
      if (!Number.isFinite(right) || left !== right) return null;
    }

    if (!Number.isInteger(left) || left < 0) return null;
    return left;
  } catch {
    return null;
  }
}

/**
 * Parses standard English number words, including hyphenated compounds
 * ("twenty-four"), scale words ("one hundred"), and ordinals ("first").
 */
export function parseNumberWords(value) {
  if (typeof value !== 'string') return null;

  const normalized = value
    .toLowerCase()
    .replace(/[-\u2010-\u2015]/g, ' ')
    .replace(/[,\s]+/g, ' ')
    .trim();

  if (normalized.length === 0) return null;

  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length === 0 || tokens.length > 12) return null;

  let total = 0;
  let current = 0;
  let sawNumberWord = false;

  for (const token of tokens) {
    const small = SMALL_WORDS[token];
    if (small !== undefined) {
      current += small;
      sawNumberWord = true;
      continue;
    }

    const tens = TENS_WORDS[token];
    if (tens !== undefined) {
      current += tens;
      sawNumberWord = true;
      continue;
    }

    const ordinal = ORDINAL_WORDS[token];
    if (ordinal !== undefined) {
      current += ordinal;
      sawNumberWord = true;
      continue;
    }

    const scale = SCALE_WORDS[token];
    if (scale !== undefined) {
      sawNumberWord = true;
      if (scale === 100) {
        current = (current === 0 ? 1 : current) * 100;
      } else {
        total += (current === 0 ? 1 : current) * scale;
        current = 0;
      }
      continue;
    }

    // Any other word means this is prose, not a number.
    return null;
  }

  if (!sawNumberWord) return null;

  const result = total + current;
  if (!Number.isInteger(result) || result < 0) return null;
  return result;
}

/**
 * Best-effort parse of a single counting token.
 * Order: literal digits -> math expression -> number words.
 */
export function parseCountToken(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_MATH_LENGTH) return null;

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  return parseMathExpression(trimmed) ?? parseNumberWords(trimmed);
}

/**
 * Finds every distinct number (digits or number words) in free text.
 * Used only to detect the "multiple numbers" offence, so overlapping
 * matches like `16` and `six` inside one token are de-duplicated by value.
 */
export function findNumbersInText(value) {
  if (typeof value !== 'string' || value.length === 0) return [];

  const found = new Set();

  for (const match of value.matchAll(/\d+/g)) {
    found.add(Number(match[0]));
  }

  for (const match of value.toLowerCase().matchAll(/[a-z]+/g)) {
    const word = match[0];
    if (ALL_NUMBER_WORDS.has(word)) {
      // Only count standalone words, not fragments of longer words
      // ("someone" is not "one").
      const before = value[match.index - 1];
      const after = value[match.index + word.length];
      const isWordChar = (char) => char !== undefined && /[a-z0-9]/i.test(char);
      if (isWordChar(before) || isWordChar(after)) continue;
      found.add(ALL_NUMBER_WORDS.get(word));
    }
  }

  return [...found];
}

/**
 * Splits a raw message on the comment prefix.
 *
 * Returns `{ body, comment, isChatterOnly }`:
 *  - `body` is everything before the first comment prefix (trimmed).
 *  - `comment` is everything after it (trimmed), or '' when absent.
 *  - `isChatterOnly` is true when the body is empty, i.e. the message was
 *    pure chat such as `\ how is everyone today?`.
 */
export function splitComment(rawContent) {
  const raw = typeof rawContent === 'string' ? rawContent : '';
  const separatorIndex = raw.indexOf(COUNTING_COMMENT_PREFIX);

  if (separatorIndex === -1) {
    return { body: raw.trim(), comment: '', isChatterOnly: false };
  }

  const body = raw.slice(0, separatorIndex).trim();
  const comment = raw.slice(separatorIndex + COUNTING_COMMENT_PREFIX.length).trim();
  return { body, comment, isChatterOnly: !hasMeaningfulBody(body) };
}

export default {
  findNumbersInText,
  parseCountToken,
  parseMathExpression,
  parseNumberWords,
  splitComment,
};