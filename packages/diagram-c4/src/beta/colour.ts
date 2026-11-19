/**
 * The colour check of a c4-beta `style` value (D635): a word must be a CSS colour name core's
 * `parseColor` knows, or `currentColor`; then every value goes through core's `checkColor`. The
 * renderer and the legend share it, so a swatch shows what its items are drawn with.
 */
import { checkColor, type Paint } from '@mermaid-js/core/svg';
import { parseColor } from '@mermaid-js/core/theme';

/** A word: what the lexer reads as an id, not a hex colour or a colour function. */
const RE_WORD = /^[\w-]+$/;
/** `currentColor`, in any case, as CSS reads it. */
const RE_CURRENT = /^currentColor$/i;

/** `value` as paint, or undefined when it is not a colour a style may give. */
export function styleColour(value: string): Paint | undefined {
  const named = !RE_WORD.test(value) || RE_CURRENT.test(value);
  return named || parseColor(value) ? checkColor(value) : undefined;
}
