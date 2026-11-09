/**
 * Treemap token kinds. They mirror the terminals of v12's Langium `treemap.langium` (which
 * does not import `common.langium`), so the lexer can be checked token by token against its
 * Chevrotain lexer (parser-method §1, D213). Kinds are plain numbers (TS enums are banned).
 */
import { FIRST_DIAGRAM_KIND, Kind, kindSet } from '@mermaid-js/core/parser-kit';

// cspell:words treemapx

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** `accDescr: …` to `%%` or the line end, or `accDescr {…}`, with the blanks before it. */
  AccDescr: F,
  /** `accTitle: …` to `%%` or the line end, with the blanks before it. */
  AccTitle: F + 1,
  /** `title …` to `%%` or the line end (or `title` alone), with the blanks before it. */
  Title: F + 2,
  /** `treemap-beta` or `treemap`, with no boundary (`treemapx` is the keyword, then `x`). */
  TreemapKeyword: F + 3,
  /**
   * `classDef`, blanks or line breaks, a name of two or more `[A-Za-z0-9_]` characters, then
   * optionally blanks or line breaks and the rest of that line up to `;`, and the `;`. With no
   * styles on its line the blanks reach into the next line and take it.
   */
  ClassDef: F + 4,
  /** `:::`. */
  StyleSeparator: F + 5,
  /** `:`. */
  Separator: F + 6,
  /** `,`. */
  Comma: F + 7,
  /** A run of blanks (`[ \t]+`), anywhere: v12's hidden WS never matches. */
  Indentation: F + 8,
  /** A name: `[A-Za-z_][A-Za-z0-9_]*`. */
  Id: F + 9,
  /** `[0-9_.,]+` (it never starts with `_` or `,`: ID and COMMA take those first). */
  Number: F + 10,
  /** `"…"` or `'…'`: no escapes, may span lines. */
  String: F + 11,
} as const;

/**
 * Trivia for the treemap parser: the shared trivia kinds. Line breaks (`Kind.Newline`) are
 * not trivia here, though v12 skipped them: the parser reads them for its diagnostics (D401).
 * In-text `%%` comments are `Kind.Comment`, like the comment lines v12 removed before lexing.
 */
export const TREEMAP_TRIVIA = /* @__PURE__ */ kindSet(Kind.Comment, Kind.Directive, Kind.Space);

/**
 * The Chevrotain token type each kind stands for in `@mermaid-js/parser@2.0.1` (dev and test
 * use: the lexer-parity gate compares token streams by these names). Never shown to users
 * (R-ERR-5). `NL` is a skipped Chevrotain token (in neither of its lists); `LEXICAL_ERROR`
 * marks where Chevrotain's lexer reports an error.
 */
export const LANGIUM_NAMES: Readonly<Record<number, string>> = {
  [T.AccDescr]: 'ACC_DESCR',
  [T.AccTitle]: 'ACC_TITLE',
  [T.Title]: 'TITLE',
  [T.TreemapKeyword]: 'TREEMAP_KEYWORD',
  [T.ClassDef]: 'CLASS_DEF',
  [T.StyleSeparator]: 'STYLE_SEPARATOR',
  [T.Separator]: 'SEPARATOR',
  [T.Comma]: 'COMMA',
  [T.Indentation]: 'INDENTATION',
  [T.Id]: 'ID2',
  [T.Number]: 'NUMBER2',
  [T.String]: 'STRING2',
  [Kind.Newline]: 'NL',
  [Kind.Comment]: 'ML_COMMENT',
  [Kind.Error]: 'LEXICAL_ERROR',
};
