/**
 * The railroad parser's public surface so far: the four lexers (#608), each gated against its
 * notation's v12 Langium lexer. The parsers, model and detection land with T2 (#610).
 */
import { cook, Kind, sourceView } from '@mermaid-js/core/parser-kit';
import type { Range, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { lexAbnf } from './abnf/lexer.ts';
import { lexEbnf } from './ebnf/lexer.ts';
import { lexIr } from './ir/lexer.ts';
import { lexPeg } from './peg/lexer.ts';
import type { RailroadNotation } from './tokens.ts';

export { RAILROAD_TRIVIA, T as RailroadTokenKind } from './tokens.ts';
export type { RailroadNotation } from './tokens.ts';

/** Each notation's lexer: `lex(src, from, view)` over the body `src[from…]`. */
export const LEXERS: Readonly<
  Record<RailroadNotation, (src: string, from: number, view: SourceView) => TokenStream>
> = {
  railroad: lexIr,
  railroadEbnf: lexEbnf,
  railroadAbnf: lexAbnf,
  railroadPeg: lexPeg,
};

export interface RailroadToken {
  /** A `RailroadTokenKind` or a shared `Kind`. */
  kind: number;
  /**
   * The token's text as v12's lexer read it: CRLF and CR as LF, removed spans cut out, tag
   * quotes as `'`, entities decoded to `&name;` as v12's renderer did.
   */
  text: string;
  range: Range;
}

/** Where v12's text starts in `src` (after front matter), and the view of that text. */
export interface RailroadView {
  bodyStart: number;
  view: SourceView;
}

/**
 * `src` as v12's railroad lexers read it: core's preprocess (front matter, directives) and the
 * source view over the body with default options (v12 ran every shared rewrite).
 */
export function railroadView(src: string): RailroadView {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  return { bodyStart: pre.bodyStart, view };
}

/**
 * The tokens of `src` that v12's lexer for `notation` saw, in order: significant tokens, the
 * hidden comments, directives and YAML blocks still in the text v12 lexed, and `Error` where no
 * rule matched. The spans v12 removed before lexing (comment lines, directives) are left out,
 * and so is the final `EOF`. Whitespace writes no token.
 */
export function railroadTokens(notation: RailroadNotation, src: string): RailroadToken[] {
  const { bodyStart, view } = railroadView(src);
  const stream = LEXERS[notation](src, bodyStart, view);
  const removed = view.holes.filter((h) => h.kind !== 'drop');
  let h = 0;
  const out: RailroadToken[] = [];
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
