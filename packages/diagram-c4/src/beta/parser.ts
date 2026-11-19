/**
 * c4-beta parser: recursive descent over the {@link lex} tokens, producing the typed AST and a
 * {@link C4BetaModel} (spec #730). `grammar/c4beta.ebnf` is the normative form:
 *
 *     diagram:   NEWLINE* "c4-beta" kind? (NEWLINE statement?)*
 *     element:   elemKind id STRING (STRING STRING?)? ("instances" STRING)? TAG* body?
 *     relation:  (STEP ":")? id arrow id (":" STRING STRING?)? TAG*
 *
 * It does not stop at the first error: it reports it, skips to the next line break and carries
 * on (R-PARSE-4). A failed line that ends in `{` still opens its body, so the `}` that closes it
 * is no second error. Bodies nest on a stack of frames, never on the call stack, so a deep
 * nesting costs memory and no recursion (R-PARSE-7). What the grammar cannot say (duplicate ids,
 * unknown relation ends, dropped fields) is {@link buildModel}'s.
 */
import { checkDepth, checkLimit } from '@mermaid-js/core/limits';
import {
  APOSTROPHE,
  COMMA,
  CR,
  DQUOTE,
  ExpectedTable,
  isBlank,
  Kind,
  LF,
  LPAREN,
  PERCENT,
  RPAREN,
  LineIndex,
  ParseState,
  Probe,
  significantTokens,
  skipTo,
  kindSet,
} from '@mermaid-js/core/parser-kit';
import type {
  ParseOptions,
  ParseResult,
  Range,
  TokenStream,
  TokenView,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import * as codes from '../codes.ts';
import type {
  C4BetaDocument,
  C4BetaElementNode,
  C4BetaRelationNode,
  C4BetaStatementNode,
  C4BetaStyleNode,
  C4BetaTextNode,
} from './ast.ts';
import { buildModel, type Place } from './build.ts';
import { lex } from './lexer.ts';
import * as lists from './probe.ts';
import type { C4BetaDirection, C4BetaElementKind, C4BetaKind, C4BetaModel } from './model.ts';
import { C4BETA_TRIVIA, DIAGRAM_KINDS, ELEMENT_KINDS, ID_KINDS, T } from './tokens.ts';

export interface C4BetaParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** The integrator's caps on elements, relations and nesting (core's defaults when absent). */
  maxNodes?: number;
  maxEdges?: number;
  maxDepth?: number;
}

export type C4BetaParseResult = ParseResult<C4BetaModel, C4BetaDocument>;

const KIND_NAMES = new Map<number, C4BetaKind>([
  [T.Context, 'context'],
  [T.Container, 'container'],
  [T.Component, 'component'],
  [T.Dynamic, 'dynamic'],
  [T.Deployment, 'deployment'],
]);
const ELEMENT_NAMES = new Map<number, C4BetaElementKind>([
  [T.Person, 'person'],
  [T.SoftwareSystem, 'softwareSystem'],
  [T.Container, 'container'],
  [T.Component, 'component'],
  [T.Group, 'group'],
  [T.DeploymentNode, 'deploymentNode'],
  [T.InfrastructureNode, 'infrastructureNode'],
]);
const DIRECTIONS = new Map<number, C4BetaDirection>([
  [T.Tb, 'TB'],
  [T.Bt, 'BT'],
  [T.Lr, 'LR'],
  [T.Rl, 'RL'],
]);
const TEXT_TYPES = new Map<number, C4BetaTextNode['type']>([
  [T.Title, 'Title'],
  [T.AccTitle, 'AccTitle'],
  [T.AccDescr, 'AccDescr'],
]);
/** The statement words, which are never ids. */
const RESERVED = kindSet(T.Title, T.AccTitle, T.AccDescr, T.Direction, T.Legend, T.Style);
const ARROWS = kindSet(T.ArrowRight, T.ArrowLeft, T.ArrowBoth, T.ArrowUndirected);
const BOUNDARY = kindSet(Kind.Newline, Kind.EOF);

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
const EXPECTED = new ExpectedTable([
  ['`c4-beta`', [T.Header]],
  ['an element such as `person`', [T.Person, T.SoftwareSystem]],
  ['an id', [T.Id]],
  ['a name in quotes, as in `"Payments"`', [T.String]],
  ['an arrow such as `-->`', [T.ArrowRight, T.ArrowLeft, T.ArrowBoth, T.ArrowUndirected]],
  ['`:` and a label', [T.Colon]],
  ['`:` after a step number', [T.Step]],
  ['a direction such as `LR`', [T.Tb, T.Bt, T.Lr, T.Rl]],
  ['`on` or `off`', [T.On, T.Off]],
  ['`title`, `direction`, `legend` or `style`', [T.Title, T.Direction, T.Legend, T.Style]],
  ['`}`', [T.Rbrace]],
  ['a line break', [Kind.Newline]],
  ['the end of the text', [Kind.EOF]],
]);
const STATEMENT_START = [T.Person, T.Title, T.Direction, T.Legend, T.Style, T.Id, T.Step, Kind.EOF];
const IN_BODY = [T.Person, T.Rbrace];
const ELEMENT_SHAPE =
  'an element is `kind id "name" "description" "technology" instances "n" :::tag`';
