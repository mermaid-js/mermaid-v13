// cspell:words CLASSDEF CLASSENTITY STYLEOPTS STYLECLASS LINKSTYLE DSTART DEND
/**
 * Block token kinds. They mirror the terminals of v12's `block.jison`, so the lexer can be
 * checked token by token against it (parser-method §1). Kinds are plain numbers (TS enums are
 * banned).
 */
import { FIRST_DIAGRAM_KIND, Kind } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** `block-beta` or `block` (each then `\b`): the header, or an anonymous composite. */
  Block: F,
  /** `block:` (no `\b`): a composite with an id. */
  IdBlock: F + 1,
  /**
   * `columns\s+auto\b` or `columns\s+\d+`. Its text is the digits (`03` stays `03`), or `-1`
   * for `auto`, as jison's actions rewrote it.
   */
  Columns: F + 2,
  /** `space:\d+` (text: the digits) or `space\b` (text: `1`). */
  SpaceBlock: F + 3,
  /** `default\b` (no grammar rule takes it). */
  Default: F + 4,
  /** `linkStyle\b` (no grammar rule takes it). */
  LinkStyle: F + 5,
  /** `interpolate\b` (no grammar rule takes it). */
  Interpolate: F + 6,
  /** `classDef\s+` (its blanks, line breaks too, included). */
  ClassDef: F + 7,
  /** `DEFAULT\s+` after `classDef` (blanks included). */
  DefaultClassDefId: F + 8,
  /** `\w+\s+` after `classDef` (blanks included). */
  ClassDefId: F + 9,
  /** `[^\n]*` after a class definition's id: the rest of the line, maybe empty. */
  ClassDefStyleOpts: F + 10,
  /** `class\s+` (blanks included). */
  Class: F + 11,
  /** `\w+(,\s*\w+)*` after `class` (blanks after a comma, line breaks too, included). */
  ClassEntityIds: F + 12,
  /** `[^\n]*` after the ids of `class`: the rest of the line, maybe empty. */
  StyleClass: F + 13,
  /** `style\s+` (blanks included). */
  Style: F + 14,
  /** `\w+(,\s*\w+)*` after `style`. */
  StyleEntityIds: F + 15,
  /** `[^\n]*` after the ids of `style`: the rest of the line, maybe empty. */
  StyleDefinitionData: F + 16,
  /** `accTitle\s*:\s*` (no grammar rule takes it). */
  AccTitle: F + 17,
  /** `[^\n]*` after `accTitle:`. */
  AccTitleValue: F + 18,
  /** `accDescr\s*:\s*` (no grammar rule takes it). */
  AccDescr: F + 19,
  /** `[^\n]*` after `accDescr:`. */
  AccDescrValue: F + 20,
  /** `accDescr\s*{\s*` (jison returns no token for it). */
  AccDescrMultiline: F + 21,
  /** `[^}]*` after `accDescr {`, line breaks included, maybe empty. */
  AccDescrMultilineValue: F + 22,
  /** The `}` closing `accDescr {` (jison returns no token for it). */
  AccDescrMultilineEnd: F + 23,
  /** `end\b\s*` (the blanks after it, line breaks too, included). */
  End: F + 24,
  /**
   * A shape opener: `-)`, `(-`, `))`, `)`, `(((`, `((`, `{{`, `{`, `>`, `([`, `(`, `[[`,
   * `[|`, `[(`, `[\`, `[/` or `[`, tried in that order (so `)))` opens as `))`).
   */
  NodeDStart: F + 25,
  /**
   * A shape closer: `(((`, `)))`, `))`, `}}`, `}`, `(-`, `-)`, `((`, `]]`, `(`, `])`, `\]`,
   * `/]`, `)]`, `)`, `]>` or `]`, tried in that order.
   */
  NodeDEnd: F + 26,
  /** `<[`, opening a block arrow. */
  BlockArrowStart: F + 27,
  /** `]>\s*(` in a block arrow, opening its directions (jison returns no token for it). */
  ArrowDirStart: F + 28,
  /**
   * `,?\s*(right|left|x|y|up|down)\s*` (no `\b`). Its text drops a leading comma and the
   * blanks right after it only: other blanks stay.
   */
  Dir: F + 29,
  /** `)\s*` closing a block arrow's directions. Its text is `]>`, as jison's action set it. */
  BlockArrowEnd: F + 30,
  /** `[^\(\[\n\-\)\{\}\s\<\>:=]+`: an id (`;`, `,`, `.`, `|`, `%`, `#`, `~` and quotes included). */
  NodeId: F + 31,
  /** jison's `<<EOF>>` `EOF`: zero-width, at the end of the text, in INITIAL only. */
  Eof: F + 32,
  /** A quote opening a string (jison returns no token for it). */
  StringStart: F + 33,
  /** `[^"]*` in a string, line breaks included; empty only at the end of the text. */
  Str: F + 34,
  /** A quote closing a string (jison returns no token for it). */
  StringEnd: F + 35,
  /** A quote then a backtick, opening a markdown string (jison returns no token for it). */
  MdStringStart: F + 36,
  /** Text in a markdown string (no backtick or quote), line breaks included. */
  MdStr: F + 37,
  /** A backtick then a quote, closing a markdown string (jison returns no token for it). */
  MdStringEnd: F + 38,
  /**
   * An edge: `[xo<]?--+[-xo>]`, `[xo<]?==+[=xo>]` or `[xo<]?-?\.+-[xo>]?`, with the blanks
   * after it (and, after a label, before it), line breaks included.
   */
  Link: F + 39,
  /** `[xo<]?--`, `[xo<]?==` or `[xo<]?-.` and the blanks after it: an edge with a label. */
  StartLink: F + 40,
  /** The quote opening the label of a {@link StartLink}: jison returns it, image `"`. */
  LinkLabel: F + 41,
  /** `:\d+`: a span. Its text is the digits. */
  Size: F + 42,
} as const;

