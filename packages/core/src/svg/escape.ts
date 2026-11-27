/**
 * Escaping and number formatting. Ported from Pele, src/svg/builder.ts @ 3a2f075.
 */
import { AMP, DQUOTE, GT, LT } from '../parser-kit/char-codes.ts';

// Characters XML 1.0 does not allow (C0 controls except tab/LF/CR, DEL, lone surrogates,
// U+FFFE/U+FFFF), as the body of a character class. In `u` mode a surrogate range only
// matches unpaired halves.
const INVALID_XML = '\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f\\ud800-\\udfff\\ufffe\\uffff';

/** Characters that `esc()` drops. A validator must reject them, so what was checked is what is written. */
export const RE_INVALID_XML = new RegExp(`[${INVALID_XML}]`, 'u');
const RE_NEEDS_ESC = new RegExp(`[&<>"${INVALID_XML}]`, 'u');
const RE_ESC = new RegExp(`[&<>"]|[${INVALID_XML}]+`, 'gu');
const ESC: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

// The fast paths below pay off on short values, nearly every value a diagram writes (ids such
// as `e:A>B`, class lists, colours). On a longer value the regex engine's own scan beats a loop
// over the code units, and a pre-test that finds something costs more than it saves, so a value
// longer than this takes exactly the steps it took before.
const SHORT = 64;

// Every code unit `RE_INVALID_XML` could match, with paired surrogate halves too (no `u`
// flag). A text without any holds nothing `esc()` drops, so only `&<>"` change in it.
const RE_MAYBE_INVALID = new RegExp(`[${INVALID_XML}]`);

/**
 * `&<>"` as entities, for text holding no code unit `RE_MAYBE_INVALID` matches: there,
 * `RE_ESC` matches exactly these four characters, one at a time, so this is what the
 * `replace` would give, without a callback per character.
 */
function escapeMarkup(text: string): string {
  let out = '';
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    let e: string;
    if (c === AMP) e = '&amp;';
    else if (c === LT) e = '&lt;';
    else if (c === GT) e = '&gt;';
    else if (c === DQUOTE) e = '&quot;';
    else continue;
    out += text.slice(from, i) + e;
    from = i + 1;
  }
  return out + text.slice(from);
}

/** Escapes text for XML text and double-quoted attribute values, dropping invalid characters. */
export function esc(text: string): string {
  if (!RE_NEEDS_ESC.test(text)) return text;
  return text.length <= SHORT && !RE_MAYBE_INVALID.test(text)
    ? escapeMarkup(text)
    : text.replace(RE_ESC, (c) => ESC[c] ?? '');
}

const RE_ATTR_WS = /[\t\n\r]/;
const RE_ATTR_WS_G = /[\t\n\r]/g;
// What either `esc()` or the tab/LF/CR step would change: a value with none is written as it is.
const RE_NEEDS_ESC_ATTR = new RegExp(`[&<>"\\t\\n\\r${INVALID_XML}]`, 'u');
const ATTR_WS: Readonly<Record<string, string>> = { '\t': '&#9;', '\n': '&#10;', '\r': '&#13;' };

/**
 * `esc()` for a double-quoted attribute value. Tab, LF and CR are written as character
 * references too, since an XML reader turns them into spaces (attribute-value normalisation).
 */
export function escAttr(value: string): string {
  if (value.length <= SHORT && !RE_NEEDS_ESC_ATTR.test(value)) return value;
  const e = esc(value);
  return RE_ATTR_WS.test(e) ? e.replace(RE_ATTR_WS_G, (c) => ATTR_WS[c] as string) : e;
}

// The two decimals of a coordinate, by hundredths. Building the string from integers is
// much faster than converting a double.
const FRACTION: string[] = [];
for (let i = 0; i < 100; i++) {
  FRACTION.push(i === 0 ? '' : '.' + String(i).padStart(2, '0').replace(/0$/, ''));
}

/** Formats a finite number to at most two decimals, without trailing zeros. */
export function num(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError(`Cannot write the number ${value} into SVG`);
  const n = Math.round(value * 100);
  if (n === 0) return '0';
  if (n > 0) {
    if (n < 1e11) {
      const q = Math.floor(n / 100);
      return q + (FRACTION[n - q * 100] as string);
    }
  } else if (n > -1e11) {
    const m = -n;
    const q = Math.floor(m / 100);
    return '-' + q + (FRACTION[m - q * 100] as string);
  }
  return String(n / 100);
}
