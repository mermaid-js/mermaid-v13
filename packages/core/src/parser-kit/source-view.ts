/**
 * The v12 source view (D114, DESIGN §4.1): what v12 did to a diagram's text before its lexer saw
 * it, reproduced without rewriting the source. v12 ran these rewrites, in order, for every type:
 *
 * 1. `cleanupText`: CRLF → LF, and `="x"` → `='x'` inside every `<tag …>`;
 * 2. directives removed, then every line comment (`^\s*%%(?!{)[^\n]+\n?`, multiline) removed;
 * 3. `encodeEntities`: on a line holding `style…:…#…;` (then `classDef…`), the last `;` is
 *    dropped; then every `#name;` / `#123;` becomes an entity placeholder;
 * 4. a `\n` appended. Some types' parsers rewrote more (flowchart: `}\s*\n` → `}\n`), which a
 *    type opts into with {@link SourceViewOptions}.
 *
 * v13 keeps the source as written. Here we compute, in linear scans (R-PARSE-7), *where* those
 * rewrites would have acted: removed spans (comments and directives, emitted as trivia),
 * converted quotes and dropped semicolons (a per-offset mask). A lexer and {@link cook}, which
 * builds label text from a source range, read a copy with the removed spans cut out (v12's text)
 * and map its offsets back to the source, so every token and range is a source offset.
 */
import {
  COLON,
  CR,
  DQUOTE,
  EQUALS,
  HASH,
  LBRACE,
  LF,
  PERCENT,
  RBRACE,
  SEMI,
} from './char-codes.ts';
import { isDigit, isSpace, isWord } from './chars.ts';
import type { Range } from './positions.ts';

/** Mask bit: a `"` that v12 turned into `'` (an HTML attribute quote). */
export const QUOTE = 1;
/** Mask bit: a `;` that v12's `encodeEntities` dropped. */
export const DROP = 2;

/** Which rewrites a type's v12 pipeline ran, beyond comments and directives (every type). */
export interface SourceViewOptions {
  /** `="x"` → `='x'` inside `<tag …>` (`cleanupText`). Default true. */
  readonly tagQuotes?: boolean;
  /** Drop the last `;` of a `style…:…#…;` or `classDef…` line (`encodeEntities`). Default true. */
  readonly styleSemicolons?: boolean;
  /** {@link cook} collapses `}\s*\n` to `}\n`, as flowchart's v12 parser did. Default false. */
  readonly braceNewline?: boolean;
}

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
  /** Whether {@link cook} collapses `}\s*\n` ({@link SourceViewOptions.braceNewline}). */
  braceNewline: boolean;
}

export interface Hole extends Range {
  /** A line comment, a directive, or a `;` that `encodeEntities` dropped. */
  kind: 'comment' | 'directive' | 'drop';
}

const isNl = (c: number) => c === 10 || c === 13;

/**
 * The source view of `src[from…]` (the text after the diagram header's start); `directives` are
 * the `%%{…}%%` ranges from core's preprocess, sorted.
 */
