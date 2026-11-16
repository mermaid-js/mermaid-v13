/**
 * The token kinds the flow family's lexer and parser share: the terminals `flow.jison` and the
 * grammars cut from it (`agentflow.jison`) have in common. Each diagram keeps its own kind
 * object (`parser/tokens.ts`, which `tools/gen-grammar` reads), with its own numbers and its
 * own extra kinds, and hands it to the family's lexer and parser as a `FlowKinds`.
 */
export interface FlowKinds {
  readonly AccTitle: number;
  readonly AccTitleValue: number;
  readonly AccDescr: number;
  readonly AccDescrValue: number;
  readonly AccDescrMultilineValue: number;
  readonly ShapeData: number;
  readonly CallbackName: number;
  readonly CallbackArgs: number;
  readonly MdStr: number;
  readonly Str: number;
  readonly Style: number;
  readonly Default: number;
  readonly LinkStyle: number;
  readonly Interpolate: number;
  readonly ClassDef: number;
  readonly Class: number;
  readonly Href: number;
  readonly Click: number;
  /** The header keyword (jison `GRAPH`). */
  readonly Graph: number;
  readonly End: number;
  readonly LinkTarget: number;
  readonly NoDir: number;
  readonly Dir: number;
  /** `direction TB`; the four kinds after it follow in this order, one apart. */
  readonly DirectionTB: number;
  readonly DirectionBT: number;
  readonly DirectionRL: number;
  readonly DirectionLR: number;
  readonly DirectionTD: number;
  readonly LinkId: number;
  readonly Num: number;
  readonly Brkt: number;
  readonly StyleSeparator: number;
  readonly Colon: number;
  readonly Amp: number;
  readonly Semi: number;
  readonly Comma: number;
  readonly Mult: number;
  readonly Link: number;
  readonly StartLink: number;
  readonly EdgeText: number;
  readonly EllipseEnd: number;
  readonly Text: number;
  readonly EllipseStart: number;
  readonly StadiumEnd: number;
  readonly StadiumStart: number;
  readonly SubroutineEnd: number;
  readonly SubroutineStart: number;
  readonly VertexWithPropsStart: number;
  readonly TagEnd: number;
  readonly CylinderEnd: number;
  readonly CylinderStart: number;
  readonly DoubleCircleEnd: number;
  readonly DoubleCircleStart: number;
  readonly TrapEnd: number;
  readonly InvTrapEnd: number;
  readonly TrapStart: number;
  readonly InvTrapStart: number;
  readonly TagStart: number;
  readonly Up: number;
  readonly Sep: number;
  readonly Down: number;
  readonly NodeString: number;
  readonly Minus: number;
  readonly UnicodeText: number;
  readonly Pipe: number;
  readonly PE: number;
  readonly PS: number;
  readonly SQE: number;
  readonly SQS: number;
  readonly DiamondStop: number;
  readonly DiamondStart: number;
  /** Significant blanks (jison `SPACE`); line breaks use the shared `Kind.Newline`. */
  readonly Space: number;
  /** jison's `EOF` token: the end of the text, reached in the initial state. A separator. */
  readonly Eof: number;
  /** The `}` closing shape data (jison drops it). */
  readonly ShapeDataEnd: number;
  /** The `click` keyword of a click statement (jison returns no token for it). */
  readonly ClickKeyword: number;
}
