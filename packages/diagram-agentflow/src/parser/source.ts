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
 * agentflow builds its own view here from core's parts (`cut`, `markDroppedSemicolons`): the
 * holes are the directives, the dropped `;`s and the blanks between a `}` and its line break
 * (both `drop` holes), and the mask carries core's tag-quote bits. Comments stay in the text and are lexed as tokens. The
 * view reads like core's, so `cook`, `localOffset`, `firstHole` and `SourceOffsets` apply.
 * Every scan is linear (R-PARSE-7).
 *
 * v12 parsed the comment-free text instead (`code.cleaned`: comments cut, then `trimStart`)
 * when `withComments` was longer than `maxTextSize` (default 50,000); so does this view, with
 * comments as core's holes and the leading blanks a `drop` hole.
 */
import {
  cut,
  CR,
  isSpace,
  LF,
  markDroppedSemicolons,
  SourceOffsets,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type { Hole, Range, SourceView } from '@mermaid-js/core/parser-kit';
import { DEFAULT_LIMITS } from '@mermaid-js/core/limits';

const NO_DIRECTIVES: readonly Range[] = [];

/**
 * The agentflow source view of `src[from…]` (the text after the front matter); `directives`
 * are the `%%{…}%%` ranges from core's preprocess, sorted. `maxTextSize` is the site config's;
 * its default, v12's 50,000, is core's `maxSourceLength` default, the limit `maxTextSize` sets
 * (`resolveLimits`). This is the one place the default is applied.
 */
export function agentflowSourceView(
  src: string,
  from: number,
  directives: readonly Range[],
  maxTextSize: number = DEFAULT_LIMITS.maxSourceLength
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
  for (const h of droppedSemicolons(src, from, holes)) holes.push(h);
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

/**
 * The `;`s `encodeEntities` cut off, as `drop` holes at source offsets: core's rule
 * (`markDroppedSemicolons`), run on the text with the `directives` holes cut out and the
 * comments kept, as v12's agentflow had it. The classDef pass reads the line without the style
 * pass's `;`.
 */
function droppedSemicolons(src: string, from: number, directives: readonly Hole[]): Hole[] {
  if (!src.includes(';', from)) return [];
  const t = cut(src, directives);
  const at = t.runs && new SourceOffsets(t.runs);
  let drops: Uint8Array | undefined;
  markDroppedSemicolons(
    t.text,
    from,
    (i) => (at ? at.source(i) : i),
    (i, bit) => {
      drops ??= new Uint8Array(src.length);
      drops[i] = (drops[i] ?? 0) | bit;
    },
    () => drops
  );
  const out: Hole[] = [];
  if (drops)
    for (let i = from; i < drops.length; i++)
      if (drops[i]) out.push({ start: i, end: i + 1, kind: 'drop' });
  return out;
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
