/**
 * The token list a langium-family diagram's `xxxTokens()` gives the language service and the
 * lexer-parity specs (R-LANG-7): what v12's lexer saw, as each `parser/index.ts` used to compute
 * it by hand.
 */
import { cook, Kind } from '@mermaid-js/core/parser-kit';
import type { Range, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';

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
 * The tokens of `stream`, lexed from `src` through `view`, that v12's lexer saw, in order:
 * significant tokens, the hidden comments and directives still in the text v12 lexed, and
 * `Error` where no rule matched. A comment or directive token that is exactly a span v12 removed
 * before lexing is left out, and so is the final `EOF`.
 */
export function seenTokens(src: string, stream: TokenStream, view: SourceView): SeenToken[] {
  const removed = view.holes.filter((h) => h.kind !== 'drop');
  let h = 0;
  const out: SeenToken[] = [];
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