const ONE_PER_LINE = 'put each statement on a line of its own';

/** Thrown inside the parser after a diagnostic is recorded; caught at statement level. */
class Stop extends Error {}
const STOP = new Stop();
/** Thrown when a `style` value cannot be read: the line is dropped with a warning, not an error. */
const DROP = new Stop();
/** How much of an unreadable style value a warning quotes. */
const QUOTED_VALUE = 24;

/** The statements a body or the top level holds, and the element a body belongs to. */
interface Frame {
  list: C4BetaStatementNode[];
  node?: C4BetaElementNode;
  span?: ReturnType<ParseState['beginStatement']>;
}

/** Parse a c4-beta diagram. Never throws: problems are error diagnostics. */
export function parseC4Beta(src: string, options: C4BetaParseOptions = {}): C4BetaParseResult {
  return new C4BetaParser(src, options).parse();
}

class C4BetaParser {
  private readonly pre: PreprocessResult;
  private readonly full: TokenStream;
  private readonly t: TokenView;
  private i = 0;
  private readonly state = new ParseState();
  private readonly lines: LineIndex;
  private readonly children: C4BetaStatementNode[] = [];
  /** The bodies being read, innermost last. */
  private readonly open: Frame[] = [];
  private readonly mentions = new Map<string, number>();
  /** Probe mode only (R-LANG-7). */
  private readonly probe: Probe | undefined;
  private readonly depths: { depth: number; range: Range }[] = [];
  private elementCount = 0;
  private relationCount = 0;
  private styleCount = 0;
  /** The `style` lines dropped for a value the lexer cannot read (`C4_COLOR_INVALID`). */
  private readonly unreadable: Place[] = [];

