/**
 * The scaffolding the recursive-descent parsers of the langium-family diagrams share: the
 * source view, lex and probe set-up, the token cursor, probe bookkeeping, AST ids counted by
 * base name, statement-level error recovery and the end of a parse. A diagram's parser extends
 * {@link RuleParser} and writes its rules and its `fail`, which can be {@link RuleParser.unexpected}.
 * The tables of `unexpected`, `lineEnd` and `textStatement` come from its {@link RuleGrammar}.
 */
import {
  type AstId,
  cook,
  type AstNode,
  type Diagnostic,
  type ExpectedTable,
  Kind,
  type KindSet,
  kindSet,
  LineIndex,
  type ParseOptions,
  type ParseResult,
  ParseState,
  Probe,
  type Range,
  significantTokens,
  skipTo,
  sourceView,
  type SourceView,
  type TokenStream,
  type TokenView,
} from '@mermaid-js/core/parser-kit';
import { withoutIndent, textValue } from './rule-text.ts';
import type { TextStatement, TextValues } from './rule-text.ts';
import { foundText, STOP } from './support.ts';

/** What {@link RuleParser} reads of a preprocess result (core's `PreprocessResult` fits). */
export interface RuleParserPre {
  readonly bodyStart: number;
  readonly frontMatter?: { readonly title?: string };
  readonly directives: readonly { readonly range: Range }[];
  readonly diagnostics: readonly Diagnostic[];
}

/** One diagram's lexer and tables, as {@link RuleParser} uses them. */
export interface RuleGrammar {
  lex(src: string, from: number, view: SourceView): TokenStream;
  /** The kinds the parser never sees. */
  readonly trivia: KindSet;
  /** Where {@link RuleParser.recover} stops (default: a line break or the end). */
  readonly boundary?: KindSet;
  /** The kinds a probe at the end of a token still belongs to (see `Probe`). */
  readonly probeFollows?: KindSet;
  /** The lexer mode at offset `o`, for a probe. */
  probeMode(src: string, tokens: TokenStream, o: number): string;
  /** What `unexpected` names for the kinds it expected (R-ERR-2, R-ERR-5). */
  readonly expected?: ExpectedTable;
  /**
   * The kinds that start a statement, and the hint `lineEnd` gives when one follows another on
   * its line.
   */
  readonly statements?: readonly number[];
  readonly onePerLine?: string;
}

/** A `title`, `accTitle` or `accDescr` statement's AST node, as `textStatement` makes it. */
export interface TextNode extends AstNode<TextStatement['type']> {
  text: string;
}

/** The fields of a model that `finish` fills in: the text statements' values and the warnings. */
export interface TextModelFields {
  readonly title?: string;
  readonly accTitle: string;
  readonly accDescr: string;
  readonly warnings: readonly Diagnostic[];
}

/** The `Document` node `finish` makes. */
export interface DocumentNode<C extends AstNode> extends AstNode<'Document'> {
  children: C[];
}

const LINE_BOUNDARY = /* @__PURE__ */ kindSet(Kind.Newline, Kind.EOF);
const LINE_END: readonly number[] = /* @__PURE__ */ Object.freeze([Kind.Newline, Kind.EOF]);

export abstract class RuleParser<Pre extends RuleParserPre = RuleParserPre> {
  protected readonly view: SourceView;
  /** Every token, trivia included. */
  protected readonly full: TokenStream;
  /** The tokens the rules see. */
  protected readonly t: TokenView;
  protected i = 0;
  protected readonly st = new ParseState();
  protected readonly probe: Probe | undefined;
  protected lines: LineIndex | undefined;
  /** How many times each AST id base was handed out. */
  protected readonly mentions = new Map<string, number>();
  private readonly boundary: KindSet;
  private readonly grammar: RuleGrammar;

  /**
   * @param own - `pre` was made for this parse (not handed in): its diagnostics are reported.
   * @param probeAt - The probe's offset, when the parse is probed.
   */
  constructor(
    protected readonly src: string,
    protected readonly pre: Pre,
    own: boolean,
    grammar: RuleGrammar,
    probeAt: number | undefined
  ) {
    if (own) this.st.diagnostics.list.push(...pre.diagnostics);
    this.view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.full = grammar.lex(src, pre.bodyStart, this.view);
    this.t = significantTokens(this.full, grammar.trivia);
    this.boundary = grammar.boundary ?? LINE_BOUNDARY;
    this.grammar = grammar;
    if (probeAt !== undefined) {
      const probe = (this.probe = new Probe(src, probeAt, grammar.probeFollows));
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      else probe.trivia(this.full);
      probe.lexed(probe.offset, probe.offset, grammar.probeMode(src, this.full, probe.offset));
    }
  }

  // --- Cursor -------------------------------------------------------------------------------

  protected kind(j = this.i): number {
    return this.t.kind[j] ?? Kind.EOF;
  }

  protected range(j = this.i): Range {
    return { start: this.t.start[j] ?? 0, end: this.t.end[j] ?? 0 };
  }

