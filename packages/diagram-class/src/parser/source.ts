/**
 * What v12 did to class-diagram text before its lexer saw it, reproduced without rewriting the
 * source (DESIGN §4.1). v12 ran these rewrites, in order (the same as for flowchart, whose
 * `source.ts` this follows, less flowchart's own `}\s*\n` rewrite):
 *
 * 1. `cleanupText`: CRLF and CR → LF, and `="x"` → `='x'` inside every `<tag …>`;
 * 2. directives removed, then every line comment (`^\s*%%(?!{)[^\n]+\n?`, multiline) removed,
 *    then leading whitespace trimmed;
 * 3. `encodeEntities`: on a line holding `style…:…#…;` (then `classDef…`), the last `;` is
 *    dropped; then every `#name;` / `#123;` becomes an entity placeholder;
 * 4. a `\n` is appended.
 *
 * v13 keeps the source as written. {@link sourceView} finds, in linear scans, *where* those
 * rewrites act: removed spans (comments and directives, emitted as trivia, and dropped
 * semicolons) and converted quotes. {@link v12Text} then builds the text v12's lexer saw, with
 * the source range of each of its characters, so the lexer can run jison's rules on exactly
 * that text and still report source offsets.
 */
import {
  COLON,
  CR,
  DQUOTE,
  EQUALS,
  HASH,
  isDigit,
  isSpace,
  isWord,
  LBRACE,
  LF,
  PERCENT,
  SEMI,
} from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';

/** Mask bit: a `"` that v12 turned into `'` (an HTML attribute quote). */
export const QUOTE = 1;
/** Mask bit: a `;` that v12's `encodeEntities` dropped. */
export const DROP = 2;

export interface SourceView {
  /** Per-offset {@link QUOTE}/{@link DROP} bits, or undefined when nothing is marked. */
  mask: Uint8Array | undefined;
  /** Removed spans in source order: directives, line comments and dropped semicolons. */
  holes: Hole[];
}

export interface Hole extends Range {
  /** A line comment, a directive, or a `;` that `encodeEntities` dropped. */
  kind: 'comment' | 'directive' | 'drop';
}

const isNl = (c: number) => c === LF || c === CR;

export function sourceView(src: string, from: number, directives: readonly Range[]): SourceView {
  let mask: Uint8Array | undefined;
  const mark = (i: number, bit: number) => {
    mask ??= new Uint8Array(src.length);
    mask[i] = (mask[i] ?? 0) | bit;
  };
  markTagQuotes(src, from, mark);
  markDroppedSemicolons(src, from, directives, mark, () => mask);
  const removed = holes(src, from, directives);
  const m = mask;
  if (m) {
    const spans = removed.length;
    let k = 0;
    for (let i = from; i < m.length; i++) {
      if (!((m[i] ?? 0) & DROP)) continue;
      while (k < spans && (removed[k]?.end ?? 0) <= i) k++;
      const h = k < spans ? removed[k] : undefined;
      if (!h || h.start > i) removed.push({ start: i, end: i + 1, kind: 'drop' });
    }
    removed.sort((a, b) => a.start - b.start);
  }
  return { mask, holes: removed };
}

/** `<(\w+)([^>]*)>` then `="([^"]*)"` inside the attributes: both quotes become `'`. */
function markTagQuotes(src: string, from: number, mark: (i: number, bit: number) => void): void {
  let gt = -1;
  let i = src.indexOf('<', from);
  while (i !== -1 && i + 1 < src.length) {
    if (!isWord(src.charCodeAt(i + 1))) {
      i = src.indexOf('<', i + 1);
      continue;
    }
    if (gt < i) gt = src.indexOf('>', i);
    if (gt === -1) return;
    let j = i + 1;
    while (j < gt) {
      if (src.charCodeAt(j) === EQUALS && src.charCodeAt(j + 1) === DQUOTE) {
        let close = j + 2;
        while (close < gt && src.charCodeAt(close) !== DQUOTE) close++;
        if (close >= gt) break;
        mark(j + 1, QUOTE);
        mark(close, QUOTE);
        j = close + 1;
      } else j++;
    }
    i = src.indexOf('<', gt + 1);
  }
}

