/**
 * Text as v12 drew it. v12's lexer read every `#name;` / `#123;` code as a placeholder
 * (`ﬂ°name¶ß`, `ﬂ°°123¶ß`, `encodeEntities`), kept it in labels and ids, and turned it into
 * `&name;` / `&#123;` in the SVG markup, so the page showed the character. An `&` the author
 * wrote was escaped and shows as written. The parser keeps v12's text (ids are made from it,
 * conflicts compare it) and the model shows it with {@link shown}.
 */
import { entityAt } from '@mermaid-js/core/text';
import { idEscaper } from '@mermaid-js/core/parser-kit/support';

const OPEN = 'ﬂ°';
/** `°`: a second one marks a numeric code (`ﬂ°°123¶ß`). */
const DEGREE = 0xb0;
const CLOSE = '¶ß';

/**
 * The character the code `name` stands for. A code core cannot decode is as the author wrote it:
 * `#name;` for a name (D559; v12 drew `&name;`), and v12's `&#…;` for a number.
 */
function decoded(name: string, numeric: boolean): string {
  const ref = `${numeric ? '&#' : '&'}${name};`;
  const hit = entityAt(ref, 0);
  if (hit && hit[1] === ref.length) return hit[0];
  return numeric ? ref : `#${name};`;
}

/**
 * `raw` with each placeholder as the character its code stands for ({@link decoded}). One scan
 * (R-PARSE-7).
 */
export function shown(raw: string): string {
  let i = raw.indexOf(OPEN);
  if (i < 0) return raw;
  let out = '';
  let from = 0;
  for (; i >= 0; i = raw.indexOf(OPEN, i + 1)) {
    const numeric = raw.charCodeAt(i + OPEN.length) === DEGREE;
    const nameAt = i + OPEN.length + (numeric ? 1 : 0);
    let close = nameAt;
    while (close < raw.length && /\w/.test(raw.charAt(close))) close++;
    if (close === nameAt || !raw.startsWith(CLOSE, close)) continue;
    out += raw.slice(from, i) + decoded(raw.slice(nameAt, close), numeric);
    from = close + CLOSE.length;
    i = from - 1;
  }
  return out + raw.slice(from);
}

/** v12's `generateId`: a quoted name's id is its label with every non-word character as `_`. */
export function generatedId(label: string): string {
  return label.replace(/\W/g, '_');
}

/** `%`, `>`, `@` and `#` in a name, percent-encoded (core's AST id rule). */
export const esc = /* @__PURE__ */ idEscaper();
