/**
 * Mindmap lexer: the shared indentation-tree lexer (`lexTree`), which mirrors the start
 * conditions and rule order of v12's `mindmap.jison` (parser-method §1), with mindmap's keyword
 * and token kinds. The kinds for the text jison matches without returning a token (`:::`,
 * `::icon(`, `)` after an icon, the quotes of a string, a line break after a bare `:::`) have
 * no jison name. jison throws on a `{` or `}` outside a shape, a lone backtick or quote in a
 * markdown string and a U+2028 or U+2029 after `:::`; each is a one-character `Kind.Error` and
 * lexing goes on.
 */
import type { Probe, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { lexTree, treeKinds } from '@mermaid-js/shared/parser/tree';
import { T } from './tokens.ts';

/** Mindmap's kinds, as the shared lexer and parser read them. */
export const KINDS = /* @__PURE__ */ treeKinds({ ...T, Keyword: T.Mindmap });

/**
 * Lex the mindmap body `src[from…]`. `view` comes from {@link sourceView}. The stream ends in
 * `Kind.EOF`; trivia (comments, directives, a dropped `;`) is in it. With a `probe`, the start
 * condition at the probe's offset is recorded as its mode.
 */
export function lex(src: string, from: number, view: SourceView, probe?: Probe): TokenStream {
  return lexTree(src, from, view, KINDS, 'mindmap', probe).tokens;
}