/** LF and CR: where v12's `[^\n]` stopped once it had turned CR into LF. */
const BREAKS = ['\n', '\r'];
/** What a regex `.` does not match, and what `^` (multiline) follows. */
const LINE_ENDS = ['\n', '\r', '\u2028', '\u2029'];

/**
 * The first of `chars` at or after `q`, or the end. Found with `indexOf`, keeping the next of
 * each, so calls with non-decreasing `q` cost one pass over the text in total.
 */
function lineEnds(src: string, chars: readonly string[] = BREAKS): (q: number) => number {
  const next = chars.map(() => -2);
  return (q) => {
    let min = src.length;
    for (let k = 0; k < chars.length; k++) {
      let at = next[k] ?? -1;
      if (at !== -1 && at < q) next[k] = at = src.indexOf(chars[k] ?? '', q);
      if (at !== -1 && at < min) min = at;
    }
    return min;
  };
}

/**
 * `style.*:\S*#.*;` then `classDef.*:\S*#.*;` (each global, `.` stops at line ends): the
 * match ends at the line's last `;`, which `encodeEntities` cut off. v12 ran it after removing
 * directives, so a `;` inside a directive on the line is neither the cut one nor a stop.
 */
function markDroppedSemicolons(
  src: string,
  from: number,
  directives: readonly Range[],
  mark: (i: number, bit: number) => void,
  current: () => Uint8Array | undefined
): void {
  if (!src.includes(';') || (!src.includes('style', from) && !src.includes('classDef', from)))
    return;
  const words = ['style', 'classDef'];
  const next = [-2, -2];
  const lineEnd = lineEnds(src, LINE_ENDS);
  const onLine = directivesOnLine(directives);
  let ls = from;
  while (ls <= src.length) {
    const le = lineEnd(ls);
    const inDirective = onLine(ls, le);
    for (let w = 0; w < 2; w++) {
      const word = words[w] ?? '';
      if ((next[w] ?? 0) !== -1 && (next[w] ?? 0) < ls) next[w] = src.indexOf(word, ls);
      const k = next[w] ?? -1;
      if (k === -1 || k >= le) continue;
      const m = current();
      const gone = (x: number) => (m !== undefined && ((m[x] ?? 0) & DROP) !== 0) || inDirective(x);
      const hash = hashAfterColon(src, k + word.length, le, gone);
      if (hash < 0) continue;
      for (let j = le - 1; j > hash; j--) {
        if (src.charCodeAt(j) === SEMI && !gone(j)) {
          mark(j, DROP);
          break;
        }
      }
    }
    if (le >= src.length) break;
    ls = le + (src.charCodeAt(le) === CR && src.charCodeAt(le + 1) === LF ? 2 : 1);
  }
}

/** `:\S*#` in `[from, le)`, skipping `gone` offsets: the offset of the `#`, or -1. */
function hashAfterColon(
  src: string,
  from: number,
  le: number,
  gone: (x: number) => boolean
): number {
  let colon = false;
  for (let j = from; j < le; j++) {
    if (gone(j)) continue;
    const c = src.charCodeAt(j);
    if (c === COLON) colon = true;
    else if (c === HASH && colon) return j;
    else if (isSpace(c)) colon = false;
  }
  return -1;
}

/**
 * For lines visited in order: whether an offset of the line `[ls, le)` is inside a directive.
 * v12 removed directives before its style regexes ran.
 */
function directivesOnLine(directives: readonly Range[]) {
  let d = 0;
  return (ls: number, le: number): ((x: number) => boolean) => {
    while (d < directives.length && (directives[d] as Range).end <= ls) d++;
    const line: Range[] = [];
    for (let i = d; i < directives.length && (directives[i] as Range).start < le; i++)
      line.push(directives[i] as Range);
    return line.length === 0 ? () => false : (x) => line.some((r) => r.start <= x && x < r.end);
  };
}

