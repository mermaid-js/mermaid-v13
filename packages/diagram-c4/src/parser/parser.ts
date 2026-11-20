/**
 * C4 parser: a linear descent over the {@link lex} tokens (gated against v12's jison lexer,
 * #538), producing a {@link C4Model}, the typed AST, symbols, statement spans and diagnostics
 * (DESIGN §4.3). One method per rule of `grammar/c4.ebnf`, the normative form:
 *
 * ```
 * diagram   = header NEWLINE statement { separator statement } [ NEWLINE ] EOF
 * separator = NEWLINE | (nothing, between an other statement and a diagram statement)
 * statement = other | element | relation | style | boundary
 * boundary  = macro arguments ( "{" NEWLINE | NEWLINE "{" [ NEWLINE ] )
 *             diagramStatement { separator statement } [ NEWLINE ] "}"
 * arguments = "(" argument { argument } ")"     (commas carry nothing, as in v12)
 * argument  = text | '"' text '"' | "$" name '="' value '"' | empty
 * ```
 *
 * Boundaries nest without recursion (an explicit stack), so depth costs no stack. Unlike jison
 * the parser does not stop at the first error: it reports it, skips to the next line and carries
 * on (R-PARSE-4); a boundary whose statement failed still opens at its `{`, so its `}` closes it.
 * What each statement adds to the model is `build.ts`'s (v12's DB with D452's and D457's
 * changes).
 *
 * Symbols (D458): each alias of an element or a boundary is an `element` or `boundary` symbol
 * (separate namespaces); the first statement with it defines it, a later one refers to it, and
 * so do relation ends and `Update…Style` targets (a shape first, as v12 looks them up).
 *
 * With a probe (R-LANG-7, D95) the parser records what it would accept at the probed token: a
 * header on the first line, a statement start after each line break (a macro, a title or
 * accessibility line, a boundary's `}`), an argument or `)` in the arguments; the lexer records
 * its jison start condition as the mode. Recovery stops the recording.
 */
