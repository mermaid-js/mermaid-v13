/**
 * The treeView parser's public surface: the parser and detection (#572), and the lexer gated
 * against v12's Langium lexer (#571).
 */
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import type { Range, SourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { lex } from './lexer.ts';
import type { BoxPass } from './box.ts';

export { LANGIUM_NAMES, T as TreeViewTokenKind, TREEVIEW_TRIVIA } from './tokens.ts';
export { ampEntities } from './text.ts';
export type { BoxError, BoxPass, BoxRewrite } from './box.ts';
export {
  parseTreeView,
  TREEVIEW_ANNOTATION_NEXT_LINE,
  TREEVIEW_NAME_READ_AS_TITLE,
  TREEVIEW_NODES_ON_ONE_LINE,
  TREEVIEW_TRAILING_BLANK,
} from './parser.ts';
export type { TreeViewParseOptions, TreeViewParseResult } from './parser.ts';
export { detectTreeView } from './detect.ts';
export type * from './ast.ts';

export interface TreeViewToken {
  /** A `TreeViewTokenKind` or a shared `Kind`. */
  kind: number;
  /**
   * The token's text as v12's lexer read it: CRLF and CR as LF, removed spans cut out, tag
   * quotes as `'`, entities decoded to `&name;` as v12's renderer did; on a line the box pass
   * rewrote, the rewritten text (its new indent, tabs as four spaces).
   */
  text: string;
  range: Range;
}

/** Where v12's text starts in `src` (after front matter), and the view of that text. */
export interface TreeViewView {
  bodyStart: number;
  view: SourceView;
}

/**
 * `src` as v12's treeView parser received it: core's preprocess (front matter, directives) and
 * the source view over the body with default options (v12 ran every shared rewrite).
 */
export function treeViewView(src: string): TreeViewView {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  return { bodyStart: pre.bodyStart, view };
}

/** What {@link treeViewTokens} gives: the tokens, the box pass, and v12's text before each. */
export interface TreeViewTokens {
  tokens: TreeViewToken[];
  /** What v12's box-drawing pass did (a rewrite's `text` is what v12's Langium lexer read). */
  box: BoxPass;
  /** The text v12's lexer read before `tokens[i]`, as the tokens' `text` gives it. */
  before(i: number): string;
}

/**
 * The tokens of `src` that v12's lexer saw, in order: significant tokens, the line breaks
 * (skipped by v12's lexer), the `%%` comments still in the text v12 lexed, and `Error` where no
 * rule matched. The spans v12 removed before lexing (comment lines, directives, and the `│`
 * lines its box pass dropped) are left out, and so is the final `EOF`. The last `Newline` is the
 * zero-width one at the end of the source, for the line break v12 appended.
 */
export function treeViewLex(src: string): TreeViewTokens {
  const { bodyStart, view } = treeViewView(src);
  const lexed = lex(src, bodyStart, view);
  const stream = lexed.tokens;
  const removed = view.holes.filter((h) => h.kind !== 'drop');
  let h = 0;
  const tokens: TreeViewToken[] = [];
  const index: number[] = [];
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
    tokens.push({ kind, text: lexed.text(j), range: { start, end } });
    index.push(j);
  }
  return { tokens, box: lexed.box, before: (i) => lexed.before(index[i] ?? stream.length - 1) };
}

/** {@link treeViewLex}'s tokens. */
export function treeViewTokens(src: string): TreeViewToken[] {
  return treeViewLex(src).tokens;
}