// The directives no comment swallowed, merged into `comments` in source order. Both are sorted
// and comments do not overlap, so one pass over each does it.
function withDirectives(comments: Hole[], directives: readonly Range[], from: number): Hole[] {
  const all: Hole[] = [];
  let k = 0;
  for (const r of directives) {
    if (r.start < from) continue;
    while (k < comments.length && (comments[k] as Hole).end <= r.start)
      all.push(comments[k++] as Hole);
    const h = comments[k];
    if (h && h.start <= r.start && r.end <= h.end) continue;
    // A comment that starts first but ends inside the directive sorts before it (as a stable
    // sort did); it cannot reach a later directive.
    if (h && h.start <= r.start) all.push(comments[k++] as Hole);
    all.push({ start: r.start, end: r.end, kind: 'directive' });
  }
  while (k < comments.length) all.push(comments[k++] as Hole);
  return all;
}

/** Directive spans plus the line comments v12 removed after them. */
function holes(src: string, from: number, directives: readonly Range[]): Hole[] {
  if (directives.length === 0 && !src.includes('%%', from)) return [];
  const out: Hole[] = [];
  let d = 0;
  // Next directive at or after `i`, as an index into `directives`.
  const dirAt = (i: number) => {
    while (d < directives.length && (directives[d]?.end ?? 0) <= i) d++;
    const r = directives[d];
    return r && r.start === i ? r : undefined;
  };
  const lineEnd = lineEnds(src);
  const nextLine = lineEnds(src, LINE_ENDS);
  let ls = from;
  while (ls < src.length) {
    // Skip whitespace (and removed directives) from this line start.
    let q = ls;
    if (directives.length === 0) {
      while (q < src.length && isSpace(src.charCodeAt(q))) q++;
    } else {
      while (q < src.length) {
        const r = dirAt(q);
        if (r) q = r.end;
        else if (isSpace(src.charCodeAt(q))) q++;
        else break;
      }
    }
    if (
      src.charCodeAt(q) === PERCENT &&
      src.charCodeAt(q + 1) === PERCENT &&
      src.charCodeAt(q + 2) !== LBRACE &&
      q + 2 < src.length &&
      !isNl(src.charCodeAt(q + 2))
    ) {
      let e = lineEnd(q + 2);
      if (src.charCodeAt(e) === CR) e++;
      if (src.charCodeAt(e) === LF) e++;
      out.push({ start: ls, end: e, kind: 'comment' });
      ls = e;
      continue;
    }
    // No comment from any line start up to q; continue at the first line start after q.
    const e = nextLine(q);
    if (e >= src.length) break;
    ls = e + (src.charCodeAt(e) === CR && src.charCodeAt(e + 1) === LF ? 2 : 1);
  }
  return directives.length === 0 ? out : withDirectives(out, directives, from);
}

/** The text v12's class lexer saw, and where each of its characters came from. */
export interface V12Text {
  /** v12's text, including the `\n` it appended (whose source range is empty, at the end). */
  text: string;
  /** Length of {@link text} without the appended `\n`. */
  length: number;
  /** Source offset where `text[i]` starts, or undefined when it is `from + i` throughout. */
  starts: Uint32Array | undefined;
  /** Source offset where `text[i]` ends; undefined with {@link starts}. */
  ends: Uint32Array | undefined;
  /** The source offset of `text[0]` when {@link starts} is undefined. */
  from: number;
}

const PLACEHOLDER_OPEN = '\uFB02\u00B0';
const PLACEHOLDER_CLOSE = '\u00B6\u00DF';

