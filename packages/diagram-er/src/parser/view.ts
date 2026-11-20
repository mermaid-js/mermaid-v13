/**
 * ER's v12 source view (D114): the text v12's jison lexer received, from the shared
 * {@link v12Text}, with ER's reading of the removed comments and directives as trivia. Every
 * offset of the text maps back to the source, so token ranges are source ranges.
 */
import type { Hole, Range } from '@mermaid-js/core/parser-kit';
import { v12Text } from '@mermaid-js/shared/parser/v12-text';

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

export function erSourceView(
  src: string,
  from: number,
  directives: readonly Range[]
): ErSourceView {
  const v = v12Text(src, from, directives, true);
  const { starts, ends, text } = v;
  const last = text.length - 1;
  return {
    text,
    trivia: trivia(v.holes, directives),
    start: (i) => {
      if (i >= last) return src.length;
      return starts ? (starts[i] ?? 0) : v.from + i;
    },
    end: (i) => {
      if (i > last) return src.length;
      if (!ends) return v.from + Math.max(i, 0);
      return i <= 0 ? (starts?.[0] ?? 0) : (ends[i - 1] ?? 0);
    },
  };
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
