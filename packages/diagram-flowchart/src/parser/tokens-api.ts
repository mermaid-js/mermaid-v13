import { Kind } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { lex } from './lexer.ts';
import { cook, firstHole, sourceView } from './source.ts';
import type { SourceView } from './source.ts';
import { T } from './tokens.ts';

/** Content tokens whose scan stops at a removed span (v12 saw them as one). */
const SPLIT = new Set<number>([
  T.Str,
  T.MdStr,
  T.Text,
  T.EdgeText,
  T.ShapeData,
  T.AccDescrMultilineValue,
  T.CallbackName,
  T.CallbackArgs,
]);

export interface FlowToken {
  /** A `T` kind or a shared `Kind`. */
  kind: number;
  /** The token's text as v12's lexer saw it (entities, CRLF and removed spans applied). */
  text: string;
  range: Range;
}

/**
 * The significant flowchart tokens of `src` (comments and directives left out), for editors
 * and for the lexer-parity gate.
 */
/** Whether `[from, to)` is non-empty and lies inside removed spans only. */
function gapRemoved(view: SourceView, from: number, to: number): boolean {
  if (from >= to) return false;
  let at = from;
  for (let k = firstHole(view, from); at < to; k++) {
    const h = view.holes[k];
    if (!h || h.start > at) return false;
    at = h.end;
  }
  return true;
}

export function flowchartTokens(src: string): FlowToken[] {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const stream = lex(src, pre.bodyStart, view);
  const out: FlowToken[] = [];
  let removed = false;
  for (let j = 0; j < stream.length; j++) {
    const kind = stream.kind[j] ?? Kind.EOF;
    if (kind === Kind.Comment || kind === Kind.Directive) {
      removed = true;
      continue;
    }
    const start = stream.start[j] ?? 0;
    const end = stream.end[j] ?? 0;
    const last = out[out.length - 1];
    if (
      last &&
      last.kind === kind &&
      SPLIT.has(kind) &&
      (removed || gapRemoved(view, last.range.end, start))
    ) {
      // One token of v12's text that a removed line cut in two.
      last.range = { start: last.range.start, end };
      last.text = cook(src, last.range.start, end, view);
    } else out.push({ kind, text: cook(src, start, end, view), range: { start, end } });
    removed = false;
  }
  return out;
}
