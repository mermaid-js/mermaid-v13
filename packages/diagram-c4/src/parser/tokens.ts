/**
 * C4 token kinds. They mirror the terminals of v12's `c4Diagram.jison`, so the lexer can be
 * checked token by token against it (parser-method §1). Kinds are plain numbers (TS enums are
 * banned). A run of line breaks is the shared `Kind.Newline` (jison's `NEWLINE`, whose image
 * also holds the blanks before it); a `%%` comment and blanks the lexer skips are
 * `Kind.Comment` and `Kind.Space`.
 */
import { FIRST_DIAGRAM_KIND, Kind } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /**
   * `.*direction\s+TB[^\n]*`, tried first in INITIAL: from the token start through the last
   * `direction TB` on the line (its blanks may span line breaks) to the next line break.
   */
  DirectionTB: F,
  /** `.*direction\s+BT[^\n]*`. */
  DirectionBT: F + 1,
  /** `.*direction\s+RL[^\n]*`. */
  DirectionRL: F + 2,
  /** `.*direction\s+LR[^\n]*`. */
  DirectionLR: F + 3,
  /** `title\s[^#\n;]+` (the `\s` may be a line break). */
  Title: F + 4,
  /** `accDescription\s[^#\n;]+`. */
  AccDescription: F + 5,
  /** `accTitle\s*:\s*` (the blanks may span line breaks). */
  AccTitle: F + 6,
  /** `[^\n]*` after `accTitle:`: the rest of the line, maybe empty. */
  AccTitleValue: F + 7,
  /** `accDescr\s*:\s*`. */
  AccDescr: F + 8,
  /** `[^\n]*` after `accDescr:`. */
  AccDescrValue: F + 9,
  /** `accDescr\s*\{\s*` (jison returns no token for it). */
  AccDescrBlockStart: F + 10,
  /** `[^\}]*` inside `accDescr {`, line breaks included; also its empty match at the end. */
  AccDescrBlockValue: F + 11,
  /** The `}` closing `accDescr {` (jison returns no token for it). */
  AccDescrBlockEnd: F + 12,
  /** `C4Context` (word-bounded, as every keyword below). */
  C4Context: F + 13,
  C4Container: F + 14,
  C4Component: F + 15,
  C4Dynamic: F + 16,
  C4Deployment: F + 17,
  PersonExt: F + 18,
  Person: F + 19,
  SystemQueueExt: F + 20,
  SystemDbExt: F + 21,
  SystemExt: F + 22,
  SystemQueue: F + 23,
  SystemDb: F + 24,
  System: F + 25,
  Boundary: F + 26,
  EnterpriseBoundary: F + 27,
  SystemBoundary: F + 28,
  ContainerQueueExt: F + 29,
  ContainerDbExt: F + 30,
  ContainerExt: F + 31,
  ContainerQueue: F + 32,
  ContainerDb: F + 33,
  Container: F + 34,
  ContainerBoundary: F + 35,
  ComponentQueueExt: F + 36,
  ComponentDbExt: F + 37,
  ComponentExt: F + 38,
  ComponentQueue: F + 39,
  ComponentDb: F + 40,
  Component: F + 41,
  /** `Deployment_Node` or `Node`. */
  Node: F + 42,
  NodeL: F + 43,
  NodeR: F + 44,
  Rel: F + 45,
  BiRel: F + 46,
  /** `Rel_Up` or `Rel_U`. */
  RelU: F + 47,
  /** `Rel_Down` or `Rel_D`. */
  RelD: F + 48,
  /** `Rel_Left` or `Rel_L`. */
  RelL: F + 49,
  /** `Rel_Right` or `Rel_R`. */
  RelR: F + 50,
  RelB: F + 51,
  RelIndex: F + 52,
  UpdateElementStyle: F + 53,
  UpdateRelStyle: F + 54,
  UpdateLayoutConfig: F + 55,
  /** `<<EOF>>` right after a macro keyword: zero-width, at the end of the text. */
  EofInStruct: F + 56,
  /**
   * An empty argument: `(`, blanks and `,` opening the arguments; `,,`; or blanks and `""`
   * (each covers the characters it matched).
   */
  AttributeEmpty: F + 57,
  /**
   * An argument's text: inside quotes (`[^"]*`, line breaks included), or unquoted (`[^,]+`:
   * to the next comma, across `)` and line breaks, with its leading blanks). Also the empty
   * match of a quoted argument left open at the end of the text.
   */
  Str: F + 58,
  /** `[^=]*` after `$`: a named argument's name, up to the next `=` (maybe empty). */
  StrKey: F + 59,
  /** `[^"]+` inside `$name="…"`. */
  StrValue: F + 60,
  /** `{` in INITIAL. */
  LBrace: F + 61,
  /** `}` in INITIAL. */
  RBrace: F + 62,
  /** jison's `<<EOF>>` `EOF`: zero-width, at the end of the text, in INITIAL only. */
  Eof: F + 63,
  /** `(` opening the arguments (jison returns no token for it). */
  ArgsOpen: F + 64,
  /** `)` closing a macro (jison returns no token for it). */
  ArgsClose: F + 65,
  /** `,` between arguments (jison returns no token for it). */
  Comma: F + 66,
  /** Blanks and the `"` opening a quoted argument (jison returns no token for it). */
  QuoteOpen: F + 67,
  /** The `"` closing a quoted argument (jison returns no token for it). */
  QuoteClose: F + 68,
  /** Blanks and the `$` starting a named argument (jison returns no token for it). */
  KeyStart: F + 69,
  /** `=`, blanks and `"` after a named argument's name (jison returns no token for it). */
  KeyEquals: F + 70,
  /** The `"` closing a named argument's value (jison returns no token for it). */
  ValueClose: F + 71,
} as const;

