/**
 * What v12 did to flowchart text before its lexer saw it, reproduced without rewriting the
 * source (DESIGN §4.1). v12 ran these rewrites, in order:
 *
 * 1. `cleanupText`: CRLF → LF, and `="x"` → `='x'` inside every `<tag …>`;
 * 2. directives removed, then every line comment (`^\s*%%(?!{)[^\n]+\n?`, multiline) removed;
 * 3. `encodeEntities`: on a line holding `style…:…#…;` (then `classDef…`), the last `;` is
 *    dropped; then every `#name;` / `#123;` becomes an entity placeholder;
 * 4. `flowParser`: `}\s*\n` → `}\n`; and a `\n` is appended.
 *
 * v13 keeps the source as written. Here we compute, in linear scans, *where* those rewrites
 * would have acted: removed spans (comments and directives, emitted as trivia), converted
 * quotes and dropped semicolons (a per-offset mask). The lexer and {@link cook}, which builds
 * label text from a source range, read a copy with the removed spans cut out (v12's text) and
 * map its offsets back to the source, so every token and range is a source offset.
 */
import {
  COLON,
  CR,
  DQUOTE,
  EQUALS,
  HASH,
  isSpace,
  isWord,
  LBRACE,
  LF,
  PERCENT,
  RBRACE,
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
  /** Removed spans in source order: directives and line comments. */
  holes: Hole[];
  /** The source with every removed span cut out: the text v12's lexer saw. */
  text: string;
  /**
   * The runs of {@link text} that are source text, as `[textStart, sourceStart]` pairs in order;
   * undefined when nothing was cut. Read them with {@link SourceOffsets}.
   */
  runs: Uint32Array | undefined;
}

export interface Hole extends Range {
  /** A line comment, a directive, or a `;` that `encodeEntities` dropped. */
  kind: 'comment' | 'directive' | 'drop';
}

const isNl = (c: number) => c === 10 || c === 13;

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
  return { mask, holes: removed, ...cut(src, removed) };
}

/** `src` without the removed spans (which may overlap), and where each kept run was. */
function cut(src: string, removed: readonly Hole[]): Pick<SourceView, 'text' | 'runs'> {
  if (removed.length === 0) return { text: src, runs: undefined };
  const parts: string[] = [];
  const runs = new Uint32Array(2 * removed.length + 2);
  let n = 0;
  let length = 0;
  let at = 0;
  const keep = (to: number) => {
    if (to <= at) return;
    parts.push(src.slice(at, to));
    runs[n++] = length;
    runs[n++] = at;
    length += to - at;
  };
  for (const h of removed) {
    keep(h.start);
    if (h.end > at) at = h.end;
  }
  keep(src.length);
  // All of it removed: one empty run at 0.
  if (n === 0) n = 2;
  return { text: parts.join(''), runs: runs.subarray(0, n) };
}

/**
 * Source offsets of `view.text` positions. Lookups near the previous one are O(1), so a scan in
 * either direction costs O(runs passed).
 */
export class SourceOffsets {
  private k = 0;
  private readonly last: number;

  constructor(private readonly runs: Uint32Array) {
    this.last = (runs.length >> 1) - 1;
  }

  /** The source offset of `text[i]`. */
  source(i: number): number {
    const r = this.runs;
    let k = this.k;
    while (k < this.last && (r[2 * k + 2] ?? 0) <= i) k++;
    while (k > 0 && (r[2 * k] ?? 0) > i) k--;
    this.k = k;
    return (r[2 * k + 1] ?? 0) + i - (r[2 * k] ?? 0);
  }
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
      const gone = (x: number) => m !== undefined && ((m[x] ?? 0) & DROP) !== 0;
      let colon = false;
      let hash = -1;
      for (let j = k + word.length; j < le; j++) {
        const c = src.charCodeAt(j);
        if (m !== undefined && ((m[j] ?? 0) & DROP) !== 0) continue;
        if (inDirective(j)) continue;
        if (c === COLON) colon = true;
        else if (c === HASH && colon) {
          hash = j;
          break;
        } else if (isSpace(c)) colon = false;
      }
      if (hash < 0) continue;
      for (let j = le - 1; j > hash; j--) {
        if (src.charCodeAt(j) === SEMI && !gone(j) && !inDirective(j)) {
          mark(j, DROP);
          break;
        }
      }
    }
    if (le >= src.length) break;
    ls = le + (src.charCodeAt(le) === CR && src.charCodeAt(le + 1) === LF ? 2 : 1);
  }
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

