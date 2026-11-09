/**
 * Agentflow's v12 source view (D114, pitfall 1): what v12 did to an agentflow text before its
 * lexer saw it, reproduced without rewriting the source. Agentflow's differs from every other
 * type's: its DB set `preserveCommentsWhenParsing`, so v12 parsed `code.withComments`:
 *
 * 1. `cleanupText`: CRLF → LF, and `="x"` → `='x'` inside every `<tag …>`;
 * 2. front matter and directives removed; **line comments kept**, and no `trimStart`;
 * 3. `encodeEntities`: on a line holding `style…:…#…;` (then `classDef…`), the last `;` is
 *    dropped (comment lines included); then `#name;` / `#123;` become entity placeholders;
 * 4. a `\n` appended, then agentflowParser's `}[^\S\n]*\n` → `}\n` (only the blanks on the
 *    `}`'s own line; flowchart's `}\s*\n` also ate blank lines).
 *
 * Core's `sourceView` always cuts comments out and its `braceNewline` is flowchart's rule, so
 * agentflow builds its own view here (no core change): the holes are the directives, the
 * dropped `;`s and the blanks between a `}` and its line break (both `drop` holes), and the
 * mask carries core's tag-quote bits. Comments stay in the text and are lexed as tokens. The
 * view reads like core's, so `cook`, `localOffset`, `firstHole` and `SourceOffsets` apply.
 * Every scan is linear (R-PARSE-7).
 *
 * v12 parsed the comment-free text instead (`code.cleaned`: comments cut, then `trimStart`)
 * when `withComments` was longer than `maxTextSize` (default 50,000); so does this view, with
 * comments as core's holes and the leading blanks a `drop` hole.
 */
