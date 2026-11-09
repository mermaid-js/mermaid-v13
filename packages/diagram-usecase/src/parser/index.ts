/** The usecase parser's public surface so far: the lexer gated against v12's Chevrotain lexer (#562). */
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import type { Range, SourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { lex } from './lexer.ts';

export { lex, lexText } from './lexer.ts';
export type { Lexed, LexText } from './lexer.ts';
export {
  ANY_CASE,
  CHEVROTAIN_NAMES,
  KEYWORDS,
  LABEL_TEXT,
  T as UsecaseTokenKind,
  WORD,
} from './tokens.ts';

export interface UsecaseToken {
  /** A `UsecaseTokenKind` or a shared `Kind`. */
  kind: number;
  /**
   * The token's text as v12's lexer read it, with entity placeholders decoded to `&name;` /
   * `&#123;` as v12's renderer did: CRLF and CR as LF, removed spans cut out, tag quotes as
   * `'`. The line break v12 appended is not part of any text.
   */
  text: string;
  range: Range;
  /** Where the token starts in the text v12 lexed (`lexText(…).text`). */
  at: number;
}

/** Where v12's text starts in `src` (after front matter), and the view of that text. */
export interface UsecaseView {
  bodyStart: number;
  view: SourceView;
}

/**
 * `src` as v12's usecase lexer read it: core's preprocess (front matter, directives) and the
 * source view over the body with default options (v12 ran every shared rewrite).
 */
export function usecaseView(src: string): UsecaseView {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  return { bodyStart: pre.bodyStart, view };
}

/** `encodeEntities`'s placeholders back to `&#`, `&` and `;`, as v12's `decodeEntities`. */
export function decodePlaceholders(text: string): string {
  if (!text.includes('ﬂ') && !text.includes('¶')) return text;
  return text.replace(/ﬂ°°/g, '&#').replace(/ﬂ°/g, '&').replace(/¶ß/g, ';');
}

/**
 * The tokens of `src` that v12's lexer saw, in order: the tokens, `COMMENT` (a `%%` line v12
 * left) as `Kind.Comment`, and `Kind.Error` where no rule matched (one token over the skipped
 * characters, then lexing goes on). The spans v12 removed before lexing (comment lines,
 * directives) are left out, and so is the final `EOF`. The last `Newline` is the zero-width
 * one at the end of the source, for the line break v12 appended.
 */
export function usecaseTokens(src: string): UsecaseToken[] {
  const { bodyStart, view } = usecaseView(src);
  const { tokens, input, at, to } = lex(src, bodyStart, view);
  const last = input.text.length - 1;
  const out: UsecaseToken[] = [];
  for (let j = 0; j < tokens.length; j++) {
    const kind = tokens.kind[j] ?? Kind.EOF;
    const s = at[j] ?? -1;
    // EOF, and the spans v12 removed before lexing: its lexer never saw them.
    if (kind === Kind.EOF || s < 0) continue;
    const e = Math.min(to[j] ?? s, last);
    out.push({
      kind,
      text: decodePlaceholders(input.text.slice(s, Math.max(s, e))),
      range: { start: tokens.start[j] ?? 0, end: tokens.end[j] ?? 0 },
      at: s,
    });
  }
  return out;
}