  constructor(
    private readonly src: string,
    private readonly options: C4BetaParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.state.diagnostics.list.push(...pre.diagnostics);
    this.full = lex(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.t = significantTokens(this.full, C4BETA_TRIVIA);
    this.lines = new LineIndex(src);
    if (options.probe !== undefined) {
      const probe = (this.probe = new Probe(src, options.probe, lists.PROBE_FOLLOWS));
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      else probe.trivia(this.full);
      // Ignored when the offset is outside code.
      probe.lexed(probe.offset, probe.offset, lists.probeMode(src, this.full, probe.offset));
    }
  }

  parse(): C4BetaParseResult {
    const { state, src } = this;
    this.statement(() => this.header());
    this.document();
    this.unclosed();
    checkDepth(state.diagnostics, this.depths, this.options.maxDepth);
    const ast: C4BetaDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    const built = buildModel(ast, state.diagnostics, (at) => this.lineOf(at), this.unreadable);
    // In source order (the facet contract, R-LANG-3): the semantic checks run after the parse.
    state.diagnostics.list.sort((a, b) => a.range.start - b.range.start);
    const warnings = state.diagnostics.list.filter((d) => d.severity === 'warning');
    return state.result({ ...built, warnings }, ast, this.full, this.options, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  private kind(j = this.i): number {
    return this.t.kind[j] ?? Kind.EOF;
  }

  private range(j = this.i): Range {
    return { start: this.t.start[j] ?? 0, end: this.t.end[j] ?? 0 };
  }

  private raw(j = this.i): string {
    const { start, end } = this.range(j);
    return this.src.slice(start, end);
  }

  private lineOf(offset: number): number {
    return this.lines.position(offset).line + 1;
  }

  /**
   * Probe hook: the parser tests token `j` for `kinds` (a constant list), or would accept them
   * there. Records them when it is the probed token.
   */
  private tested(kinds: readonly number[], j = this.i): void {
    const p = this.probe;
    if (p?.isAt(this.t, j, this.pre.bodyStart)) p.tested(kinds, this.t.start[j] ?? 0);
  }

  /** `id`, then `id@2`, `id@3`, … */
  private id(base: string): string {
    const n = (this.mentions.get(base) ?? 0) + 1;
    this.mentions.set(base, n);
    return n === 1 ? base : `${base}@${n}`;
  }

  // ---- errors and recovery ------------------------------------------------------------

  private found(): string {
    const k = this.kind();
    if (k === Kind.EOF) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    const text = this.raw().trim();
    return text.length > 24 ? `\`${text.slice(0, 24)}…\`` : `\`${text}\``;
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  private fail(want: readonly number[], hint?: string): never {
    this.tested(want);
    if (this.kind() === Kind.Error) {
      this.badCharacters(this.i);
      throw STOP;
    }
    const d = this.state.diagnostics.unexpected(
      'UNEXPECTED',
      this.range(),
      EXPECTED.names(want),
      this.found()
    );
    if (hint) d.message = `${d.message.slice(0, -1)}; ${hint}.`;
    throw STOP;
  }

  /** Report `message` at the current token with `code`, then stop the statement. */
  private reject(code: string, message: string): never {
    this.state.diagnostics.error(code, message, this.range());
    throw STOP;
  }

  /** The error token `j`: an unclosed string or `accDescr {`, or stray characters. */
  private badCharacters(j: number): void {
    const where = this.range(j);
    const text = this.raw(j);
    const line = this.lineOf(where.start);
    const { diagnostics } = this.state;
    const quote = text.charAt(0);
    if (quote === '"' || quote === "'") {
      diagnostics.error(
        'UNCLOSED_STRING',
        `Unclosed text: the \`${quote}\` at line ${line} has no closing \`${quote}\`. Add \`${quote}\` after the text.`,
        where,
        { expected: [`\`${quote}\``] }
      );
    } else if (text.startsWith('accDescr')) {
      diagnostics.error(
        'UNCLOSED_ACC_DESCR',
        `Unclosed accessible description: the \`accDescr\` at line ${line} needs a \`:\` and a line, or a \`{\` and a closing \`}\`.`,
        where
      );
    } else if (text.startsWith('accTitle')) {
      diagnostics.error('UNEXPECTED_CHARACTER', 'Expected `:` after `accTitle`.', where);
    } else {
      const arrow = /^[-<]/.test(text) ? '; an arrow is `-->`, `<--` or `<-->`' : '';
      diagnostics.error('UNEXPECTED_CHARACTER', `Unexpected character \`${text}\`${arrow}.`, where);
    }
  }

  /**
   * Skip to the next line break after an error, reporting each lexer error in the skipped text
   * (the token that failed is reported already). A failed line that ends in `{` opens a body
   * that no element owns, so its `}` has an opener.
   */
  private recover(depth: number): void {
    const end = skipTo(this.t, this.i, BOUNDARY);
    this.freezeProbe(end);
    // Adjacent error characters are one problem, reported once.
    let reported = this.kind() === Kind.Error ? this.t.end[this.i] : -1;
    for (let j = this.i + 1; j < end; j++) {
      if (this.kind(j) !== Kind.Error) continue;
      if (this.t.start[j] !== reported) this.badCharacters(j);
      reported = this.t.end[j];
    }
    if (this.open.length === depth && end > this.i && this.kind(end - 1) === T.Lbrace) {
      // Its elements join the body they sit in, so no relation to one is reported unknown.
      this.open.push({ list: this.open[this.open.length - 1]?.list ?? this.children });
    }
    this.i = end;
  }

  /**
   * Recovery skips the tokens from here to the boundary `end` of the failed line, the boundary
   * included: a cursor in them is on the failed line, where the parser accepts nothing.
   */
  private freezeProbe(end: number): void {
    const probe = this.probe;
    if (!probe) return;
    probe.freeze();
    for (let j = this.i; j <= end; j++) {
      if (probe.isAt(this.t, j, this.pre.bodyStart)) probe.freeze(true);
    }
  }

  /** Run one statement rule; on failure, recover. */
  private statement(rule: () => void): void {
    const depth = this.open.length;
    try {
      rule();
    } catch (error) {
      if (error !== STOP && error !== DROP) throw error;
      if (error === DROP) this.skipLine();
      else this.recover(depth);
    }
  }

  /** Skip a dropped line to its line break, which reports nothing more. */
  private skipLine(): void {
    const end = skipTo(this.t, this.i, BOUNDARY);
    this.freezeProbe(end);
    this.i = end;
  }

  // ---- rules --------------------------------------------------------------------------

  private expect(kind: number, hint?: string): number {
    this.tested([kind]);
    if (this.kind() !== kind) this.fail([kind], hint);
    return this.i++;
  }

  /** An id: any word but the six that open a statement. */
  private idToken(): number {
    this.tested(lists.ID_LIST);
    if (ID_KINDS[this.kind()] === 1) return this.i++;
    const word = RESERVED[this.kind()] === 1 ? `\`${this.raw().split(/[\s:]/, 1)[0]}\`` : '';
    return this.fail(
      [T.Id],
      word ? `${word} starts a statement, so it cannot be an id` : undefined
    );
  }

  /** The end of a statement: a line break or the end of the text. */
  private eol(hint = ONE_PER_LINE): void {
    const k = this.kind();
    if (k === Kind.EOF) return;
    if (k !== Kind.Newline) this.fail([Kind.Newline, Kind.EOF], hint);
    this.i++;
  }

  /** The text inside the quotes of a string token, `\` escapes resolved. */
  private unquote(j: number): string {
    return this.raw(j).slice(1, -1).replace(/\\(.)/g, '$1');
  }

  private quoted(hint: string): string {
    return this.unquote(this.expect(T.String, hint));
  }

  private place(node: C4BetaStatementNode): void {
    const frame = this.open[this.open.length - 1];
    (frame ? frame.list : this.children).push(node);
  }

  /** `NEWLINE* "c4-beta" kind?` */
  private header(): void {
    while (this.kind() === Kind.Newline) this.i++;
    this.tested(lists.HEADER_LIST);
    if (this.kind() !== T.Header) this.fail(lists.HEADER_LIST);
    const start = this.range(this.i++);
    this.tested(lists.KIND_LIST);
    const word = this.kind();
    const kind = KIND_NAMES.get(word);
    if (DIAGRAM_KINDS[word] !== 1 && ID_KINDS[word] === 1) {
      this.reject(
        codes.C4BETA_UNKNOWN_DIAGRAM_KIND,
        `Unknown diagram kind \`${this.raw()}\`: use \`context\`, \`container\`, \`component\`, \`dynamic\` or \`deployment\`.`
      );
    }
    const range = { start: start.start, end: kind ? this.range(this.i++).end : start.end };
    this.children.push({ id: 'header', type: 'Header', range, ...(kind ? { kind } : {}) });
    this.state.statement('header', range);
    this.eol();
  }

  /** `(statement? NEWLINE)* EOF` */
  private document(): void {
    for (;;) {
      const k = this.kind();
      this.testedAtLineStart(k);
      if (k === Kind.EOF) return;
      if (k === Kind.Newline) this.i++;
      else this.statement(() => (this.open.length > 0 ? this.inBody(k) : this.top(k)));
    }
  }

  /**
   * Probe hook for what may start a statement: at every line start, a blank line and the last
   * line included. The end of the text after a statement with no line break is mid-line.
   */
  private testedAtLineStart(k: number): void {
    if (k === Kind.EOF && this.kind(this.i - 1) !== Kind.Newline) return;
    this.tested(this.open.length > 0 ? lists.BODY_LIST : lists.TOP_LIST);
  }

  /** The statement at the top level. */
  private top(k: number): void {
    if (ID_KINDS[k] === 1 && ARROWS[this.kind(this.i + 1)] === 1) this.relation();
    else if (k === T.Step) this.relation();
    else if (ELEMENT_KINDS[k] === 1) this.element();
    else if (TEXT_TYPES.has(k)) this.text(k);
    else this.topOther(k);
  }

  private topOther(k: number): void {
    if (k === T.Direction) this.direction();
    else if (k === T.Legend) this.legend();
    else if (k === T.Style) this.style();
    else if (k === T.Rbrace) this.fail([], 'no `{` is open to close');
    else if (k === T.Lbrace)
      this.fail(STATEMENT_START, 'a body starts with `{` at the end of its element line');
    else if (ID_KINDS[k] === 1 && ID_KINDS[this.kind(this.i + 1)] === 1) {
      this.reject(
        codes.C4BETA_UNKNOWN_ELEMENT_KIND,
        `Unknown element kind \`${this.raw()}\`: use \`person\`, \`softwareSystem\`, \`container\`, \`component\`, \`group\`, \`deploymentNode\` or \`infrastructureNode\`.`
      );
    } else if (ID_KINDS[k] === 1) {
      this.i++;
      this.fail(lists.ARROW_LIST, 'a relation is `a --> b`');
    } else this.fail(STATEMENT_START);
  }

  /** The statement inside a body: an element, or the `}` that ends it. */
  private inBody(k: number): void {
    if (k === T.Rbrace) this.close();
    else if (ELEMENT_KINDS[k] === 1 && ARROWS[this.kind(this.i + 1)] !== 1) this.element();
    else
      this.fail(IN_BODY, 'a body holds elements only; relations, styles and the rest go outside');
  }

  /** `}` ends the innermost body. */
  private close(): void {
    const frame = this.open.pop();
    if (frame?.node) frame.node.range.end = this.range().end;
    if (frame?.span) this.state.endStatement(frame.span, this.range().end);
    this.i++;
    this.eol('put the `}` on a line of its own, with nothing after it');
  }

  private unclosed(): void {
    for (const { node } of this.open) {
      if (!node) continue;
      this.state.diagnostics.error(
        'UNCLOSED_BLOCK',
        `Unclosed body: the \`{\` of \`${node.name}\` at line ${this.lineOf(node.range.start)} has no closing \`}\`.`,
        node.idRange
      );
    }
  }

  /** `elemKind id STRING (STRING STRING?)? ("instances" STRING)? TAG* body?` */
  private element(): void {
    const kind = ELEMENT_NAMES.get(this.kind()) ?? 'person';
    const first = this.range(this.i++);
    const idAt = this.idToken();
    const name = this.raw(idAt);
    const label = this.quoted(`an element has a name in quotes, as in \`${kind} ${name} "Name"\``);
    const node: C4BetaElementNode = {
      id: this.id(`element:${name}`),
      type: 'Element',
      range: { ...first },
      kind,
      name,
      idRange: this.range(idAt),
      label,
      tags: [],
      children: [],
    };
    this.fields(node);
    node.range.end = this.range(this.i - 1).end;
    this.counted(node);
    this.body(node);
  }

  /** `(STRING STRING?)? ("instances" STRING)? TAG*` after an element's name. */
  private fields(node: C4BetaElementNode): void {
    this.tested(lists.AFTER_NAME_LIST);
    if (this.kind() === T.String) {
      node.description = this.unquote(this.i++);
      this.tested(lists.AFTER_NAME_LIST);
    }
    if (node.description !== undefined && this.kind() === T.String) {
      node.technology = this.unquote(this.i++);
      this.tested(lists.AFTER_TECHNOLOGY_LIST);
    }
    if (this.kind() === T.Instances) {
      this.i++;
      node.instances = this.quoted('`instances` takes a number in quotes, as in `instances "3"`');
      this.tested(lists.AFTER_TAG_LIST);
    }
    while (this.kind() === T.Tag) {
      node.tags.push(this.raw(this.i++).slice(3));
      this.tested(lists.AFTER_TAG_LIST);
    }
  }

  private counted(node: C4BetaElementNode): void {
    const { diagnostics } = this.state;
    this.place(node);
    this.state.symbol(node.name, 'element', node.idRange, 'def');
    checkLimit(
      diagnostics,
      'maxNodes',
      ++this.elementCount,
      this.options.maxNodes,
      'elements',
      node.range
    );
    if (this.open.length > 0) this.depths.push({ depth: this.open.length, range: node.idRange });
  }

  /** The `{` of an element, then its line break, or `}` at once; else the end of the line. */
  private body(node: C4BetaElementNode): void {
    if (this.kind() !== T.Lbrace) {
      this.state.statement('element', node.range);
      return this.eol(ELEMENT_SHAPE);
    }
    this.i++;
    if (this.kind() === T.Rbrace) {
      node.range.end = this.range(this.i++).end;
      this.state.statement('element', node.range);
      return this.eol();
    }
    if (this.kind() !== Kind.EOF) this.expect(Kind.Newline, 'start the body on the next line');
    const span = this.state.beginStatement('element', node.range.start);
    this.open.push({ list: node.children, node, span });
  }

  /** `(STEP ":")? id arrow id (":" STRING STRING?)? TAG*` */
  private relation(): void {
    const first = this.range();
    let step: number | undefined;
    if (this.kind() === T.Step) {
      step = Number(this.raw(this.i++));
      this.expect(T.Colon);
    }
    const left = this.idToken();
    const arrow = this.kind();
    if (ARROWS[arrow] !== 1) this.fail(lists.ARROW_LIST, 'a relation is `a --> b`');
    this.tested(lists.ARROW_LIST);
    this.i++;
    const right = this.idToken();
    this.tested(lists.AFTER_END_LIST);
    const [from, to] = arrow === T.ArrowLeft ? [right, left] : [left, right];
    const node: C4BetaRelationNode = {
      id: this.id(`rel:${this.raw(from)}->${this.raw(to)}`),
      type: 'Relation',
      range: { ...first },
      from: this.raw(from),
      fromRange: this.range(from),
      to: this.raw(to),
      toRange: this.range(to),
      start: arrow === T.ArrowBoth ? 'arrow' : 'none',
      end: arrow === T.ArrowUndirected ? 'none' : 'arrow',
      tags: [],
      ...(step === undefined ? {} : { step }),
    };
    this.labels(node);
    node.range.end = this.range(this.i - 1).end;
    this.place(node);
    this.state.symbol(node.from, 'element', node.fromRange, 'ref');
    this.state.symbol(node.to, 'element', node.toRange, 'ref');
    this.state.statement('relation', node.range);
    checkLimit(
      this.state.diagnostics,
      'maxEdges',
      ++this.relationCount,
      this.options.maxEdges,
      'relations',
      node.range
    );
    this.eol();
  }

  /** `(":" STRING STRING?)? TAG*` */
  private labels(node: C4BetaRelationNode): void {
    if (this.kind() === T.Colon) {
      this.i++;
      node.description = this.quoted('a relation label is quoted, as in `a --> b : "Uses"`');
      this.tested(lists.AFTER_LABEL_LIST);
      if (this.kind() === T.String) {
        node.technology = this.unquote(this.i++);
        this.tested(lists.AFTER_RELATION_LIST);
      }
    }
    while (this.kind() === T.Tag) {
      node.tags.push(this.raw(this.i++).slice(3));
      this.tested(lists.AFTER_RELATION_LIST);
    }
  }

  /** `title …`, `accTitle: …` and `accDescr …`: the value is what follows the keyword. */
  private text(k: number): void {
    const j = this.i++;
    const type = TEXT_TYPES.get(k) ?? 'Title';
    const range = this.range(j);
    const text = textValue(type, this.raw(j));
    const word = type.charAt(0).toLowerCase() + type.slice(1);
    this.children.push({ id: this.id(word), type, range, text });
    this.state.statement(word, range);
    this.eol();
  }

  private direction(): void {
    const start = this.range(this.i++);
    this.tested(lists.DIRECTION_LIST);
    const direction = DIRECTIONS.get(this.kind());
    if (!direction) this.fail([T.Tb], 'write `direction TB`, `BT`, `LR` or `RL`');
    const range = { start: start.start, end: this.range(this.i++).end };
    this.children.push({ id: this.id('direction'), type: 'Direction', range, direction });
    this.state.statement('direction', range);
    this.eol();
  }

  private legend(): void {
    const start = this.range(this.i++);
    this.tested(lists.LEGEND_LIST);
    if (this.kind() !== T.On && this.kind() !== T.Off)
      this.fail([T.On], 'write `legend on` or `legend off`');
    const on = this.kind() === T.On;
    const range = { start: start.start, end: this.range(this.i++).end };
    this.children.push({ id: this.id('legend'), type: 'Legend', range, on });
    this.state.statement('legend', range);
    this.eol();
  }

  /** `style id entry ("," entry)*` */
  private style(): void {
    const start = this.range(this.i++);
    const target = this.raw(this.idToken());
    const entries: C4BetaStyleNode['entries'] = [this.entry()];
    while (this.kind() === T.Comma) {
      this.i++;
      entries.push(this.entry());
    }
    const range = { start: start.start, end: this.range(this.i - 1).end };
    this.children.push({ id: `style:${++this.styleCount}`, type: 'Style', range, target, entries });
    this.state.statement('style', range);
    this.eol();
  }

  /** `id ":" (HEX | COLOR_FUNCTION | id)` */
  private entry(): C4BetaStyleNode['entries'][number] {
    const key = this.idToken();
    this.expect(T.Colon, 'a style entry is `key:value`, as in `fill:#1f2937`');
    this.tested(lists.VALUE_LIST);
    const k = this.kind();
    if (this.unreadableValue()) this.dropStyle(key);
    const value = k === T.Hex || k === T.ColorFunction ? this.i++ : this.idToken();
    this.tested(lists.AFTER_ENTRY_LIST);
    return {
      key: this.raw(key),
      value: this.raw(value),
      range: { start: this.range(key).start, end: this.range(value).end },
    };
  }

  /**
   * A style value the lexer cannot read: stray characters (`#12`, `(`), or a word they follow
   * with no blank between (`rgb(1, 2` with no `)`). An unclosed text is an error as elsewhere.
   */
  private unreadableValue(): boolean {
    const glued = ID_KINDS[this.kind()] === 1 && this.t.start[this.i + 1] === this.t.end[this.i];
    return this.strayAt(this.i) || (glued && this.strayAt(this.i + 1));
  }

  /** Token `j` is stray characters, not an unclosed text. */
  private strayAt(j: number): boolean {
    const c = this.src.charCodeAt(this.t.start[j] ?? 0);
    return this.kind(j) === Kind.Error && c !== DQUOTE && c !== APOSTROPHE;
  }

  /** Drop the `style` line whose entry `key` has an unreadable value: one warning names it. */
  private dropStyle(key: number): never {
    const start = this.range(key).start;
    const end = this.valueEnd(this.range().start);
    const text = this.src.slice(start, end);
    const quoted = text.length > QUOTED_VALUE ? `${text.slice(0, QUOTED_VALUE)}…` : text;
    this.unreadable.push({ range: { start, end }, what: `\`${quoted}\`` });
    throw DROP;
  }

  /** The end of a style value from `at`: a blank or `,` outside parentheses, `%%` or the line end. */
  private valueEnd(at: number): number {
    const { src } = this;
    let depth = 0;
    let i = at;
    for (; i < src.length; i++) {
      const c = src.charCodeAt(i);
      if (c === LF || c === CR || (c === PERCENT && src.charCodeAt(i + 1) === PERCENT)) break;
      if (c === LPAREN) depth++;
      else if (c === RPAREN) depth--;
      else if (depth <= 0 && (isBlank(c) || c === COMMA)) break;
    }
    return i;
  }
}

/** The text of a `title`, `accTitle:` or `accDescr` token, as the statement means it. */
function textValue(type: C4BetaTextNode['type'], raw: string): string {
  if (type === 'Title') return raw.slice('title'.length).trim();
  const rest = raw.slice(raw.search(/[:{]/));
  if (!rest.startsWith('{')) return rest.slice(1).trim();
  return rest
    .slice(1, -1)
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .join('\n')
    .trim();
}
