/**
 * Value conversion as v12 ran it (parser-method §3): treemap's `valueConverter.ts` for names,
 * values and `classDef`, `common/valueConverter.ts` for `title`, `accTitle` and `accDescr`, then
 * the DB's setters (`db.ts` `addClass`, commonDb). Every input is a token's text as v12's lexer
 * read it (`cook()`ed).
 *
 * The scans are linear (R-PARSE-7, pitfall 5): v12's `/\s+$/gm` backtracks over a long blank
 * run inside a line, so it is written out by hand here, as are the `classDef` and number checks.
 */
export { accDescrValue, accTitleValue, titleValue } from '@mermaid-js/shared/parser/rule';
import {
  BACKSLASH,
  COMMA,
  CR,
  DOT,
  HASH,
  isDigit,
  isSpace,
  isWord,
  LF,
  SEMI,
} from '@mermaid-js/core/parser-kit';

/** A name: the `"…"` or `'…'` string without its first and last character (no escapes). */
export function nameValue(image: string): string {
  return image.slice(1, -1);
}

/** A value: `parseFloat` with every comma removed (`1,234` is 1234, `.` is `NaN`). */
export function numberValue(image: string): number {
  return parseFloat(image.replaceAll(',', ''));
}

/**
 * Whether v12's conversion reads `image` (a value token, `[0-9_.,]+`) as written: digits, with
 * `,` only between groups of three (`1,000`) or at the end (`1,`), and at most one `.` (`1.5`,
 * `1.`, `.5`). Else the
 * value is `NaN` or `parseFloat` cut it short or the commas joined digits (`1_000` is 1, `1.2.3`
 * is 1.2, `1,2,3` is 123): D402's `TREEMAP_INVALID_VALUE`.
 */
export function isPlainNumber(image: string): boolean {
  const n = image.length;
  let i = 0;
  let digits = 0;
  let group = -1;
  for (; i < n; i++) {
    const c = image.charCodeAt(i);
    if (isDigit(c)) {
      digits++;
      if (group >= 0) group++;
      continue;
    }
    if (c !== COMMA) break;
    // The first group has 1 to 3 digits, each later one exactly 3.
    if (digits === 0 || (group < 0 ? digits > 3 : group !== 3)) return false;
    group = 0;
  }
  // A comma at the end (`1,`, as in `"a": 1, "b": 2`) changes nothing.
  if (group === 0 && i === n) return digits > 0;
  if (group >= 0 && group !== 3) return false;
  if (i < n && image.charCodeAt(i) === DOT) {
    i++;
    let decimals = 0;
    while (i < n && isDigit(image.charCodeAt(i))) {
      i++;
      decimals++;
    }
    if (digits + decimals === 0) return false;
  } else if (digits === 0) return false;
  return i === n;
}

/** v12's `classDef` parts: `/classDef\s+([A-Z_a-z]\w+)(?:\s+([^\n\r;]*))?;?/` on the token. */
export interface ClassDefParts {
  name: string;
  /** Offset of the name in the token text. */
  nameAt: number;
  /** `match[2] || undefined`: the styles, absent when empty. */
  styleText?: string;
  /** Offset of the styles in the token text, when there are any. */
  stylesAt?: number;
}

/** Read a `classDef` token's text (which the lexer matched with the same expression). */
export function classDefParts(image: string): ClassDefParts {
  const n = image.length;
  let i = 'classDef'.length;
  while (i < n && isSpace(image.charCodeAt(i))) i++;
  const nameAt = i;
  while (i < n && isWord(image.charCodeAt(i))) i++;
  const name = image.slice(nameAt, i);
  const gap = i;
  while (i < n && isSpace(image.charCodeAt(i))) i++;
  if (i === gap) return { name, nameAt };
  const from = i;
  while (i < n) {
    const c = image.charCodeAt(i);
    if (c === SEMI || c === LF || c === CR) break;
    i++;
  }
  const styleText = image.slice(from, i);
  return styleText === '' ? { name, nameAt } : { name, nameAt, styleText, stylesAt: from };
}

/**
 * The style properties v12's `isLabelStyle` names. v12 passes it the whole style (`color:red`),
 * so only a style that is just one of these names counts as a text style.
 */
const LABEL_STYLES = new Set([
  'color',
  'font-size',
  'font-family',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-align',
  'text-transform',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-shadow',
  'text-overflow',
  'white-space',
  'word-wrap',
  'word-break',
  'overflow-wrap',
  'hyphens',
]);

/**
 * v12 `db.ts` `addClass` on a `classDef`'s styles: `\,` is a comma, `,` and `;` separate
 * styles; nothing is trimmed. `styleText` is the text v12's lexer read, before its entity
 * placeholders were decoded: the `;` of a `#name;` entity was a placeholder there and separated
 * nothing, so the entity is read whole (and decoded to `&name;`, as everywhere).
 */
export function splitStyles(styleText: string): { styles: string[]; textStyles: string[] } {
  const styles: string[] = [];
  let current = '';
  const n = styleText.length;
  for (let i = 0; i < n; i++) {
    const c = styleText.charCodeAt(i);
    if (c === HASH) {
      let j = i + 1;
      while (j < n && isWord(styleText.charCodeAt(j))) j++;
      if (j > i + 1 && styleText.charCodeAt(j) === SEMI) {
        const name = styleText.slice(i + 1, j);
        current += /^\d+$/.test(name) ? `&#${name};` : `&${name};`;
        i = j;
        continue;
      }
    }
    if (c === BACKSLASH && styleText.charCodeAt(i + 1) === COMMA) {
      current += ',';
      i++;
    } else if (c === COMMA || c === SEMI) {
      styles.push(current);
      current = '';
    } else current += styleText[i];
  }
  styles.push(current);
  return { styles, textStyles: styles.filter((s) => LABEL_STYLES.has(s)) };
}

/** `#name;` and `#123;` as v12's renderer read its placeholders: `&name;` and `&#123;`. */
export function decodeEntities(text: string): string {
  return text.replace(/#(\w+);/g, (_, name: string) =>
    /^\d+$/.test(name) ? `&#${name};` : `&${name};`
  );
}
