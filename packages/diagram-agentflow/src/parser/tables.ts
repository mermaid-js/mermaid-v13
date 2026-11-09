/**
 * The agentflow parser's tables (`parser.ts`): the token kinds each rule takes, what the probe
 * and the error messages name, and the shapes of the state it keeps. Built once at module scope.
 */
import { ExpectedTable, Kind, kindSet } from '@mermaid-js/core/parser-kit';
import type { ParseState, Range } from '@mermaid-js/core/parser-kit';
import type { YamlMap } from '@mermaid-js/core/preprocess';
import type { AgentflowLabelNode, AgentflowNodeStmt, AgentflowStatementNode } from './ast.ts';
import type { DocItem } from './model.ts';
import { T } from './tokens.ts';

export const ID_KINDS = [
  T.Num,
  T.NodeString,
  T.Down,
  T.Minus,
  T.Default,
  T.Comma,
  T.Colon,
  T.Amp,
  T.Brkt,
  T.Mult,
  T.UnicodeText,
];
export const ID = kindSet(...ID_KINDS);
export const ALPHANUM = kindSet(
  T.Num,
  T.UnicodeText,
  T.NodeString,
  T.Dir,
  T.Down,
  T.Minus,
  T.Comma,
  T.Colon,
  T.Amp,
  T.Brkt,
  T.Mult
);
export const NO_TAGS = kindSet(
  T.Num,
  T.NodeString,
  T.Space,
  T.Minus,
  T.Amp,
  T.UnicodeText,
  T.Colon,
  T.Mult,
  T.Brkt,
  T.Style,
  T.LinkStyle,
  T.ClassDef,
  T.Class,
  T.Click,
  T.Graph,
  T.Dir,
  T.Flow,
  T.Connector,
  T.Global,
  T.End,
  T.Down,
  T.Up,
  T.StartLink
);
export const STYLE_PART = kindSet(T.Num, T.NodeString, T.Colon, T.Space, T.Brkt, T.Style);
export const TEXT_PART = kindSet(T.Text, T.TagStart, T.TagEnd, T.UnicodeText);
export const EDGE_PART = kindSet(T.EdgeText, T.UnicodeText);
export const NONE = kindSet();
export const LEXER_MODE = kindSet(
  T.Text,
  T.EdgeText,
  T.Str,
  T.MdStr,
  T.ShapeData,
  T.Click,
  T.CallbackName,
  T.CallbackArgs
);

export const SHAPES: Record<
  number,
  [shape: string, close: number, what: string, closeText: string]
> = {
  [T.SQS]: ['square', T.SQE, 'node label', '`]`'],
  [T.DoubleCircleStart]: ['doublecircle', T.DoubleCircleEnd, 'node label', '`)))`'],
  [T.EllipseStart]: ['ellipse', T.EllipseEnd, 'node label', '`-)`'],
  [T.StadiumStart]: ['stadium', T.StadiumEnd, 'node label', '`])`'],
  [T.SubroutineStart]: ['subroutine', T.SubroutineEnd, 'node label', '`]]`'],
  [T.CylinderStart]: ['cylinder', T.CylinderEnd, 'node label', '`)]`'],
  [T.TagEnd]: ['odd', T.SQE, 'node label', '`]`'],
};
export const DIRECTIONS = ['TB', 'BT', 'RL', 'LR', 'TD'];

/** jison's `separator`: a line break, `;`, the end, or a comment. */
export const LINE_END = [Kind.Newline, T.Semi, T.Eof, T.Comment];
export const LINE_END_SET = kindSet(...LINE_END);
/**
 * What the parser reads past besides spaces: comments inside labels and past `maxTextSize`
 * (a `%%` comment elsewhere is a token), directives, and the `click` keyword (jison has no
 * token for it, so `click` heads no statement: the node id after it does).
 */
export const READ_PAST_KINDS = [Kind.Comment, Kind.Directive, T.ClickKeyword] as const;
export const READ_PAST = kindSet(...READ_PAST_KINDS);
/** What the parser skips: {@link READ_PAST} and spaces. */
export const PARSER_TRIVIA = kindSet(...READ_PAST_KINDS, Kind.Space);
/** Where recovery resumes (R-PARSE-4). */
export const BOUNDARY = kindSet(Kind.EOF, T.Eof, Kind.Newline, T.Semi, T.Comment);
export const STATEMENT_START = [
  T.Style,
  T.LinkStyle,
  T.ClassDef,
  T.Class,
  T.Click,
  T.Flow,
  T.Global,
  T.Connector,
  T.AccTitle,
  T.AccDescr,
  T.NodeString,
];

