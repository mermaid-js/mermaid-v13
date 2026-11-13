/**
 * ER's v12 source view (D114): core's {@link sourceView} (comments, directives, the `;`
 * `encodeEntities` dropped, HTML attribute quotes), plus what ER's lexer reads differently from
 * flowchart's. ER's lexer reads the text v12's jison lexer received byte for byte, so this view
 * also applies, as one layer of edits over core's text:
 *
 * - the front matter cut and leading blanks trimmed (`trimStart`);
 * - CRLF and CR read as LF, and attribute quotes (core's `QUOTE` mask) as `'`;
 * - `#name;` / `#123;` written as v12's entity placeholders (`ﬂ°name¶ß`, `ﬂ°°123¶ß`);
 * - a `\n` appended.
 *
 * Every offset of the text maps back to the source, so token ranges are source ranges.
 */
import {
  isDigit,
  isSpace,
  isWord,
  LF,
  localOffset,
  QUOTE,
  SEMI,
  SourceOffsets,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type { Hole, Range, SourceView } from '@mermaid-js/core/parser-kit';
import { entityAt } from '@mermaid-js/core/text';

export interface Trivia extends Range {
  kind: 'comment' | 'directive';
}

export interface ErSourceView {
  /** The text v12's lexer saw, appended `\n` included. */
  readonly text: string;
  /** Comments and directives v12 removed, as source ranges in source order. */
  readonly trivia: readonly Trivia[];
  /** The source offset where `text[i]` starts (`src.length` for `i = text.length`). */
  start(i: number): number;
  /** The source offset where `text[i - 1]` ends. */
  end(i: number): number;
}

/** One rewrite of core's text: `[start, end)` replaced by `text` (`''` removes it). */
interface Edit {
  start: number;
  end: number;
  text: string;
}

/** Placeholders of v12's `encodeEntities`. */
const ENTITY_OPEN = 'ﬂ°';
const ENTITY_OPEN_NUM = 'ﬂ°°';
const ENTITY_CLOSE = '¶ß';

export function erSourceView(
  src: string,
  from: number,
  directives: readonly Range[]
): ErSourceView {
  const base = sourceView(src, from, directives);
  const bt = base.text;
  const offsets = base.runs ? new SourceOffsets(base.runs) : undefined;
  const toSource = (t: number) => (offsets ? offsets.source(t) : t);
  const layer = new Layer(bt, erEdits(base, from, toSource));
  return {
    text: layer.text,
    trivia: trivia(base.holes, directives),
    start: (i) => {
      const t = layer.start(i);
      return t >= bt.length ? src.length : toSource(t);
    },
    end: (i) => {
      const t = layer.end(i);
      return t <= 0 ? toSource(0) : toSource(t - 1) + 1;
    },
  };
}

/** ER's rewrites of core's text, sorted. */
function erEdits(base: SourceView, from: number, toSource: (t: number) => number): Edit[] {
  const bt = base.text;
  const out: Edit[] = [];
  // Front matter, then the blanks `trimStart` took.
  let k = localOffset(base, from);
  while (k < bt.length && isSpace(bt.charCodeAt(k))) k++;
  if (k > 0) out.push({ start: 0, end: k, text: '' });
  for (let i = bt.indexOf('\r', k); i !== -1; i = bt.indexOf('\r', i + 1)) {
    const crlf = bt.charCodeAt(i + 1) === LF;
    out.push({ start: i, end: crlf ? i + 2 : i + 1, text: '\n' });
    if (crlf) i++;
  }
  const { mask } = base;
  for (let at = from; mask && at < mask.length; at++) {
    if (!((mask[at] ?? 0) & QUOTE)) continue;
    const t = localOffset(base, at);
    if (t >= k && t < bt.length && toSource(t) === at)
      out.push({ start: t, end: t + 1, text: "'" });
  }
  entities(bt, k, out);
  out.push({ start: bt.length, end: bt.length, text: '\n' });
  return out.sort((a, b) => a.start - b.start);
}

/** `#\w+;` → `ﬂ°…¶ß` (`ﬂ°°…¶ß` for digits only), as `encodeEntities` wrote them. */
function entities(text: string, from: number, out: Edit[]): void {
  for (let h = text.indexOf('#', from); h !== -1; ) {
    let j = h + 1;
    let digits = true;
    while (j < text.length && isWord(text.charCodeAt(j))) {
      if (!isDigit(text.charCodeAt(j))) digits = false;
      j++;
    }
    if (j > h + 1 && text.charCodeAt(j) === SEMI) {
      out.push({ start: h, end: h + 1, text: digits ? ENTITY_OPEN_NUM : ENTITY_OPEN });
      out.push({ start: j, end: j + 1, text: ENTITY_CLOSE });
      h = text.indexOf('#', j + 1);
    } else h = text.indexOf('#', h + 1);
  }
}

/**
 * Comments and directives as trivia. Core counts a directive that starts a comment's line as
 * part of the comment; v12 removed the directive first, so it is trivia of its own and the
 * comment starts after it.
 */
function trivia(holes: readonly Hole[], directives: readonly Range[]): Trivia[] {
  const out: Trivia[] = [];
  let d = 0;
  for (const h of holes) {
    if (h.kind === 'drop') continue;
    let at = h.start;
    if (h.kind === 'comment') {
      while (d < directives.length && (directives[d]?.start ?? 0) < at) d++;
      for (let r = directives[d]; r && r.start === at && r.end <= h.end; r = directives[++d]) {
        out.push({ start: r.start, end: r.end, kind: 'directive' });
        at = r.end;
      }
    }
    if (at < h.end) out.push({ start: at, end: h.end, kind: h.kind });
  }
  return out;
}

/**
 * A text made from a base text by sorted, non-overlapping edits, and the map back. Its
 * segments are runs of base text kept as is, or the (non-empty) replacement of one edit.
 */
class Layer {
  readonly text: string;
  /** Per segment, in order: start in `text`, start and end in the base, 1 if kept as is. */
  private readonly seg: Int32Array;
  private readonly count: number;

  constructor(
    base: string,
    edits: readonly Edit[],
    private readonly baseLength = base.length
  ) {
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
    const s = this.seg;
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
    if (i >= this.text.length) return this.baseLength;
    const s = this.seg;
    const k = 4 * this.find(i);
    return s[k + 3] ? (s[k + 1] ?? 0) + i - (s[k] ?? 0) : (s[k + 1] ?? 0);
  }

  /** Base offset where `text[i - 1]` ends: before any removed span after it. */
  end(i: number): number {
    if (i <= 0) return 0;
    const s = this.seg;
    const k = 4 * this.find(i - 1);
    return s[k + 3] ? (s[k + 1] ?? 0) + i - (s[k] ?? 0) : (s[k + 2] ?? 0);
  }
}

const RE_NAMED = /ﬂ°(?!°)(\w+)¶ß/g;

/**
 * Undo the placeholders of v12's `encodeEntities`, as v12's renderer read the text: `&name;`
 * and `&#123;`. A name core cannot decode goes back to `#name;` (D559), as in the parser kit's
 * `cook`.
 */
export function decodeEntities(text: string): string {
  if (!text.includes('ﬂ') && !text.includes(ENTITY_CLOSE)) return text;
  return text
    .replace(RE_NAMED, (all, name: string) => (entityAt(`&${name};`, 0) ? all : `#${name};`))
    .split(ENTITY_OPEN_NUM)
    .join('&#')
    .split(ENTITY_OPEN)
    .join('&')
    .split(ENTITY_CLOSE)
    .join(';');
}