import {
  cook,
  formatExpected,
  inKindSet,
  Kind,
  kindSet,
  LineIndex,
  ParseState,
  Probe,
  ProbeCursor,
  sourceView,
  TokenCursor,
} from '@mermaid-js/core/parser-kit';
import { STOP } from '@mermaid-js/shared/parser/support';
import type {
  ParseOptions,
  ParseResult,
  Range,
  SourceView,
  StatementSpan,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import * as codes from '../codes.ts';
import { checkLimits } from './limits.ts';
import type { C4LimitOptions } from './limits.ts';
import type {
  C4Direction,
  C4ElementKind,
  C4Model,
  C4NodeKind,
  C4RelationKind,
  C4Type,
} from '../model.ts';
import type {
  C4BoundaryNode,
  C4Document,
  C4RelationNode,
  C4StatementNode,
  C4StyleNode,
} from './ast.ts';
import { C4Builder } from './build.ts';
import type { Arg, BoundaryMacro } from './build.ts';
import { lex } from './lexer.ts';
import { SLOT_TABLES } from './slots.ts';
import type { SlotTable } from './slots.ts';
import { HEADERS, T } from './tokens.ts';

export interface C4ParseOptions extends ParseOptions, C4LimitOptions {}

export type C4ParseResult = ParseResult<C4Model, C4Document>;

/** Parse a C4 diagram. Never throws: problems are error diagnostics. */
export function parseC4(src: string, options: C4ParseOptions = {}): C4ParseResult {
  return new C4Parser(src, options).parse();
}

/**
 * Trivia, and text jison matched without returning a token that the parser needs no more than
 * jison did: the commas between arguments, `accDescr {` and its `}` (an empty block is no
 * statement, as in v12).
 */
const SKIPPED = kindSet(
  Kind.Comment,
  Kind.Directive,
  Kind.Space,
  T.Comma,
  T.AccDescrBlockStart,
  T.AccDescrBlockEnd
);

// ---- macros -----------------------------------------------------------------------------

type Macro =
  | { role: 'element'; kind: C4ElementKind; table: SlotTable }
  | { role: 'boundary'; boundary: BoundaryMacro }
  | { role: 'relation'; kind: C4RelationKind; index?: boolean }
  | { role: 'elementStyle' | 'relStyle' | 'layout' };

/** An element macro: its kind, and its keyword's slots from `SLOT_TABLES` (the one map of them). */
const element = (keyword: number, kind: C4ElementKind): [number, Macro] => {
  const table = SLOT_TABLES.get(keyword);
  if (!table) throw new Error(`no slot table for the element keyword ${keyword}`);
  return [keyword, { role: 'element', kind, table }];
};
const rel = (kind: C4RelationKind): Macro => ({ role: 'relation', kind });
const deployment = (nodeKind: C4NodeKind): Macro => ({
  role: 'boundary',
  boundary: { type: 'node', nodeKind },
});

/** Each macro keyword's statement, as `c4Diagram.jison`'s `diagramStatement` maps it. */
const MACROS: ReadonlyMap<number, Macro> = new Map<number, Macro>([
  element(T.Person, 'person'),
  element(T.PersonExt, 'external_person'),
  element(T.System, 'system'),
  element(T.SystemDb, 'system_db'),
  element(T.SystemQueue, 'system_queue'),
  element(T.SystemExt, 'external_system'),
  element(T.SystemDbExt, 'external_system_db'),
  element(T.SystemQueueExt, 'external_system_queue'),
  element(T.Container, 'container'),
  element(T.ContainerDb, 'container_db'),
  element(T.ContainerQueue, 'container_queue'),
  element(T.ContainerExt, 'external_container'),
  element(T.ContainerDbExt, 'external_container_db'),
  element(T.ContainerQueueExt, 'external_container_queue'),
  element(T.Component, 'component'),
  element(T.ComponentDb, 'component_db'),
  element(T.ComponentQueue, 'component_queue'),
  element(T.ComponentExt, 'external_component'),
  element(T.ComponentDbExt, 'external_component_db'),
  element(T.ComponentQueueExt, 'external_component_queue'),
  [T.Boundary, { role: 'boundary', boundary: { type: 'system' } }],
  [T.EnterpriseBoundary, { role: 'boundary', boundary: { type: 'system', splice: 'ENTERPRISE' } }],
  [T.SystemBoundary, { role: 'boundary', boundary: { type: 'system', splice: 'SYSTEM' } }],
  [T.ContainerBoundary, { role: 'boundary', boundary: { type: 'container', splice: 'CONTAINER' } }],
  [T.Node, deployment('node')],
  [T.NodeL, deployment('nodeL')],
  [T.NodeR, deployment('nodeR')],
  [T.Rel, rel('rel')],
  [T.BiRel, rel('birel')],
  [T.RelU, rel('rel_u')],
  [T.RelD, rel('rel_d')],
  [T.RelL, rel('rel_l')],
  [T.RelR, rel('rel_r')],
  [T.RelB, rel('rel_b')],
  [T.RelIndex, { role: 'relation', kind: 'rel', index: true }],
  [T.UpdateElementStyle, { role: 'elementStyle' }],
  [T.UpdateRelStyle, { role: 'relStyle' }],
  [T.UpdateLayoutConfig, { role: 'layout' }],
]);

/** The other statements: title and accessibility. */
const OTHER = kindSet(T.Title, T.AccDescription, T.AccTitle, T.AccDescr, T.AccDescrBlockValue);
const DIRECTIONS_LIST = [T.DirectionTB, T.DirectionBT, T.DirectionRL, T.DirectionLR];
const DIRECTIONS = kindSet(...DIRECTIONS_LIST);
/** The fill order each `direction` token names. */
const DIRECTION_OF = new Map<number, C4Direction>([
  [T.DirectionTB, 'TB'],
  [T.DirectionBT, 'BT'],
  [T.DirectionRL, 'RL'],
  [T.DirectionLR, 'LR'],
]);
/** Where the text ends: jison's `EOF`, or the stream's end (the lexer ended in a value). */
const ENDS = kindSet(T.Eof, Kind.EOF);

// What the parser accepts at its decision points, for the probe (R-LANG-7, D95). Constants,
// so a parse without a probe allocates nothing for them.
const HEADER_KINDS = [...HEADERS];
/** What may start a statement: a macro, a `direction`, then a title or accessibility line. */
const STATEMENT_KINDS = [
  ...MACROS.keys(),
  ...DIRECTIONS_LIST,
  T.Title,
  T.AccDescription,
  T.AccTitle,
  T.AccDescr,
  T.AccDescrBlockStart,
];
/** What may start a statement in a boundary: those and its `}`. */
const BOUNDARY_STATEMENT_KINDS = [...STATEMENT_KINDS, T.RBrace];
/**
 * What may start a boundary's first statement: no title or accessibility line goes there, a
 * `direction` may.
 */
const BOUNDARY_FIRST_KINDS = [...MACROS.keys(), ...DIRECTIONS_LIST, T.RBrace];
/** What may come next in the arguments. */
const ARGUMENT_KINDS = [T.ArgsClose, T.Str, T.AttributeEmpty, T.QuoteOpen, T.KeyStart];
/**
 * Kinds a probe's cursor follows rather than extends when the token ends at the offset: the
 * punctuation of the arguments and braces, and the openers that take the blanks after them.
 */
const PROBE_FOLLOWS = kindSet(
  T.ArgsOpen,
  T.ArgsClose,
  T.Comma,
  T.AttributeEmpty,
  T.QuoteOpen,
  T.QuoteClose,
  T.KeyStart,
  T.KeyEquals,
  T.ValueClose,
  T.LBrace,
  T.RBrace,
  T.AccTitle,
  T.AccDescr,
  T.AccDescrBlockStart,
  T.AccDescrBlockEnd
);

/** What may follow a statement: a separator, or (after an other statement) a macro. */
type After = 0 | 1 | 2;
const DIAGRAM_STATEMENT: After = 0;
const OTHER_STATEMENT: After = 1;
/** A boundary's opening, which took its line break. */
const OPENED: After = 2;

// ---- messages (R-ERR-5: Mermaid terms, never a token or rule name) -----------------------

const HEADER = ['`C4Context`, `C4Container`, `C4Component`, `C4Dynamic` or `C4Deployment`'];
const STATEMENT = [
  'an element such as `Person(alias, "Label")`',
  'a relation such as `Rel(from, to, "Label")`',
  'a boundary such as `Boundary(alias, "Label") {`',
  'a `title`, `accTitle:` or `accDescr` line',
];
const LINE_BREAK = ['a line break'];
const ONE_LINE_HINT = 'each statement goes on a line of its own';
const NO_SEMICOLON_HINT = 'C4 has no `;`: each statement goes on a line of its own';
const DIRECTION_HINT = 'write `direction TB`, `BT`, `LR` or `RL`, alone on a line';
const BLANK_BEFORE_PAREN_HINT = 'write the `(` right after the macro name, with no blank';
const NAMED_HINT = 'a named argument is written `$name="value"`';

/** An open boundary: its model index (-1 when its statement failed) and AST node. */
interface Frame {
  boundary: number;
  /** The boundary its statements are in: its own, else the one around it (-1: none). */
  current: number;
  node: C4BoundaryNode | undefined;
  /** Where its statements' AST nodes go: its node, else the nearest open boundary's. */
  children: C4StatementNode[];
  span: StatementSpan;
  /** The `{`. */
  open: Range;
  /** Statements read inside so far. */
  count: number;
}

/** A macro statement as read (pitfall 10): its name as written, arguments and range. */
interface MacroParts {
  name: string;
  args: Arg[];
  at: Range;
}

/** Where a statement started: what recovery after it needs. */
interface Start {
  /** Its first token. */
  pos: number;
  start: number;
  /** How many boundaries were open. */
  frames: number;
}

/** An accessible description as v12's `setAccDescription` kept it: line indents dropped. */
const accText = (text: string): string => text.replace(/\n\s+/g, '\n');

/**
 * One parse. Each grammar rule is a method; a rule that fails records a diagnostic and throws
 * {@link STOP}, and the statement loop recovers.
 */
class C4Parser {
  private readonly pre: PreprocessResult;
  private readonly view: SourceView;
  private readonly st = new ParseState();
  private readonly cursor: TokenCursor;
  /** Probe mode only (R-LANG-7). */
  private readonly probe: Probe | undefined;
  private readonly builder: C4Builder;
  private readonly doc: C4Document;

  private c4Type: C4Type | undefined;
  private title: string | undefined;
  private accTitle = '';
  private accDescr = '';
  private readonly frames: Frame[] = [];
  /** The source of each statement that failed: an alias in one is not reported unknown. */
  private readonly failed: Range[] = [];
  private lines: LineIndex | undefined;

  constructor(
    private readonly src: string,
    private readonly options: C4ParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    if (options.probe === undefined) {
      this.cursor = new TokenCursor(lex(src, pre.bodyStart, this.view), SKIPPED);
    } else {
      const probe = (this.probe = new Probe(src, options.probe, PROBE_FOLLOWS));
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      // The cursor marks an offset inside a comment or directive as outside code.
      this.cursor = new ProbeCursor(lex(src, pre.bodyStart, this.view, probe), probe, SKIPPED);
    }
    this.builder = new C4Builder(src, this.st);
    this.doc = {
      id: 'doc',
      type: 'Document',
      range: { start: pre.bodyStart, end: src.length },
      children: [],
    };
  }

  parse(): C4ParseResult {
    this.guarded(() => this.header());
    this.body();
    this.endChecks();
    const { st } = this;
    const built = this.builder.model();
    checkLimits(this.doc.children, built, this.options, st.diagnostics);
    st.diagnostics.list.sort((a, b) => a.range.start - b.range.start);
    // D453: the in-text title, else the front-matter one (D218).
    const title = this.title ?? this.pre.frontMatter?.title;
    const model: C4Model = {
      ...(this.c4Type !== undefined && { c4Type: this.c4Type }),
      ...built,
      ...(title !== undefined && { title }),
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      warnings: st.diagnostics.list.filter((d) => d.severity === 'warning'),
    };
    return st.result(model, this.doc, this.cursor.tokens, this.options, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  private range(j: number): Range {
    const t = this.cursor.tokens;
    return { start: t.start[j] ?? 0, end: t.end[j] ?? 0 };
  }

  /** Token `j`'s text as v12's parser read it (entities as `&…;`, CRLF as LF). */
  private text(j: number): string {
    const r = this.range(j);
    return cook(this.src, r.start, r.end, this.view);
  }

  /** The kind of the next stream token after `j` that is not a comment or directive. */
  private rawNext(j: number): number {
    const t = this.cursor.tokens;
    for (let i = j + 1; i < t.length; i++) {
      const k = t.kind[i] ?? Kind.EOF;
      if (k !== Kind.Comment && k !== Kind.Directive) return k;
    }
    return Kind.EOF;
  }

  /** `r` without the blanks at its ends (by the source). */
  private trimmed(r: Range): Range {
    let { start, end } = r;
    while (start < end && /\s/.test(this.src.charAt(start))) start++;
    while (end > start && /\s/.test(this.src.charAt(end - 1))) end--;
    return { start, end };
  }

  /**
   * A line break, and one after a `%%` comment right after it: the comment keeps its line break
   * (D452), where v12's ate it. Two line breaks with anything else between them (an empty
   * `accDescr {}`, which is no statement) stay two, as in v12.
   */
  private lineBreaks(): boolean {
    const { cursor: c } = this;
    if (c.kind !== Kind.Newline) return false;
    let from = c.next();
    while (c.at(Kind.Newline) && this.commentBetween(from, c.pos)) from = c.next();
    return true;
  }

  /** Whether only trivia, a `%%` comment among it, lies between tokens `a` and `b`. */
  private commentBetween(a: number, b: number): boolean {
    const t = this.cursor.tokens;
    let comment = false;
    for (let i = a + 1; i < b; i++) {
      const k = t.kind[i];
      if (k === Kind.Comment) comment = true;
      else if (k !== Kind.Space && k !== Kind.Directive) return false;
    }
    return comment;
  }

  /** What the message says was found at the cursor. */
  private found(): string {
    const { cursor: c } = this;
    if (inKindSet(ENDS, c.kind)) return 'the end of the text';
    if (c.kind === Kind.Newline || c.start === c.end) return 'a line break';
    const text = this.src.slice(c.start, c.end).split('\n')[0] ?? '';
    return `\`${text.length > 40 ? `${text.slice(0, 40)}…` : text}\``;
  }

  private lineOf(offset: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(offset).line + 1;
  }

  // ---- diagnostics and recovery ---------------------------------------------------------

  /** Report what was found where `names` were expected, then stop the statement. */
  private fail(names: string[], hint?: string): never {
    const { cursor: c } = this;
    const why = hint === undefined ? '' : `; ${hint}`;
    const message = `Expected ${formatExpected(names)}, got ${this.found()}${why}.`;
    this.st.diagnostics.error('UNEXPECTED', message, c.range, { expected: names });
    throw STOP;
  }

  /** The hint for an unexpected character at the cursor. */
  private hint(): string | undefined {
    const { cursor: c } = this;
    if (c.kind !== Kind.Error) return undefined;
    const ch = this.src.charAt(c.start);
    if (ch === ';') return NO_SEMICOLON_HINT;
    if (c.start === c.end) return 'write the `(` on the line of the macro name';
    if (/\s/.test(ch)) return BLANK_BEFORE_PAREN_HINT;
    if (this.src.startsWith('direction', c.start)) return DIRECTION_HINT;
    return undefined;
  }

  private unclosed(code: string, what: string, open: Range, close: string): never {
    this.st.diagnostics.error(
      code,
      `Unclosed ${what}: the one at line ${this.lineOf(open.start)} has no closing \`${close}\`. Add \`${close}\` after it.`,
      open
    );
    throw STOP;
  }

  /**
   * Skip to the next line after an error (R-PARSE-4), and past its line break. A `{` skipped over
   * opens a boundary (its `}` then closes it: one error, one diagnostic), a `}` closes one. `from`
   * is where the failed statement started: a boundary's that opened no frame still opens at a `{`
   * ending its line or starting the next; a macro name alone on its line takes the next line's
   * `(…)` with it.
   */
  private recover(from: Start): void {
    const { cursor: c } = this;
    c.recovering();
    const role = MACROS.get(c.tokens.kind[from.pos] ?? 0)?.role;
    let boundary = role === 'boundary' && this.frames.length === from.frames;
    const parenLine = role !== undefined && this.zeroWidthAfter(from.pos);
    while (!inKindSet(ENDS, c.kind) && c.kind !== Kind.Newline) {
      if (c.kind === T.LBrace) {
        this.openFrame(-1, undefined, c.range);
        boundary = false;
      } else if (c.kind === T.RBrace && this.frames.length > 0) this.closeFrame(c.range);
      c.next();
    }
    // A boundary whose arguments ran into its `{` (`Boundary(b, "B" {`): it opens.
    if (boundary && /\{\s*$/.test(this.src.slice(from.start, c.start))) {
      this.openFrame(-1, undefined, { start: c.start, end: c.start });
      boundary = false;
    }
    this.lineBreaks();
    if (parenLine && c.kind === Kind.Error && this.src.charAt(c.start) === '(') {
      while (!inKindSet(ENDS, c.kind) && !c.at(Kind.Newline)) c.next();
      this.lineBreaks();
    }
    // `Boundary(…)` that failed, then `{` on the next line: it opens.
    if (boundary && c.kind === T.LBrace) {
      this.openFrame(-1, undefined, c.range);
      c.next();
      this.lineBreaks();
    }
  }

  /** Whether the significant token after token `j` is a zero-width error (a line break). */
  private zeroWidthAfter(j: number): boolean {
    const t = this.cursor.tokens;
    for (let i = j + 1; i < t.length; i++) {
      const k = t.kind[i] ?? Kind.EOF;
      if (inKindSet(SKIPPED, k)) continue;
      return k === Kind.Error && t.start[i] === t.end[i];
    }
    return false;
  }

  /** Run one rule; on failure, skip to the next line. Whether it ran through. */
  private guarded(rule: () => void): boolean {
    const { cursor: c } = this;
    const from: Start = { pos: c.pos, start: c.start, frames: this.frames.length };
    try {
      rule();
      return true;
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover(from);
      return false;
    }
  }

  // ---- grammar --------------------------------------------------------------------------

  /** `header NEWLINE`. */
  private header(): void {
    const { cursor: c } = this;
    c.tested(HEADER_KINDS);
    const k = c.kind;
    if (HEADERS.has(k)) {
      this.c4Type = this.text(c.pos) as C4Type;
      this.st.statement('header', c.range);
      c.next();
      if (!this.lineBreaks()) this.fail(LINE_BREAK, ONE_LINE_HINT);
      return;
    }
    this.fail(HEADER);
  }

  /** The statements after the header, to the end: at least one. */
  private body(): void {
    const { cursor: c } = this;
    if (inKindSet(ENDS, c.kind) && !this.st.diagnostics.hasErrors) {
      this.st.diagnostics.unexpected('UNEXPECTED', c.range, STATEMENT, this.found());
    }
    while (!inKindSet(ENDS, c.kind)) {
      const start = c.start;
      if (!this.guarded(() => this.separator(this.statement()))) {
        this.failed.push({ start, end: c.start });
      }
    }
    // At the end of the text a statement could still start, after the header.
    if (this.c4Type !== undefined) c.tested(this.statementKinds());
    // The lexer ended outside the statements (in a value) with nothing reported yet.
    if (c.kind === Kind.EOF && !this.st.diagnostics.hasErrors) {
      this.st.diagnostics.unexpected('UNEXPECTED', c.range, LINE_BREAK, this.found());
    }
  }

  /**
   * After a statement: a line break, a `}` closing the boundary, the end, or (after an other
   * statement) a diagram statement on the same line, as v12's grammar allows. A boundary's
   * opening took its line break already.
   */
  private separator(after: After): void {
    const { cursor: c } = this;
    const k = c.kind;
    if (after === OPENED || this.lineBreaks()) return;
    if (inKindSet(ENDS, k) || (k === T.RBrace && this.frames.length > 0)) return;
    if (after === OTHER_STATEMENT && MACROS.has(k)) return;
    this.fail(LINE_BREAK, MACROS.has(k) || inKindSet(OTHER, k) ? ONE_LINE_HINT : this.hint());
  }

  /** What may start a statement here. */
  private statementKinds(): number[] {
    const frame = this.frames[this.frames.length - 1];
    if (!frame) return STATEMENT_KINDS;
    return frame.count === 0 ? BOUNDARY_FIRST_KINDS : BOUNDARY_STATEMENT_KINDS;
  }

  /** One statement; what may come after it. */
  private statement(): After {
    const { cursor: c } = this;
    c.tested(this.statementKinds());
    const k = c.kind;
    const frame = this.frames[this.frames.length - 1];
    if (k === T.RBrace && frame) {
      if (frame.count === 0) {
        this.st.diagnostics.error(
          'UNEXPECTED',
          'Empty boundary: a boundary holds at least one element, relation or style.',
          c.range
        );
      }
      this.closeFrame(c.range);
      c.next();
      return DIAGRAM_STATEMENT;
    }
    if (inKindSet(DIRECTIONS, k)) return this.direction();
    if (frame) frame.count++;
    if (inKindSet(OTHER, k)) {
      if (frame?.count === 1) {
        this.st.diagnostics.error(
          'UNEXPECTED',
          'A boundary starts with an element, a relation or a style; move this line below one.',
          c.range
        );
      }
      this.other();
      return OTHER_STATEMENT;
    }
    const macro = MACROS.get(k);
    if (macro) return this.macro(macro);
    if (HEADERS.has(k)) this.fail(STATEMENT, 'the `C4…` header comes once, on the first line');
    if (k === T.LBrace) {
      // A `{` with no boundary before it: open one anyway, so its `}` matches.
      const at = c.range;
      this.st.diagnostics.unexpected('UNEXPECTED', at, STATEMENT, this.found());
      this.openFrame(-1, undefined, at);
      c.next();
      return this.lineBreaks() ? OPENED : DIAGRAM_STATEMENT;
    }
    this.fail(STATEMENT, k === T.RBrace ? 'this `}` closes no boundary' : this.hint());
  }

  /**
   * `direction TB|BT|RL|LR` (#730): the fill order of the boundary whose braces hold it, else of
   * the top level. It is no statement of the boundary (a boundary still needs an element, a
   * relation or a style) and has no AST node. A boundary that failed to parse takes none.
   */
  private direction(): After {
    const { cursor: c } = this;
    const frame = this.frames[this.frames.length - 1];
    if (!frame || frame.boundary >= 0)
      this.builder.direction(frame ? frame.boundary : -1, DIRECTION_OF.get(c.kind) ?? 'TB');
    this.st.statement('direction', c.range);
    c.next();
    return DIAGRAM_STATEMENT;
  }

  /** `title`, `accDescription`, `accTitle:`, `accDescr:` or `accDescr { … }`. */
  private other(): void {
    const { cursor: c } = this;
    const j = c.pos;
    const k = c.kind;
    const start = c.start;
    if (k === T.Title) {
      // D453: trimmed (v12 kept the blanks after `title `).
      this.title = this.text(j).substring(6).trim();
      this.st.statement('title', c.range);
      c.next();
      return;
    }
    if (k === T.AccDescription) {
      this.accDescr = accText(this.text(j).substring(15));
      this.st.statement('accDescr', c.range);
      c.next();
      return;
    }
    if (k === T.AccDescrBlockValue) {
      const open = this.blockStart(j);
      if (this.rawNext(j) !== T.AccDescrBlockEnd) {
        this.unclosed('UNCLOSED_ACC_DESCR', '`accDescr {`', open, '}');
      }
      this.accDescr = accText(this.text(j).trim());
      this.st.statement('accDescr', { start: open.start, end: c.end + 1 });
      c.next();
      return;
    }
    // `accTitle:` / `accDescr:` and the rest of the line.
    c.next();
    const value = k === T.AccTitle ? T.AccTitleValue : T.AccDescrValue;
    // At the end of the text the blanks after `:` took the last line break, and v12's lexer
    // ended in the value with no end of text.
    if (c.kind !== value || this.rawNext(c.pos) === Kind.EOF) this.fail(['the text of the line']);
    const text = this.text(c.pos).trim();
    if (k === T.AccTitle) this.accTitle = text;
    else this.accDescr = accText(text);
    this.st.statement(k === T.AccTitle ? 'accTitle' : 'accDescr', { start, end: c.end });
    c.next();
  }

  /** The range of the `accDescr {` before the block value at `j`. */
  private blockStart(j: number): Range {
    const t = this.cursor.tokens;
    for (let i = j - 1; i >= 0; i--) {
      if (t.kind[i] === T.AccDescrBlockStart) return this.range(i);
    }
    return this.range(j);
  }

  // ---- macros ---------------------------------------------------------------------------

  /** A macro statement: its arguments, then what it adds to the model. */
  private macro(macro: Macro): After {
    const { cursor: c, builder: b } = this;
    const name = this.src.slice(c.start, c.end);
    const start = c.start;
    c.next();
    const args = this.args(name);
    const at = { start, end: this.lastEnd() };
    const written = [...args];
    switch (macro.role) {
      case 'element': {
        const { kind, table } = macro;
        const { ast, alias } = b.element({ kind, table, args, parent: this.current() });
        this.place({ id: ast, type: 'Element', range: at, macro: name, alias, args: written });
        this.st.statement('element', at);
        return DIAGRAM_STATEMENT;
      }
      case 'boundary':
        this.boundary({ macro: macro.boundary, name, args, at });
        return OPENED;
      case 'relation':
        this.relation({ kind: macro.kind, index: macro.index === true, name, args, at });
        return DIAGRAM_STATEMENT;
      case 'elementStyle':
      case 'relStyle':
      case 'layout': {
        const node: C4StyleNode = {
          id: b.styleId(),
          type: 'Style',
          range: at,
          macro: name,
          args: written,
        };
        this.place(node);
        this.st.statement('style', at);
        if (macro.role === 'elementStyle') b.elementStyle(args);
        else if (macro.role === 'relStyle') b.relStyle(args);
        else b.layout(args);
        return DIAGRAM_STATEMENT;
      }
    }
  }

  /** The end of the last significant token read. */
  private lastEnd(): number {
    const t = this.cursor.tokens;
    for (let i = this.cursor.pos - 1; i >= 0; i--) {
      if (!inKindSet(SKIPPED, t.kind[i] ?? 0)) return t.end[i] ?? 0;
    }
    return 0;
  }

  /** `arguments`: `(`, at least one argument, `)`. */
  private args(name: string): Arg[] {
    const { cursor: c } = this;
    const out: Arg[] = [];
    const open = c.range;
    if (c.kind === T.AttributeEmpty) {
      // `(` then blanks and `,`: an empty first argument.
      out.push({ value: '', range: { start: c.end - 1, end: c.end - 1 } });
      c.next();
    } else if (c.kind === T.ArgsOpen) c.next();
    else this.fail(['`(`'], this.hint() ?? `\`${name}\` takes its arguments in \`( )\``);
    for (;;) {
      c.tested(ARGUMENT_KINDS);
      const k = c.kind;
      if (k === T.ArgsClose) {
        if (out.length === 0) this.fail(['an argument'], `\`${name}()\` needs at least an alias`);
        c.next();
        return out;
      }
      if (k === T.Str) {
        out.push(this.unquoted());
        c.next();
      } else if (k === T.AttributeEmpty) {
        out.push({ value: '', range: this.trimmed(c.range) });
        c.next();
      } else if (k === T.QuoteOpen) out.push(this.quoted());
      else if (k === T.KeyStart) out.push(this.named());
      else if (k === Kind.Newline || inKindSet(ENDS, k)) {
        this.unclosed('UNCLOSED_ARGUMENTS', `\`${name}(\``, open, ')');
      } else this.fail(['an argument', '`)`'], this.hint());
    }
  }

  /** An unquoted argument (the current token); a `"` in it is warned about (#681). */
  private unquoted(): Arg {
    const { cursor: c } = this;
    const arg = { value: this.text(c.pos).trim(), range: this.trimmed(c.range) };
    if (arg.value.includes('"')) this.quoteInArgument(arg.range);
    return arg;
  }

  /** #681: a `"` inside an unquoted argument, which C4 text does not escape. */
  private quoteInArgument(at: Range): void {
    this.st.diagnostics.warning(
      codes.C4_QUOTE_IN_ARGUMENT,
      `The argument at line ${this.lineOf(at.start)} holds a \`"\`, which does not escape a quote: a quoted text ends at the next \`"\`. Write \`'\` or \`#quot;\` for a quote inside the text.`,
      at
    );
  }

  /** `"text"`: no escapes, line breaks included. */
  private quoted(): Arg {
    const { cursor: c } = this;
    const open = c.range;
    const start = c.end - 1;
    c.next();
    let value = '';
    if (c.kind === T.Str) {
      value = this.text(c.pos).trim();
      c.next();
    }
    if (c.kind !== T.QuoteClose) this.unclosed('UNCLOSED_STRING', 'string', open, '"');
    const end = c.end;
    c.next();
    return { value, range: { start, end } };
  }

  /** `$name="value"`. */
  private named(): Arg {
    const { cursor: c } = this;
    const open = c.range;
    const start = c.end - 1;
    c.next();
    if (c.kind !== T.StrKey) this.fail(['a name'], NAMED_HINT);
    const name = this.text(c.pos).trim();
    c.next();
    if (c.kind !== T.KeyEquals) this.fail(['`="`'], NAMED_HINT);
    c.next();
    if (c.kind === T.ValueClose) {
      this.fail(['a value'], 'a named argument takes a value that is not empty');
    }
    if (c.kind !== T.StrValue) this.unclosed('UNCLOSED_STRING', 'named argument', open, '"');
    const value = this.text(c.pos).trim();
    c.next();
    if (c.kind !== T.ValueClose) this.unclosed('UNCLOSED_STRING', 'named argument', open, '"');
    const end = c.end;
    c.next();
    return { name, value, range: { start, end } };
  }

  /** The boundary statements are in now (-1: the top level). */
  private current(): number {
    return this.frames[this.frames.length - 1]?.current ?? -1;
  }

  /** Add `node` to the open boundary's children (a failed boundary's go to the one around it). */
  private place(node: C4StatementNode): void {
    (this.frames[this.frames.length - 1]?.children ?? this.doc.children).push(node);
  }

  /** A boundary's statement and its `{`: `{` NEWLINE, or NEWLINE `{` [NEWLINE]. */
  private boundary(parts: MacroParts & { macro: BoundaryMacro }): void {
    const { cursor: c } = this;
    const { macro, name, args, at } = parts;
    const parent = this.current();
    const { ast, alias, index } = this.builder.boundary({ macro, args, end: at.end, parent });
    const node: C4BoundaryNode = {
      id: ast,
      type: 'Boundary',
      range: { ...at },
      macro: name,
      alias,
      args: [...args],
      children: [],
    };
    this.place(node);
    if (c.kind === T.LBrace) {
      const brace = c.range;
      c.next();
      this.openFrame(index, node, brace, at.start);
      if (!this.lineBreaks()) {
        this.fail(
          LINE_BREAK,
          "a boundary's `{` ends its line; its statements go on the lines after it"
        );
      }
      return;
    }
    if (c.kind === Kind.Newline && c.peek() === T.LBrace) {
      c.next();
      const brace = c.range;
      c.next();
      this.openFrame(index, node, brace, at.start);
      this.lineBreaks();
      return;
    }
    this.fail(['`{`'], "a boundary's statements go between `{` and `}`");
  }

  private openFrame(
    boundary: number,
    node: C4BoundaryNode | undefined,
    open: Range,
    start = open.start
  ): void {
    const span = this.st.beginStatement('boundary', start);
    const around = this.frames[this.frames.length - 1]?.children ?? this.doc.children;
    const children = node?.children ?? around;
    const current = boundary >= 0 ? boundary : this.current();
    this.frames.push({ boundary, current, node, children, span, open, count: 0 });
  }

  private closeFrame(close: Range): void {
    const frame = this.frames.pop();
    if (!frame) return;
    this.st.endStatement(frame.span, close.end);
    if (frame.node) frame.node.range = { start: frame.node.range.start, end: close.end };
  }

  /** A relation statement; `RelIndex` drops its first argument (v12's `splice(0, 1)`). */
  private relation(parts: MacroParts & { kind: C4RelationKind; index: boolean }): void {
    const { name, args, at } = parts;
    this.st.statement('relation', at);
    const added = this.builder.relation({
      kind: parts.kind,
      args: parts.index ? args.slice(1) : args,
      at,
    });
    if (!added) return;
    const node: C4RelationNode = {
      id: added.ast,
      type: 'Relation',
      range: at,
      macro: name,
      from: added.from,
      to: added.to,
      args: [...args],
    };
    this.place(node);
  }

  // ---- end of the text ------------------------------------------------------------------

  private endChecks(): void {
    for (let k = this.frames.length - 1; k >= 0; k--) {
      const frame = this.frames[k];
      if (!frame) continue;
      this.st.diagnostics.error(
        'UNCLOSED_BLOCK',
        `Unclosed boundary: the \`{\` at line ${this.lineOf(frame.open.start)} has no closing \`}\`. Add \`}\` on a line after its statements.`,
        frame.open
      );
    }
    while (this.frames.length > 0)
      this.closeFrame({ start: this.src.length, end: this.src.length });
    // The words of the statements that failed: an alias among them may have been defined there.
    const words = new Set<string>();
    for (const r of this.failed) {
      for (const w of this.src.slice(r.start, r.end).split(/[\s,()"{}$=]+/)) words.add(w);
    }
    this.builder.finish((alias) => alias !== '' && words.has(alias));
  }
}