/**
 * The INITIAL keywords by spelling, each with its kind: the five headers, then the macros in
 * `c4Diagram.jison`'s order. Each is word-bounded (jison appends `\b`) and made of word
 * characters only, so a keyword matches exactly when the word run at a token start is one.
 */
export const KEYWORDS: ReadonlyMap<string, number> = new Map([
  ['C4Context', T.C4Context],
  ['C4Container', T.C4Container],
  ['C4Component', T.C4Component],
  ['C4Dynamic', T.C4Dynamic],
  ['C4Deployment', T.C4Deployment],
  ['Person_Ext', T.PersonExt],
  ['Person', T.Person],
  ['SystemQueue_Ext', T.SystemQueueExt],
  ['SystemDb_Ext', T.SystemDbExt],
  ['System_Ext', T.SystemExt],
  ['SystemQueue', T.SystemQueue],
  ['SystemDb', T.SystemDb],
  ['System', T.System],
  ['Boundary', T.Boundary],
  ['Enterprise_Boundary', T.EnterpriseBoundary],
  ['System_Boundary', T.SystemBoundary],
  ['ContainerQueue_Ext', T.ContainerQueueExt],
  ['ContainerDb_Ext', T.ContainerDbExt],
  ['Container_Ext', T.ContainerExt],
  ['ContainerQueue', T.ContainerQueue],
  ['ContainerDb', T.ContainerDb],
  ['Container', T.Container],
  ['Container_Boundary', T.ContainerBoundary],
  ['ComponentQueue_Ext', T.ComponentQueueExt],
  ['ComponentDb_Ext', T.ComponentDbExt],
  ['Component_Ext', T.ComponentExt],
  ['ComponentQueue', T.ComponentQueue],
  ['ComponentDb', T.ComponentDb],
  ['Component', T.Component],
  ['Deployment_Node', T.Node],
  ['Node', T.Node],
  ['Node_L', T.NodeL],
  ['Node_R', T.NodeR],
  ['Rel', T.Rel],
  ['BiRel', T.BiRel],
  ['Rel_Up', T.RelU],
  ['Rel_U', T.RelU],
  ['Rel_Down', T.RelD],
  ['Rel_D', T.RelD],
  ['Rel_Left', T.RelL],
  ['Rel_L', T.RelL],
  ['Rel_Right', T.RelR],
  ['Rel_R', T.RelR],
  ['Rel_Back', T.RelB],
  ['RelIndex', T.RelIndex],
  ['UpdateElementStyle', T.UpdateElementStyle],
  ['UpdateRelStyle', T.UpdateRelStyle],
  ['UpdateLayoutConfig', T.UpdateLayoutConfig],
]);

/** The header kinds (`C4Context` … `C4Deployment`): every other keyword opens a macro. */
export const HEADERS: ReadonlySet<number> = new Set([
  T.C4Context,
  T.C4Container,
  T.C4Component,
  T.C4Dynamic,
  T.C4Deployment,
]);

