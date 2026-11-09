/**
 * The event modeling parser's public surface: for now the lexer gated against v12's Langium
 * lexer (#600). T2 (#602) adds the parser, the model and detection.
 */
import { cook, Kind, sourceView } from '@mermaid-js/core/parser-kit';
import type { Range, SourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { lex } from './lexer.ts';

export { EVENTMODELING_TRIVIA, T as EventModelingTokenKind, LANGIUM_NAMES } from './tokens.ts';

export interface EventModelingToken {
  /** An `EventModelingTokenKind` or a shared `Kind`. */
  kind: number;
  /**
   * The token's text as v12's lexer read it: CRLF and CR as LF, removed spans cut out, tag
   * quotes as `'`, entities decoded to `&name;` as v12's renderer did.
   */
  text: string;
  range: Range;
}

/** Where v12's text starts in `src` (after front matter), and the view of that text. */
export interface EventModelingView {
  bodyStart: number;
  view: SourceView;
}

/**
 * `src` as v12's event modeling lexer read it: core's preprocess (front matter, directives) and
 * the source view over the body with default options (v12 ran every shared rewrite), except
 * that the `%%` comment lines stay. v12's event modeling db set `preserveCommentsWhenParsing`, so
 * its parser read `withComments` (directives removed, comment lines kept, nothing trimmed), and
 * its lexer took them as hidden EM_SINGLE_LINE_COMMENT tokens.
 *
 * Core's view has no option to keep them, so this takes a second view of a copy of `src` in
 * which the first `%` of each comment line is replaced (a same-length edit, which no other
 * rewrite reads: tag quotes and dropped semicolons come out as v12's), and reads its text back
 * from `src` through its runs.
 */
export function eventModelingView(src: string): EventModelingView {
  const pre = preprocess(src);
  const directives = pre.directives.map((d) => d.range);
  const first = sourceView(src, pre.bodyStart, directives);
  if (!first.holes.some((h) => h.kind === 'comment')) {
    return { bodyStart: pre.bodyStart, view: first };
  }
  // A comment span may start inside a directive v12 removed first (its `^\s*` then matched
  // the line break the directive left): its `%%` is after the directive.
  const cuts = [...directives].sort((a, b) => a.start - b.start);
  let d = 0;
  let copy = '';
  let at = 0;
  for (const h of first.holes) {
    if (h.kind !== 'comment') continue;
    let from = h.start;
    while (d < cuts.length && (cuts[d]?.end ?? 0) <= from) d++;
    for (let c = cuts[d]; c && c.start <= from; c = cuts[++d]) from = Math.max(from, c.end);
    const k = src.indexOf('%', from);
    copy += src.slice(at, k) + '_';
    at = k + 1;
  }
  const view = sourceView(copy + src.slice(at), pre.bodyStart, directives);
  return { bodyStart: pre.bodyStart, view: { ...view, text: textOf(src, view) } };
}

/** `src` without the view's removed spans: its runs read from `src`. */
function textOf(src: string, view: SourceView): string {
  const { runs } = view;
  if (!runs) return src;
  const parts: string[] = [];
  for (let k = 0; k < runs.length; k += 2) {
    const from = runs[k + 1] ?? 0;
    const length = (runs[k + 2] ?? view.text.length) - (runs[k] ?? 0);
    parts.push(src.slice(from, from + length));
  }
  return parts.join('');
}

/**
 * The tokens of `src` that v12's lexer saw, in order: significant tokens, the hidden comments,
 * directives and YAML blocks in the text v12 lexed (`%%` comment lines included), and `Error` where no rule matched
 * (one token over the skipped characters; lexing goes on). Whitespace writes no token (v12
 * skipped it). The spans v12 removed before lexing (comment lines, directives) are left out,
 * and so is the final `EOF`.
 */
export function eventModelingTokens(src: string): EventModelingToken[] {
  const { bodyStart, view } = eventModelingView(src);
  const stream = lex(src, bodyStart, view);
  const removed = view.holes.filter((h) => h.kind !== 'drop');
  let h = 0;
  const out: EventModelingToken[] = [];
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