export function sourceView(
  src: string,
  from: number,
  directives: readonly Range[],
  options: SourceViewOptions = {}
): SourceView {
  let mask: Uint8Array | undefined;
  const mark = (i: number, bit: number) => {
    mask ??= new Uint8Array(src.length);
    mask[i] = (mask[i] ?? 0) | bit;
  };
  if (options.tagQuotes !== false) markTagQuotes(src, from, mark);
  // v12 ran each step on the previous one's output: directives, then line comments, then the
  // semicolon drops, which therefore read the text with both cut out.
  const removed = holes(src, from, directives);
  if (options.styleSemicolons !== false && mayDropSemicolons(src, from, removed.length > 0)) {
    const pre = cut(src, removed);
    const at = pre.runs ? new SourceOffsets(pre.runs) : undefined;
    // Holes start at or after `from`, so `from` is the same offset in the cut text.
    markDroppedSemicolons(
      pre.text,
      from,
      (i) => (at ? at.source(i) : i),
      mark,
      () => mask
    );
  }
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
  return {
    mask,
    holes: removed,
    ...cut(src, removed),
    braceNewline: options.braceNewline === true,
  };
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
 * either direction costs O(runs passed). `near` (a text offset) starts it at that run, found by
 * binary search, so a lookup in the middle of a long text does not walk every run before it.
 */
export class SourceOffsets {
  private k = 0;
  private readonly last: number;

  constructor(
    private readonly runs: Uint32Array,
    near = 0
  ) {
    this.last = (runs.length >> 1) - 1;
    let hi = this.last;
    while (this.k < hi) {
      const mid = (this.k + hi + 1) >> 1;
      if ((runs[2 * mid] ?? 0) <= near) this.k = mid;
      else hi = mid - 1;
    }
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
const BREAKS = ['\n', '\r'] as const;
/** What a regex `.` does not match, and what `^` (multiline) follows. */
const LINE_ENDS = ['\n', '\r', '\u2028', '\u2029'] as const;

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
 * Whether `encodeEntities` could drop a `;` of `src[from…]`. With spans cut out, `style` or
 * `classDef` may only appear once they are gone, so the cut text decides.
 */
function mayDropSemicolons(src: string, from: number, holed: boolean): boolean {
  return (
    src.includes(';', from) &&
    (holed || src.includes('style', from) || src.includes('classDef', from))
  );
}

/**
 * `style.*:\S*#.*;` then `classDef.*:\S*#.*;` (each global, `.` stops at line ends): the
 * match ends at the line's last `;`, which `encodeEntities` cut off. `t` is the text with
 * directives and comments cut out, as v12 had it by then; `source` maps its offsets back, and
 * the mask is marked at source offsets.
 */
function markDroppedSemicolons(
  t: string,
  from: number,
  source: (i: number) => number,
  mark: (i: number, bit: number) => void,
  current: () => Uint8Array | undefined
): void {
  if (!t.includes('style', from) && !t.includes('classDef', from)) return;
  const words = ['style', 'classDef'];
  const next = [-2, -2];
  const lineEnd = lineEnds(t, LINE_ENDS);
  let ls = from;
  while (ls <= t.length) {
    const le = lineEnd(ls);
    for (let w = 0; w < 2; w++) {
      const word = words[w] ?? '';
      if ((next[w] ?? 0) !== -1 && (next[w] ?? 0) < ls) next[w] = t.indexOf(word, ls);
      const k = next[w] ?? -1;
      if (k === -1 || k >= le) continue;
      const m = current();
      const gone = (x: number) => m !== undefined && ((m[source(x)] ?? 0) & DROP) !== 0;
      let colon = false;
      let hash = -1;
      for (let j = k + word.length; j < le; j++) {
        const c = t.charCodeAt(j);
        if (gone(j)) continue;
        if (c === COLON) colon = true;
        else if (c === HASH && colon) {
          hash = j;
          break;
        } else if (isSpace(c)) colon = false;
      }
      if (hash < 0) continue;
      for (let j = le - 1; j > hash; j--) {
        if (t.charCodeAt(j) === SEMI && !gone(j)) {
          mark(source(j), DROP);
          break;
        }
      }
    }
    if (le >= t.length) break;
    ls = le + (t.charCodeAt(le) === CR && t.charCodeAt(le + 1) === LF ? 2 : 1);
  }
}

/**
 * `find` (a {@link lineEnds} lookup) skipping the line ends inside directives: v12 removed
 * directives before it looked for line comments. Calls must have non-decreasing `q`.
 */
function outsideDirectives(
  find: (q: number) => number,
  directives: readonly Range[]
): (q: number) => number {
  if (directives.length === 0) return find;
  let d = 0;
  return (q) => {
    for (;;) {
      const e = find(q);
      while (d < directives.length && (directives[d]?.end ?? 0) <= e) d++;
      const r = directives[d];
      if (!r || r.start > e) return e;
      q = r.end;
    }
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
  // Line ends and `%%` as in the text with directives cut out, where v12 looked for comments.
  const lineEnd = outsideDirectives(lineEnds(src), directives);
  const nextLine = outsideDirectives(lineEnds(src, LINE_ENDS), directives);
  // `i`, or the first offset after the directives that start there.
  const past = (i: number) => {
    for (let r = dirAt(i); r; r = dirAt(i)) i = r.end;
    return i;
  };
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
    const second = src.charCodeAt(q) === PERCENT ? past(q + 1) : q + 1;
    const third = src.charCodeAt(second) === PERCENT ? past(second + 1) : second + 1;
    if (
      src.charCodeAt(q) === PERCENT &&
      src.charCodeAt(second) === PERCENT &&
      src.charCodeAt(third) !== LBRACE &&
      third < src.length &&
      !isNl(src.charCodeAt(third))
    ) {
      let e = lineEnd(third);
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
 * Removed spans inside the range are skipped, and `}\s*\n` collapses when the view asks for it.
 */
export function cook(src: string, start: number, end: number, view: SourceView): string {
  const { text, mask, braceNewline } = view;
  const removed = view.holes;
  const k = firstHole(view, start);
  // A removed span inside the range, or right before it (then the text before is not src's).
  const split = (removed[k]?.start ?? end) < end || (k > 0 && removed[k - 1]?.end === start);
  if (
    !split &&
    (!braceNewline || src.charCodeAt(start - 1) !== RBRACE) &&
    !needsCooking(src, start, end, mask, braceNewline)
  )
    return src.slice(start, end);
  const from = localOffset(view, start);
  const to = localOffset(view, end);
  const offsets = view.runs ? new SourceOffsets(view.runs, from) : undefined;
  let out = '';
  for (let i = from; i < to; i++) {
    const c = text.charCodeAt(i);
    if (((mask?.[offsets ? offsets.source(i) : i] ?? 0) & QUOTE) !== 0) {
      out += "'";
      continue;
    }
    if (c === CR) {
      out += '\n';
      // A CRLF in the source; a CR and an LF that a removed span left side by side were two
      // line ends to v12, which turned CRs into LFs before removing anything.
      if (
        text.charCodeAt(i + 1) === LF &&
        (!offsets || offsets.source(i + 1) === offsets.source(i) + 1)
      )
        i++;
      continue;
    }
    if (c === HASH) {
      let j = i + 1;
      let numeric = true;
      while (j < to && isWord(text.charCodeAt(j))) {
        if (!isDigit(text.charCodeAt(j))) numeric = false;
        j++;
      }
      if (j > i + 1 && j < to && text.charCodeAt(j) === SEMI) {
        const name = text.slice(i + 1, j);
        out += numeric ? `&#${name};` : `&${name};`;
        i = j;
        continue;
      }
    }
    if (
      braceNewline &&
      (c === RBRACE || (i === from && text.charCodeAt(i - 1) === RBRACE && isSpace(c)))
    ) {
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

/** Inspect just the source range, without a temporary substring or per-token RegExp. */
function needsCooking(
  src: string,
  start: number,
  end: number,
  mask: Uint8Array | undefined,
  braceNewline: boolean
): boolean {
  for (let i = start; i < end; i++) {
    const c = src.charCodeAt(i);
    if (c === CR || c === HASH || (braceNewline && c === RBRACE) || mask?.[i]) return true;
  }
  return false;
}
