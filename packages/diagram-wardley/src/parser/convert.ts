/**
 * Value conversion as v12 ran it (parser-method §3): Langium's default string converter for
 * quoted names, notes and annotations, wardley's own converter for a link's `; label`, and
 * `common/valueConverter.ts` for `title`, `accTitle` and `accDescr`, then commonDb's setters.
 * Every input is a token's text as v12's lexer read it (`cook()`ed).
 *
 * The scans are linear (R-PARSE-7, pitfall 5): v12's `/\s+$/gm` backtracks over a long blank
 * run inside a line, so it is written out by hand here.
 */
export {
  accDescrValue,
  accTitleValue,
  stringValue,
  titleValue,
} from '@mermaid-js/core/parser-kit';
import { AMP, cook, HASH } from '@mermaid-js/core/parser-kit';
import type { SourceView } from '@mermaid-js/core/parser-kit';
import { entityAt } from '@mermaid-js/core/text';

/**
 * The text of the source range `[start, end)` as v12 drew it: v12's lexer's text (`cook()`),
 * with each `#name;` / `#123;` code written as its character (GAPS #493). v12 turned a code
 * into a placeholder, wrote the text with `.text()` and turned the placeholders into `&name;`
 * in the SVG markup, so the page showed the character; an `&name;` the author wrote was escaped
 * by `.text()` and shows as written. `cook()` gives both as `&name;`, so the range is cooked in
 * pieces between the author's `&`s, and only the references inside a piece (`cook()`'s) are
 * decoded. A name core does not know (`#y;`) stays `&y;`, as a browser shows it.
 */
export function displayText(src: string, start: number, end: number, view: SourceView): string {
  if (!has(src, start, end, HASH)) return cook(src, start, end, view);
  let out = '';
  let from = start;
  for (let p = start; p < end; p++) {
    if (src.charCodeAt(p) !== AMP) continue;
    // The `&` itself through cook(), which drops it inside a removed span.
    out += decodeReferences(cook(src, from, p, view)) + cook(src, p, p + 1, view);
    from = p + 1;
  }
  return out + decodeReferences(cook(src, from, end, view));
}

/** Whether `src[start…end)` holds the character `c` (a scan of the range only, R-PARSE-7). */
function has(src: string, start: number, end: number, c: number): boolean {
  for (let i = start; i < end; i++) if (src.charCodeAt(i) === c) return true;
  return false;
}

/** Every character reference core knows in `text`, as its character. */
function decodeReferences(text: string): string {
  let i = text.indexOf('&');
  if (i < 0) return text;
  let out = '';
  let from = 0;
  for (; i >= 0; i = text.indexOf('&', i + 1)) {
    const ref = entityAt(text, i);
    if (ref === undefined) continue;
    out += text.slice(from, i) + ref[0];
    from = i + ref[1];
    i = from - 1;
  }
  return out + text.slice(from);
}

/** `;` and the rest of the line: v12's wardley value converter, `substring(1).trim()`. */
export function linkLabelValue(image: string): string {
  return image.slice(1).trim();
}

/** A coordinate as the model holds it ({@link toPercent}). */
export interface Percent {
  /** 0–100; 100 when out of range. */
  readonly percent: number;
  /** Written as a fraction of the axis (at most 1), not as a percentage. */
  readonly fraction: boolean;
  /** Inside 0–100 % (else `WARDLEY_OUT_OF_RANGE`, kept as 100). */
  readonly inRange: boolean;
}

/**
 * A coordinate as the model holds it (v12 `toPercent`, D428): up to 1 a fraction of the axis,
 * above it a percentage; outside 0–100 out of range (`WARDLEY_OUT_OF_RANGE`) and kept as 100.
 */
export function toPercent(value: number): Percent {
  const fraction = value <= 1;
  const percent = fraction ? value * 100 : value;
  return percent < 0 || percent > 100
    ? { percent: 100, fraction, inRange: false }
    : { percent, fraction, inRange: true };
}
