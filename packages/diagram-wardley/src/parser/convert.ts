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
} from '@mermaid-js/shared/parser/rule';
export { displayText } from '@mermaid-js/shared/parser/display-text';

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
