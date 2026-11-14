import { Kind } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { decodePlaceholders } from '@mermaid-js/core/parser-kit/support';
import { lex } from './lexer.ts';
import type { ClassLex } from './lexer.ts';
import { v12Text } from './v12-text.ts';

export interface ClassToken {
  /** A `T` kind or a shared `Kind`. */
  kind: number;
  /** The token's text as v12's parser read it (CRLF as LF, entities as `&name;`). */
  text: string;
  range: Range;
}

/**
 * Lex a whole class-diagram source (front matter and directives located first). `onRule` is
 * told the jison rule number of every rule that matches (dev use: the rule-coverage gate).
 */
export function lexClass(src: string, onRule?: (rule: number) => void): ClassLex {
  const pre = preprocess(src);
  const directives = pre.directives.map((d) => d.range);
  return lex(src, v12Text(src, pre.bodyStart, directives), onRule);
}

/**
 * The text of token `i` as v12's parser read it (less the `\n` v12 appended), or the source
 * text of a trivia token.
 */
export function tokenValue(l: ClassLex, i: number): string {
  const s = l.textStart[i] ?? -1;
  if (s < 0) return l.tokens.source.slice(l.tokens.start[i] ?? 0, l.tokens.end[i] ?? 0);
  return decodePlaceholders(l.v12.text.slice(s, Math.min(l.textEnd[i] ?? s, l.v12.length)));
}

/**
 * The significant class-diagram tokens of `src` (comments and directives left out), for
 * editors and for the lexer-parity gate.
 */
export function classTokens(src: string): ClassToken[] {
  const l = lexClass(src);
  const { kind, start, end, length } = l.tokens;
  const out: ClassToken[] = [];
  for (let j = 0; j < length - 1; j++) {
    const k = kind[j] ?? Kind.EOF;
    if (k === Kind.Comment || k === Kind.Directive) continue;
    out.push({
      kind: k,
      text: tokenValue(l, j),
      range: { start: start[j] ?? 0, end: end[j] ?? 0 },
    });
  }
  return out;
}
