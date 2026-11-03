/**
 * Flowchart parser: recursive descent over the {@link lex} tokens, producing a
 * {@link FlowModel}, the typed AST, symbols, statement spans and diagnostics (DESIGN §4.3).
 *
 * The grammar is v12's `flow.jison` (LALR); the descent follows Pele's port of it
 * (`src/diagrams/flowchart/parser.ts` @ 3a2f075, https://github.com/obsidianmd/pele, MIT,
 * (c) 2026 kepano), so it accepts and rejects what jison does. Unlike jison it does not stop
 * at the first error: it reports it, skips to the next statement boundary and carries on
 * (R-PARSE-4). An unclosed label or string, which swallows the rest of the text, is reported
 * at its opener and lexing restarts on the following line.
 */
// cspell:words kepano LALR yytexts
import {
  ExpectedTable,
  inKindSet,
  isSpace,
  Kind,
  kindSet,
  LineIndex,
  nodeId,
  ParseState,
} from '@mermaid-js/core/parser-kit';
import type {
  AstCallback,
  KindSet,
  ParseOptions,
  ParseResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { DEFAULT_LIMITS, LIMIT_CODES } from '@mermaid-js/core/limits';
import { parseYaml, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult, YamlMap, YamlValue } from '@mermaid-js/core/preprocess';
import type {
  FlowDocument,
  FlowEdge,
  FlowHeader,
  FlowLabelNode,
  FlowNodeStmt,
  FlowSimpleKind,
  FlowSimpleStmt,
  FlowStatementNode,
  FlowSubgraph,
} from './ast.ts';
import { lex } from './lexer.ts';
import { destructLink, FlowBuilder } from './model.ts';
import type { DocItem, FlowModel, LabelType, LinkInfo } from './model.ts';
import { cook, sourceView } from './source.ts';
import type { SourceView } from './source.ts';
import { T } from './tokens.ts';

export interface FlowParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** Edge cap (core `DEFAULT_LIMITS.maxEdges`, 5,000; v12's `maxEdges` was 500). */
  maxEdges?: number;
  /** Vertex cap (core `DEFAULT_LIMITS.maxNodes`). */
  maxNodes?: number;
  /** Subgraph nesting cap (core `DEFAULT_LIMITS.maxDepth`). */
  maxDepth?: number;
  /** v12 `flowchart.inheritDir`. */
  inheritDir?: boolean;
  /** Features claimed by extension plugins; `callbacks` silences `CALLBACK_IGNORED`. */
  claims?: readonly string[];
}

export type FlowParseResult = ParseResult<FlowModel, FlowDocument>;

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
const ID = kindSet(...ID_KINDS);
const ALPHANUM = kindSet(
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
const NO_TAGS = kindSet(
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
  T.Subgraph,
  T.End,
  T.Down,
  T.Up,
  T.StartLink
);
const STYLE_PART = kindSet(T.Num, T.NodeString, T.Colon, T.Space, T.Brkt, T.Style);
const TEXT_PART = kindSet(T.Text, T.TagStart, T.TagEnd, T.UnicodeText);
const EDGE_PART = kindSet(T.EdgeText, T.UnicodeText);
const NONE = kindSet();
const DIRECTIONS = ['TB', 'BT', 'RL', 'LR', 'TD'];

const LINE_END = [Kind.Newline, T.Semi, T.Eof];
const STATEMENT_START = [
  T.Style,
  T.LinkStyle,
  T.ClassDef,
  T.Class,
  T.Click,
  T.Subgraph,
  T.AccTitle,
  T.AccDescr,
  T.NodeString,
];

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
const EXPECTED = new ExpectedTable([
  ['`&`', [T.Amp]],
  ['a link number such as `0`', [T.Num]],
  ['a node id', ID_KINDS],
  ['a link such as `-->`', [T.Link, T.StartLink, T.LinkId]],
  [
    'a node shape such as `[text]`',
    [
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
    ],
  ],
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
  ['a line break or `;`', [Kind.Newline, T.Semi]],
  ['a space', [T.Space]],
  ['a direction such as `TD` or `LR`', [T.Dir, T.NoDir]],
  ['`graph` or `flowchart`', [T.Graph]],
  ['`end`', [T.End]],
  [
    'a statement such as `style`, `classDef`, `class`, `click` or `subgraph`',
    [
      T.Style,
      T.LinkStyle,
      T.ClassDef,
      T.Class,
      T.Click,
      T.Subgraph,
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
  ['shape data `@{ … }`', [T.ShapeData]],
  ['`}`', [T.ShapeDataEnd]],
  ['the end of the text', [Kind.EOF, T.Eof]],
]);

/** Thrown inside the parser after a diagnostic is recorded; caught at statement level. */
class Stop {}
const STOP = new Stop();

interface Frame {
  id: FlowLabelNode | undefined;
  title: FlowLabelNode | undefined;
  list: DocItem[];
  collect: boolean;
  start: number;
  opener: Range;
  span: ReturnType<ParseState['beginStatement']>;
  children: FlowStatementNode[];
  outer: FlowStatementNode[];
}

interface Opener {
  range: Range;
  what: string;
  closer: string;
}

const NO_ITEMS: string[] = [];

/** How each statement is written, for errors inside it. */
const STATEMENT_HINTS: Record<number, string> = {
  [T.Style]: 'write it as `style <node id> <styles>`, e.g. `style A fill:#f9f,stroke:#333`',
  [T.ClassDef]: 'write it as `classDef <name> <styles>`, e.g. `classDef hot fill:#f96`',
  [T.Class]: 'write it as `class <node ids> <class name>`, e.g. `class A,B hot`',
  [T.LinkStyle]:
    'write it as `linkStyle <link numbers or default> <styles>`, e.g. `linkStyle 0,1 stroke:red`',
  [T.Click]:
    'write it as `click <node id> <callback>` or `click <node id> "<url>"`, e.g. `click A "https://example.com"`',
};

/** Parse a flowchart. Never throws: problems are error diagnostics. */
export function parseFlowchart(src: string, options: FlowParseOptions = {}): FlowParseResult {
  const pre = options.preprocessed ?? preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const st = new ParseState();
  if (!options.preprocessed) st.diagnostics.list.push(...pre.diagnostics);
  // Line numbers are only for error messages.
  let lines: LineIndex | undefined;
  const lineOf = (at: number) => (lines ??= new LineIndex(src)).position(at).line + 1;
  const db = new FlowBuilder({
    maxEdges: options.maxEdges ?? DEFAULT_LIMITS.maxEdges,
    maxNodes: options.maxNodes ?? DEFAULT_LIMITS.maxNodes,
    inheritDir: options.inheritDir ?? false,
    error: (code, message, range) => {
      st.diagnostics.error(code, message, range);
    },
    warn: (code, message, range) => {
      st.diagnostics.warning(code, message, range);
    },
  });

  const fullTokens = lex(src, pre.bodyStart, view);
  let tokens: TokenStream = fullTokens;
  // Significant tokens (comments and directives dropped) as parallel arrays.
  // Without trivia these are the stream's own arrays.
  let K: Uint16Array = new Uint16Array(0);
  let S: Uint32Array = new Uint32Array(0);
  let E: Uint32Array = new Uint32Array(0);
  /** 1 where trivia came right before the token; undefined when the stream has none. */
  let gap: Uint8Array | undefined;
  const load = (stream: TokenStream) => {
    let trivia = 0;
    for (let j = 0; j < stream.length; j++) {
      const k = stream.kind[j];
      if (k === Kind.Comment || k === Kind.Directive) trivia++;
    }
    if (trivia === 0) {
      K = stream.kind;
      S = stream.start;
      E = stream.end;
      gap = undefined;
      return;
    }
    const n = stream.length - trivia;
    K = new Uint16Array(n);
    S = new Uint32Array(n);
    E = new Uint32Array(n);
    gap = new Uint8Array(n);
    let after = 0;
    let o = 0;
    for (let j = 0; j < stream.length; j++) {
      const k = stream.kind[j] ?? Kind.EOF;
      if (k === Kind.Comment || k === Kind.Directive) {
        after = 1;
        continue;
      }
      K[o] = k;
      S[o] = stream.start[j] ?? 0;
      E[o] = stream.end[j] ?? 0;
      gap[o] = after;
      after = 0;
      o++;
    }
  };
  load(tokens);
  let i = 0;
  const kind = (j = i) => K[j] ?? Kind.EOF;
  /** A token's text as v12 saw it (removed spans dropped, entities decoded). */
  const raw = (j = i) => cook(src, S[j] ?? 0, E[j] ?? 0, view);
  // Source extent of a token, with the quotes around a string (the lexer drops them).
  const tokStart = (j: number) => {
    const s = S[j] ?? 0;
    if (K[j] === T.Str && src[s - 1] === '"') return s - 1;
    if (K[j] === T.MdStr && src.startsWith('"`', s - 2)) return s - 2;
    if (K[j] === T.Click) {
      // `click` and its blanks are consumed without a token.
      let b = s;
      while (b > 0 && isSpace(src.charCodeAt(b - 1))) b--;
      if (src.startsWith('click', b - 5)) return b - 5;
    }
    return s;
  };
  const tokEnd = (j: number) => {
    const e = E[j] ?? 0;
    if (K[j] === T.Str && src[e] === '"') return e + 1;
    if (K[j] === T.MdStr && src.startsWith('`"', e)) return e + 2;
    if (K[j] === T.End) return (S[j] ?? 0) + 3;
    return e;
  };
  const range = (a: number, b = a): Range => ({ start: tokStart(a), end: tokEnd(b) });
  const span = (from: number): Range => ({
    start: tokStart(from),
    end: i > from ? tokEnd(i - 1) : tokStart(from),
  });
  const opens: Opener[] = [];
  let stmtHint: string | undefined;
  let restartFrom = -1;

  const found = (j = i): string => {
    const k = kind(j);
    if (k === Kind.EOF || k === T.Eof) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    if (k === T.Space) return 'a space';
    if (k === Kind.Error) return `the character \`${raw(j)}\``;
    const t = (k === T.Str || k === T.MdStr ? src.slice(tokStart(j), tokEnd(j)) : raw(j)).trim();
    return t.length > 24 ? `\`${t.slice(0, 24)}…\`` : `\`${t}\``;
  };

  /** Offset of the line break ending the line that holds `at`. */
  const lineBreakAfter = (at: number) => {
    let e = at;
    while (e < src.length && src[e] !== '\n' && src[e] !== '\r') e++;
    return e;
  };
  // Lexing restarts in the initial state after an error inside a label or other lexer mode,
  // which would otherwise swallow the following lines.
  let lastRestart = -1;
  let restarts = 0;
  const restartAt = (at: number) => {
    if (at > lastRestart && at <= src.length && restarts < 64) restartFrom = at;
  };
  /** The next statement boundary (`;` or line break) at or after `at`. */
  const boundaryAfter = (at: number) => {
    let e = at;
    while (e < src.length && src[e] !== '\n' && src[e] !== '\r' && src[e] !== ';') e++;
    return e;
  };
  const LEXER_MODE = kindSet(
    T.Text,
    T.EdgeText,
    T.Str,
    T.MdStr,
    T.ShapeData,
    T.Click,
    T.CallbackName,
    T.CallbackArgs
  );

  const fail = (want: readonly number[], hint?: string): never => {
    const k = kind();
    const where = range(i);
    const open = opens[opens.length - 1];
    const prev = i - 1;
    if (
      k === Kind.EOF &&
      (K[prev] === T.Str || K[prev] === T.MdStr) &&
      (E[prev] ?? 0) >= src.length
    ) {
      // A string ran to the end of the text.
      const q = { start: tokStart(prev), end: S[prev] ?? 0 };
      st.diagnostics.error(
        'UNCLOSED_STRING',
        K[prev] === T.MdStr
          ? `Unclosed markdown string: the string opened at line ${lineOf(q.start)} has no closing backtick and quote.`
          : `Unclosed string: the string opened at line ${lineOf(q.start)} has no closing quote.`,
        q,
        { related: [{ message: 'The text ends here.', range: where }] }
      );
      restartAt(lineBreakAfter(q.end));
      throw STOP;
    }
    if (open && (k === Kind.EOF || lineOf(where.start) > lineOf(open.range.start))) {
      const got = k === Kind.EOF ? '' : ` before ${found()} at line ${lineOf(where.start)}`;
      st.diagnostics.error(
        'UNCLOSED',
        `Unclosed ${open.what}: the \`${src.slice(open.range.start, open.range.end)}\` at line ${lineOf(open.range.start)} has no closing ${open.closer}${got}. Add ${open.closer} to close it.`,
        open.range,
        {
          expected: EXPECTED.names(want),
          related: [
            { message: k === Kind.EOF ? 'The text ends here.' : 'Found here.', range: where },
          ],
        }
      );
      // The label swallowed the lines after it: carry on from the line after its opener.
      restartAt(lineBreakAfter(open.range.end));
      throw STOP;
    }
    // The tokens after an error may come from a lexer mode the bad text opened (`>` starts a
    // label, for one): lex again from the next statement boundary.
    restartAt(
      opens.length > 0 || inKindSet(LEXER_MODE, k) || (k === Kind.Error && raw() === '#')
        ? lineBreakAfter(where.start)
        : boundaryAfter(where.start)
    );
    if (
      k === Kind.Error &&
      raw() === '#' &&
      /^#\w+;/.test(src.slice(where.start, where.start + 40))
    ) {
      st.diagnostics.error(
        'ENTITY_OUTSIDE_LABEL',
        'Entities such as `#quot;` work only inside labels: put the text in a label, e.g. `A["#quot;"]`.',
        where
      );
      throw STOP;
    }
    if (k === Kind.Error) {
      st.diagnostics.error(
        'UNEXPECTED_CHARACTER',
        `Unexpected character \`${raw()}\`${(hint ?? hintFor(raw())) ? `; ${hint ?? hintFor(raw())}` : ''}.`,
        where,
        { expected: EXPECTED.names(want) }
      );
      throw STOP;
    }
    const d = st.diagnostics.unexpected('UNEXPECTED', where, EXPECTED.names(want), found());
    const bracket = open && /^[[\](){}|]/.test(raw());
    const quoted = open && (k === T.Str || k === T.MdStr);
    const explain = (): string | undefined => {
      if (bracket) return 'to use brackets in a label, put it in quotes, e.g. `A["a (b)"]`';
      if (quoted)
        return 'to use quotes in a label, quote it all and write them as `#quot;`, e.g. `A["say #quot;hi#quot;"]`';
      const general = hintFor(raw());
      if (general) return general;
      if (k === T.End || k === T.Graph || k === T.Subgraph) {
        const word = raw().trim();
        return `\`${word}\` is a keyword: use another node id, and \`${word}\` as its label if needed, e.g. \`X[${word}]\``;
      }
      if (want === LINE_END && inKindSet(ID, k))
        return 'put each statement on its own line, or separate them with `;`';
      return stmtHint;
    };
    const why = hint ?? explain();
    if (why) d.message = `${d.message.slice(0, -1)}; ${why}.`;
    throw STOP;
  };

  const expect = (k: number, ...also: number[]): number => {
    if (kind() !== k) fail([k, ...also]);
    return i++;
  };

  const separator = (): void => {
    const k = kind();
    if (k !== Kind.Newline && k !== T.Semi && k !== T.Eof) fail(LINE_END);
    i++;
  };

  /** Concatenated token text of a run (ids, styles), as v12 joined yytexts. */
  const runText = (from: number, to: number): string => {
    let s = '';
    for (let j = from; j < to; j++) s += cook(src, S[j] ?? 0, E[j] ?? 0, view);
    return s;
  };

  const run = (table: KindSet, want: readonly number[]): [string, Range] => {
    if (!inKindSet(table, kind())) fail(want);
    const from = i++;
    while (inKindSet(table, kind())) i++;
    return [runText(from, i), span(from)];
  };
  const idString = () => run(ID, [T.NodeString]);
  const alphaNum = () => run(ALPHANUM, [T.NodeString]);

  /**
   * A label: a string (one Str/MdStr token, plus pieces a removed comment line split off) or
   * a first text token, then more text tokens of `part` (jison's left-recursive `text`).
   */
  const labelRun = (
    part: KindSet,
    first: KindSet,
    want: readonly number[],
    strType: LabelType
  ): FlowLabelNode => {
    const from = i;
    const k = kind();
    let type: LabelType;
    if (k === T.Str || k === T.MdStr) {
      type = k === T.Str ? strType : 'markdown';
      i++;
      while (kind() === k && gap?.[i] === 1) i++;
    } else if (inKindSet(first, k)) {
      type = 'text';
      i++;
    } else return fail(want);
    while (inKindSet(part, kind())) i++;
    return { text: runText(from, i), type, range: span(from) };
  };
  const text = () => labelRun(TEXT_PART, TEXT_PART, [T.Text, T.Str], 'string');
  const edgeText = () => labelRun(EDGE_PART, EDGE_PART, [T.EdgeText, T.Str], 'string');
  const textNoTags = () => labelRun(NO_TAGS, NO_TAGS, [T.NodeString, T.Str], 'text');
  const str = (): FlowLabelNode => labelRun(NONE, NONE, [T.Str], 'string');

  const closer = (k: number) => {
    expect(k, T.Text);
    opens.pop();
  };
  const open = (what: string, close: string) => {
    opens.push({ range: range(i), what, closer: close });
    i++;
  };

  // ---- shape data -------------------------------------------------------------------

  const shapeData = (): { value: YamlMap | null; range: Range } => {
    const opener = range(i);
    i++;
    let built = '';
    let inString = false;
    while (kind() === T.ShapeData) {
      const piece = cook(src, S[i] ?? 0, E[i] ?? 0, view);
      if (raw() === '"' && E[i] === (S[i] ?? 0) + 1) {
        inString = !inString;
        built += piece;
      } else built += inString ? piece.replace(/\n\s*/g, '<br/>') : piece;
      i++;
    }
    if (kind() !== T.ShapeDataEnd) {
      opens.push({ range: opener, what: 'shape data', closer: '`}`' });
      fail([T.ShapeDataEnd]);
    }
    const close = S[i] ?? 0;
    i++;
    const whole: Range = { start: opener.start, end: close + 1 };
    const inner = { start: opener.end, end: close };
    // v12 parsed `{\n<data>\n}`; a `#` comment reads differently without those newlines.
    const inPlace = src.slice(inner.start, inner.end) === built && !built.includes('#');
    const multiline = built.includes('\n');
    const result = inPlace
      ? parseYaml(src, multiline ? inner : { start: opener.start + 1, end: whole.end })
      : parseYaml(multiline ? built + '\n' : `{\n${built}\n}`);
    for (const d of result.diagnostics) {
      const r = inPlace ? d.range : whole;
      if (d.severity === 'error') {
        st.diagnostics.error('SHAPE_DATA', d.message, r);
      } else st.diagnostics.warning(d.code, d.message, r);
    }
    // A semantic error: the tokens are fine, so parse on and report later errors in the same
    // statement too (R-PARSE-4). The node keeps no data.
    if (result.diagnostics.some((d) => d.severity === 'error'))
      return { value: null, range: whole };
    const value = result.value;
    return { value: isYamlMap(value) ? value : null, range: whole };
  };

  // ---- vertices and chains ----------------------------------------------------------

  const ids = st.ids;
  /** A vertex's AST id is its first mention's: `n:<name>`. */
  const nodeAst = (name: string) => db.vertices.get(name)?.ast ?? nodeId(name);
  let chain: (FlowNodeStmt | FlowEdge)[] = [];

  /** A mention that may create the vertex: its definition when it does. */
  const nodeSymbol = (name: string, r: Range) => {
    const creates = !db.vertices.has(name) && !db.hasEdge(name) && name.trim() !== '';
    st.symbol(name, 'node', r, creates ? 'def' : 'ref');
  };

  const SHAPES: Record<number, [shape: string, close: number, what: string, closeText: string]> = {
    [T.SQS]: ['square', T.SQE, 'node label', '`]`'],
    [T.DoubleCircleStart]: ['doublecircle', T.DoubleCircleEnd, 'node label', '`)))`'],
    [T.EllipseStart]: ['ellipse', T.EllipseEnd, 'node label', '`-)`'],
    [T.StadiumStart]: ['stadium', T.StadiumEnd, 'node label', '`])`'],
    [T.SubroutineStart]: ['subroutine', T.SubroutineEnd, 'node label', '`]]`'],
    [T.CylinderStart]: ['cylinder', T.CylinderEnd, 'node label', '`)]`'],
    [T.TagEnd]: ['odd', T.SQE, 'node label', '`]`'],
  };

  const vertex = (): FlowNodeStmt => {
    const startTok = i;
    const [name, nameRange] = idString();
    nodeSymbol(name, nameRange);
    const node: FlowNodeStmt = {
      id: ids.node(name),
      type: 'Node',
      range: nameRange,
      name,
      nameRange,
    };
    const k = kind();
    let shape: string | undefined;
    let lbl: FlowLabelNode | undefined;
    let props: Record<string, string> | undefined;
    const simple = SHAPES[k];
    if (simple) {
      open(simple[2], simple[3]);
      lbl = text();
      closer(simple[1]);
      shape = simple[0];
    } else if (k === T.PS || k === T.DiamondStart) {
      const round = k === T.PS;
      open('node label', round ? '`)`' : '`}`');
      if (kind() === k) {
        open('node label', round ? '`)`' : '`}`');
        lbl = text();
        closer(round ? T.PE : T.DiamondStop);
        closer(round ? T.PE : T.DiamondStop);
        shape = round ? 'circle' : 'hexagon';
      } else {
        lbl = text();
        closer(round ? T.PE : T.DiamondStop);
        shape = round ? 'round' : 'diamond';
      }
    } else if (k === T.VertexWithPropsStart) {
      open('node label', '`]`');
      const field = raw(expect(T.NodeString));
      expect(T.Colon);
      const value = raw(expect(T.NodeString));
      expect(T.Pipe);
      lbl = text();
      closer(T.SQE);
      shape = 'rect';
      props = Object.fromEntries([[field, value]]) as Record<string, string>;
    } else if (k === T.TrapStart || k === T.InvTrapStart) {
      const trap = k === T.TrapStart;
      open('node label', trap ? '`\\]` or `/]`' : '`/]` or `\\]`');
      lbl = text();
      if (kind() === (trap ? T.InvTrapEnd : T.TrapEnd)) {
        i++;
        opens.pop();
        shape = trap ? 'lean_right' : 'lean_left';
      } else {
        closer(trap ? T.TrapEnd : T.InvTrapEnd);
        shape = trap ? 'trapezoid' : 'inv_trapezoid';
      }
    }
    db.addVertex(name, nodeAst(name), nameRange, lbl, shape, undefined, props);
    if (shape !== undefined) node.shape = shape;
    if (lbl) node.label = lbl;
    node.range = span(startTok);
    return node;
  };

  const styledVertex = (): FlowNodeStmt => {
    const node = vertex();
    if (kind() === T.StyleSeparator) {
      i++;
      const [cls, r] = idString();
      st.symbol(cls, 'class', r, 'ref');
      db.setClass(node.name, cls);
      node.className = cls;
      node.range = { start: node.range.start, end: r.end };
    }
    return node;
  };

  let pendingData: { value: YamlMap | null; range: Range } | undefined;

  const applyData = (node: FlowNodeStmt, data: { value: YamlMap | null; range: Range }) => {
    db.addVertex(
      node.name,
      nodeAst(node.name),
      data.range,
      undefined,
      undefined,
      undefined,
      undefined,
      data.value
    );
    node.dataRange = data.range;
    node.range = { start: node.range.start, end: data.range.end };
  };

  const node = (): FlowNodeStmt[] => {
    const nodes = [styledVertex()];
    chain.push(nodes[0] as FlowNodeStmt);
    pendingData = undefined;
    while (true) {
      const data = kind() === T.ShapeData ? shapeData() : undefined;
      if (kind() !== T.Space) {
        pendingData = data;
        return nodes;
      }
      do i++;
      while (kind() === T.Space);
      if (kind() !== T.Amp) {
        // Blanks after shape data must lead to `&` (v12 drops them before a line break).
        if (data !== undefined)
          fail(
            [T.Amp],
            'after shape data `@{ … }` only `&` and another node may follow on the line'
          );
        return nodes;
      }
      i++;
      if (kind() !== T.Space) fail([T.Space]);
      do i++;
      while (kind() === T.Space);
      const next = styledVertex();
      if (data !== undefined) applyData(nodes[nodes.length - 1] as FlowNodeStmt, data);
      nodes.push(next);
      chain.push(next);
    }
  };

  const link = (): [LinkInfo, Range, FlowLabelNode | undefined] => {
    const from = i;
    let id: string | undefined;
    if (kind() === T.LinkId) {
      id = raw();
      st.symbol(id.slice(0, -1), 'edge', { start: S[i] ?? 0, end: (E[i] ?? 1) - 1 }, 'def');
      i++;
    }
    if (kind() === T.Link) {
      const info = destructLink(raw(i++));
      if (id !== undefined) info.id = id;
      let lbl: FlowLabelNode | undefined;
      if (kind() === T.Pipe) {
        open('edge label', '`|`');
        lbl = text();
        info.text = { text: lbl.text, type: lbl.type };
        closer(T.Pipe);
        if (kind() === T.Space) i++;
      }
      return [info, span(from), lbl];
    }
    if (kind() === T.StartLink) {
      const startText = raw();
      opens.push({ range: range(i), what: 'edge label', closer: 'arrow such as `-->`' });
      i++;
      const lbl = edgeText();
      const end = raw(expect(T.Link, T.EdgeText));
      opens.pop();
      const info = destructLink(end, startText);
      info.text = { text: lbl.text, type: lbl.type };
      if (id !== undefined) info.id = id;
      return [info, span(from), lbl];
    }
    return fail([T.Link, T.StartLink]);
  };

  const vertexStatement = (collect: boolean): string[] => {
    let stmt = node();
    let nodes = stmt.map((n) => n.name);
    if (pendingData !== undefined) applyData(stmt[stmt.length - 1] as FlowNodeStmt, pendingData);
    while (true) {
      const t = kind();
      if (t !== T.Link && t !== T.StartLink && t !== T.LinkId) return nodes;
      const [info, linkRange, lbl] = link();
      const next = node();
      if (pendingData !== undefined) applyData(next[next.length - 1] as FlowNodeStmt, pendingData);
      const before = db.edges.length;
      db.addLink(
        stmt.map((n) => n.name),
        next.map((n) => n.name),
        info,
        (a, b) => ids.edge(a, b),
        linkRange
      );
      for (const edge of db.edges.slice(before)) {
        const from = stmt.find((n) => n.name === edge.start);
        const to = next.find((n) => n.name === edge.end);
        const ast: FlowEdge = {
          id: edge.ast,
          type: 'Edge',
          range: {
            start: from?.range.start ?? linkRange.start,
            end: to?.range.end ?? linkRange.end,
          },
          from: edge.start,
          to: edge.end,
          edgeId: edge.id,
          linkRange,
        };
        if (lbl) ast.label = lbl;
        chain.push(ast);
      }
      if (collect) nodes = next.map((n) => n.name).concat(nodes);
      stmt = next;
    }
  };

  // ---- other statements ---------------------------------------------------------------

  const style = (): string => {
    if (!inKindSet(STYLE_PART, kind())) fail([T.NodeString]);
    const from = i++;
    while (inKindSet(STYLE_PART, kind())) i++;
    return runText(from, i);
  };

  const stylesOpt = (): string[] => {
    const out = [style()];
    while (kind() === T.Comma) {
      i++;
      out.push(style());
    }
    return out;
  };

  const refs = (list: string, r: Range, kindName: string, role: 'def' | 'ref', out: string[]) => {
    let at = r.start;
    const exact = src.slice(r.start, r.end) === list;
    for (const part of list.split(',')) {
      const pr = exact ? { start: at, end: at + part.length } : r;
      st.symbol(part, kindName, pr, role);
      out.push(part);
      at += part.length + 1;
    }
  };

  const linkStyleStatement = (): void => {
    const at = i;
    i++;
    expect(T.Space);
    const positions: string[] = [];
    if (kind() === T.Default) positions.push(raw(i++));
    else {
      positions.push(raw(expect(T.Num, T.Default)));
      while (kind() === T.Comma) {
        i++;
        positions.push(raw(expect(T.Num)));
      }
    }
    expect(T.Space);
    if (kind() !== T.Interpolate) {
      const styles = stylesOpt();
      // An index error is semantic: the statement parses on (R-PARSE-4).
      db.updateLink(positions, styles, span(at));
      return;
    }
    i++;
    expect(T.Space);
    const [interpolate] = alphaNum();
    if (kind() === T.Space) {
      i++;
      const styles = stylesOpt();
      if (db.updateLinkInterpolate(positions, interpolate, span(at)))
        db.updateLink(positions, styles, span(at));
    } else db.updateLinkInterpolate(positions, interpolate, span(at));
  };

  const strText = (j: number) => cook(src, S[j] ?? 0, E[j] ?? 0, view);

  /** A `"…"` value in a click statement (one Str token, as jison requires). */
  const expectStr = (...also: number[]): string => {
    if (kind() === T.Str) return str().text;
    return fail([T.Str, ...also]);
  };

  /** Returns the callback of a `click … callback` / `call` statement, for the AST. */
  const clickStatement = (out: string[]): AstCallback | undefined => {
    const at = i;
    const id = raw(i++);
    refs(id, range(at), 'node', 'ref', out);
    const k = kind();
    if (k === T.CallbackName) {
      const name = strText(i++);
      const args = kind() === T.CallbackArgs ? strText(i++) : undefined;
      let tooltip: string | undefined;
      if (kind() === T.Space) {
        i++;
        tooltip = expectStr();
      }
      db.setClickEvent(id, name, span(at), args);
      if (tooltip !== undefined) db.setTooltip(id, tooltip);
      return args === undefined
        ? { targets: id.split(','), name }
        : { targets: id.split(','), name, args };
    }
    let url: string;
    if (k === T.Href) {
      i++;
      url = expectStr();
    } else if (k === T.Str) url = expectStr();
    else {
      const [name] = alphaNum();
      let tooltip: string | undefined;
      if (kind() === T.Space) {
        i++;
        tooltip = expectStr();
      }
      db.setClickEvent(id, name, span(at));
      if (tooltip !== undefined) db.setTooltip(id, tooltip);
      return { targets: id.split(','), name };
    }
    if (kind() !== T.Space) {
      db.setLink(id, url, span(at));
      return;
    }
    i++;
    if (kind() === T.LinkTarget) {
      db.setLink(id, url, span(at), raw(i++));
      return;
    }
    const tooltip = expectStr(T.LinkTarget);
    if (kind() === T.Space) {
      i++;
      const target = raw(expect(T.LinkTarget));
      db.setLink(id, url, span(at), target);
    } else db.setLink(id, url, span(at));
    db.setTooltip(id, tooltip);
  };

  const simple = (k: FlowSimpleKind, from: number, refsOut: string[]): FlowSimpleStmt => {
    const r = span(from);
    st.statement(k.charAt(0).toLowerCase() + k.slice(1), r);
    return {
      id: ids.statement(k.charAt(0).toLowerCase() + k.slice(1)),
      type: k,
      range: r,
      refs: refsOut,
    };
  };

  /** One statement. Returns what v12's grammar adds to an enclosing subgraph's list. */
  const statement = (collect: boolean, out: FlowStatementNode[]): DocItem => {
    const t = kind();
    stmtHint = STATEMENT_HINTS[t];
    const from = i;
    const refList: string[] = [];
    switch (t) {
      case T.Style: {
        i++;
        expect(T.Space);
        const [id, r] = idString();
        nodeSymbol(id, r);
        refList.push(id);
        expect(T.Space);
        const styles = stylesOpt();
        db.addVertex(id, nodeAst(id), r, undefined, undefined, styles);
        out.push(simple('Style', from, refList));
        separator();
        return NO_ITEMS;
      }
      case T.LinkStyle:
        linkStyleStatement();
        out.push(simple('LinkStyle', from, refList));
        separator();
        return NO_ITEMS;
      case T.ClassDef: {
        i++;
        expect(T.Space);
        const [id, r] = idString();
        expect(T.Space);
        const styles = stylesOpt();
        refs(id, r, 'class', 'def', refList);
        db.addClass(id, styles);
        out.push(simple('ClassDef', from, refList));
        separator();
        return NO_ITEMS;
      }
      case T.Class: {
        i++;
        expect(T.Space);
        const [targets, r] = idString();
        expect(T.Space);
        const [cls, cr] = idString();
        refs(targets, r, 'node', 'ref', refList);
        st.symbol(cls, 'class', cr, 'ref');
        refList.push(cls);
        db.setClass(targets, cls);
        out.push(simple('Class', from, refList));
        separator();
        return NO_ITEMS;
      }
      case T.Click: {
        const callback = clickStatement(refList);
        const stmt = simple('Click', from, refList);
        if (callback !== undefined) stmt.callback = callback;
        out.push(stmt);
        separator();
        return NO_ITEMS;
      }
      case T.DirectionTB:
      case T.DirectionBT:
      case T.DirectionRL:
      case T.DirectionLR:
      case T.DirectionTD:
        i++;
        out.push(simple('Direction', from, refList));
        return { stmt: 'dir', value: DIRECTIONS[t - T.DirectionTB] ?? 'TB' };
      case T.AccTitle: {
        i++;
        const value = strText(expect(T.AccTitleValue)).trim();
        db.setAccTitle(value);
        out.push(simple('AccTitle', from, refList));
        return value;
      }
      case T.AccDescr: {
        i++;
        const value = strText(expect(T.AccDescrValue)).trim();
        db.setAccDescription(value);
        out.push(simple('AccDescr', from, refList));
        return value;
      }
      case T.AccDescrMultilineValue: {
        const value = strText(i++).trim();
        db.setAccDescription(value);
        out.push(simple('AccDescr', from, refList));
        return value;
      }
      default: {
        if (!inKindSet(ID, t)) fail(STATEMENT_START);
        chain = [];
        const nodes = vertexStatement(collect);
        const r = span(from);
        st.statement('chain', r);
        out.push({ id: ids.statement('chain'), type: 'Chain', range: r, children: chain });
        separator();
        return nodes;
      }
    }
  };

  const children: FlowStatementNode[] = [];
  const frames: Frame[] = [];
  const maxDepth = options.maxDepth ?? DEFAULT_LIMITS.maxDepth;
  let list: DocItem[] = [];
  let collect = false;
  let body = children;

  const subgraphHeader = (): void => {
    const from = i;
    const opener = range(i);
    i++;
    let id: FlowLabelNode | undefined;
    let title: FlowLabelNode | undefined;
    const t = kind();
    if (t === Kind.Newline || t === T.Semi || t === T.Eof) {
      i++;
    } else {
      expect(T.Space, ...LINE_END);
      id = textNoTags();
      title = id;
      if (kind() === T.SQS) {
        open('subgraph title', '`]`');
        title = text();
        closer(T.SQE);
      }
      const k = kind();
      if (k !== Kind.Newline && k !== T.Semi && k !== T.Eof) fail([...LINE_END, T.SQS]);
      i++;
    }
    const spanned = st.beginStatement('subgraph', S[from] ?? 0);
    frames.push({
      id,
      title,
      list,
      collect,
      start: S[from] ?? 0,
      opener,
      span: spanned,
      children: [],
      outer: body,
    });
    list = [];
    collect = true;
    body = (frames[frames.length - 1] as Frame).children;
    if (frames.length === maxDepth + 1) {
      st.diagnostics.error(
        LIMIT_CODES.maxDepth,
        `Subgraphs are nested ${frames.length} deep here, over the limit of ${maxDepth}. The limit is set by the page or app that renders the diagram.`,
        opener
      );
    }
  };

  const closeSubgraph = (frame: Frame, end: number): void => {
    const sgId = db.addSubGraph(frame.id, list, frame.title, (name) => ids.subgraph(name));
    if (frame.id) {
      const named = frame.id === frame.title && /\s/.test(frame.title.text) ? undefined : frame.id;
      if (named) {
        const written = src.slice(named.range.start, named.range.end);
        const start = named.range.start + (written.length - written.trimStart().length);
        st.symbol(sgId, 'subgraph', { start, end: start + written.trim().length }, 'def');
      }
    }
    st.endStatement(frame.span, end);
    const sg = db.subgraph(sgId);
    const node: FlowSubgraph = {
      id: sg?.ast ?? ids.subgraph(sgId),
      type: 'Subgraph',
      range: { start: frame.start, end },
      name: sgId,
      children: frame.children,
    };
    if (frame.title) node.title = frame.title;
    frame.outer.push(node);
    body = frame.outer;
    list = frame.list;
    collect = frame.collect;
    if (collect) list.push(sgId);
  };

  /** Skip to the next statement boundary after an error (R-PARSE-4). */
  const recover = (): void => {
    opens.length = 0;
    if (restartFrom >= 0) {
      const from = restartFrom;
      restartFrom = -1;
      lastRestart = from;
      restarts++;
      tokens = lex(src, from, view, false);
      load(tokens);
      i = 0;
      return;
    }
    while (
      kind() !== Kind.EOF &&
      kind() !== T.Eof &&
      kind() !== Kind.Newline &&
      kind() !== T.Semi
    ) {
      i++;
    }
  };

  const document = (): void => {
    while (true) {
      const t = kind();
      if (t === Kind.EOF) break;
      try {
        if (t === T.End) {
          const frame = frames.pop();
          if (frame === undefined) {
            const r = { start: S[i] ?? 0, end: (S[i] ?? 0) + 3 };
            st.diagnostics.error(
              'UNEXPECTED_END',
              'Unexpected `end`: there is no open subgraph to close. Remove it, or add a `subgraph` above.',
              r
            );
            i++;
          } else {
            i++;
            closeSubgraph(frame, tokEnd(i - 1));
          }
        } else if (t === T.Semi || t === Kind.Newline || t === T.Space || t === T.Eof) {
          if (collect) list.push(raw());
          i++;
        } else if (t === T.Subgraph) {
          stmtHint = 'write a subgraph as `subgraph id`, or `subgraph id [title]`, on its own line';
          subgraphHeader();
        } else {
          const item = statement(collect, body);
          if (collect && (!Array.isArray(item) || item.length > 0)) list.push(item);
        }
      } catch (e) {
        if (e !== STOP) throw e;
        recover();
      }
    }
    while (frames.length > 0) {
      const frame = frames[frames.length - 1] as Frame;
      st.diagnostics.error(
        'UNCLOSED_SUBGRAPH',
        `Unclosed subgraph: the subgraph opened at line ${lineOf(frame.opener.start)} has no \`end\`. Add \`end\` to close it.`,
        frame.opener,
        {
          related: [
            { message: 'The text ends here.', range: { start: src.length, end: src.length } },
          ],
        }
      );
      frames.pop();
      closeSubgraph(frame, src.length);
    }
  };

  const header = (): void => {
    while (kind() === T.Space || kind() === Kind.Newline) i++;
    const from = i;
    try {
      if (kind() !== T.Graph)
        fail([T.Graph], 'a flowchart starts with `flowchart` or `graph` and a direction');
      i++;
      if (kind() === T.NoDir) {
        i++;
        db.setDirection('TB');
      } else {
        if (kind() === Kind.Error) {
          const at = S[i] ?? 0;
          let w = at;
          while (w < src.length && /\s/.test(src[w] ?? '')) w++;
          let e = w;
          while (e < src.length && !/\s/.test(src[e] ?? '')) e++;
          st.diagnostics.error(
            'UNKNOWN_DIRECTION',
            `Unknown direction \`${src.slice(w, e)}\`: use TB, TD, BT, LR or RL (or \`>\`, \`<\`, \`^\`, \`v\`).`,
            { start: w, end: e },
            { expected: EXPECTED.names([T.Dir]) }
          );
          throw STOP;
        }
        const dir = raw(expect(T.Dir, T.NoDir));
        let t = kind();
        if (t === T.Space) {
          do i++;
          while (kind() === T.Space);
          t = kind();
          if (t !== Kind.Newline) fail([Kind.Newline]);
        } else if (t !== T.Semi && t !== Kind.Newline) fail(LINE_END);
        i++;
        db.setDirection(dir);
      }
      const r = { start: S[from] ?? 0, end: E[from + 1] ?? 0 };
      if (K[from + 1] === T.NoDir) r.end = E[from] ?? 0;
      st.statement('header', r);
      const h: FlowHeader = {
        id: ids.statement('header'),
        type: 'Header',
        range: r,
        keyword: raw(from),
        direction: db.direction,
      };
      children.push(h);
    } catch (e) {
      if (e !== STOP) throw e;
      recover();
    }
  };

  header();
  document();
  db.finish();

  const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
  const model = db.model(warnings);
  if (model.callbacks.length > 0 && !options.claims?.includes('callbacks')) {
    const first = model.callbacks[0];
    const d = st.diagnostics.warning(
      'CALLBACK_IGNORED',
      '`click … callback` and `call` are ignored: install the interactions plugin to run callbacks.',
      first?.range ?? { start: 0, end: 0 }
    );
    model.warnings.push(d);
  }
  const ast: FlowDocument = {
    id: 'doc',
    type: 'Document',
    range: { start: pre.bodyStart, end: src.length },
    children,
  };
  return st.result(model, ast, fullTokens, options);
}

/** A fix hint for common slips, from the text found where the error is. */
function hintFor(text: string): string | undefined {
  if (/^\s*[-=.<>ox~]+\s*$/.test(text) && /[-=.~]/.test(text)) {
    return 'links are written like `-->`, `---`, `-.->`, `==>` or `~~~`';
  }
  return undefined;
}

function isYamlMap(v: YamlValue): v is YamlMap {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export type { SourceView };
