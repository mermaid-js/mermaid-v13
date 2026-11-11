/**
 * The flow family parser's tables: the token kinds each rule takes, what the probe and the
 * error messages name. {@link flowTables} builds them once a diagram, at module scope, from
 * the diagram's token kinds and what its grammar adds (its block keywords, a comment token
 * that ends a statement, its names for things).
 */
import { ExpectedTable, Kind, kindSet } from '@mermaid-js/core/parser-kit';
import type { KindSet } from '@mermaid-js/core/parser-kit';
import type { FlowKinds } from './flow-kinds.ts';

/** What a dialect's grammar adds to the family's. */
export interface FlowTablesDialect {
  /**
   * The kinds of the dialect's own statement keywords (`subgraph`; `flow`, `global`,
   * `connector`), in the order the statement lists name them.
   */
  readonly keywords: readonly number[];
  /** Kinds that end a statement besides a line break, `;` and the end (a comment token). */
  readonly separators: readonly number[];
  /** How a message names a statement end, the header keyword, a statement and `@{ … }`. */
  readonly names: {
    readonly separator: string;
    readonly header: string;
    readonly statement: string;
    readonly data: string;
  };
  /** How the dialect's own statements are written, by keyword kind, for errors inside them. */
  readonly hints: Readonly<Record<number, string>>;
  /** What to say of text that looks like a link but is none. */
  readonly linkHint: string;
}

/** One dialect's tables. */
export interface FlowTables {
  readonly ID: KindSet;
  readonly ALPHANUM: KindSet;
  readonly NO_TAGS: KindSet;
  readonly STYLE_PART: KindSet;
  readonly TEXT_PART: KindSet;
  readonly EDGE_PART: KindSet;
  readonly NONE: KindSet;
  readonly LEXER_MODE: KindSet;
  /** The keywords that cannot be ids: `end`, the header's and the dialect's own. */
  readonly KEYWORDS: KindSet;
  readonly SHAPES: Readonly<
    Record<number, readonly [shape: string, close: number, what: string, closeText: string]>
  >;
  /** jison's `separator`. */
  readonly LINE_END: readonly number[];
  readonly LINE_END_SET: KindSet;
  /**
   * What the parser reads past besides spaces: comments, directives and the `click` keyword
   * (jison has no token for it, so `click` heads no statement: the node id after it does). The
   * completion facet reads a statement's head past the same kinds.
   */
  readonly READ_PAST: KindSet;
  /** What the parser skips: {@link READ_PAST} and spaces. */
  readonly PARSER_TRIVIA: KindSet;
  /** Where recovery resumes (R-PARSE-4). */
  readonly BOUNDARY: KindSet;
  readonly STATEMENT_START: readonly number[];
  // What the parser would accept at its decision points, for the probe (R-LANG-7, D95). Each
  // list is a constant so a parse without a probe allocates nothing for them.
  readonly STATEMENT_KINDS: readonly number[];
  readonly DOC_KINDS: readonly number[];
  readonly BLOCK_DOC_KINDS: readonly number[];
  readonly BLANKS: readonly number[];
  /** What may stand before the header keyword, and the keyword. */
  readonly HEADER_START: readonly number[];
  /** What the parser skips before the header keyword. */
  readonly HEADER_SKIP: KindSet;
  readonly DIR_KINDS: readonly number[];
  readonly AFTER_DIR: readonly number[];
  /** What ends the header line right after its direction: a statement end but the text's. */
  readonly AFTER_DIR_END: KindSet;
  readonly AFTER_DIR_WANT: readonly number[];
  readonly SHAPE_KINDS: readonly number[];
  readonly GRAPH: readonly number[];
  readonly PS_ONLY: readonly number[];
  readonly DIAMOND_ONLY: readonly number[];
  readonly TRAP_ENDS: readonly number[];
  readonly STYLE_SEPARATOR: readonly number[];
  readonly SHAPE_DATA: readonly number[];
  readonly SHAPE_DATA_PARTS: readonly number[];
  readonly SPACE: readonly number[];
  readonly AMP: readonly number[];
  readonly LINK_KINDS: readonly number[];
  readonly LINK_AFTER_ID: readonly number[];
  /** After an edge label: an optional blank, then the node. */
  readonly AFTER_EDGE_LABEL: readonly number[];
  readonly PIPE: readonly number[];
  readonly COMMA: readonly number[];
  readonly STYLE_WANT: readonly number[];
  readonly LINK_STYLE_INDEX: readonly number[];
  readonly INTERPOLATE_OR_STYLE: readonly number[];
  readonly CLICK_ACTION: readonly number[];
  readonly CALLBACK_ARGS: readonly number[];
  readonly LINK_TARGET_OR_TOOLTIP: readonly number[];
  /** After a block keyword that takes an id: a blank, or the end of the line. */
  readonly BLOCK_HEADER: readonly number[];
  /**
   * Kinds a probe's cursor follows rather than extends when the token ends at the offset:
   * links, separators and brackets. Id and text kinds are absent, so `my-` or a label is a word.
   */
  readonly PROBE_FOLLOWS: KindSet;
  /** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
  readonly EXPECTED: ExpectedTable;
  /** How each statement is written, for errors inside it. */
  readonly STATEMENT_HINTS: Readonly<Record<number, string>>;
  /** How a message names `@{ … }`. */
  readonly dataName: string;
  readonly linkHint: string;
}