/** The longest keyword's length: a word run is read no further than one past it. */
export const KEYWORD_MAX = Math.max(...[...KEYWORDS.keys()].map((k) => k.length));

/**
 * The v12 `c4Diagram.jison` terminal each kind stands for (dev and test use: the lexer-parity
 * gate compares token streams by these names). Never shown to users (R-ERR-5). Kinds without
 * an entry have no jison token; `LEXICAL_ERROR` marks where jison threw.
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  [T.DirectionTB]: 'direction_tb',
  [T.DirectionBT]: 'direction_bt',
  [T.DirectionRL]: 'direction_rl',
  [T.DirectionLR]: 'direction_lr',
  [T.Title]: 'title',
  [T.AccDescription]: 'accDescription',
  [T.AccTitle]: 'acc_title',
  [T.AccTitleValue]: 'acc_title_value',
  [T.AccDescr]: 'acc_descr',
  [T.AccDescrValue]: 'acc_descr_value',
  [T.AccDescrBlockValue]: 'acc_descr_multiline_value',
  [T.C4Context]: 'C4_CONTEXT',
  [T.C4Container]: 'C4_CONTAINER',
  [T.C4Component]: 'C4_COMPONENT',
  [T.C4Dynamic]: 'C4_DYNAMIC',
  [T.C4Deployment]: 'C4_DEPLOYMENT',
  [T.PersonExt]: 'PERSON_EXT',
  [T.Person]: 'PERSON',
  [T.SystemQueueExt]: 'SYSTEM_EXT_QUEUE',
  [T.SystemDbExt]: 'SYSTEM_EXT_DB',
  [T.SystemExt]: 'SYSTEM_EXT',
  [T.SystemQueue]: 'SYSTEM_QUEUE',
  [T.SystemDb]: 'SYSTEM_DB',
  [T.System]: 'SYSTEM',
  [T.Boundary]: 'BOUNDARY',
  [T.EnterpriseBoundary]: 'ENTERPRISE_BOUNDARY',
  [T.SystemBoundary]: 'SYSTEM_BOUNDARY',
  [T.ContainerQueueExt]: 'CONTAINER_EXT_QUEUE',
  [T.ContainerDbExt]: 'CONTAINER_EXT_DB',
  [T.ContainerExt]: 'CONTAINER_EXT',
  [T.ContainerQueue]: 'CONTAINER_QUEUE',
  [T.ContainerDb]: 'CONTAINER_DB',
  [T.Container]: 'CONTAINER',
  [T.ContainerBoundary]: 'CONTAINER_BOUNDARY',
  [T.ComponentQueueExt]: 'COMPONENT_EXT_QUEUE',
  [T.ComponentDbExt]: 'COMPONENT_EXT_DB',
  [T.ComponentExt]: 'COMPONENT_EXT',
  [T.ComponentQueue]: 'COMPONENT_QUEUE',
  [T.ComponentDb]: 'COMPONENT_DB',
  [T.Component]: 'COMPONENT',
  [T.Node]: 'NODE',
  [T.NodeL]: 'NODE_L',
  [T.NodeR]: 'NODE_R',
  [T.Rel]: 'REL',
  [T.BiRel]: 'BIREL',
  [T.RelU]: 'REL_U',
  [T.RelD]: 'REL_D',
  [T.RelL]: 'REL_L',
  [T.RelR]: 'REL_R',
  [T.RelB]: 'REL_B',
  [T.RelIndex]: 'REL_INDEX',
  [T.UpdateElementStyle]: 'UPDATE_EL_STYLE',
  [T.UpdateRelStyle]: 'UPDATE_REL_STYLE',
  [T.UpdateLayoutConfig]: 'UPDATE_LAYOUT_CONFIG',
  [T.EofInStruct]: 'EOF_IN_STRUCT',
  [T.AttributeEmpty]: 'ATTRIBUTE_EMPTY',
  [T.Str]: 'STR',
  [T.StrKey]: 'STR_KEY',
  [T.StrValue]: 'STR_VALUE',
  [T.LBrace]: 'LBRACE',
  [T.RBrace]: 'RBRACE',
  [T.Eof]: 'EOF',
  [Kind.Newline]: 'NEWLINE',
  [Kind.Error]: 'LEXICAL_ERROR',
};