/**
 * The v12 `block.jison` terminal each kind stands for (dev and test use: the lexer-parity gate
 * compares token streams by these names). Never shown to users (R-ERR-5). Kinds without an
 * entry have no jison token; `LEXICAL_ERROR` marks where jison threw. Blanks and line breaks
 * are no token: `[\s]+` skips them, so block's `NL` never fires.
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  [T.Block]: 'BLOCK_DIAGRAM_KEY',
  [T.IdBlock]: 'id-block',
  [T.Columns]: 'COLUMNS',
  [T.SpaceBlock]: 'SPACE_BLOCK',
  [T.Default]: 'DEFAULT',
  [T.LinkStyle]: 'LINKSTYLE',
  [T.Interpolate]: 'INTERPOLATE',
  [T.ClassDef]: 'classDef',
  [T.DefaultClassDefId]: 'DEFAULT_CLASSDEF_ID',
  [T.ClassDefId]: 'CLASSDEF_ID',
  [T.ClassDefStyleOpts]: 'CLASSDEF_STYLEOPTS',
  [T.Class]: 'class',
  [T.ClassEntityIds]: 'CLASSENTITY_IDS',
  [T.StyleClass]: 'STYLECLASS',
  [T.Style]: 'style',
  [T.StyleEntityIds]: 'STYLE_ENTITY_IDS',
  [T.StyleDefinitionData]: 'STYLE_DEFINITION_DATA',
  [T.AccTitle]: 'acc_title',
  [T.AccTitleValue]: 'acc_title_value',
  [T.AccDescr]: 'acc_descr',
  [T.AccDescrValue]: 'acc_descr_value',
  [T.AccDescrMultilineValue]: 'acc_descr_multiline_value',
  [T.End]: 'end',
  [T.NodeDStart]: 'NODE_DSTART',
  [T.NodeDEnd]: 'NODE_DEND',
  [T.BlockArrowStart]: 'BLOCK_ARROW_START',
  [T.Dir]: 'DIR',
  [T.BlockArrowEnd]: 'BLOCK_ARROW_END',
  [T.NodeId]: 'NODE_ID',
  [T.Eof]: 'EOF',
  [T.Str]: 'STR',
  [T.MdStr]: 'MD_STR',
  [T.Link]: 'LINK',
  [T.StartLink]: 'START_LINK',
  [T.LinkLabel]: 'LINK_LABEL',
  [T.Size]: 'SIZE',
  [Kind.Error]: 'LEXICAL_ERROR',
};
