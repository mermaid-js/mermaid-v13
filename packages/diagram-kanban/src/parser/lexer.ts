/**
 * Kanban lexer: the shared indentation-tree lexer (`lexTree`), which mirrors the start
 * conditions and rule order of v12's `mindmap.jison` (parser-method §1) and of the shape data
 * `kanban.jison`, a fork of it, adds, with kanban's keyword and token kinds. The kinds for the
 * text jison matches without returning a token (`:::`, `::icon(`, `)` after an icon, the quotes
 * of a string, a line break after a bare `:::`, the `}` closing shape data) have no jison name.
 *
 * Shape data: `@{` is tried first in INITIAL and returns a `SHAPE_DATA` whose image its action
 * cleared; inside, `[^}^"]+` (line breaks included) and each `"` are `SHAPE_DATA` tokens, and
 * a quoted run's text is one more. `Lexed.text` applies both actions' rewrites of the image.
 *
 * jison throws on a `{` or `}` outside a shape, an `@` that starts no `@{`, a `^` in shape
 * data, a lone backtick or quote in a markdown string and a U+2028 or U+2029 after `:::`; each
 * is a one-character `Kind.Error` and lexing goes on.
 */
import { cook } from '@mermaid-js/core/parser-kit';
import type { Probe, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { lexTree, treeKinds } from '@mermaid-js/shared/parser/tree';
import { T } from './tokens.ts';

/** Kanban's kinds, as the shared lexer and parser read them. */
export const KINDS = /* @__PURE__ */ treeKinds({ ...T, Keyword: T.Kanban });

/** A lex: the token stream, and the text of each token as v12's parser read it. */
export interface Lexed {
  /** Ends in `Kind.EOF`; trivia (comments, directives, a dropped `;`) is in it. */
  readonly tokens: TokenStream;
  /**
   * The text of token `j`: its source range with entities, CRLF and removed spans applied
   * ({@link cook}), and the rewrites of `kanban.jison`'s actions. `@{` reads `''`. In a quoted
   * run of shape data each `\n\s*` reads `<br/>`; a run left open at the end of the text took
   * the line break v12 appended, so it reads one more. Read token text only through this.
   */
  text(j: number): string;
}

/**
 * Lex the kanban body `src[from…]`. `view` comes from {@link sourceView}. With a `probe`, the
 * start condition at the probe's offset is recorded as its mode.
 */
export function lex(src: string, from: number, view: SourceView, probe?: Probe): Lexed {
  const { tokens, openRun: open } = lexTree(src, from, view, KINDS, 'kanban', probe);
  return {
    tokens,
    text(j) {
      const kind = tokens.kind[j];
      if (kind === T.ShapeDataStart) return '';
      const start = tokens.start[j] ?? 0;
      const text = cook(src, start, tokens.end[j] ?? 0, view);
      if (kind !== T.ShapeDataStr) return text;
      // `<shapeDataStr>[^\"]+`'s action.
      return (start === open ? text + '\n' : text).replace(/\n\s*/g, '<br/>');
    },
  };
}
