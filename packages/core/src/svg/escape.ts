/**
 * Escaping and number formatting. Ported from Pele (https://github.com/obsidianmd/pele,
 * MIT, (c) 2026 kepano), src/svg/builder.ts @ 3a2f075.
 */

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

/** Escapes text for XML text and double-quoted attribute values, dropping invalid characters. */
export function esc(text: string): string {
  return RE_NEEDS_ESC.test(text) ? text.replace(RE_ESC, (c) => ESC[c] ?? '') : text;
}

// The two decimals of a coordinate, by hundredths. Building the string from integers is
// much faster than converting a double.
const FRACTION: string[] = [];
for (let i = 0; i < 100; i++) {
  FRACTION.push(i === 0 ? '' : i % 10 === 0 ? '.' + i / 10 : '.' + (i < 10 ? '0' + i : i));
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
