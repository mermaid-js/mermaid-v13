/**
 * What v12 did to ER text before its lexer saw it, reproduced without rewriting the source
 * (DESIGN §4.1). v12 ran these rewrites, in order:
 *
 * 1. `cleanupText`: CRLF and CR → LF, and `="x"` → `='x'` inside every `<tag …>`; front matter
 *    and directives removed;
 * 2. `cleanupComments`: every line comment (`^\s*%%(?!{)[^\n]+\n?`, multiline) removed, then
 *    `trimStart()`;
 * 3. `encodeEntities`: on a line holding `style…:…#…;` (then `classDef…`) the last `;` is
 *    dropped; then every `#name;` / `#123;` becomes an entity placeholder (`ﬂ°name¶ß`,
 *    `ﬂ°°123¶ß`);
 * 4. a `\n` is appended.
 *
 * v13 keeps the source as written. {@link sourceView} builds the text v12's lexer saw, as
 * layers of edits, each found with a linear scan (no regex runs on user input), and keeps the
 * map from every offset of that text back to the source. The lexer reads the text; every token
 * range it reports is a source range. A token that runs over a removed span covers it.
 */
import {
  COLON,
  DQUOTE,
  EQUALS,
  HASH,
  isDigit,
  isLineEnd,
  isSpace,
  isWord,
  LBRACE,
  LF,
  PERCENT,
  SEMI,
} from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';

/** One rewrite: `[start, end)` of a layer's base text replaced by `text` (`''` removes it). */
interface Edit {
  start: number;
  end: number;
  text: string;
}

/**
 * A text made from a base text by sorted, non-overlapping edits, and the map back. Its
 * segments are runs of base text kept as is, or the (non-empty) replacement of one edit.
 */
class Layer {
  readonly text: string;
  /** Per segment, in order: start in `text`, start and end in the base, 1 if kept as is. */
  private readonly seg: Int32Array | undefined;
  private readonly count: number;

  constructor(
    base: string,
    edits: readonly Edit[],
    private readonly baseLength = base.length
  ) {
    if (edits.length === 0) {
      this.text = base;
      this.seg = undefined;
      this.count = 0;
      return;
    }
    const parts: string[] = [];
    const seg = new Int32Array(4 * (2 * edits.length + 1));
    let n = 0;
    let length = 0;
    let at = 0;
    const push = (text: string, start: number, end: number, kept: number) => {
      if (text.length === 0) return;
      parts.push(text);
      seg[4 * n] = length;
      seg[4 * n + 1] = start;
      seg[4 * n + 2] = end;
      seg[4 * n + 3] = kept;
      n++;
      length += text.length;
    };
    for (const e of edits) {
      push(base.slice(at, e.start), at, e.start, 1);
      push(e.text, e.start, e.end, 0);
      at = e.end;
    }
    push(base.slice(at), at, base.length, 1);
    this.text = parts.join('');
    this.seg = seg;
    this.count = n;
  }

