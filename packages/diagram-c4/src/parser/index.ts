/**
 * The C4 parser's public surface (so far): the lexer gated against v12's jison lexer.
 */
import { cook, Kind, sourceView } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { lex } from './lexer.ts';

export { JISON_NAMES, T as C4TokenKind } from './tokens.ts';

export interface C4Token {
  /** A `C4TokenKind` or a shared `Kind`. */
  kind: number;
  /**
   * The token's text as v12's parser read it: its source range with entities decoded, CRLF as
   * LF and removed spans cut ({@link cook}).
   */
  text: string;
  range: Range;
}

/**
 * The significant C4 tokens of `src` (trivia left out: comments, directives, skipped blanks
 * and the final `Kind.EOF`), for editors and for the lexer-parity gate.
 */
export function c4Tokens(src: string): C4Token[] {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const tokens = lex(src, pre.bodyStart, view);
  const out: C4Token[] = [];
  for (let j = 0; j < tokens.length; j++) {
    const kind = tokens.kind[j] ?? Kind.EOF;
    if (
      kind === Kind.Comment ||
      kind === Kind.Directive ||
      kind === Kind.Space ||
      kind === Kind.EOF
    )
      continue;
    const start = tokens.start[j] ?? 0;
    const end = tokens.end[j] ?? 0;
    out.push({ kind, text: cook(src, start, end, view), range: { start, end } });
  }
  return out;
}
