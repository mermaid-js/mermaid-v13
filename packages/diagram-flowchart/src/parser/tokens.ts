/**
 * Flowchart token kinds. They mirror the terminals of v12's `flow.jison`, so the lexer can
 * be checked token by token against it. Kinds are plain numbers (TS enums are banned).
 */
import { FIRST_DIAGRAM_KIND } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  AccTitle: F,
  AccTitleValue: F + 1,
  AccDescr: F + 2,
  AccDescrValue: F + 3,
  AccDescrMultilineValue: F + 4,
  ShapeData: F + 5,
  CallbackName: F + 6,
  CallbackArgs: F + 7,
  MdStr: F + 8,
  Str: F + 9,
  Style: F + 10,
  Default: F + 11,
  LinkStyle: F + 12,
  Interpolate: F + 13,
  ClassDef: F + 14,
  Class: F + 15,
  Href: F + 16,
  Click: F + 17,
  Graph: F + 18,
  Subgraph: F + 19,
  End: F + 20,
  LinkTarget: F + 21,
  NoDir: F + 22,
  Dir: F + 23,
  DirectionTB: F + 24,
  DirectionBT: F + 25,
  DirectionRL: F + 26,
  DirectionLR: F + 27,
  DirectionTD: F + 28,
  LinkId: F + 29,
  Num: F + 30,
  Brkt: F + 31,
  StyleSeparator: F + 32,
  Colon: F + 33,
  Amp: F + 34,
  Semi: F + 35,
  Comma: F + 36,
  Mult: F + 37,
  Link: F + 38,
  StartLink: F + 39,
  EdgeText: F + 40,
  EllipseEnd: F + 41,
  Text: F + 42,
  EllipseStart: F + 43,
  StadiumEnd: F + 44,
  StadiumStart: F + 45,
  SubroutineEnd: F + 46,
  SubroutineStart: F + 47,
  VertexWithPropsStart: F + 48,
  TagEnd: F + 49,
  CylinderEnd: F + 50,
  CylinderStart: F + 51,
  DoubleCircleEnd: F + 52,
  DoubleCircleStart: F + 53,
  TrapEnd: F + 54,
  InvTrapEnd: F + 55,
  TrapStart: F + 56,
  InvTrapStart: F + 57,
  TagStart: F + 58,
  Up: F + 59,
  Sep: F + 60,
  Down: F + 61,
  NodeString: F + 62,
  Minus: F + 63,
  UnicodeText: F + 64,
  Pipe: F + 65,
  PE: F + 66,
  PS: F + 67,
  SQE: F + 68,
  SQS: F + 69,
  DiamondStop: F + 70,
  DiamondStart: F + 71,
  /** Significant blanks (jison `SPACE`); line breaks use the shared `Kind.Newline`. */
  Space: F + 72,
  /** jison's `EOF` token: the end of the text, reached in the initial state. A separator. */
  Eof: F + 73,
  /** The `}` closing shape data (jison drops it). */
  ShapeDataEnd: F + 74,
  /**
   * The `click` keyword of a click statement (jison returns no token for it: its `CLICK` is
   * the node id after it). The parser skips it as trivia.
   */
  ClickKeyword: F + 75,
  /** `mermaid` opening an embedded diagram block (ADR-15): only on a line ending in `{`. */
  Embed: F + 76,
  /** The `{` ending a block's opening line. */
  EmbedOpen: F + 77,
  /** A block's body, verbatim: from the line after the opener to its closing line. */
  EmbedBody: F + 78,
  /** The `}` that closes a block, first on its line. */
  EmbedEnd: F + 79,
} as const;
