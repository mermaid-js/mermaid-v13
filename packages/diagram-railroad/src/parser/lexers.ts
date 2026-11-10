/** The four railroad lexers (#608), each gated against its notation's v12 Langium lexer. */
import type { SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { lexAbnf } from './abnf/lexer.ts';
import { lexEbnf } from './ebnf/lexer.ts';
import { lexIr } from './ir/lexer.ts';
import { lexPeg } from './peg/lexer.ts';
import type { RailroadNotation } from './tokens.ts';

/** Each notation's lexer: `lex(src, from, view)` over the body `src[from…]`. */
export const LEXERS: Readonly<
  Record<RailroadNotation, (src: string, from: number, view: SourceView) => TokenStream>
> = {
  railroad: lexIr,
  railroadEbnf: lexEbnf,
  railroadAbnf: lexAbnf,
  railroadPeg: lexPeg,
};
