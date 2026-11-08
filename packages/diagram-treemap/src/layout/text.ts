/**
 * Treemap text (D405): plain text, measured by the injected measurer in the font it is drawn
 * in (pitfall 16), with v12's fitting rules (`renderer.ts:240-292`, `:381-523`) in place of
 * `getComputedTextLength()`.
 */
import { entityAt, fontSizePx, Style, type FontKey, type Measurer } from '@mermaid-js/core/text';
import { BOLD_WEIGHT, MAX_WEIGHT, NORMAL_WEIGHT } from './metrics.ts';

/** A name as drawn: character references decoded, tags left as text (D405). */
export function plainText(text: string): string {
  if (!text.includes('&')) return text;
  let out = '';
  for (let i = 0; i < text.length; ) {
    const entity = text[i] === '&' ? entityAt(text, i) : undefined;
    if (entity) {
      out += entity[0];
      i += entity[1];
    } else out += text[i++];
  }
  return out;
}

/** CSS weights for a `font-weight` value; undefined for what is not one. */
function weightOf(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const v = value.toLowerCase();
  if (v === 'bold' || v === 'bolder') return BOLD_WEIGHT;
  if (v === 'normal' || v === 'lighter') return NORMAL_WEIGHT;
  const n = /^\d+$/.test(v) ? Number(v) : Number.NaN;
  return n >= 1 && n <= MAX_WEIGHT ? n : undefined;
}

/**
 * The font a class's styles draw text in, from `base`: v12 wrote a class's text properties
 * after its own `font-size` (`styles2String`'s label styles), so a class `font-size`,
 * `font-weight` or `font-family` wins. Each style is `key: value`, the last of a key counts.
 */
export function classFont(styles: readonly string[], base: FontKey): FontKey {
  const map = new Map<string, string | undefined>();
  for (const style of styles) {
    const [key, value] = style.split(':');
    map.set(key!.trim(), value?.trim());
  }
  const size = fontSizePx(map.get('font-size'), base.size);
  const family = map.get('font-family');
  return {
    family: family ? family : base.family,
    size: size !== undefined && size > 0 ? size : base.size,
    weight: weightOf(map.get('font-weight')) ?? base.weight,
  };
}

/** Width of `text` in `font` through the measurer. */
export function textWidth(measurer: Measurer, text: string, font: FontKey): number {
  return text === '' ? 0 : measurer.width(text, font, font.weight >= BOLD_WEIGHT ? Style.Bold : 0);
}

const ELLIPSIS = '...';

/**
 * v12's header truncation (`:262-292`): the whole text if it fits `space`; else the longest
 * start of it that fits with `...` after it; else `...` alone; else nothing. v12 dropped one
 * character at a time; a start's width grows with its length, so a binary search finds the same
 * cut in O(n log n) (pitfall 19). Characters are code points (v12 cut UTF-16 units, which
 * could split an emoji).
 */
export function truncate(measurer: Measurer, text: string, font: FontKey, space: number): string {
  if (textWidth(measurer, text, font) <= space) return text;
  const chars = [...text];
  const cut = (n: number): string => chars.slice(0, n).join('') + ELLIPSIS;
  // The longest n in [1, length) whose cut fits, or 0.
  let lo = 0;
  let hi = chars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textWidth(measurer, cut(mid), font) <= space) lo = mid;
    else hi = mid - 1;
  }
  if (lo > 0) return cut(lo);
  return textWidth(measurer, ELLIPSIS, font) <= space ? ELLIPSIS : '';
}
