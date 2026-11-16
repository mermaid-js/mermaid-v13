import { Kind } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { tokenValue, v12Text } from '@mermaid-js/shared/parser/v12-text';
import { lex } from './lexer.ts';
import type { ClassLex } from './lexer.ts';

export { tokenValue };

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
  return lex(src, v12Text(src, pre.bodyStart, directives, true), onRule);
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
