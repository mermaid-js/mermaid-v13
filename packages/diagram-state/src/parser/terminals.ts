/**
 * The parser's view of the lexer's tokens: the jison terminals only, each with its image as
 * v12's lexer gave it (entities read as v12's renderer read them) and the range it covers in
 * the source, widened over the text jison consumed without a terminal (the `state` keyword,
 * quotes, `<<fork>>`-style markers, `end note`, …) and over a `;` v12 dropped.
 */
import { Kind, kindSet } from '@mermaid-js/core/parser-kit';
import type { Probe, TokenView } from '@mermaid-js/core/parser-kit';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { ampEntities } from '@mermaid-js/core/parser-kit/support';
import { lex, NO_VIEW } from './lexer.ts';
import { T } from './tokens.ts';
import { stateView } from './view.ts';

/** Kinds jison consumed without a terminal: they only widen the ranges of their neighbours. */
const NO_TERMINAL = kindSet(
  T.State,
  T.Quote,
  T.Marker,
  T.EndNote,
  T.AccDescrOpen,
  T.AccDescrClose,
  T.ScaleWidth
);
/** Of those, the kinds that belong to the terminal after them. */
const LEADING = kindSet(T.State, T.AccDescrOpen);

/** Parser tokens: the terminals, each with its own range and the range it covers. */
export interface Tokens extends TokenView {
  /** Range start including leading text jison consumed without a terminal. */
  readonly from: Uint32Array;
  /** Range end including trailing text jison consumed without a terminal. */
  readonly to: Uint32Array;
  /** Images as v12's lexer gave them (see `stateTokens`). */
  readonly text: string[];
}

export function terminals(
  src: string,
  pre: PreprocessResult,
  probe?: Probe
): { tokens: Tokens; all: ReturnType<typeof lex>['tokens'] } {
  const view = stateView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const { tokens, viewStart, viewEnd } = lex(src, view, probe);
  const last = view.text.length - 1;
  const kind: number[] = [];
  const start: number[] = [];
  const end: number[] = [];
  const from: number[] = [];
  const to: number[] = [];
  const text: string[] = [];
  let lead = -1;
  let prevKind: number = Kind.EOF;
  for (let j = 0; j < tokens.length; j++) {
    const k = tokens.kind[j] ?? Kind.EOF;
    const a = viewStart[j] ?? NO_VIEW;
    if (k === Kind.EOF || a === NO_VIEW || k === Kind.Comment || k === Kind.Directive) continue;
    const s = tokens.start[j] ?? 0;
    const e = tokens.end[j] ?? 0;
    if (NO_TERMINAL[k] === 1) {
      const trailing =
        LEADING[k] !== 1 &&
        !(k === T.Quote && prevKind !== T.StateDescr && prevKind !== T.NoteText);
      if (trailing && to.length > 0) to[to.length - 1] = Math.max(to[to.length - 1] ?? 0, e);
      else if (lead < 0) lead = s;
      prevKind = k;
      continue;
    }
    const b = Math.min(viewEnd[j] ?? a, last);
    kind.push(k);
    start.push(s);
    end.push(e);
    from.push(lead >= 0 ? lead : s);
    // A `;` right after a token is one v12 dropped: it belongs to the statement.
    to.push(view.drops.has(e) ? e + 1 : e);
    text.push(ampEntities(view.text.slice(Math.min(a, b), b)));
    lead = -1;
    prevKind = k;
  }
  return {
    tokens: {
      kind: Uint16Array.from(kind),
      start: Uint32Array.from(start),
      end: Uint32Array.from(end),
      from: Uint32Array.from(from),
      to: Uint32Array.from(to),
      text,
      length: kind.length,
    },
    all: tokens,
  };
}