// What the parser would accept at its decision points, for the probe (R-LANG-7, D95). Each
// list is a constant so a parse without a probe allocates nothing for them.
export const STATEMENT_KINDS = [
  ...STATEMENT_START,
  T.AccDescrMultilineValue,
  T.DirectionTB,
  T.DirectionBT,
  T.DirectionRL,
  T.DirectionLR,
  T.DirectionTD,
];
export const DOC_KINDS = [
  ...STATEMENT_KINDS,
  T.Semi,
  Kind.Newline,
  T.Space,
  T.Eof,
  T.Comment,
  Kind.EOF,
];
export const BLOCK_DOC_KINDS = [...DOC_KINDS, T.End];
export const BLANKS = [T.Space, Kind.Newline];
/** Blanks and comments before the header are optional: where one may stand, so may the header. */
export const HEADER_START = [...BLANKS, T.Comment, T.Graph];
export const DIR_KINDS = [T.NoDir, T.Dir];
export const AFTER_DIR = [T.Space, ...LINE_END];
export const SHAPE_KINDS = [
  T.SQS,
  T.PS,
  T.DiamondStart,
  T.StadiumStart,
  T.SubroutineStart,
  T.CylinderStart,
  T.DoubleCircleStart,
  T.EllipseStart,
  T.TrapStart,
  T.InvTrapStart,
  T.TagEnd,
  T.VertexWithPropsStart,
];
export const GRAPH = [T.Graph];
export const PS_ONLY = [T.PS];
export const DIAMOND_ONLY = [T.DiamondStart];
export const TRAP_ENDS = [T.TrapEnd, T.InvTrapEnd];
export const STYLE_SEPARATOR = [T.StyleSeparator];
export const SHAPE_DATA = [T.ShapeData];
export const SHAPE_DATA_PARTS = [T.ShapeData, T.ShapeDataEnd];
export const SPACE = [T.Space];
export const AMP = [T.Amp];
export const LINK_KINDS = [T.Link, T.StartLink, T.LinkId];
export const LINK_AFTER_ID = [T.Link, T.StartLink];
/** After an edge label: an optional blank, then the node. */
export const AFTER_EDGE_LABEL = [T.Space, T.NodeString];
export const PIPE = [T.Pipe];
export const COMMA = [T.Comma];
export const STYLE_WANT = [T.NodeString];
export const LINK_STYLE_INDEX = [T.Default, T.Num];
export const INTERPOLATE_OR_STYLE = [T.Interpolate, T.NodeString];
export const CLICK_ACTION = [T.CallbackName, T.Href, T.Str, T.NodeString];
export const CALLBACK_ARGS = [T.CallbackArgs];
export const LINK_TARGET_OR_TOOLTIP = [T.LinkTarget, T.Str];
export const FLOW_HEADER = [T.Space, ...LINE_END];
export const AFTER_FLOW_ID = [T.SQS, T.ShapeData, ...LINE_END];
export const AFTER_TITLE = [T.ShapeData, ...LINE_END];
export const CONNECTOR_SPACE = [T.Space];

/**
 * Kinds a probe's cursor follows rather than extends when the token ends at the offset:
 * links, separators and brackets. Id and text kinds are absent, so `my-` or a label is a word.
 */
