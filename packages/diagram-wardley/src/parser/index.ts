/**
 * The wardley parser's public surface: the parser (#489), detection, and the lexer gated against
 * v12's Langium lexer (#487).
 */
import { cook, Kind, sourceView } from '@mermaid-js/core/parser-kit';
import type { Range, SourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { lex } from './lexer.ts';

export { LANGIUM_NAMES, T as WardleyTokenKind, WARDLEY_TRIVIA } from './tokens.ts';
export { parseWardley } from './parser.ts';
export type { WardleyParseOptions } from './options.ts';
export type { WardleyParseResult } from './parser.ts';
export { detectWardley } from './detect.ts';
export type * from './ast.ts';

export interface WardleyToken {
  /** A `WardleyTokenKind` or a shared `Kind`. */
  kind: number;
  /**
   * The token's text as v12's lexer read it: CRLF and CR as LF, removed spans cut out, tag
   * quotes as `'`, entities decoded to `&name;` as v12's renderer did.
   */
  text: string;
  range: Range;
}

/** Where v12's text starts in `src` (after front matter), and the view of that text. */
export interface WardleyView {
  bodyStart: number;
  view: SourceView;
}

/**
 * `src` as v12's wardley lexer read it: core's preprocess (front matter, directives) and the
 * source view over the body with default options (v12 ran every shared rewrite).
 */
export function wardleyView(src: string): WardleyView {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  return { bodyStart: pre.bodyStart, view };
}

/**
 * The tokens of `src` that v12's lexer saw, in order: significant tokens, the hidden comments,
 * directives and YAML blocks still in the text v12 lexed, and `Error` where no rule matched.
 * The spans v12 removed before lexing (comment lines, directives) are left out, and so is the
 * final `EOF`. The last `Newline` is the zero-width one at the end of the source, for the line
 * break v12 appended.
 */
export function wardleyTokens(src: string): WardleyToken[] {
  const { bodyStart, view } = wardleyView(src);
  const stream = lex(src, bodyStart, view);
  const removed = view.holes.filter((h) => h.kind !== 'drop');
  let h = 0;
  const out: WardleyToken[] = [];
  for (let j = 0; j < stream.length; j++) {
    const kind = stream.kind[j] ?? Kind.EOF;
    const start = stream.start[j] ?? 0;
    const end = stream.end[j] ?? 0;
    if (kind === Kind.EOF) continue;
    while ((removed[h]?.start ?? Infinity) < start) h++;
    const hole = removed[h];
    const trivia = kind === Kind.Comment || kind === Kind.Directive;
    // A span v12 removed before lexing: its lexer never saw it.
    if (trivia && hole?.start === start && hole.end === end) continue;
    out.push({ kind, text: cook(src, start, end, view), range: { start, end } });
  }
  return out;
}
