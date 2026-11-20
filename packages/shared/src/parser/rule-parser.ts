/**
 * The scaffolding the recursive-descent parsers of the langium-family diagrams share: the
 * source view, lex and probe set-up, the token cursor, probe bookkeeping, AST ids counted by
 * base name, and statement-level error recovery. A diagram's parser extends {@link RuleParser}
 * and writes its rules and its `fail` (what it expected, with its own hints).
 */
import {
  type AstId,
  cook,
  type Diagnostic,
  Kind,
  type KindSet,
  kindSet,
  LineIndex,
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
import { foundText, STOP } from './support.ts';

/** What {@link RuleParser} reads of a preprocess result (core's `PreprocessResult` fits). */
export interface RuleParserPre {
  readonly bodyStart: number;
  readonly frontMatter?: unknown;
  readonly directives: readonly { readonly range: Range }[];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * One diagram's lexer and tables, as {@link RuleParser} uses them. `Pre` is the preprocess
 * result the parser reads (see {@link RuleGrammar.view}).
 */
export interface RuleGrammar<Pre extends RuleParserPre = RuleParserPre> {
  /**
   * The source view the lexer reads `src` through. Optional: by default core's `sourceView`
   * of the body with the directives cut. A diagram whose v12 lexer read other text (event
   * modeling keeps the `%%` comment lines) makes its own.
   */
  view?(src: string, pre: Pre): SourceView;
  lex(src: string, from: number, view: SourceView): TokenStream;
  /** The kinds the parser never sees. */
  readonly trivia: KindSet;
  /**
   * The token view the rules see (`t`), made from every token and {@link RuleGrammar.trivia}.
   * Optional: by default core's `significantTokens`. A diagram that also needs to know where
   * lines start (treemap reads `lineTokens`) makes its own, and narrows `t` to its type.
   */
  tokens?(full: TokenStream, trivia: KindSet): TokenView;
  /** Where {@link RuleParser.recover} stops (default: a line break or the end). */
  readonly boundary?: KindSet;
  /** The kinds a probe at the end of a token still belongs to (see `Probe`). */
  readonly probeFollows?: KindSet;
  /** The lexer mode at offset `o`, for a probe. */
  probeMode(src: string, tokens: TokenStream, o: number): string;
}

const LINE_BOUNDARY = /* @__PURE__ */ kindSet(Kind.Newline, Kind.EOF);

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

  /**
   * @param own - `pre` was made for this parse (not handed in): its diagnostics are reported.
   * @param probeAt - The probe's offset, when the parse is probed.
   */
  constructor(
    protected readonly src: string,
    protected readonly pre: Pre,
    own: boolean,
    grammar: RuleGrammar<Pre>,
    probeAt: number | undefined
  ) {
    if (own) this.st.diagnostics.list.push(...pre.diagnostics);
    this.view = grammar.view
      ? grammar.view(src, pre)
      : sourceView(
          src,
          pre.bodyStart,
          pre.directives.map((d) => d.range)
        );
    this.full = grammar.lex(src, pre.bodyStart, this.view);
    this.t = (grammar.tokens ?? significantTokens)(this.full, grammar.trivia);
    this.boundary = grammar.boundary ?? LINE_BOUNDARY;
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
    // A plain parse builds no probe list.
    if (this.probe !== undefined) this.tested([kind]);
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
}
