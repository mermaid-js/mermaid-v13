import { Kind, kindSet } from '@mermaid-js/core/parser-kit';
import type { KindSet } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex, NO_VIEW } from './lexer.ts';
import { stateView } from './view.ts';

/**
 * A token of this diagram: its `kind` is a `StateTokenKind` or a shared `Kind`. Its `text` is
 * the token's text as v12's lexer gave it: CRLF as LF, comment lines and dropped `;` cut out,
 * trimmed where v12's lexer actions trimmed. Entities stay as `#name;`.
 */
export type StateToken = SeenToken;

/** A directive token has no view offsets, so only comments need leaving out by kind. */
const COMMENT: KindSet = /* @__PURE__ */ kindSet(Kind.Comment);

/**
 * The significant state tokens of `src` (comments, directives, the tokens outside the text v12's
 * lexer saw and the final `Kind.EOF` left out), for editors and for the lexer-parity gate (#138).
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
  const startOf = (j: number): number => viewStart[j] ?? NO_VIEW;
  return keptTokens(
    tokens,
    COMMENT,
    (j) => {
      const a = startOf(j);
      const b = Math.min(viewEnd[j] ?? a, last);
      return view.text.slice(Math.min(a, b), b);
    },
    { keep: (j) => startOf(j) !== NO_VIEW }
  );
}