export const FLOW_DIRECTIONS: readonly string[] = /* @__PURE__ */ Object.freeze([
  'TB',
  'BT',
  'RL',
  'LR',
  'TD',
]);

export const NO_ITEMS: readonly string[] = /* @__PURE__ */ Object.freeze([]);

/** The sets of kinds the token rules take. */
function kindSets(
  T: FlowKinds,
  ID_KINDS: readonly number[],
  keywords: readonly number[]
): Pick<
  FlowTables,
  | 'ID'
  | 'ALPHANUM'
  | 'NO_TAGS'
  | 'STYLE_PART'
  | 'TEXT_PART'
  | 'EDGE_PART'
  | 'NONE'
  | 'LEXER_MODE'
  | 'KEYWORDS'
> {
  return {
    ID: kindSet(...ID_KINDS),
    ALPHANUM: kindSet(
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
    ),
    NO_TAGS: kindSet(
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
      ...keywords,
      T.End,
      T.Down,
      T.Up,
      T.StartLink
    ),
    STYLE_PART: kindSet(T.Num, T.NodeString, T.Colon, T.Space, T.Brkt, T.Style),
    TEXT_PART: kindSet(T.Text, T.TagStart, T.TagEnd, T.UnicodeText),
    EDGE_PART: kindSet(T.EdgeText, T.UnicodeText),
    NONE: kindSet(),
    LEXER_MODE: kindSet(
      T.Text,
      T.EdgeText,
      T.Str,
      T.MdStr,
      T.ShapeData,
      T.Click,
      T.CallbackName,
      T.CallbackArgs
    ),
    KEYWORDS: kindSet(T.End, T.Graph, ...keywords),
  };
}

