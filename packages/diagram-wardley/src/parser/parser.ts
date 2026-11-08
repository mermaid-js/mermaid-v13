// cspell:words accdescr
/**
 * Wardley parser: recursive descent over the significant {@link lex} tokens (gated against
 * v12's Langium lexer, #487), producing a {@link WardleyModel}, the typed AST, symbols,
 * statement spans and diagnostics (DESIGN §4.2).
 *
 * The grammar is v12's `wardley.langium` (with `common.langium`), ported rule for rule (below);
 * `grammar/wardley.ebnf` is the normative form, so it accepts and rejects what v12's parser
 * does. The model is then built as v12's `populateDb` built it ({@link normalise}); v12's
 * thrown errors are error diagnostics with its messages (R-PARSE-4). Unlike v12 the parser
 * does not stop at the first error: it reports it, skips to the next line break and carries
 * on; a pipeline's braces are a block it recovers inside, so one error in it gives one
 * diagnostic.
 */
/*
    Wardley: NEWLINE* "wardley-beta" (NEWLINE | TitleAndAccessibilities | Statement)*
    Size: "size" "[" INT "," INT "]" EOL
    Evolution: "evolution" Stage ("->" Stage)+ EOL     Stage: Name ("@" WN)? ("/" Name)?
    Anchor: "anchor" Name "[" WN "," WN "]" EOL
    Component: "component" Name "[" WN "," WN "]" Label? ("(" STRATEGY ")")?
               ("inertia" | "(" "inertia" ")")? EOL
    Label: "label" "[" "-"? INT "," "-"? INT "]"
    Link: Name LINK_PORT? (LINK_ARROW | "->")? Name LINK_PORT? LINK_LABEL? EOL
    Evolve: "evolve" Name WN EOL
    Pipeline: "pipeline" Name "{" NEWLINE+ ("component" Name "[" WN "]" Label? EOL)+ "}" EOL
    Note: "note" STRING "[" WN "," WN "]" EOL
    Annotations: "annotations" "[" C "," C "]" EOL
    Annotation: "annotation" INT "," "[" C "," C "]" STRING EOL
    (Accelerator | Deaccelerator): kw Name "[" WN "," WN "]" EOL
    TitleAndAccessibilities: ((ACC_DESCR | ACC_TITLE | TITLE) EOL)+     EOL: NEWLINE+ | EOF
    Name: STRING | ID | NAME_WITH_SPACES     WN: WARDLEY_NUMBER     C: WN | INT
*/
import {
  formatExpected,
  Kind,
  LineIndex,
  ParseState,
  Probe,
  significantTokens,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type {
  AstId,
  ParseOptions,
  ParseResult,
  Range,
  SourceView,
  TokenStream,
  TokenView,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { WardleyModel, WardleyStrategy } from '../model.ts';
import type {
  WardleyAcceleratorNode,
  WardleyComponentNode,
  WardleyDocument,
  WardleyLabelOffset,
  WardleyLinkNode,
  WardleyName,
  WardleyNumber,
  WardleyPipelineComponentNode,
  WardleyStage,
  WardleyStatementNode,
} from './ast.ts';
import {
  accDescrValue,
  accTitleValue,
  displayText,
  linkLabelValue,
  stringValue,
  titleValue,
} from './convert.ts';
import { astName, linkName } from './ids.ts';
import { lex } from './lexer.ts';
import {
  characterHint,
  componentHint,
  keywordHint,
  LABEL_HINT,
  linkHint,
  pipelineHint,
  SIZE_HINT,
} from './messages.ts';
import { normalise } from './normalise.ts';
import {
  AFTER_BOUNDARY,
  AFTER_COORDINATES,
  AFTER_FROM,
  AFTER_LABEL,
  AFTER_PIPELINE_CHILD,
  AFTER_PORT,
  AFTER_STAGE,
  AFTER_STAGES,
  AFTER_STRATEGY,
  AFTER_TO,
  AFTER_TO_PORT,
  COORDINATE,
  DOC,
  EXPECTED,
  HEAD,
  IN_PIPELINE,
  KEYWORD_LINE,
  KEYWORD_PREFIX,
  LINE_END,
  NAME_SET,
  NAMES,
  NEWLINE_ONLY,
  PIPELINE_CHILD,
  PROBE_FOLLOWS,
  probeMode,
  STARTS_SET,
  TEXT,
} from './tables.ts';
import { T, TEXT_STATEMENTS, WARDLEY_TRIVIA } from './tokens.ts';

export interface WardleyParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
}

export type WardleyParseResult = ParseResult<WardleyModel, WardleyDocument>;

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
class Stop extends Error {}
const STOP = new Stop();

/** Parse a Wardley map. Never throws: problems are error diagnostics. */
export function parseWardley(src: string, options: WardleyParseOptions = {}): WardleyParseResult {
  return new WardleyParser(src, options).parse();
}

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class WardleyParser {
  private readonly pre: PreprocessResult;
  private readonly view: SourceView;
  private readonly full: TokenStream;
  private readonly t: TokenView;
  private i = 0;
  /** The first token of the statement being read (for D423's glued-keyword hint). */
  private stmt = 0;
  /** Past the header: the statements have begun. */
  private started = false;
  /** Inside a pipeline's `{ … }` (for the messages). */
  private inPipeline = false;
  /**
   * An `accDescr {` with no `}`: v12 read its lines as statements. Recovery skips them, up to
   * a line that starts with a keyword.
   */
  private description = false;
  private readonly st = new ParseState();
  private readonly probe: Probe | undefined;
  private readonly children: WardleyStatementNode[] = [];
  /** Components of pipelines whose name failed: no node, their values still checked. */
  private readonly orphans: WardleyPipelineComponentNode[] = [];
  private lines: LineIndex | undefined;
  /** Mentions per id base (`node:A`, `title`, …), for the `@n` suffixes. */
  private readonly mentions = new Map<string, number>();
  /** Notes so far, for `note:k`. */
  private notes = 0;
  /** Names that have a `node` definition so far (D427: the first one defines). */
  private readonly defined = new Set<string>();
  /** The last in-text value of each (v12's Langium assignments: the last one wins). */
  private title = '';
  private titleAstId: AstId | undefined;
  private accTitle = '';
  private accDescr = '';

  constructor(
    private readonly src: string,
    private readonly opts: WardleyParseOptions
  ) {
    const pre = (this.pre = opts.preprocessed ?? preprocess(src));
    if (!opts.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.full = lex(src, pre.bodyStart, this.view);
    this.t = significantTokens(this.full, WARDLEY_TRIVIA);
    if (opts.probe !== undefined) {
      const probe = (this.probe = new Probe(src, opts.probe, PROBE_FOLLOWS));
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      else probe.trivia(this.full);
      probe.lexed(probe.offset, probe.offset, probeMode(src, this.full, probe.offset));
    }
  }

  parse(): WardleyParseResult {
    const { st, src } = this;
    this.statement(() => this.header());
    this.document();
    this.unresolved();
    const model = this.model();
    const ast: WardleyDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.full, this.opts, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  private kind(j = this.i): number {
    return this.t.kind[j] ?? Kind.EOF;
  }

  private range(j = this.i): Range {
    return { start: this.t.start[j] ?? 0, end: this.t.end[j] ?? 0 };
  }

  /**
   * A token's text as v12's lexer read it (removed spans dropped), with v12's `#name;` codes as
   * the characters v12 drew (`displayText`).
   */
  private raw(j = this.i): string {
    const { start, end } = this.range(j);
    return displayText(this.src, start, end, this.view);
  }

  /**
   * Probe hook: the parser tests the current token for `kinds` (a constant list), or would
   * accept them there. Records them when it is the probed token.
   */
  private tested(kinds: readonly number[]): void {
    const p = this.probe;
    if (p?.isAt(this.t, this.i, this.pre.bodyStart)) p.tested(kinds, this.range().start);
  }

  /** Consume a token of `kind` and return its index, or fail. */
  private expect(kind: number, hint?: string): number {
    this.tested([kind]);
    if (this.kind() !== kind) this.fail([kind], hint);
    return this.i++;
  }

  /** Whether the current token is `kind` (tested for `kinds`, what may come here); consume it if so. */
  private accept(kind: number, kinds: readonly number[]): boolean {
    this.tested(kinds);
    if (this.kind() !== kind) return false;
    this.i++;
    return true;
  }

  /** Consume the line breaks at the cursor; `next` (with `Kind.Newline`) may follow them. */
  private newlines(next: readonly number[] = NEWLINE_ONLY): void {
    for (;;) {
      this.tested(next);
      if (this.kind() !== Kind.Newline) return;
      this.i++;
    }
  }

  /** `id`, then `id@2`, `id@3`, … */
  private id(base: string): AstId {
    const n = (this.mentions.get(base) ?? 0) + 1;
    this.mentions.set(base, n);
    return n === 1 ? base : `${base}@${n}`;
  }

  /** `Name: STRING | ID | NAME_WITH_SPACES`, converted. */
  private name(): WardleyName {
    this.tested(NAMES);
    const k = this.kind();
    if (NAME_SET[k] !== 1) this.fail(NAMES);
    const range = this.range(this.i);
    const raw = this.raw(this.i++);
    return { value: k === T.String ? stringValue(raw) : raw, range };
  }

  /** A token of `kind` (a decimal or an integer) as a number. */
  private number(kind: number, hint?: string): WardleyNumber {
    const j = this.expect(kind, hint);
    return { value: Number(this.raw(j)), range: this.range(j) };
  }

  /** `CoordinateValue: WARDLEY_NUMBER | INT`. */
  private coordinate(): WardleyNumber {
    this.tested(COORDINATE);
    const k = this.kind();
    if (k !== T.Decimal && k !== T.Int) this.fail(COORDINATE);
    return { value: Number(this.raw(this.i)), range: this.range(this.i++) };
  }

  /** `"[" WN "," WN "]"`: `[visibility, evolution]`. */
  private coordinates(): { visibility: WardleyNumber; evolution: WardleyNumber } {
    this.expect(T.LBracket);
    const visibility = this.number(T.Decimal);
    this.expect(T.Comma);
    const evolution = this.number(T.Decimal);
    this.expect(T.RBracket);
    return { visibility, evolution };
  }

  /** `EOL: NEWLINE+ | EOF` (the document loop takes the line breaks after the first). */
  private eol(next: readonly number[] = LINE_END, hint?: string): void {
    this.tested(next);
    const k = this.kind();
    if (k === Kind.EOF) return;
    if (k !== Kind.Newline) this.fail(next, hint);
    this.i++;
  }

  /** The end of the last token read. */
  private end(): number {
    return this.t.end[this.i - 1] ?? 0;
  }

  // ---- errors and recovery ------------------------------------------------------------

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the token at `j`. */
  private found(j = this.i): string {
    const k = this.kind(j);
    if (k === Kind.EOF) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    const text = this.raw(j).trim();
    const line = text.split('\n', 1)[0] ?? '';
    return line.length > 24 || line !== text ? `\`${line.slice(0, 24)}…\`` : `\`${line}\``;
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  private fail(want: readonly number[], hint?: string, names = EXPECTED.names(want)): never {
    if (this.kind() === Kind.Error) this.badCharacters(this.range());
    this.accessibilityName();
    this.report(want, hint, names);
    throw STOP;
  }

  /** Record `Expected …, got …` at the current token (and go on). */
  private report(want: readonly number[], hint?: string, names = EXPECTED.names(want)): void {
    const why = hint ?? this.explain(want);
    const message = `Expected ${formatExpected(names)}, got ${this.found()}${why ? `; ${why}` : ''}.`;
    this.st.diagnostics.error('UNEXPECTED', message, this.range(), { expected: names });
  }

  /** Text no token rule matched: an unclosed string, or stray characters. */
  private badCharacters(where: Range): never {
    const { st } = this;
    const text = this.raw();
    const line = this.lineOf(where.start);
    if (text.startsWith('"') || text.startsWith("'")) {
      const q = text[0] ?? '"';
      st.diagnostics.error(
        'UNCLOSED_STRING',
        `Unclosed quote: the \`${q}\` at line ${line} has no closing \`${q}\`. Add \`${q}\` after the text.`,
        where,
        { expected: [`\`${q}\``] }
      );
      throw STOP;
    }
    const shown = text.length > 24 ? `${text.slice(0, 24)}…` : text;
    const why = characterHint(text, this.src.charAt(where.end));
    st.diagnostics.error('UNEXPECTED_CHARACTER', `Unexpected character \`${shown}\`${why}.`, where);
    throw STOP;
  }

  /**
   * A statement that starts with `accDescr` or `accTitle` read as a name (no `:` after it, or
   * an `accDescr {` with no `}`): v12's lexer then has no accessibility token, and the parser
   * reads the start of a link.
   */
  private accessibilityName(): void {
    if (!this.started || this.kind(this.stmt) !== T.Id || this.i > this.stmt + 1) return;
    const word = this.raw(this.stmt);
    if (word !== 'accDescr' && word !== 'accTitle') return;
    const where = this.range(this.stmt);
    if (word === 'accDescr' && this.kind(this.stmt + 1) === T.LBrace) {
      this.description = true;
      this.st.diagnostics.error(
        'UNCLOSED_ACC_DESCR',
        `Unclosed accessible description: the \`accDescr {\` at line ${this.lineOf(where.start)} has no closing \`}\`. Write \`accDescr { … }\` or \`accDescr: …\`.`,
        where
      );
      throw STOP;
    }
    this.st.diagnostics.error(
      'UNEXPECTED',
      `Expected \`:\` after \`${word}\`; write it as \`${word}: …\`${word === 'accDescr' ? ' or `accDescr { … }`' : ''}.`,
      where,
      { expected: ['`:`'] }
    );
    throw STOP;
  }

  private explain(want: readonly number[]): string | undefined {
    const k = this.kind();
    const wantsName = want.some((w) => NAME_SET[w] === 1);
    if (wantsName && KEYWORD_PREFIX[k] === 1) return this.keywordName(this.i);
    if (wantsName && k === T.Int && this.glued(this.i) && NAME_SET[this.kind(this.i + 1)] === 1) {
      const whole = this.raw() + this.raw(this.i + 1);
      return `\`${whole}\` starts with a digit, and an unquoted name cannot: quote it, as \`"${whole}"\``;
    }
    // `notebook`, `sizeable`, `componentX -> Y`: a keyword glued to the name after it.
    const s = this.stmt;
    if (
      KEYWORD_PREFIX[this.kind(s)] === 1 &&
      NAME_SET[this.kind(s + 1)] === 1 &&
      this.glued(s) &&
      this.i <= s + 2
    ) {
      return this.keywordName(s);
    }
    if (want.includes(T.Decimal) && !want.includes(T.Int) && k === T.Int) {
      return 'a coordinate is a decimal with a `.`, such as `0.5`: write `1.0` for 1 and `0.0` for 0';
    }
    if (want.includes(T.Int) && !want.includes(T.Decimal) && k === T.Decimal) {
      return 'this is a whole number, without a `.`';
    }
    if (k === T.WardleyBeta) return 'a map has one `wardley-beta`, at its start';
    if (this.inPipeline) return pipelineHint(k, want);
    if (want.includes(Kind.Newline) && KEYWORD_LINE[k] === 1) {
      return 'each statement goes on a line of its own';
    }
    const statement = this.kind(s);
    if (statement === T.Component) return componentHint(k, this.kind(this.i + 1), want);
    if (NAME_SET[statement] === 1) return linkHint(k, want, this.raw(s), statement === T.Name);
    if (k === T.RBrace) return 'this `}` closes no pipeline';
    return undefined;
  }

  /** Whether the token at `j` ends where the next one starts. */
  private glued(j: number): boolean {
    return (this.t.end[j] ?? 0) === (this.t.start[j + 1] ?? -1);
  }

  /** The keyword a keyword-like token starts with (`title` for a title's whole line). */
  private keywordOf(j: number): string {
    const text = this.raw(j);
    return this.kind(j) === T.Title ? 'title' : text;
  }

  /** D423: v12 reads a keyword or strategy at the start of an unquoted name. */
  private keywordName(j: number): string {
    const word = this.keywordOf(j);
    let whole = word;
    if (this.kind(j) !== T.Title) {
      for (let n = j; this.glued(n) && NAME_SET[this.kind(n + 1)] === 1; n++)
        whole += this.raw(n + 1);
    } else {
      const m = /^title[\t ]+([^\t [\]]*)/.exec(this.raw(j));
      if (m?.[1]) whole = `title ${m[1]}`;
    }
    return keywordHint(word, whole);
  }

  /**
   * Skip to the next line break after an error (R-PARSE-4). After an error at a line end, skip
   * the next line too unless it starts a statement (it is the rest of the one cut short). After
   * an unclosed `accDescr {`, skip to a line that starts with a keyword (the description's
   * lines are text, not links).
   */
  private recover(): void {
    this.probe?.freeze();
    let continued = this.kind() === Kind.Newline;
    const description = this.description;
    this.description = false;
    for (;;) {
      const k = this.kind();
      if (k === Kind.EOF) return;
      if (k === Kind.Newline) {
        const j = this.lineStart(this.i);
        const next = this.kind(j);
        if (description ? KEYWORD_LINE[next] === 1 : !continued || STARTS_SET[next] === 1) return;
        continued = false;
        this.i = j;
        continue;
      }
      this.i++;
    }
  }

  /** Run one statement rule; on failure, recover. */
  private statement(rule: () => void): void {
    this.stmt = this.i;
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover();
    }
  }

  // ---- rules --------------------------------------------------------------------------

  /** `NEWLINE* "wardley-beta"` */
  private header(): void {
    this.newlines(HEAD);
    const k = this.kind();
    if (k !== T.WardleyBeta) {
      const raw = k === T.Name ? this.raw() : '';
      const hint = raw.toLowerCase().startsWith('wardley-beta')
        ? 'a Wardley map starts with `wardley-beta`, in lower case'
        : 'a Wardley map starts with `wardley-beta`';
      this.fail([T.WardleyBeta], hint);
    }
    const range = this.range(this.i++);
    this.st.statement('header', range);
    this.children.push({ id: 'wardley', type: 'Header', range });
  }

  /** `(NEWLINE | TitleAndAccessibilities | Statement)* EOF` */
  private document(): void {
    this.started = true;
    for (;;) {
      this.tested(DOC);
      const k = this.kind();
      if (k === Kind.EOF) return;
      if (k === Kind.Newline) {
        this.i++;
        continue;
      }
      this.statement(() => this.dispatch(k));
    }
  }

  private dispatch(k: number): void {
    if (TEXT.includes(k)) this.text(k);
    else if (k === T.Size) this.size();
    else if (k === T.Evolution) this.evolution();
    else if (k === T.Anchor) this.anchor();
    else if (k === T.Component) this.component();
    else if (k === T.Evolve) this.evolve();
    else if (k === T.Pipeline) this.pipeline();
    else if (k === T.Note) this.note();
    else if (k === T.Annotations) this.annotations();
    else if (k === T.Annotation) this.annotation();
    else if (k === T.Accelerator || k === T.Deaccelerator) this.accelerator(k);
    else if (NAME_SET[k] === 1) this.link();
    else this.fail(DOC);
  }

  /** Record a finished statement: its node, its span. */
  private done(node: WardleyStatementNode, kind: string): void {
    this.children.push(node);
    this.st.statement(kind, node.range);
  }

  /** A node name's symbol (D427): the first anchor or component of a name defines it. */
  private define(name: WardleyName): void {
    const def = !this.defined.has(name.value);
    this.defined.add(name.value);
    this.st.symbol(name.value, 'node', name.range, def ? 'def' : 'ref');
  }

  /** A name that refers to a node (links, `evolve`, `pipeline`, (de)accelerators). */
  private refer(name: WardleyName): void {
    this.st.symbol(name.value, 'node', name.range, 'ref');
  }

  /** `Size: "size" "[" INT "," INT "]" EOL` */
  private size(): void {
    const start = this.range(this.i++).start;
    this.expect(T.LBracket);
    const width = this.number(T.Int, SIZE_HINT);
    this.expect(T.Comma);
    const height = this.number(T.Int, SIZE_HINT);
    this.expect(T.RBracket);
    const range = { start, end: this.end() };
    this.eol();
    this.done({ id: this.id('size'), type: 'Size', range, width, height }, 'size');
  }

  /** `Evolution: "evolution" Stage ("->" Stage)+ EOL` */
  private evolution(): void {
    const start = this.range(this.i++).start;
    const stages = [this.stage()];
    this.expect(T.Arrow, 'an evolution has at least two stages, joined by `->`');
    stages.push(this.stage());
    while (this.accept(T.Arrow, AFTER_STAGES)) stages.push(this.stage());
    const range = { start, end: this.end() };
    this.eol();
    this.done({ id: this.id('evolution'), type: 'Evolution', range, stages }, 'evolution');
  }

  /** `Stage: Name ("@" WARDLEY_NUMBER)? ("/" Name)?` */
  private stage(): WardleyStage {
    const stage: WardleyStage = { name: this.name() };
    if (this.accept(T.At, AFTER_STAGE)) stage.boundary = this.number(T.Decimal);
    if (this.accept(T.Slash, stage.boundary ? AFTER_BOUNDARY : AFTER_STAGE)) {
      stage.secondName = this.name();
    }
    return stage;
  }

  /** `Anchor: "anchor" Name "[" WN "," WN "]" EOL` */
  private anchor(): void {
    const start = this.range(this.i++).start;
    const name = this.name();
    const at = this.coordinates();
    const range = { start, end: this.end() };
    this.eol(LINE_END, this.kind() === T.Label ? 'an anchor has no `label`' : undefined);
    this.define(name);
    const id = this.id(astName('node', name.value));
    this.done({ id, type: 'Anchor', range, name, ...at }, 'anchor');
  }

  /** `Label: "label" "[" "-"? INT "," "-"? INT "]"` */
  private labelOffset(): WardleyLabelOffset {
    const start = this.range(this.i++).start;
    this.expect(T.LBracket);
    const sx = this.accept(T.Dash, [T.Dash, T.Int]) ? -1 : 1;
    const x = this.number(T.Int, LABEL_HINT);
    this.expect(T.Comma);
    const sy = this.accept(T.Dash, [T.Dash, T.Int]) ? -1 : 1;
    const y = this.number(T.Int, LABEL_HINT);
    this.expect(T.RBracket);
    return { x: sx * x.value, y: sy * y.value, range: { start, end: this.end() } };
  }

  /** Component: `component` Name, coordinates, then label, strategy and inertia, each optional. */
  private component(): void {
    const start = this.range(this.i++).start;
    const name = this.name();
    const at = this.coordinates();
    const node: WardleyComponentNode = {
      id: '',
      type: 'Component',
      range: { start, end: 0 },
      name,
      ...at,
      inertia: false,
    };
    this.tested(AFTER_COORDINATES);
    if (this.kind() === T.Label) node.label = this.labelOffset();
    this.tested(node.label ? AFTER_LABEL : AFTER_COORDINATES);
    if (this.kind() === T.LParen && this.kind(this.i + 1) === T.Strategy) {
      this.i++;
      node.strategy = this.raw(this.i++) as WardleyStrategy;
      this.expect(T.RParen);
      this.tested(AFTER_STRATEGY);
    }
    if (this.kind() === T.Inertia) {
      this.i++;
      node.inertia = true;
    } else if (this.kind() === T.LParen && this.kind(this.i + 1) === T.Inertia) {
      this.i += 2;
      this.expect(T.RParen);
      node.inertia = true;
    }
    node.range.end = this.end();
    this.eol(this.afterComponent(node));
    this.define(name);
    node.id = this.id(astName('node', name.value));
    this.done(node, 'component');
  }

  /** What may follow a component's last part (the probe's list, and the message's). */
  private afterComponent(node: WardleyComponentNode): readonly number[] {
    if (node.inertia) return LINE_END;
    if (node.strategy) return AFTER_STRATEGY;
    return node.label ? AFTER_LABEL : AFTER_COORDINATES;
  }

  /** `Link: Name LINK_PORT? (LINK_ARROW | ARROW)? Name LINK_PORT? LINK_LABEL? EOL` */
  private link(): void {
    const from = this.name();
    const node: WardleyLinkNode = {
      id: '',
      type: 'Link',
      range: { start: from.range.start, end: 0 },
      from,
      to: from,
    };
    this.tested(AFTER_FROM);
    if (this.kind() === T.LinkPort) node.fromPort = this.raw(this.i++);
    this.tested(node.fromPort ? AFTER_PORT : AFTER_FROM);
    if (this.kind() === T.LinkArrow || this.kind() === T.Arrow) node.arrow = this.raw(this.i++);
    if (NAME_SET[this.kind()] !== 1) {
      if (node.arrow) this.fail(NAMES);
      this.fail(node.fromPort ? AFTER_PORT : AFTER_FROM);
    }
    node.to = this.name();
    this.tested(AFTER_TO);
    if (this.kind() === T.LinkPort) node.toPort = this.raw(this.i++);
    this.tested(node.toPort ? AFTER_TO_PORT : AFTER_TO);
    if (this.kind() === T.LinkLabel) node.linkLabel = linkLabelValue(this.raw(this.i++));
    node.range.end = this.end();
    if (node.linkLabel !== undefined) this.eol();
    else this.eol(node.toPort ? AFTER_TO_PORT : AFTER_TO);
    this.refer(node.from);
    this.refer(node.to);
    node.id = this.id(linkName(from.value, node.to.value));
    this.done(node, 'link');
  }

  /** `Evolve: "evolve" Name WARDLEY_NUMBER EOL` */
  private evolve(): void {
    const start = this.range(this.i++).start;
    const name = this.name();
    const target = this.number(T.Decimal);
    const range = { start, end: this.end() };
    this.eol();
    this.refer(name);
    this.done(
      { id: this.id(astName('evolve', name.value)), type: 'Evolve', range, name, target },
      'evolve'
    );
  }

  /**
   * `Pipeline: "pipeline" Name "{" NEWLINE+ PipelineComponent+ "}" EOL`. A header that fails
   * still opens the block when its line (or the next line's start) has the `{`, so the
   * components and the `}` are read as the block's (pitfall 8). Inside, an error skips its line;
   * a `}` on it closes the block. A line that starts another statement ends an unclosed block.
   */
  private pipeline(): void {
    const keyword = this.range(this.i++);
    let parent: WardleyName | undefined;
    let brace: Range | undefined;
    try {
      parent = this.name();
      this.tested([T.LBrace]);
      if (this.kind() !== T.LBrace) {
        const next = this.lineStart(this.i);
        const hint =
          this.kind() === Kind.Newline && this.kind(next) === T.LBrace
            ? "a pipeline's `{` goes on the line of its name"
            : undefined;
        this.fail([T.LBrace], hint);
      }
      brace = this.range(this.i++);
      // At the end of the text, the block's missing `}` is the one error.
      this.tested(LINE_END);
      if (this.kind() !== Kind.EOF) {
        this.expect(Kind.Newline, 'the components of a pipeline start on the line after its `{`');
      }
    } catch (error) {
      if (error !== STOP) throw error;
      this.probe?.freeze();
      brace ??= this.openBrace();
      if (!brace) {
        this.recover();
        return;
      }
      this.skipLine();
    }
    if (parent) this.refer(parent);
    const span = this.st.beginStatement('pipeline', keyword.start);
    const body = this.pipelineBody(parent, brace);
    this.st.endStatement(span, body.end);
    // Components of a pipeline whose name failed are in no AST node, but their values are
    // checked, so their errors count (R-PARSE-4).
    if (!parent) this.orphans.push(...body.children);
    else {
      this.children.push({
        id: this.id(astName('pipeline', parent.value)),
        type: 'Pipeline',
        range: { start: keyword.start, end: body.end },
        parent,
        children: body.children,
      });
    }
    if (body.closed) this.eol(LINE_END, 'the `}` of a pipeline ends its line');
  }

  /**
   * The components of a pipeline and its `}`. `closed`: the cursor is after the `}` (its line
   * end comes next); otherwise the `}` was on a line an error skipped, or there is none (an
   * error says so). `end` is where the block ends.
   */
  private pipelineBody(
    parent: WardleyName | undefined,
    brace: Range
  ): { children: WardleyPipelineComponentNode[]; closed: boolean; end: number } {
    const children: WardleyPipelineComponentNode[] = [];
    let failed = false;
    let end = brace.end;
    this.inPipeline = true;
    try {
      for (;;) {
        this.newlines(IN_PIPELINE);
        const k = this.kind();
        if (k === T.RBrace) {
          if (children.length === 0 && !failed)
            this.report([T.Component], undefined, [PIPELINE_CHILD]);
          end = this.range(this.i++).end;
          return { children, closed: true, end };
        }
        if (k === Kind.EOF || (STARTS_SET[k] === 1 && k !== T.Component)) {
          this.unclosed(parent, brace);
          return { children, closed: false, end };
        }
        this.stmt = this.i;
        try {
          if (k !== T.Component)
            this.fail([T.Component, T.RBrace], undefined, [PIPELINE_CHILD, '`}`']);
          children.push(this.pipelineComponent(parent));
          end = this.end();
        } catch (error) {
          if (error !== STOP) throw error;
          this.probe?.freeze();
          failed = true;
          const closed = this.skipLine();
          end = this.end();
          if (closed) return { children, closed: false, end };
        }
      }
    } finally {
      this.inPipeline = false;
    }
  }

  /** `PipelineComponent: "component" Name "[" WARDLEY_NUMBER "]" Label? EOL` */
  private pipelineComponent(parent: WardleyName | undefined): WardleyPipelineComponentNode {
    const start = this.range(this.i++).start;
    const name = this.name();
    this.expect(T.LBracket);
    const evolution = this.number(T.Decimal);
    this.expect(T.RBracket);
    this.tested(AFTER_PIPELINE_CHILD);
    const label = this.kind() === T.Label ? this.labelOffset() : undefined;
    const range = { start, end: this.end() };
    this.tested(LINE_END);
    if (this.kind() !== Kind.EOF) this.expect(Kind.Newline);
    this.define(name);
    this.st.statement('component', range);
    // Without a parent (its name failed) the component has no id; its values are still checked.
    const id = parent ? this.id(astName('node', `${parent.value}_${name.value}`)) : '';
    const node: WardleyPipelineComponentNode = {
      id,
      type: 'PipelineComponent',
      range,
      name,
      evolution,
    };
    if (label) node.label = label;
    return node;
  }

  /** The token index of the first token of the line after `j`'s line breaks. */
  private lineStart(j: number): number {
    let n = j;
    while (this.kind(n) === Kind.Newline) n++;
    return n;
  }

  /**
   * After a failed pipeline header: the `{` later on its line, or at the start of the next
   * line, with the cursor after it; undefined (cursor unmoved) when there is none.
   */
  private openBrace(): Range | undefined {
    let j = this.i;
    while (this.kind(j) !== Kind.Newline && this.kind(j) !== Kind.EOF && this.kind(j) !== T.LBrace)
      j++;
    if (this.kind(j) !== T.LBrace) j = this.lineStart(j);
    if (this.kind(j) !== T.LBrace) return undefined;
    this.i = j + 1;
    return this.range(j);
  }

  /** Skip to the line break that ends the current line; whether a `}` was skipped. */
  private skipLine(): boolean {
    let brace = false;
    for (;;) {
      const k = this.kind();
      if (k === Kind.Newline || k === Kind.EOF) return brace;
      if (k === T.RBrace) brace = true;
      this.i++;
    }
  }

  /** A pipeline's `{` with no `}` before the end or before a line that starts a statement. */
  private unclosed(parent: WardleyName | undefined, brace: Range): void {
    const of = parent ? ` of \`pipeline ${parent.value}\`` : '';
    this.st.diagnostics.error(
      'UNCLOSED_PIPELINE',
      `Unclosed pipeline: the \`{\`${of} at line ${this.lineOf(brace.start)} has no \`}\`. Add a line with \`}\` after its components.`,
      brace,
      { expected: ['`}`'] }
    );
  }

  /** `Note: "note" STRING "[" WN "," WN "]" EOL` */
  private note(): void {
    const start = this.range(this.i++).start;
    this.tested([T.String]);
    if (this.kind() !== T.String) {
      this.fail([T.String], undefined, ['a text in quotes, such as `"Note"`']);
    }
    const text = stringValue(this.raw(this.i++));
    const at = this.coordinates();
    const range = { start, end: this.end() };
    this.eol();
    this.done({ id: `note:${++this.notes}`, type: 'Note', range, text, ...at }, 'note');
  }

  /** `Annotations: "annotations" "[" C "," C "]" EOL` */
  private annotations(): void {
    const start = this.range(this.i++).start;
    this.expect(T.LBracket);
    const visibility = this.coordinate();
    this.expect(T.Comma);
    const evolution = this.coordinate();
    this.expect(T.RBracket);
    const range = { start, end: this.end() };
    this.eol();
    this.done(
      { id: this.id('annotations'), type: 'Annotations', range, visibility, evolution },
      'annotations'
    );
  }

  /** `Annotation: "annotation" INT "," "[" C "," C "]" STRING EOL` */
  private annotation(): void {
    const start = this.range(this.i++).start;
    const number = this.number(
      T.Int,
      'an annotation has a whole number, such as `annotation 1, [0.5, 0.5] "Text"`'
    );
    this.expect(T.Comma);
    this.expect(T.LBracket);
    const visibility = this.coordinate();
    this.expect(T.Comma);
    const evolution = this.coordinate();
    this.expect(T.RBracket);
    this.tested([T.String]);
    if (this.kind() !== T.String) {
      this.fail([T.String], undefined, ['a text in quotes, such as `"Annotation"`']);
    }
    const text = stringValue(this.raw(this.i++));
    const range = { start, end: this.end() };
    this.eol();
    const id = this.id(astName('annotation', String(number.value)));
    this.done({ id, type: 'Annotation', range, number, visibility, evolution, text }, 'annotation');
  }

  /** `(Accelerator | Deaccelerator): kw Name "[" WN "," WN "]" EOL` */
  private accelerator(k: number): void {
    const start = this.range(this.i++).start;
    const name = this.name();
    const at = this.coordinates();
    const range = { start, end: this.end() };
    this.eol();
    const type: WardleyAcceleratorNode['type'] =
      k === T.Accelerator ? 'Accelerator' : 'Deaccelerator';
    const word = k === T.Accelerator ? 'accelerator' : 'deaccelerator';
    this.refer(name);
    this.done({ id: this.id(astName(word, name.value)), type, range, name, ...at }, word);
  }

  /** `(ACC_DESCR | ACC_TITLE | TITLE) EOL` */
  private text(k: number): void {
    const j = this.i++;
    const image = this.raw(j);
    const { type, word } = TEXT_STATEMENTS[k] ?? { type: 'Title', word: 'title' };
    const range = this.range(j);
    let text: string;
    if (type === 'Title') text = this.title = titleValue(image);
    else if (type === 'AccTitle') text = this.accTitle = accTitleValue(image);
    else text = this.accDescr = accDescrValue(image);
    const id = this.id(word);
    if (type === 'Title') this.titleAstId = id;
    this.eol(LINE_END, '`title`, `accTitle` and `accDescr` end their line');
    this.done({ id, type, range, text }, word);
  }

  /**
   * D427: a reference to a name no anchor or component defines has no symbol (no definition,
   * references or rename). Run after the parse: a node defined after a link still resolves it.
   */
  private unresolved(): void {
    const { symbols } = this.st;
    let k = 0;
    for (const s of symbols) if (this.defined.has(s.name)) symbols[k++] = s;
    symbols.length = k;
  }

  // ---- the model ----------------------------------------------------------------------

  private model(): WardleyModel {
    const { diagnostics } = this.st;
    const resolved = normalise(
      {
        statements: this.children,
        orphans: this.orphans,
        title: this.title,
        titleAstId: this.titleAstId,
        accTitle: this.accTitle,
        accDescr: this.accDescr,
        frontMatterTitle: this.pre.frontMatter?.title,
      },
      diagnostics
    );
    // The model's diagnostics are found after the parse: keep the list in source order.
    diagnostics.list.sort((x, y) => x.range.start - y.range.start);
    const warnings = diagnostics.list.filter((d) => d.severity === 'warning');
    return Object.freeze({ ...resolved, warnings: Object.freeze(warnings) });
  }
}
