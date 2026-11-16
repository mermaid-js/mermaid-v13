/**
 * The token list a langium-family diagram's `xxxTokens()` gives the language service and the
 * lexer-parity specs (R-LANG-7): what v12's lexer saw, as each `parser/index.ts` used to compute
 * it by hand.
 */
import { cook, Kind, sourceView } from '@mermaid-js/core/parser-kit';
import type { Range, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';

export interface SeenToken {
  /** The diagram's own token kind, or a shared `Kind`. */
  kind: number;
  /**
   * The token's text as v12's lexer read it: CRLF and CR as LF, removed spans cut out, tag
   * quotes as `'`, entities decoded to `&name;` as v12's renderer did.
   */
  text: string;
  range: Range;
}

/**
 * The indices into `stream`, lexed through `view`, of the tokens v12's lexer saw, in order:
 * significant tokens, the hidden comments and directives still in the text v12 lexed, and
 * `Error` where no rule matched. A comment or directive token that is exactly a span v12 removed
 * before lexing is left out, and so is the final `EOF`.
 */
export function seenIndices(stream: TokenStream, view: SourceView): number[] {
  const removed = view.holes.filter((h) => h.kind !== 'drop');
  let h = 0;
  const out: number[] = [];
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
    out.push(j);
  }
  return out;
}

/** The tokens at {@link seenIndices}, each with its text `cook()`ed from `src`. */
export function seenTokens(src: string, stream: TokenStream, view: SourceView): SeenToken[] {
  return seenIndices(stream, view).map((j) => {
    const start = stream.start[j] ?? 0;
    const end = stream.end[j] ?? 0;
    return {
      kind: stream.kind[j] ?? Kind.EOF,
      text: cook(src, start, end, view),
      range: { start, end },
    };
  });
}

/** A diagram's lexer over `src[from…]`, through the v12 source view. */
export type ViewLexer = (src: string, from: number, view: SourceView) => TokenStream;

/**
 * {@link seenTokens} of `src` for a diagram whose v12 text is core's preprocessed body with only
 * the directives cut out: `lex` runs from the body start over the default source view.
 */
export function bodyTokens(src: string, lex: ViewLexer): SeenToken[] {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  return seenTokens(src, lex(src, pre.bodyStart, view), view);
}
