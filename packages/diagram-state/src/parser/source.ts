/**
 * What v12 did to state text before its lexer saw it, reproduced without rewriting the source
 * (DESIGN §4.1). v12 ran, in order:
 *
 * 1. `cleanupText`: `\r\n?` → `\n`, and `="x"` → `='x'` inside every `<tag …>`;
 * 2. front matter and directives removed, then every line comment (`^\s*%%(?!{)[^\n]+\n?`,
 *    multiline) removed, then `trimStart`;
 * 3. `encodeEntities`: on a line holding `style…:…#…;` (then `classDef…`), the last `;` is
 *    dropped; then every `#name;` / `#123;` became an entity placeholder;
 * 4. a `\n` appended.
 *
 * {@link sourceView} builds that text (steps 1–2, the dropped `;` and the appended `\n`) with
 * the source offset of every character, so the lexer reads what v12's lexer read and each
 * token maps back to a source range. Entities stay as `#name;`: the lexer treats one as an
 * opaque unit, as v12 lexed its placeholder. Every scan is linear (R-PARSE-7).
 */
import {
  COLON,
  CR,
  DQUOTE,
  EQUALS,
  GT,
  HASH,
  isLineEnd,
  isSpace,
  isWord,
  LBRACE,
  LF,
  LT,
  PERCENT,
  SEMI,
} from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';

const APOSTROPHE = 39;

export interface SourceView {
  /** The text v12's lexer saw, entities still as `#name;`, plus the appended `\n`. */
  text: string;
  /** `at[i]`: the source offset of `text[i]`; `at[text.length]` is the source length. */
  at: Uint32Array;
  /** Spans v12 removed that the lexer reports as trivia: directives and comment lines. */
  removed: Removed[];
}

export interface Removed extends Range {
  kind: 'comment' | 'directive';
}

/** A text being built: character codes and the source offset of each. */
interface Chars {
  codes: number[];
  at: number[];
}

/**
 * The v12 text of the state body `src[from…]`; `directives` are the `%%{…}%%` ranges from
 * core's preprocess.
 */
export function sourceView(src: string, from: number, directives: readonly Range[]): SourceView {
  const removed: Removed[] = [];
  // Step 1, and directives cut.
  const raw: Chars = { codes: [], at: [] };
  let d = 0;
  for (let i = from; i < src.length; i++) {
    while (d < directives.length && (directives[d]?.end ?? 0) <= i) d++;
    const r = directives[d];
    if (r && r.start <= i) {
      removed.push({ start: i, end: r.end, kind: 'directive' });
      i = r.end - 1;
      continue;
    }
    const c = src.charCodeAt(i);
    raw.codes.push(c === CR ? LF : c);
    raw.at.push(i);
    if (c === CR && src.charCodeAt(i + 1) === LF) i++;
  }
  tagQuotes(raw.codes);
  // Step 2.
  const text = comments(raw, removed);
  // Step 3 (the semicolons) and step 4.
  const keep = droppedSemicolons(text.codes);
  const codes: number[] = [];
  const at: number[] = [];
  for (let i = 0; i < text.codes.length; i++) {
    if (keep?.[i] === 0) continue;
    codes.push(text.codes[i] ?? 0);
    at.push(text.at[i] ?? 0);
  }
  codes.push(LF);
  at.push(src.length, src.length);
  let out = '';
  for (let i = 0; i < codes.length; i += 4096) {
    out += String.fromCharCode(...codes.slice(i, i + 4096));
  }
  removed.sort((x, y) => x.start - y.start);
  return { text: out, at: Uint32Array.from(at), removed };
}

/** `<(\w+)([^>]*)>` then `="([^"]*)"` inside the attributes: both quotes become `'`. */
function tagQuotes(c: number[]): void {
  let gt = -1;
  for (let i = 0; i + 1 < c.length; i++) {
    if (c[i] !== LT || !isWord(c[i + 1] ?? NaN)) continue;
    if (gt < i) gt = c.indexOf(GT, i);
    if (gt === -1) return;
    let j = i + 1;
    while (j < gt) {
      if (c[j] === EQUALS && c[j + 1] === DQUOTE) {
        let close = j + 2;
        while (close < gt && c[close] !== DQUOTE) close++;
        if (close >= gt) break;
        c[j + 1] = APOSTROPHE;
        c[close] = APOSTROPHE;
        j = close + 1;
      } else j++;
    }
    i = gt;
  }
}

/** `cleanupComments`: comment lines cut (recorded in `removed`), then `trimStart`. */
function comments(text: Chars, removed: Removed[]): Chars {
  const c = text.codes;
  const n = c.length;
  const out: Chars = { codes: [], at: [] };
  const copy = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      out.codes.push(c[i] ?? 0);
      out.at.push(text.at[i] ?? 0);
    }
  };
  let ls = 0;
  let kept = 0;
  while (ls < n) {
    let q = ls;
    while (q < n && isSpace(c[q] ?? NaN)) q++;
    const isComment =
      c[q] === PERCENT &&
      c[q + 1] === PERCENT &&
      q + 2 < n &&
      c[q + 2] !== LBRACE &&
      c[q + 2] !== LF;
    if (isComment) {
      let e = q + 2;
      while (e < n && c[e] !== LF) e++;
      removed.push({ start: text.at[q] ?? 0, end: (text.at[e - 1] ?? 0) + 1, kind: 'comment' });
      copy(kept, ls);
      kept = ls = e < n ? e + 1 : e;
      continue;
    }
    // No comment from any line start up to q; go on at the first line start after q.
    let e = q;
    while (e < n && !isLineEnd(c[e] ?? NaN)) e++;
    ls = e + 1;
  }
  copy(kept, n);
  let lead = 0;
  while (lead < out.codes.length && isSpace(out.codes[lead] ?? NaN)) lead++;
  out.codes.splice(0, lead);
  out.at.splice(0, lead);
  return out;
}

const STYLE = 'style';
const CLASSDEF = 'classDef';

/**
 * `style.*:\S*#.*;` then `classDef.*:\S*#.*;` (each global, `.` stops at line ends): the match
 * ends at the line's last `;`, which `encodeEntities` cut off. Returns a keep mask (0 = cut),
 * or undefined when nothing is cut.
 */
function droppedSemicolons(c: number[]): Uint8Array | undefined {
  let keep: Uint8Array | undefined;
  const n = c.length;
  const gone = (i: number) => keep?.[i] === 0;
  let ls = 0;
  while (ls < n) {
    let le = ls;
    while (le < n && !isLineEnd(c[le] ?? NaN)) le++;
    for (const word of [STYLE, CLASSDEF]) {
      const k = find(c, word, ls, le);
      if (k < 0) continue;
      let colon = false;
      let hash = -1;
      for (let j = k + word.length; j < le; j++) {
        if (gone(j)) continue;
        const x = c[j] ?? NaN;
        if (x === COLON) colon = true;
        else if (x === HASH && colon) {
          hash = j;
          break;
        } else if (isSpace(x)) colon = false;
      }
      for (let j = le - 1; hash >= 0 && j > hash; j--) {
        if (c[j] === SEMI && !gone(j)) {
          keep ??= new Uint8Array(n).fill(1);
          keep[j] = 0;
          break;
        }
      }
    }
    ls = le + 1;
  }
  return keep;
}

/** First offset in `[from, to)` where `word` starts, or -1. */
function find(c: number[], word: string, from: number, to: number): number {
  for (let i = from; i + word.length <= to; i++) {
    let j = 0;
    while (j < word.length && c[i + j] === word.charCodeAt(j)) j++;
    if (j === word.length) return i;
  }
  return -1;
}