export const PROBE_FOLLOWS = kindSet(
  ...SHAPE_KINDS,
  ...LINK_KINDS,
  T.StyleSeparator,
  T.Semi,
  T.Space,
  T.NoDir,
  T.Pipe,
  T.SQE,
  T.PE,
  T.DiamondStop,
  T.StadiumEnd,
  T.SubroutineEnd,
  T.CylinderEnd,
  T.DoubleCircleEnd,
  T.EllipseEnd,
  T.TrapEnd,
  T.InvTrapEnd,
  T.TagStart,
  T.ShapeDataEnd,
  T.Sep
);

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
export const EXPECTED = new ExpectedTable([
  ['`&`', [T.Amp]],
  ['a link number such as `0`', [T.Num]],
  ['a node id', ID_KINDS],
  ['a link such as `-->`', [T.Link, T.StartLink, T.LinkId]],
  ['a node shape such as `[text]`', SHAPE_KINDS],
  ['label text', [T.Text, T.TagStart, T.EdgeText]],
  ['a quoted string', [T.Str, T.MdStr]],
  ['`]`', [T.SQE]],
  ['`)`', [T.PE]],
  ['`}`', [T.DiamondStop]],
  ['`|`', [T.Pipe]],
  ['`])`', [T.StadiumEnd]],
  ['`]]`', [T.SubroutineEnd]],
  ['`)]`', [T.CylinderEnd]],
  ['`)))`', [T.DoubleCircleEnd]],
  ['`-)`', [T.EllipseEnd]],
  ['`\\]`', [T.TrapEnd]],
  ['`/]`', [T.InvTrapEnd]],
  ['`:::`', [T.StyleSeparator]],
  ['a line break, `;` or a comment', [Kind.Newline, T.Semi, T.Comment]],
  ['a space', [T.Space]],
  ['a direction such as `TD` or `LR`', [T.Dir, T.NoDir]],
  ['`agentflow-beta`', [T.Graph]],
  ['`end`', [T.End]],
  [
    'a statement such as `flow`, `connector`, `style` or `classDef`',
    [
      T.Style,
      T.LinkStyle,
      T.ClassDef,
      T.Class,
      T.Click,
      T.Flow,
      T.Global,
      T.Connector,
      T.AccTitle,
      T.AccDescr,
      T.AccDescrMultilineValue,
      T.DirectionTB,
      T.DirectionBT,
      T.DirectionLR,
      T.DirectionRL,
      T.DirectionTD,
    ],
  ],
  ['`default`', [T.Default]],
  ['`interpolate`', [T.Interpolate]],
  ['`href`', [T.Href]],
  ['a link target such as `_blank`', [T.LinkTarget]],
  ['metadata `@{ … }`', [T.ShapeData]],
  ['`}`', [T.ShapeDataEnd]],
  ['the end of the text', [Kind.EOF, T.Eof]],
]);

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
export class Stop extends Error {}
export const STOP = new Stop();

/** An open `flow` or `global` block. */
export interface Frame {
  kind: 'flow' | 'global';
  /** The header had an error, already reported: a missing `end` is part of it. */
  failed: boolean;
  id: AgentflowLabelNode | undefined;
  title: AgentflowLabelNode | undefined;
  data: ShapeData | undefined;
  list: DocItem[];
  collect: boolean;
  start: number;
  opener: Range;
  span: ReturnType<ParseState['beginStatement']>;
  children: AgentflowStatementNode[];
  outer: AgentflowStatementNode[];
}

export interface Opener {
  range: Range;
  what: string;
  closer: string;
}

export const NO_ITEMS: string[] = [];

/** How each statement is written, for errors inside it. */
export const STATEMENT_HINTS: Record<number, string> = {
  [T.Style]: 'write it as `style <node id> <styles>`, e.g. `style A fill:#f9f,stroke:#333`',
  [T.ClassDef]: 'write it as `classDef <name> <styles>`, e.g. `classDef hot fill:#f96`',
  [T.Class]: 'write it as `class <node ids> <class name>`, e.g. `class A,B hot`',
  [T.LinkStyle]:
    'write it as `linkStyle <link numbers or default> <styles>`, e.g. `linkStyle 0,1 stroke:red`',
  [T.Click]:
    'write it as `click <node id> <callback>` or `click <node id> "<url>"`, e.g. `click A "https://example.com"`',
  [T.Connector]:
    'write it as `connector <id>`, `connector <id>[title]` or `connector <id>@{ … }`, on its own line',
};

/**
 * The first node statement of `list` with a name: a scan for short lists, a map for the long
 * ones of `A & B & …` fan-out (each edge looks up both its ends).
 */
export function byName(
  list: readonly AgentflowNodeStmt[]
): (name: string) => AgentflowNodeStmt | undefined {
  if (list.length < 8) return (name) => list.find((n) => n.name === name);
  const map = new Map<string, AgentflowNodeStmt>();
  for (const n of list) if (!map.has(n.name)) map.set(n.name, n);
  return (name) => map.get(name);
}

export interface ShapeData {
  value: YamlMap | null;
  range: Range;
}

/** A fix hint for common slips, from the text found where the error is. */
export function hintFor(text: string): string | undefined {
  if (/^\s*[-=.<>ox~]+\s*$/.test(text) && /[-=.~]/.test(text)) {
    return 'agentflow links are written `-->`, `--x` or `-.-`';
  }
  return undefined;
}