  /** The segment holding `text[i]` (`0 <= i < text.length`). */
  private find(i: number): number {
    const s = this.seg as Int32Array;
    let lo = 0;
    let hi = this.count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((s[4 * mid] ?? 0) <= i) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Base offset where `text[i]` starts: past any removed span before it. */
  start(i: number): number {
    const s = this.seg;
    if (!s) return i;
    if (i >= this.text.length) return this.baseLength;
    const k = 4 * this.find(i);
    return s[k + 3] ? (s[k + 1] ?? 0) + i - (s[k] ?? 0) : (s[k + 1] ?? 0);
  }

  /** Base offset where `text[i - 1]` ends: before any removed span after it. */
  end(i: number): number {
    const s = this.seg;
    if (!s || i <= 0) return i;
    const k = 4 * this.find(i - 1);
    return s[k + 3] ? (s[k + 1] ?? 0) + i - (s[k] ?? 0) : (s[k + 2] ?? 0);
  }
}

export interface Trivia extends Range {
  kind: 'comment' | 'directive';
}

export interface SourceView {
  /** The text v12's lexer saw, appended `\n` included. */
  readonly text: string;
  /** Comments and directives v12 removed, as source ranges in source order. */
  readonly trivia: readonly Trivia[];
  /** The source offset where `text[i]` starts (`src.length` for `i = text.length`). */
  start(i: number): number;
  /** The source offset where `text[i - 1]` ends. */
  end(i: number): number;
}

/** Placeholders of v12's `encodeEntities`. */
const ENTITY_OPEN = '\uFB02\u00B0';
const ENTITY_OPEN_NUM = '\uFB02\u00B0\u00B0';
const ENTITY_CLOSE = '\u00B6\u00DF';

export function sourceView(src: string, from: number, directives: readonly Range[]): SourceView {
  const l1 = new Layer(src, cleanup(src, from, directives));
  const comments = commentLines(l1.text);
  const l2 = new Layer(l1.text, comments);
  const l3 = new Layer(l2.text, [...trimStart(l2.text), ...droppedSemicolons(l2.text)]);
  const l4 = new Layer(l3.text, [
    ...entities(l3.text),
    { start: l3.text.length, end: l3.text.length, text: '\n' },
  ]);
  const trivia: Trivia[] = [];
  let d = 0;
  for (const c of comments) {
    const range = { start: l1.start(c.start), end: l1.end(c.end) };
    for (; d < directives.length && (directives[d]?.start ?? 0) < range.start; d++) {
      trivia.push({ ...(directives[d] as Range), kind: 'directive' });
    }
    // A directive inside a comment line went with it.
    while (d < directives.length && (directives[d]?.end ?? 0) <= range.end) d++;
    trivia.push({ ...range, kind: 'comment' });
  }
  for (; d < directives.length; d++)
    trivia.push({ ...(directives[d] as Range), kind: 'directive' });
  return {
    text: l4.text,
    trivia,
    start: (i) => l1.start(l2.start(l3.start(l4.start(i)))),
    end: (i) => l1.end(l2.end(l3.end(l4.end(i)))),
  };
}

/** Front matter, directives, CR line breaks and HTML attribute quotes (`cleanupText`). */
function cleanup(src: string, from: number, directives: readonly Range[]): Edit[] {
  const edits: Edit[] = [];
  if (from > 0) edits.push({ start: 0, end: from, text: '' });
  for (const r of directives) edits.push({ start: r.start, end: r.end, text: '' });
  const inCR = outside(directives);
  for (let i = src.indexOf('\r', from); i !== -1; i = src.indexOf('\r', i + 1)) {
    if (!inCR(i)) continue;
    const crlf = src.charCodeAt(i + 1) === LF;
    edits.push({ start: i, end: crlf ? i + 2 : i + 1, text: '\n' });
    if (crlf) i++;
  }
  const inQuote = outside(directives);
  for (const at of tagQuotes(src, from)) {
    if (inQuote(at)) edits.push({ start: at, end: at + 1, text: "'" });
  }
  return edits.sort((a, b) => a.start - b.start);
}

/** For ascending offsets: whether each is outside every one of the sorted `ranges`. */
function outside(ranges: readonly Range[]): (at: number) => boolean {
  let k = 0;
  return (at) => {
    while (k < ranges.length && (ranges[k]?.end ?? 0) <= at) k++;
    const r = ranges[k];
    return r === undefined || r.start > at;
  };
}

/**
 * Offsets of the quotes `<(\w+)([^>]*)>` then `="([^"]*)"` inside the attributes match: v12
 * turned each into `'`. Ascending.
 */
function tagQuotes(src: string, from: number): number[] {
  const out: number[] = [];
  let gt = -1;
  let i = src.indexOf('<', from);
  while (i !== -1 && i + 1 < src.length) {
    if (!isWord(src.charCodeAt(i + 1))) {
      i = src.indexOf('<', i + 1);
      continue;
    }
    if (gt < i) gt = src.indexOf('>', i);
    if (gt === -1) break;
    let j = i + 1;
    while (j < gt) {
      if (src.charCodeAt(j) === EQUALS && src.charCodeAt(j + 1) === DQUOTE) {
        const close = src.indexOf('"', j + 2);
        if (close === -1 || close >= gt) break;
        out.push(j + 1, close);
        j = close + 1;
      } else j++;
    }
    i = src.indexOf('<', gt + 1);
  }
  return out;
}

/** The end of the line (`.` stops there) holding `i`, or `text.length`. */
function lineEndAt(text: string, i: number): number {
  let e = i;
  while (e < text.length && !isLineEnd(text.charCodeAt(e))) e++;
  return e;
}

/**
 * `^\s*%%(?!{)[^\n]+\n?`, multiline and global, on text without CR. A match starts at a line
 * start; its `\s*` may run over blank lines.
 */
function commentLines(text: string): Edit[] {
  const out: Edit[] = [];
  if (!text.includes('%%')) return out;
  const n = text.length;
  let ls = 0;
  while (ls < n) {
    let q = ls;
    while (q < n && isSpace(text.charCodeAt(q))) q++;
    if (
      text.charCodeAt(q) === PERCENT &&
      text.charCodeAt(q + 1) === PERCENT &&
      q + 2 < n &&
      text.charCodeAt(q + 2) !== LBRACE &&
      text.charCodeAt(q + 2) !== LF
    ) {
      const lf = text.indexOf('\n', q + 2);
      const e = lf === -1 ? n : lf + 1;
      out.push({ start: ls, end: e, text: '' });
      ls = e;
      continue;
    }
    // Every line start up to q leads to the same q: go on at the first one after it.
    const e = lineEndAt(text, q);
    if (e >= n) break;
    ls = e + 1;
  }
  return out;
}

function trimStart(text: string): Edit[] {
  let k = 0;
  while (k < text.length && isSpace(text.charCodeAt(k))) k++;
  return k > 0 ? [{ start: 0, end: k, text: '' }] : [];
}

/**
 * `style.*:\S*#.*;` then `classDef.*:\S*#.*;` (each global; `.` stops at line ends): the match
 * ends at the line's last `;`, which `encodeEntities` cut off.
 */
function droppedSemicolons(text: string): Edit[] {
  const out: Edit[] = [];
  if (!text.includes(';') || (!text.includes('style') && !text.includes('classDef'))) return out;
  const words = ['style', 'classDef'];
  const next = [-2, -2];
  let ls = 0;
  while (ls <= text.length) {
    const le = lineEndAt(text, ls);
    // The `style` pass drops first; the `classDef` pass reads the line without that `;`.
    const dropped = [-1, -1];
    for (let w = 0; w < 2; w++) {
      const word = words[w] ?? '';
      if ((next[w] ?? 0) !== -1 && (next[w] ?? 0) < ls) next[w] = text.indexOf(word, ls);
      const k = next[w] ?? -1;
      if (k !== -1 && k < le)
        dropped[w] = droppedOnLine(text, k + word.length, le, dropped[0] ?? -1);
    }
    for (const at of dropped.sort((a, b) => a - b)) {
      if (at >= 0) out.push({ start: at, end: at + 1, text: '' });
    }
    if (le >= text.length) break;
    ls = le + 1;
  }
  return out;
}

/**
 * After a `style`/`classDef` ending at `from` on a line ending at `le`: when `:\S*#` follows
 * with a `;` after it, the offset of the line's last `;` (skipping one already `dropped`);
 * otherwise -1.
 */
function droppedOnLine(text: string, from: number, le: number, dropped: number): number {
  let colon = false;
  let hash = -1;
  for (let j = from; j < le; j++) {
    if (j === dropped) continue;
    const c = text.charCodeAt(j);
    if (c === COLON) colon = true;
    else if (c === HASH && colon) {
      hash = j;
      break;
    } else if (isSpace(c)) colon = false;
  }
  if (hash < 0) return -1;
  for (let j = le - 1; j > hash; j--) {
    if (text.charCodeAt(j) === SEMI && j !== dropped) return j;
  }
  return -1;
}

/** `#\w+;` → `ﬂ°…¶ß` (`ﬂ°°…¶ß` for digits only), as `encodeEntities` wrote them. */
function entities(text: string): Edit[] {
  const out: Edit[] = [];
  let h = text.indexOf('#');
  while (h !== -1) {
    let j = h + 1;
    let digits = true;
    while (j < text.length && isWord(text.charCodeAt(j))) {
      const c = text.charCodeAt(j);
      if (!isDigit(c)) digits = false;
      j++;
    }
    if (j > h + 1 && text.charCodeAt(j) === SEMI) {
      out.push({ start: h, end: h + 1, text: digits ? ENTITY_OPEN_NUM : ENTITY_OPEN });
      out.push({ start: j, end: j + 1, text: ENTITY_CLOSE });
      h = text.indexOf('#', j + 1);
    } else h = text.indexOf('#', h + 1);
  }
  return out;
}

/** Undo the placeholders of v12's `encodeEntities`, as v12's renderer read the text. */
export function decodeEntities(text: string): string {
  if (!text.includes('\uFB02') && !text.includes(ENTITY_CLOSE)) return text;
  return text
    .split(ENTITY_OPEN_NUM)
    .join('&#')
    .split(ENTITY_OPEN)
    .join('&')
    .split(ENTITY_CLOSE)
    .join(';');
}