/** Builds v12's text for the body `src[from…]` from the spans {@link sourceView} found. */
export function v12Text(src: string, from: number, view: SourceView): V12Text {
  if (
    view.holes.length === 0 &&
    !view.mask &&
    !src.includes('\r', from) &&
    !src.includes(';', from) &&
    !isSpace(src.charCodeAt(from))
  ) {
    const text = src.slice(from) + '\n';
    return { text, length: text.length - 1, starts: undefined, ends: undefined, from };
  }
  const b = new TextBuilder(src.length - from);
  cleaned(src, from, view, b);
  return withEntities(b, src.length);
}

/** Characters with their source ranges, appended in order. */
class TextBuilder {
  parts: string[] = [];
  starts: Uint32Array;
  ends: Uint32Array;
  n = 0;

  constructor(capacity: number) {
    this.starts = new Uint32Array(capacity + 1);
    this.ends = new Uint32Array(capacity + 1);
  }

  push(ch: string, start: number, end: number): void {
    if (this.n === this.starts.length) this.grow();
    this.parts.push(ch);
    this.starts[this.n] = start;
    this.ends[this.n] = end;
    this.n++;
  }

  private grow(): void {
    const starts = new Uint32Array(this.starts.length * 2);
    starts.set(this.starts);
    this.starts = starts;
    const ends = new Uint32Array(this.ends.length * 2);
    ends.set(this.ends);
    this.ends = ends;
  }
}

/** Steps 1 and 2: removed spans cut, line breaks and tag quotes converted, leading blanks gone. */
function cleaned(src: string, from: number, view: SourceView, b: TextBuilder): void {
  const { holes: hs, mask } = view;
  let h = 0;
  let lead = true;
  for (let i = from; i < src.length; ) {
    while (h < hs.length && (hs[h]?.end ?? 0) <= i) h++;
    const hole = hs[h];
    if (hole && hole.start <= i) {
      i = hole.end;
      continue;
    }
    const c = src.charCodeAt(i);
    if (lead && isSpace(c)) {
      i += c === CR && src.charCodeAt(i + 1) === LF ? 2 : 1;
      continue;
    }
    lead = false;
    if (c === CR) {
      const end = src.charCodeAt(i + 1) === LF ? i + 2 : i + 1;
      b.push('\n', i, end);
      i = end;
    } else {
      b.push(((mask?.[i] ?? 0) & QUOTE) !== 0 ? "'" : (src[i] ?? ''), i, i + 1);
      i++;
    }
  }
}

/** Step 3's placeholders (`#name;` → `ﬂ°name¶ß`, `#123;` → `ﬂ°°123¶ß`), then step 4. */
function withEntities(b: TextBuilder, srcLength: number): V12Text {
  const { parts, starts, ends, n } = b;
  const out = new TextBuilder(n + 8);
  for (let i = 0; i < n; i++) {
    const ch = parts[i] ?? '';
    let j = i + 1;
    if (ch === '#') while (j < n && isWord((parts[j] ?? '').charCodeAt(0))) j++;
    if (ch !== '#' || j === i + 1 || parts[j] !== ';') {
      out.push(ch, starts[i] ?? 0, ends[i] ?? 0);
      continue;
    }
    const digits = parts.slice(i + 1, j).every((p) => isDigit(p.charCodeAt(0)));
    const open = digits ? PLACEHOLDER_OPEN + '\u00B0' : PLACEHOLDER_OPEN;
    for (const o of open) out.push(o, starts[i] ?? 0, ends[i] ?? 0);
    for (let k = i + 1; k < j; k++) out.push(parts[k] ?? '', starts[k] ?? 0, ends[k] ?? 0);
    for (const o of PLACEHOLDER_CLOSE) out.push(o, starts[j] ?? 0, ends[j] ?? 0);
    i = j;
  }
  out.push('\n', srcLength, srcLength);
  const text = out.parts.join('');
  return {
    text,
    length: text.length - 1,
    starts: out.starts.subarray(0, out.n),
    ends: out.ends.subarray(0, out.n),
    from: 0,
  };
}