  /** Token `j`'s text as v12's lexer read it. */
  protected raw(j = this.i): string {
    const { start, end } = this.range(j);
    return cook(this.src, start, end, this.view);
  }

  /** Record that the rules test for `kinds` at token `j`, when the probe is there. */
  protected tested(kinds: readonly number[], j = this.i): void {
    const p = this.probe;
    if (p?.isAt(this.t, j, this.pre.bodyStart)) p.tested(kinds, this.t.start[j] ?? 0);
  }

  /** Consume a token of `kind` (its index), or fail. */
  protected expect(kind: number, hint?: string): number {
    this.tested([kind]);
    if (this.kind() !== kind) this.fail([kind], hint);
    return this.i++;
  }

  /** `base`, then `base@2`, `base@3`, … for later mentions. */
  protected id(base: string): AstId {
    const n = (this.mentions.get(base) ?? 0) + 1;
    this.mentions.set(base, n);
    return n === 1 ? base : `${base}@${n}`;
  }

  // --- Errors and recovery ------------------------------------------------------------------

  /** The 1-based line of source offset `at`. */
  protected lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** What the current token is, for "got …". */
  protected found(): string {
    const k = this.kind();
    return foundText(k, k === Kind.EOF || k === Kind.Newline ? '' : this.raw());
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  protected abstract fail(want: readonly number[], hint?: string): never;

  /**
   * A `fail` that most diagrams can use: report what was found where one of `want` was expected,
   * then stop the statement. `names` are what is reported as expected: the grammar's `expected`
   * table names `want` by default. Text no token rule matched goes to {@link unmatched} first,
   * and `hint` defaults to {@link failHint}.
   */
  protected unexpected(
    want: readonly number[],
    hint?: string,
    names = this.grammar.expected?.names(want) ?? []
  ): never {
    const where = this.range();
    if (this.kind() === Kind.Error) this.unmatched(where, want);
    this.st.diagnostics.unexpected(
      'UNEXPECTED',
      where,
      names,
      this.found(),
      undefined,
      hint ?? this.failHint()
    );
    throw STOP;
  }

  /**
   * {@link unexpected}'s hook for an error token (text no token rule matched) at `where`,
   * where one of `want` was expected: report it and throw {@link STOP}, or return to report it as
   * unexpected.
   */
  protected unmatched(_where: Range, _want: readonly number[]): void {
    // By default it is reported as an unexpected token.
  }

  /** {@link unexpected}'s hint about the current token, when the caller gives none. */
  protected failHint(): string | undefined {
    return undefined;
  }

  /**
   * `EOL: NEWLINE+ | EOF` (the statement loop takes the line breaks after the first). A statement
   * of the grammar's `statements` here gets its `onePerLine` hint.
   */
  protected lineEnd(): void {
    this.tested(LINE_END);
    const k = this.kind();
    if (k === Kind.EOF) return;
    if (k !== Kind.Newline) {
      const { statements, onePerLine } = this.grammar;
      this.fail(LINE_END, statements?.includes(k) ? onePerLine : undefined);
    }
    this.i++;
  }

  /**
   * `(ACC_DESCR | ACC_TITLE | TITLE) EOL`: the current token is the statement `s`. Its value goes
   * to `values` (the last one wins, as v12's Langium assignments) and its node to `children`.
   */
  protected textStatement(
    s: TextStatement,
    values: TextValues,
    children: { push(node: TextNode): unknown }
  ): void {
    const j = this.i++;
    const { type, word } = s;
    const range = withoutIndent(this.src, this.range(j));
    const text = (values[word] = textValue(type, this.raw(j)));
    children.push({ id: this.id(word), type, range, text });
    this.st.statement(word, range);
    this.lineEnd();
  }

  /** Skip to the end of the statement. */
  protected recover(): void {
    this.probe?.freeze();
    this.i = skipTo(this.t, this.i, this.boundary);
  }

  /** Run one statement's rule; a failure inside it recovers. */
  protected statement(rule: () => void): void {
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover();
    }
  }

  // --- Result -------------------------------------------------------------------------------

  /**
   * The end of a parse: the model is `fields`, then the text statements' `values` and the
   * warnings so far, frozen. Its `title` is the in-text one if non-empty, else the front-matter
   * one, and absent when neither (D218). The AST is a `Document` node over the body that holds
   * `children`.
   */
  protected finish<F extends object, C extends AstNode>(
    fields: F,
    values: TextValues,
    children: C[],
    options: Pick<ParseOptions, 'keepTokens'>
  ): ParseResult<Readonly<F & TextModelFields>, DocumentNode<C>> {
    const { st, pre } = this;
    const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
    const title = values.title || pre.frontMatter?.title;
    const model = Object.freeze({
      ...fields,
      ...(title ? { title } : {}),
      accTitle: values.accTitle,
      accDescr: values.accDescr,
      warnings: Object.freeze(warnings),
    });
    const ast: DocumentNode<C> = {
      id: 'doc',
      type: 'Document',
      range: { start: pre.bodyStart, end: this.src.length },
      children,
    };
    return st.result(model, ast, this.full, options, this.probe);
  }
}
