/**
 * Sankey values as v12 read them: `parseFloat` of the trimmed value field (`sankey.jison`'s
 * record action), and what D394 does with them.
 */
import { DASH, DOT, isDigit, LOWER_E } from '@mermaid-js/core/parser-kit';

const PLUS = 0x2b;
const UPPER_E = 0x45;

const isSign = (c: number) => c === PLUS || c === DASH;

/** The end of the run of digits from `i`. */
function digitsEnd(s: string, i: number): number {
  let j = i;
  while (isDigit(s.charCodeAt(j))) j++;
  return j;
}

/**
 * The length of the prefix of `s` that `parseFloat` reads (its `StrDecimalLiteral`): an
 * optional sign, then `Infinity` or digits with an optional fraction and exponent. 0 when it
 * reads none (the value is NaN). `s` is trimmed, so there are no blanks before the number.
 */
export function numberEnd(s: string): number {
  const from = isSign(s.charCodeAt(0)) ? 1 : 0;
  if (s.startsWith('Infinity', from)) return from + 8;
  let i = digitsEnd(s, from);
  let digits = i - from;
  if (s.charCodeAt(i) === DOT) {
    const j = digitsEnd(s, i + 1);
    digits += j - i - 1;
    if (digits > 0) i = j;
  }
  if (digits === 0) return 0;
  const e = s.charCodeAt(i);
  if (e !== LOWER_E && e !== UPPER_E) return i;
  const at = isSign(s.charCodeAt(i + 1)) ? i + 2 : i + 1;
  const end = digitsEnd(s, at);
  return end > at ? end : i;
}

/**
 * Whether the layout draws `value` as it is (D394): a finite number of 0 or more. NaN and
 * negative values count as 0; so does an infinite one, with which d3-sankey would draw that
 * node and its links with NaN.
 */
export const drawable = (value: number): boolean => value >= 0 && value !== Infinity;

/** Why the layout does not draw `value` as it is, for messages; undefined when it does. */
export function invalidity(value: number): string | undefined {
  if (Number.isNaN(value)) return 'is not a number';
  if (value === Infinity) return 'is not a finite number';
  if (value < 0) return 'is negative';
  return undefined;
}
