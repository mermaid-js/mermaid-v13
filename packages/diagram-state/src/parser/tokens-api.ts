import { Kind } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { lex, NO_VIEW } from './lexer.ts';
import { stateView } from './view.ts';

export interface StateToken {
  /** A `StateTokenKind` or a shared `Kind`. */
  kind: number;
  /**
   * The token's text as v12's lexer gave it: CRLF as LF, comment lines and dropped `;` cut out,
   * trimmed where v12's lexer actions trimmed. Entities stay as `#name;`.
   */
  text: string;
  range: Range;
}

/**
 * The significant state tokens of `src` (comments and directives left out), for editors and
 * for the lexer-parity gate (#138).
 */
export function stateTokens(src: string): StateToken[] {
  const pre = preprocess(src);
  const view = stateView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const { tokens, viewStart, viewEnd } = lex(src, view);
  // The appended line break is not source text.
  const last = view.text.length - 1;
  const out: StateToken[] = [];
  for (let j = 0; j < tokens.length; j++) {
    const kind = tokens.kind[j] ?? Kind.EOF;
    const a = viewStart[j] ?? NO_VIEW;
    if (kind === Kind.EOF || a === NO_VIEW || kind === Kind.Comment) continue;
    const b = Math.min(viewEnd[j] ?? a, last);
    out.push({
      kind,
      text: view.text.slice(Math.min(a, b), b),
      range: { start: tokens.start[j] ?? 0, end: tokens.end[j] ?? 0 },
    });
  }
  return out;
}
