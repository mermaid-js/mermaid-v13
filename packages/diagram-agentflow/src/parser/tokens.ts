/**
 * Agentflow token kinds. They mirror the terminals of v12's `agentflow.jison` (flowchart's
 * `flow.jison` less `subgraph`, plus `flow`, `connector`, `global` and `COMMENT`), so the lexer
 * can be checked token by token against it. Kinds are plain numbers (TS enums are banned).
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
  /** The `agentflow-beta` header keyword (jison `GRAPH`). */
  Graph: F + 18,
  Flow: F + 19,
  Connector: F + 20,
  Global: F + 21,
  End: F + 22,
  LinkTarget: F + 23,
  NoDir: F + 24,
  Dir: F + 25,
  DirectionTB: F + 26,
  DirectionBT: F + 27,
  DirectionRL: F + 28,
  DirectionLR: F + 29,
  DirectionTD: F + 30,
  LinkId: F + 31,
  Num: F + 32,
  Brkt: F + 33,
  StyleSeparator: F + 34,
  Colon: F + 35,
  Amp: F + 36,
  Semi: F + 37,
  Comma: F + 38,
  Mult: F + 39,
  Link: F + 40,
  StartLink: F + 41,
  EdgeText: F + 42,
  EllipseEnd: F + 43,
  Text: F + 44,
  EllipseStart: F + 45,
  StadiumEnd: F + 46,
  StadiumStart: F + 47,
  SubroutineEnd: F + 48,
  SubroutineStart: F + 49,
  VertexWithPropsStart: F + 50,
  TagEnd: F + 51,
  CylinderEnd: F + 52,
  CylinderStart: F + 53,
  DoubleCircleEnd: F + 54,
  DoubleCircleStart: F + 55,
  TrapEnd: F + 56,
  InvTrapEnd: F + 57,
  TrapStart: F + 58,
  InvTrapStart: F + 59,
  TagStart: F + 60,
  Up: F + 61,
  Sep: F + 62,
  Down: F + 63,
  /**
   * A `%%` comment outside labels (jison `COMMENT`, `[ \t]*"%%"(?!\{)[^\n]*`), blanks before
   * it included. v12 kept comments in the text it lexed and its grammar reads them, so this
   * is a significant token, not `Kind.Comment` trivia. A `%%` comment inside a label, which
   * jison skips, is `Kind.Comment`.
   */
  Comment: F + 64,
  NodeString: F + 65,
  Minus: F + 66,
  UnicodeText: F + 67,
  Pipe: F + 68,
  PE: F + 69,
  PS: F + 70,
  SQE: F + 71,
  SQS: F + 72,
  DiamondStop: F + 73,
  DiamondStart: F + 74,
  /** One blank (jison `SPACE` is `\s`, one character a token); line breaks use `Kind.Newline`. */
  Space: F + 75,
  /** jison's `EOF` token: the end of the text, reached in the initial state. A separator. */
  Eof: F + 76,
  /** The `}` closing shape data (jison drops it). */
  ShapeDataEnd: F + 77,
  /**
   * The `click` keyword of a click statement (jison returns no token for it: its `CLICK` is
   * the node id after it). The parser skips it as trivia.
   */
  ClickKeyword: F + 78,
} as const;