/**
 * The text v12's parser saw for the source range `[start, end)` (one label or value), with
 * entity placeholders already decoded back to `&name;` / `&#123;` as v12's renderer did.
 * Removed spans inside the range are skipped.
 */
export function cook(src: string, start: number, end: number, view: SourceView): string {
  const { text, mask } = view;
  const removed = view.holes;
  const k = firstHole(view, start);
  // A removed span inside the range, or right before it (then the text before is not src's).
  const split = (removed[k]?.start ?? end) < end || (k > 0 && removed[k - 1]?.end === start);
  if (
    !split &&
    !/[\r#}]/.test(src.slice(start, end)) &&
    src.charCodeAt(start - 1) !== RBRACE &&
    !masked(mask, start, end)
  )
    return src.slice(start, end);
  const from = localOffset(view, start);
  const to = localOffset(view, end);
  const offsets = mask && view.runs ? new SourceOffsets(view.runs) : undefined;
  let out = '';
  for (let i = from; i < to; i++) {
    const c = text.charCodeAt(i);
    if (((mask?.[offsets ? offsets.source(i) : i] ?? 0) & QUOTE) !== 0) {
      out += "'";
      continue;
    }
    if (c === CR) {
      out += '\n';
      if (text.charCodeAt(i + 1) === LF) i++;
      continue;
    }
    if (c === HASH) {
      let j = i + 1;
      while (j < to && isWord(text.charCodeAt(j))) j++;
      if (j > i + 1 && j < to && text.charCodeAt(j) === SEMI) {
        const name = text.slice(i + 1, j);
        out += /^\d+$/.test(name) ? `&#${name};` : `&${name};`;
        i = j;
        continue;
      }
    }
    if (c === RBRACE || (i === from && text.charCodeAt(i - 1) === RBRACE && isSpace(c))) {
      const at = c === RBRACE ? i + 1 : i;
      if (c === RBRACE) out += '}';
      let j = at;
      let nl = -1;
      while (j < to && isSpace(text.charCodeAt(j))) {
        if (isNl(text.charCodeAt(j))) nl = j;
        j++;
      }
      // v12 appended a line break, so blanks up to the end of the text reach one too; the
      // final line break itself belongs to no source text.
      if (j >= text.length) {
        i = j - 1;
        continue;
      }
      if (nl >= 0) {
        out += '\n';
        i = text.charCodeAt(nl) === CR && text.charCodeAt(nl + 1) === LF ? nl + 1 : nl;
        continue;
      }
      if (c === RBRACE) continue;
    }
    out += text[i];
  }
  return out;
}

/** The first offset into `view.text` whose source offset is at or after `at`. */
export function localOffset(view: SourceView, at: number): number {
  const r = view.runs;
  if (!r) return at;
  // The last run that starts at or before `at`.
  let lo = 0;
  let hi = (r.length >> 1) - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((r[2 * mid + 1] ?? 0) <= at) lo = mid;
    else hi = mid - 1;
  }
  const t = r[2 * lo] ?? 0;
  const s = r[2 * lo + 1] ?? 0;
  if (at < s) return t;
  const end = 2 * lo + 2 < r.length ? (r[2 * lo + 2] ?? 0) : view.text.length;
  return Math.min(t + at - s, end);
}

/** Index of the first hole that ends after `at`. */
export function firstHole(view: SourceView, at: number): number {
  const hs = view.holes;
  let lo = 0;
  let hi = hs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((hs[mid]?.end ?? 0) <= at) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function masked(mask: Uint8Array | undefined, start: number, end: number): boolean {
  if (!mask) return false;
  for (let i = start; i < end; i++) if (mask[i]) return true;
  return false;
}