import {
  COLON,
  CR,
  HASH,
  isSpace,
  LF,
  SEMI,
  SourceOffsets,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type { Hole, Range, SourceView } from '@mermaid-js/core/parser-kit';

/** v12's default `maxTextSize`. */
export const MAX_TEXT_SIZE = 50_000;

const NO_DIRECTIVES: readonly Range[] = [];

/**
 * The agentflow source view of `src[from…]` (the text after the front matter); `directives`
 * are the `%%{…}%%` ranges from core's preprocess, sorted. `maxTextSize` is the site config's.
 */
export function agentflowSourceView(
  src: string,
  from: number,
  directives: readonly Range[],
  maxTextSize = MAX_TEXT_SIZE
): SourceView {
  if (withCommentsLength(src, from, directives) > maxTextSize) {
    // v12's `cleaned`: core's view (comments, directives and the `;` drops it read without
    // them), then `trimStart` and agentflow's `}` rewrite.
    const core = sourceView(src, from, directives);
    return withDrops(src, from, core.holes, core.mask, true);
  }
  // Tag quotes only: core reads its other rewrites from the text with comments cut out.
  const { mask } = sourceView(src, from, NO_DIRECTIVES, { styleSemicolons: false });
  const holes: Hole[] = [];
  for (const d of directives) {
    if (d.start >= from) holes.push({ start: d.start, end: d.end, kind: 'directive' });
  }
  // v12 ran each step on the previous one's output: the `;` drops read the text with the
  // directives cut out, and the `}` rewrite reads it with the drops cut out too.
  const t1 = cut(src, holes);
  const at1 = t1.runs && new SourceOffsets(t1.runs);
  for (const i of droppedSemicolons(t1.text, from)) {
    const s = at1 ? at1.source(i) : i;
    holes.push({ start: s, end: s + 1, kind: 'drop' });
  }
  holes.sort((a, b) => a.start - b.start);
  return withDrops(src, from, holes, mask, false);
}

/**
 * The length of v12's `withComments` for `src[from…]`: CRLF as one LF, directives removed
 * (their own CRLFs with them).
 */
function withCommentsLength(src: string, from: number, directives: readonly Range[]): number {
  let n = src.length - from;
  let d = 0;
  for (const r of directives) if (r.start >= from) n -= r.end - r.start;
  for (let i = src.indexOf('\r\n', from); i !== -1; i = src.indexOf('\r\n', i + 2)) {
    while (d < directives.length && (directives[d]?.end ?? 0) <= i) d++;
    const r = directives[d];
    if (!r || r.start > i) n--;
  }
  return n;
}

/**
 * The view over `holes` (sorted, disjoint) plus the blanks v12 removed after them: the
 * blanks between a `}` and its line break, and with `trim` the leading blanks.
 */
function withDrops(
  src: string,
  from: number,
  holes: Hole[],
  mask: Uint8Array | undefined,
  trim: boolean
): SourceView {
  const t = holes.length > 0 ? cut(src, holes) : { text: src, runs: undefined };
  const at = t.runs && new SourceOffsets(t.runs);
  const spans = braceBlanks(t.text, from);
  if (trim) {
    let e = from;
    while (e < t.text.length && isSpace(t.text.charCodeAt(e))) e++;
    if (e > from) spans.unshift([from, e]);
  }
  let last: Hole | undefined;
  const blanks: Hole[] = [];
  for (const [a, b] of spans) {
    for (let i = a; i < b; i++) {
      const s = at ? at.source(i) : i;
      if (last?.end === s) last.end++;
      else blanks.push((last = { start: s, end: s + 1, kind: 'drop' }));
    }
  }
  if (blanks.length === 0) return { mask, holes, text: t.text, runs: t.runs, braceNewline: false };
  const all = [...holes, ...blanks].sort((a, b) => a.start - b.start);
  return { mask, holes: all, ...cut(src, all), braceNewline: false };
}

/** `src` without the (sorted, disjoint) `removed` spans, and where each kept run was. */
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

/** What a regex `.` does not match. */
const LINE_ENDS = ['\n', '\r', '\u2028', '\u2029'] as const;

/**
 * The first line end at or after `q`, or the end. Found with `indexOf`, keeping the next of
 * each, so calls with non-decreasing `q` cost one pass over the text in total.
 */
function lineEnds(t: string): (q: number) => number {
  const next = LINE_ENDS.map(() => -2);
  return (q) => {
    let min = t.length;
    for (let k = 0; k < LINE_ENDS.length; k++) {
      let at = next[k] ?? -1;
      if (at !== -1 && at < q) next[k] = at = t.indexOf(LINE_ENDS[k] ?? '', q);
      if (at !== -1 && at < min) min = at;
    }
    return min;
  };
}

/**
 * The offsets in `t` of the `;`s `encodeEntities` cut off: `style.*:\S*#.*;` then
 * `classDef.*:\S*#.*;` (each global, `.` stops at line ends), each match ending at its line's
 * last `;`. The classDef pass reads the line without the style pass's `;`. Core's rule
 * (`source-view.ts`), run here on the text with comments kept, as v12's agentflow had it.
 */
function droppedSemicolons(t: string, from: number): number[] {
  if (!t.includes(';', from)) return [];
  if (!t.includes('style', from) && !t.includes('classDef', from)) return [];
  const gone = new Set<number>();
  const words = ['style', 'classDef'] as const;
  const next = [-2, -2];
  const lineEnd = lineEnds(t);
  let ls = from;
  while (ls <= t.length) {
    const le = lineEnd(ls);
    for (let w = 0; w < 2; w++) {
      const word = words[w] ?? '';
      if ((next[w] ?? 0) !== -1 && (next[w] ?? 0) < ls) next[w] = t.indexOf(word, ls);
      const k = next[w] ?? -1;
      if (k === -1 || k >= le) continue;
      const hash = hashAfterColon(t, k + word.length, le, gone);
      if (hash < 0) continue;
      for (let j = le - 1; j > hash; j--) {
        if (t.charCodeAt(j) === SEMI && !gone.has(j)) {
          gone.add(j);
          break;
        }
      }
    }
    if (le >= t.length) break;
    ls = le + (t.charCodeAt(le) === CR && t.charCodeAt(le + 1) === LF ? 2 : 1);
  }
  return [...gone];
}

/** The first `#` of `t[from, to)` after a `:` with no blank between (`:\S*#`), or -1. */
function hashAfterColon(t: string, from: number, to: number, gone: ReadonlySet<number>): number {
  let colon = false;
  for (let j = from; j < to; j++) {
    const c = t.charCodeAt(j);
    if (gone.has(j)) continue;
    if (c === COLON) colon = true;
    else if (c === HASH && colon) return j;
    else if (isSpace(c)) colon = false;
  }
  return -1;
}

/**
 * `}[^\S\n]*\n` in v12's text, where a CR (alone or before an LF) was an LF too and the
 * appended `\n` ends the text: the `[start, end)` runs of `t` between a `}` and its line
 * break, which v12 removed.
 */
function braceBlanks(t: string, from: number): [number, number][] {
  const out: [number, number][] = [];
  let i = t.indexOf('}', from);
  while (i !== -1) {
    let j = i + 1;
    for (let c = t.charCodeAt(j); j < t.length && isSpace(c) && c !== LF && c !== CR; ) {
      c = t.charCodeAt(++j);
    }
    const c = t.charCodeAt(j);
    if (j > i + 1 && (j === t.length || c === LF || c === CR)) out.push([i + 1, j]);
    i = t.indexOf('}', j);
  }
  return out;
}
