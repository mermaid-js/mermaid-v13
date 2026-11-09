/**
 * TreeView token kinds. They mirror the terminals of v12's Langium `treeView.langium` and its
 * one keyword, so the lexer can be checked token by token against its Chevrotain lexer
 * (parser-method §1, D213, D220). Kinds are plain numbers (TS enums are banned).
 */
import { FIRST_DIAGRAM_KIND, Kind, kindSet } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /**
   * `treeView-beta` followed by `%%`, a `\s` character or the end. Its longer alternative is
   * the bare name, so `treeView-beta   ` (trailing blanks) is a bare name.
   */
  TreeViewBeta: F,
  /** `accDescr: …` to `%%` or the line end, or `accDescr {…}`, with the blanks before it. */
  AccDescr: F + 1,
  /** `accTitle: …` to `%%` or the line end, with the blanks before it. */
  AccTitle: F + 2,
  /** `title …` to `%%` or the line end (or `title` alone), with the blanks before it. */
  Title: F + 3,
  /** Blanks, `:::`, blanks and a class name (`[A-Za-z_][\w-]*`). */
  ClassAnnotation: F + 4,
  /** Blanks and `icon(…)`: `[\w-]*`, optionally `:` and `[\w-]+`, then `)`. */
  IconAnnotation: F + 5,
  /** Blanks, `##` and the rest of the line. */
  DescAnnotation: F + 6,
  /** A run of blanks (`[ \t]+`), anywhere: v12's skipped WS never matches. */
  Indentation: F + 7,
  /** `"…"` or `'…'`: no escapes, may span lines. */
  QuotedName: F + 8,
  /**
   * A name: a character that is not a blank, a line break or a quote (and no `:::`, `icon(`
   * or `##` there), then everything up to the line end or a blank run before an annotation.
   */
  BareName: F + 9,
} as const;

/**
 * Trivia for the treeView parser: the shared trivia kinds. Line breaks (`Kind.Newline`) are not
 * trivia here, though v12 skipped them: the parser reads them for its diagnostics. In-text `%%`
 * comments are `Kind.Comment`, like the comment lines v12 removed before lexing.
 */
export const TREEVIEW_TRIVIA = /* @__PURE__ */ kindSet(Kind.Comment, Kind.Directive, Kind.Space);

/**
 * The Chevrotain token type each kind stands for in `@mermaid-js/parser@2.0.1` (dev and test
 * use: the lexer-parity gate compares token streams by these names). Never shown to users
 * (R-ERR-5). `NL` is a skipped Chevrotain token (in neither of its lists); `LEXICAL_ERROR`
 * marks where Chevrotain's lexer reports an error.
 */
export const LANGIUM_NAMES: Readonly<Record<number, string>> = {
  [T.TreeViewBeta]: 'treeView-beta',
  [T.AccDescr]: 'ACC_DESCR',
  [T.AccTitle]: 'ACC_TITLE',
  [T.Title]: 'TITLE',
  [T.ClassAnnotation]: 'CLASS_ANNOTATION',
  [T.IconAnnotation]: 'ICON_ANNOTATION',
  [T.DescAnnotation]: 'DESC_ANNOTATION',
  [T.Indentation]: 'INDENTATION',
  [T.QuotedName]: 'QUOTED_NAME',
  [T.BareName]: 'BARE_NAME',
  [Kind.Newline]: 'NL',
  [Kind.Comment]: 'ML_COMMENT',
  [Kind.Error]: 'LEXICAL_ERROR',
};
