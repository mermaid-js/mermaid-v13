/**
 * The cynefin parser's public surface: the lexer, gated against v12's Langium lexer (T1, #461),
 * and the parser, detection and AST (T2, #465).
 */
import { cook, Kind, sourceView } from '@mermaid-js/core/parser-kit';
import type { Range, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { lex } from './lexer.ts';

export { LANGIUM_NAMES, T as CynefinTokenKind } from './tokens.ts';
export { parseCynefin } from './parser.ts';
export type { CynefinParseOptions, CynefinParseResult } from './parser.ts';
export { detectCynefin } from './detect.ts';
export type * from './ast.ts';

export interface CynefinToken {
  /** A `CynefinTokenKind` or a shared `Kind`. */
  kind: number;
  /**
   * The token's text as v12's lexer read it: CRLF and CR as LF, removed spans cut out, tag
   * quotes as `'`, entities decoded to `&name;` as v12's renderer did.
   */
  text: string;
  range: Range;
}

export interface CynefinLexed {
  /** Core's preprocess of the source (front matter, directives, where the body starts). */
  pre: PreprocessResult;
  /** The source view: the text v12 lexed, with the spans v12 removed as holes. */
  view: SourceView;
  /** The lexer's tokens, with source ranges (trivia included, then `EOF`). */
  stream: TokenStream;
}

/**
 * Lex a whole source as the parser does: core's {@link preprocess}, the {@link sourceView} of
 * the body, then the cynefin lexer over it. The one stream setup the parser (T2), the tokens
 * below and the gates share.
 */
export function lexCynefin(src: string): CynefinLexed {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  return { pre, view, stream: lex(src, pre.bodyStart, view) };
}

/**
 * The tokens of `src` that v12's lexer saw, in order: significant tokens, the hidden comments,
 * directives and YAML blocks still in the text v12 lexed, and `Error` where no rule matched.
 * The spans v12 removed before lexing (comment lines, directives) are left out, and so is the
 * final `EOF`. The last `Newline` is the zero-width one at the end of the source, for the line
 * break v12 appended.
 */
export function cynefinTokens(src: string): CynefinToken[] {
  const { view, stream } = lexCynefin(src);
  const removed = view.holes.filter((h) => h.kind !== 'drop');
  let h = 0;
  const out: CynefinToken[] = [];
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

/**
 * The tokens of `text` lexed verbatim, as Chevrotain lexes a text handed to it directly: no
 * preprocessing, so comment lines and directives are hidden tokens; no line break appended and
 * no leading blanks trimmed. Each token's text is its source slice. For the gate over v12's
 * spec strings, which reached v12's parser raw (#461).
 */
export function cynefinVerbatimTokens(text: string): CynefinToken[] {
  const view: SourceView = {
    mask: undefined,
    holes: [],
    text,
    runs: undefined,
    braceNewline: false,
  };
  const stream = lex(text, 0, view, { verbatim: true });
  const out: CynefinToken[] = [];
  for (let j = 0; j < stream.length; j++) {
    const kind = stream.kind[j] ?? Kind.EOF;
    if (kind === Kind.EOF) continue;
    const start = stream.start[j] ?? 0;
    const end = stream.end[j] ?? 0;
    out.push({ kind, text: text.slice(start, end), range: { start, end } });
  }
  return out;
}