function probeFollows(
  T: FlowKinds,
  SHAPE_KINDS: readonly number[],
  LINK_KINDS: readonly number[]
): KindSet {
  return kindSet(
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
}

function expected(
  T: FlowKinds,
  dialect: FlowTablesDialect,
  lists: {
    ID_KINDS: readonly number[];
    LINK_KINDS: readonly number[];
    SHAPE_KINDS: readonly number[];
  }
): ExpectedTable {
  const { keywords, separators, names } = dialect;
  const { ID_KINDS, LINK_KINDS, SHAPE_KINDS } = lists;
  return new ExpectedTable([
    ['`&`', [T.Amp]],
    ['a link number such as `0`', [T.Num]],
    ['a node id', ID_KINDS],
    ['a link such as `-->`', LINK_KINDS],
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
    [names.separator, [Kind.Newline, T.Semi, ...separators]],
    ['a space', [T.Space]],
    ['a direction such as `TD` or `LR`', [T.Dir, T.NoDir]],
    [names.header, [T.Graph]],
    ['`end`', [T.End]],
    [
      names.statement,
      [
        T.Style,
        T.LinkStyle,
        T.ClassDef,
        T.Class,
        T.Click,
        ...keywords,
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
    [`${names.data} \`@{ … }\``, [T.ShapeData]],
    ['`}`', [T.ShapeDataEnd]],
    ['the end of the text', [Kind.EOF, T.Eof]],
  ]);
}

/** The tables of the dialect with the token kinds `T`. */
export function flowTables(T: FlowKinds, dialect: FlowTablesDialect): FlowTables {
  const { keywords, separators, names } = dialect;
  const ID_KINDS = [
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
  const LINE_END = [Kind.Newline, T.Semi, T.Eof, ...separators];
  const READ_PAST_KINDS = [Kind.Comment, Kind.Directive, T.ClickKeyword];
  const STATEMENT_START = [
    T.Style,
    T.LinkStyle,
    T.ClassDef,
    T.Class,
    T.Click,
    ...keywords,
    T.AccTitle,
    T.AccDescr,
    T.NodeString,
  ];
  const STATEMENT_KINDS = [
    ...STATEMENT_START,
    T.AccDescrMultilineValue,
    T.DirectionTB,
    T.DirectionBT,
    T.DirectionRL,
    T.DirectionLR,
    T.DirectionTD,
  ];
  const DOC_KINDS = [
    ...STATEMENT_KINDS,
    T.Semi,
    Kind.Newline,
    T.Space,
    T.Eof,
    ...separators,
    Kind.EOF,
  ];
  const BLANKS = [T.Space, Kind.Newline];
  const SHAPE_KINDS = [
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
  const LINK_KINDS = [T.Link, T.StartLink, T.LinkId];
  const AFTER_DIR_KINDS = [T.Semi, Kind.Newline, ...separators];
  return {
    ...kindSets(T, ID_KINDS, keywords),
    SHAPES: {
      [T.SQS]: ['square', T.SQE, 'node label', '`]`'],
      [T.DoubleCircleStart]: ['doublecircle', T.DoubleCircleEnd, 'node label', '`)))`'],
      [T.EllipseStart]: ['ellipse', T.EllipseEnd, 'node label', '`-)`'],
      [T.StadiumStart]: ['stadium', T.StadiumEnd, 'node label', '`])`'],
      [T.SubroutineStart]: ['subroutine', T.SubroutineEnd, 'node label', '`]]`'],
      [T.CylinderStart]: ['cylinder', T.CylinderEnd, 'node label', '`)]`'],
      [T.TagEnd]: ['odd', T.SQE, 'node label', '`]`'],
    },
    LINE_END,
    LINE_END_SET: kindSet(...LINE_END),
    READ_PAST: kindSet(...READ_PAST_KINDS),
    PARSER_TRIVIA: kindSet(...READ_PAST_KINDS, Kind.Space),
    BOUNDARY: kindSet(Kind.EOF, T.Eof, Kind.Newline, T.Semi, ...separators),
    STATEMENT_START,
    STATEMENT_KINDS,
    DOC_KINDS,
    BLOCK_DOC_KINDS: [...DOC_KINDS, T.End],
    BLANKS,
    HEADER_START: [...BLANKS, ...separators, T.Graph],
    HEADER_SKIP: kindSet(...BLANKS, ...separators),
    DIR_KINDS: [T.NoDir, T.Dir],
    AFTER_DIR: [T.Space, ...LINE_END],
    AFTER_DIR_END: kindSet(...AFTER_DIR_KINDS),
    // Without its own separators a dialect names every statement end: the list `separator()`
    // fails with, which the hint for two statements on a line goes by.
    AFTER_DIR_WANT: separators.length === 0 ? LINE_END : AFTER_DIR_KINDS,
    SHAPE_KINDS,
    GRAPH: [T.Graph],
    PS_ONLY: [T.PS],
    DIAMOND_ONLY: [T.DiamondStart],
    TRAP_ENDS: [T.TrapEnd, T.InvTrapEnd],
    STYLE_SEPARATOR: [T.StyleSeparator],
    SHAPE_DATA: [T.ShapeData],
    SHAPE_DATA_PARTS: [T.ShapeData, T.ShapeDataEnd],
    SPACE: [T.Space],
    AMP: [T.Amp],
    LINK_KINDS,
    LINK_AFTER_ID: [T.Link, T.StartLink],
    AFTER_EDGE_LABEL: [T.Space, T.NodeString],
    PIPE: [T.Pipe],
    COMMA: [T.Comma],
    STYLE_WANT: [T.NodeString],
    LINK_STYLE_INDEX: [T.Default, T.Num],
    INTERPOLATE_OR_STYLE: [T.Interpolate, T.NodeString],
    CLICK_ACTION: [T.CallbackName, T.Href, T.Str, T.NodeString],
    CALLBACK_ARGS: [T.CallbackArgs],
    LINK_TARGET_OR_TOOLTIP: [T.LinkTarget, T.Str],
    BLOCK_HEADER: [T.Space, ...LINE_END],
    PROBE_FOLLOWS: probeFollows(T, SHAPE_KINDS, LINK_KINDS),
    EXPECTED: expected(T, dialect, { ID_KINDS, LINK_KINDS, SHAPE_KINDS }),
    STATEMENT_HINTS: {
      [T.Style]: 'write it as `style <node id> <styles>`, e.g. `style A fill:#f9f,stroke:#333`',
      [T.ClassDef]: 'write it as `classDef <name> <styles>`, e.g. `classDef hot fill:#f96`',
      [T.Class]: 'write it as `class <node ids> <class name>`, e.g. `class A,B hot`',
      [T.LinkStyle]:
        'write it as `linkStyle <link numbers or default> <styles>`, e.g. `linkStyle 0,1 stroke:red`',
      [T.Click]:
        'write it as `click <node id> <callback>` or `click <node id> "<url>"`, e.g. `click A "https://example.com"`',
      ...dialect.hints,
    },
    dataName: names.data,
    linkHint: dialect.linkHint,
  };
}
