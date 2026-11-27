// cspell:words LALR
/**
 * The scaffolding the recursive-descent parsers of the indentation-tree diagrams (mindmap,
 * kanban) share: the source view, lex and probe set-up, the token helpers, error reporting and
 * recovery, and the rules of v12's `mindmap.jison` (LALR) down to a statement, which
 * `kanban.jison` keeps:
 *
 *     start     = [ SPACELINE ( SPACELINE | NL )* ] KEYWORD [ NL ] ( statement stop )+
 *     stop      = ( NL | EOF | SPACELINE ) ( NL | EOF )*
 *     statement = SPACELIST [ node | ICON | CLASS ] | SPACELINE | node | ICON | CLASS
 *
 * So a blank or comment line is a statement where one may start, and a separator after one: a
 * node right after two of them in a row (or one right after the keyword) is a syntax error, as
 * in v12. The parser reads the tokens jison returned; `:::`, `::icon(`, the `)` after an icon
 * and the quotes of a string, for which jison returns none, are skipped like comments (they
 * still give the ranges). Unlike jison the parser does not stop at the first error: it reports
 * it, skips to the next line and carries on (R-PARSE-4).
 *
 * A diagram's parser extends {@link TreeParser} and writes its node and decoration rules, what
 * they build, and its messages ({@link TreeGrammar}).
 */
import {
  type AstNode,
  type Diagnostic,
  firstHole,
  inKindSet,
  Kind,
  type KindSet,
  LineIndex,
  type ParseOptions,
  type ParseResult,
  ParseState,
  Probe,
  ProbeCursor,
  type Range,
  sourceView,
  type SourceView,
  TokenCursor,
  type TokenStream,
} from '@mermaid-js/core/parser-kit';
import { STOP } from './support.ts';
import type { TreeKinds } from './tree-lexer.ts';

/** What {@link TreeParser} reads of a preprocess result (core's `PreprocessResult` fits). */
export interface TreeParserPre {
  readonly bodyStart: number;
  readonly frontMatter?: unknown;
  readonly directives: readonly { readonly range: Range }[];
  readonly diagnostics: readonly Diagnostic[];
}

/** One diagram's lexer, tables and messages, as {@link treeGrammar} takes them. */
export interface TreeGrammarSpec<Lexed extends { readonly tokens: TokenStream }> {
  lex(src: string, from: number, view: SourceView, probe?: Probe): Lexed;
  readonly kinds: TreeKinds;
  /**
   * Comments, and the text jison matched without returning a token (`:::`, `::icon(`, the `)`
   * closing an icon, the line break after a bare `:::`, the quotes of a string, …).
   */
  readonly skipped: KindSet;
  /** Kinds a probe's cursor follows rather than extends when the token ends at the offset. */
  readonly probeFollows: KindSet;
  /** What the parser expects where the keyword is due: the keyword in backticks. */
  readonly header: string[];
  /** Why: `a mindmap starts with …`. */
  readonly headerHint: string;
  /** What may start a statement, for messages. */
  readonly statement: string[];
  /** What the parser expects after a shape's opener: `the text of the node`. */
  readonly shapeText: string[];
  /** The hint where a decoration follows on a node's line. */
  readonly decorationHint: string;
  /** The hint where a second node follows on a line. */
  readonly oneNodeHint: string;
  /** The hint where a line follows two blank or comment lines, or one after the keyword. */
  readonly afterBlankHint: string;
}

/** A {@link TreeGrammarSpec}, as {@link TreeParser} uses it. */
export interface TreeGrammar<Lexed extends { readonly tokens: TokenStream }>
  extends TreeGrammarSpec<Lexed> {
  // What the parser accepts at its decision points, for the probe (R-LANG-7, D95). Made once,
  // so a parse without a probe allocates nothing for them.
  /** What may start a statement (an indent, a node, a decoration, a blank line). */
  readonly statementKinds: readonly number[];
  /** What may follow an indent. */
  readonly afterIndentKinds: readonly number[];
  /** What ends a statement. */
  readonly stopKinds: readonly number[];
}

/** The {@link TreeGrammar} of `spec` (built once per diagram). */
export function treeGrammar<Lexed extends { readonly tokens: TokenStream }>(
  spec: TreeGrammarSpec<Lexed>
): TreeGrammar<Lexed> {
  const k = spec.kinds;
  const acc = k.acc ? [k.AccTitle, k.AccDescr] : [];
  return {
    ...spec,
    statementKinds: [k.SpaceList, k.NodeId, k.NodeDStart, k.Icon, k.Class, k.SpaceLine, ...acc],
    afterIndentKinds: [k.NodeId, k.NodeDStart, k.Icon, k.Class, ...acc],
    stopKinds: [Kind.Newline, k.Eof, k.SpaceLine],
  };
}

/** What a closer the opener reads best with is, for messages (any closer parses, as in v12). */
export const CLOSERS: Readonly<Record<string, string>> = /* @__PURE__ */ Object.freeze({
  '[': ']',
  '(': ')',
  '((': '))',
  ')': '(',
  '))': '((',
  '{{': '}}',
  '-)': '(-',
  '(-': '-)',
});

/**
 * The removed spans of `view` (comments, directives) that overlap `r`, in source order: found
 * by binary search, so the cost is the log of the spans plus the ones returned.
 */
export function holesIn(view: SourceView, r: Range): readonly Range[] {
  const { holes } = view;
  const from = firstHole(view, r.start);
  let end = from;
  while (end < holes.length && (holes[end]?.start ?? 0) < r.end) end++;
  return holes.slice(from, end);
}

/** The text of the first line. */
const FIRST_LINE = /^[^\n\r\u2028\u2029]*/;

/** What the parser expects where a statement ends, for messages. */
const lineBreak = (): string[] => ['a line break'];
/** The hint where a line goes on after a bare `:::`. */
const BARE_CLASS_HINT = 'a bare `:::` takes the line break after it';

/**
 * One parse. Each grammar rule is a method; a rule that fails records a diagnostic and throws
 * {@link STOP}, and the statement loop recovers.
 */
export abstract class TreeParser<
  Lexed extends { readonly tokens: TokenStream },
  Pre extends TreeParserPre = TreeParserPre,
> {
  protected readonly view: SourceView;
  protected readonly st = new ParseState();
  protected readonly lexed: Lexed;
  protected readonly c: TokenCursor;
  /** Probe mode only (R-LANG-7). */
  protected readonly probe: Probe | undefined;
  protected readonly k: TreeKinds;
  /** The last statement was a blank or comment line (for the message after it). */
  private afterBlank = false;
  /** The statement reported a missing separator already: the next one starts here. */
  private lineEnded = false;
  /** The keyword was read; a missing one was reported once, so a later one is the header. */
  private headerSeen = false;
  private lines: LineIndex | undefined;

  /**
   * @param own - `pre` was made for this parse (not handed in): its diagnostics are reported.
   * @param probeAt - The probe's offset, when the parse is probed.
   */
  constructor(
    protected readonly src: string,
    protected readonly pre: Pre,
    own: boolean,
    protected readonly grammar: TreeGrammar<Lexed>,
    probeAt: number | undefined
  ) {
    if (own) this.st.diagnostics.list.push(...pre.diagnostics);
    this.k = grammar.kinds;
    this.view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    if (probeAt === undefined) {
      this.lexed = grammar.lex(src, pre.bodyStart, this.view);
      this.c = new TokenCursor(this.lexed.tokens, grammar.skipped);
      return;
    }
    const probe = (this.probe = new Probe(src, probeAt, grammar.probeFollows));
    if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
    this.lexed = grammar.lex(src, pre.bodyStart, this.view, probe);
    // The cursor marks an offset inside a comment or directive as outside code.
    this.c = new ProbeCursor(this.lexed.tokens, probe, grammar.skipped);
  }

  /**
   * The parse result: `model` with the warnings reported so far, and the document over the
   * body holding `children`.
   */
  protected finish<M extends object, C extends AstNode>(
    model: M,
    children: C[],
    options: ParseOptions
  ): ParseResult<M & { warnings: Diagnostic[] }, AstNode<'Document'> & { children: C[] }> {
    const { st, pre, src } = this;
    const full = {
      ...model,
      warnings: st.diagnostics.list.filter((d) => d.severity === 'warning'),
    };
    const ast: AstNode<'Document'> & { children: C[] } = {
      id: 'doc',
      type: 'Document',
      range: { start: pre.bodyStart, end: src.length },
      children,
    };
    return st.result(full, ast, this.c.tokens, options, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  /** A token's text as v12's parser read it (removed spans cut, entities decoded). */
  protected abstract raw(j?: number): string;

  protected range(j: number): Range {
    const t = this.c.tokens;
    return { start: t.start[j] ?? 0, end: t.end[j] ?? 0 };
  }

  /**
   * `[start, end)` of token `j` without the blanks around `text` (its v12 text), when the
   * source there reads as `text`; else the token's range (the service then drops the symbol).
   */
  protected exact(j: number, text: string, from = 0, to = text.length): Range {
    const r = this.range(j);
    if (this.src.slice(r.start, r.end) !== text) return r;
    return { start: r.start + from, end: r.start + to };
  }

  /** A node id: a definition of its own (D289), without the blanks around it. */
  protected idSymbol(id: string, j: number): void {
    const name = id.trim();
    if (name === '') return;
    const from = id.length - id.trimStart().length;
    this.st.symbol(name, 'node', this.exact(j, id, from, from + name.length), 'def');
  }

  /**
   * The index of the token of `kind` next to `j` in direction `step` (±1), past comments and
   * directives; -1 when the next other token is not of `kind`.
   */
  protected beside(j: number, step: number, kind: number): number {
    const t = this.c.tokens;
    for (let i = j + step; i >= 0 && i < t.length; i += step) {
      const k = t.kind[i];
      if (k === kind) return i;
      if (k !== Kind.Comment && k !== Kind.Directive) return -1;
    }
    return -1;
  }

  /** The whole decoration whose text is token `j`: `::icon(` or `:::` and an icon's `)` too. */
  protected decorationRange(j: number): Range {
    const { k } = this;
    const icon = this.c.tokens.kind[j] === k.Icon;
    const inner = this.range(j);
    const opener = this.beside(j, -1, icon ? k.IconStart : k.ClassStart);
    const closer = icon ? this.beside(j, 1, k.IconEnd) : -1;
    return {
      start: opener < 0 ? inner.start : this.range(opener).start,
      end: closer < 0 ? inner.end : this.range(closer).end,
    };
  }

  /** The kind of the significant token after an indent at the cursor (else the cursor's). */
  private afterIndent(): number {
    const { c } = this;
    if (c.kind !== this.k.SpaceList) return c.kind;
    return this.c.tokens.kind[this.nextSignificant(c.pos)] ?? Kind.EOF;
  }

  protected nextSignificant(j: number): number {
    const t = this.c.tokens;
    const { skipped } = this.grammar;
    let next = j + 1;
    while (next < t.length - 1 && inKindSet(skipped, t.kind[next] ?? 0)) next++;
    return next;
  }

  /** Whether nothing but line breaks and blank lines follows from token `j` on. */
  private onlySeparatorsFrom(j: number): boolean {
    const t = this.c.tokens;
    const { k } = this;
    for (let i = j; i < t.length; i = this.nextSignificant(i)) {
      const kind = t.kind[i] ?? Kind.EOF;
      if (kind === Kind.EOF) return true;
      if (
        kind !== Kind.Newline &&
        kind !== k.Eof &&
        !(kind === k.SpaceLine && !this.raw(i).includes('%%'))
      )
        return false;
      if (i === t.length - 1) return true;
    }
    return true;
  }

  private isStop(kind: number): boolean {
    return kind === Kind.Newline || kind === this.k.Eof || kind === this.k.SpaceLine;
  }

  protected isNodeStart(kind: number): boolean {
    return kind === this.k.NodeId || kind === this.k.NodeDStart;
  }

  // ---- errors and recovery ------------------------------------------------------------

  protected lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** The token an error message names: the current one (the one after it, for an indent). */
  private namedToken(): number {
    const { c } = this;
    let j = c.pos;
    if (c.kind === this.k.SpaceList) {
      const next = this.nextSignificant(j);
      const after = c.tokens.kind[next] ?? Kind.EOF;
      if (!this.isStop(after) && after !== Kind.EOF) j = next;
    }
    return j;
  }

  /**
   * The source text of the run token `j` (of `kind`) starts, where a message names the whole
   * run rather than the token: a diagram's own (kanban's shape data). Undefined for none.
   */
  protected runText(_j: number, _kind: number): string | undefined {
    return undefined;
  }

  /** The range of a diagnostic about token `j` ({@link namedToken}): the current token's. */
  protected namedRange(_j: number): Range {
    return this.c.range;
  }

  /** How an error message names token `j` ({@link namedToken}). */
  private found(j: number): string {
    const { c, k } = this;
    const kind = c.tokens.kind[j] ?? Kind.EOF;
    if (kind === Kind.EOF || kind === k.Eof || this.onlySeparatorsFrom(j))
      return 'the end of the text';
    if (kind === Kind.Newline) return 'a line break';
    let t = this.raw(j).trim();
    if (kind === k.Icon || kind === k.Class) {
      const r = this.decorationRange(j);
      t = this.src.slice(r.start, r.end).trim();
    } else t = this.runText(j, kind)?.trim() ?? t;
    if (kind === k.SpaceLine) return t.includes('%%') ? 'a comment' : 'a blank line';
    if (t === '') return 'blanks';
    const line = FIRST_LINE.exec(t)?.[0] ?? '';
    const cut = line.length > 24 ? line.slice(0, 24) : line;
    return cut.length < t.length ? `\`${cut}…\`` : `\`${t}\``;
  }

  /** Report what was found where `names` were expected, then stop the statement. */
  protected fail(names: string[], hint?: string, at?: Range): never {
    this.report(names, hint, at);
    throw STOP;
  }

  /**
   * Report what was found where `names` were expected, and go on. The range is
   * {@link namedRange}'s, unless `at` is given.
   */
  protected report(names: string[], hint?: string, at?: Range): void {
    const j = this.namedToken();
    const where = at ?? this.namedRange(j);
    this.st.diagnostics.unexpected('UNEXPECTED', where, names, this.found(j), undefined, hint);
  }

  /** Skip to the next separator after an error (R-PARSE-4), and past it. */
  private recover(): void {
    const { c } = this;
    c.recovering();
    while (c.kind !== Kind.EOF && !this.isStop(c.kind)) c.next();
    this.separator();
  }

  /** Run one rule; on failure, skip to the next statement. */
  private guarded(rule: () => void): void {
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover();
    }
  }

  /** The hint for an unexpected token of `kind` where a statement or line break was due. */
  protected abstract hintFor(kind: number): string | undefined;

  // ---- grammar ------------------------------------------------------------------------

  /**
   * `start`: blank and comment lines, then the keyword and an optional line break. Without the
   * header the rest is still read, and a later keyword is taken as it.
   */
  protected start(): void {
    const { c, k } = this;
    if (c.kind === k.SpaceLine) {
      // `spaceLines`.
      c.next();
      while (c.kind === k.SpaceLine || c.kind === Kind.Newline) c.next();
    }
    c.tested(k.Keyword);
    if (c.kind === k.Keyword) this.header();
    else this.report(this.grammar.header, this.grammar.headerHint);
  }

  private header(): void {
    const { c } = this;
    this.headerSeen = true;
    this.st.statement('header', c.range);
    c.next();
    c.eat(Kind.Newline);
  }

  /** `document`: statements, each followed by a separator, to the end. */
  protected document(): void {
    const { c } = this;
    for (;;) {
      if (this.headerSeen) c.tested(this.grammar.statementKinds);
      if (c.kind === Kind.EOF) break;
      // The missing header was reported; one error, one diagnostic.
      if (!this.headerSeen && c.kind === this.k.Keyword) {
        this.header();
        continue;
      }
      // Blank lines and the end after a missing header: it was reported, nothing else is wrong.
      if (!this.headerSeen && this.isStop(c.kind)) {
        this.separator();
        continue;
      }
      this.guarded(() => {
        this.statement();
        this.stop();
      });
    }
  }

  /** `stop`: a line break, the end, or a blank or comment line; then line breaks. */
  private stop(): void {
    const { c, k } = this;
    if (this.lineEnded) {
      this.lineEnded = false;
      return;
    }
    c.tested(this.grammar.stopKinds);
    if (this.isStop(c.kind)) {
      this.separator();
      return;
    }
    if (c.kind === Kind.EOF) this.endsOpen();
    const kind = c.kind;
    // The line ended (inside a blank run or after a bare `:::`) where jison wanted a separator:
    // one error, and the line after it is still read.
    const bareClass = this.beside(c.pos, -1, k.ClassEnd) >= 0;
    if (this.afterBlank || bareClass) {
      this.report(lineBreak(), this.afterBlank ? this.grammar.afterBlankHint : BARE_CLASS_HINT);
      // What the next line starts with is an error here: not an expectation.
      this.probePassed();
      return;
    }
    let hint = this.hintFor(kind);
    const after = this.afterIndent();
    if (after === k.Icon || after === k.Class) hint = this.grammar.decorationHint;
    else if (this.isNodeStart(after)) hint = this.grammar.oneNodeHint;
    this.fail(lineBreak(), hint);
  }

  /** The separator tokens at the cursor: one of `stop`'s, then line breaks and the end. */
  private separator(): void {
    const { c } = this;
    if (c.kind === Kind.EOF) return;
    c.next();
    // A statement may start after each of them.
    while (c.kind === Kind.Newline || c.kind === this.k.Eof) {
      if (this.headerSeen) c.tested(this.grammar.statementKinds);
      c.next();
    }
  }

  /**
   * Stop recording when the probed token is on the line at the cursor, or before it: an error
   * was reported for that line, so the parser's later tests there are recovery, not
   * expectations.
   */
  private probePassed(): void {
    const { probe, c } = this;
    if (!probe) return;
    let end = c.pos;
    while (end < c.tokens.length - 1 && !this.isStop(c.tokens.kind[end] ?? Kind.EOF)) end++;
    if (probe.targetIn(c.tokens, 0, this.grammar.skipped) <= end) probe.freeze(true);
  }

  /**
   * The text ended inside an icon, a shape, a string or shape data (jison's lexer returned no
   * `EOF` there): report what was left open.
   */
  protected endsOpen(): never {
    const t = this.c.tokens;
    const { k } = this;
    for (let j = t.length - 1; j >= 0; j--) {
      const kind = t.kind[j] ?? 0;
      if (kind === k.IconStart) return this.unclosed('UNCLOSED_ICON', 'icon', '::icon(', ')', j);
      if (kind === k.StringStart) return this.unclosed('UNCLOSED_STRING', 'string', '"', '"', j);
      if (kind === k.MdStringStart)
        return this.unclosed('UNCLOSED_STRING', 'string', '"`', '`"', j);
      if (kind === k.ShapeDataStart)
        return this.unclosed('UNCLOSED_SHAPE_DATA', 'shape data', '@{', '}', j);
      if (kind === k.NodeDStart) {
        const open = this.raw(j);
        return this.unclosed('UNCLOSED_SHAPE', 'shape', open, CLOSERS[open] ?? ')', j);
      }
      if (this.closes(kind)) break;
    }
    this.fail(lineBreak());
  }

  /** `kind` closes an icon, a string, a shape or shape data: nothing before it is still open. */
  private closes(kind: number): boolean {
    const { k } = this;
    return (
      kind === k.IconEnd ||
      kind === k.StringEnd ||
      kind === k.MdStringEnd ||
      kind === k.NodeDEnd ||
      kind === k.ShapeDataEnd
    );
  }

  private unclosed(code: string, what: string, open: string, close: string, j: number): never {
    const at = this.range(j);
    this.st.diagnostics.error(
      code,
      `Unclosed ${what}: the \`${open}\` at line ${this.lineOf(at.start)} has no closing \`${close}\`. Add \`${close}\` after its text.`,
      at
    );
    throw STOP;
  }

  /** `statement`. */
  private statement(): void {
    const { c, k } = this;
    c.tested(this.grammar.statementKinds);
    const kind = c.kind;
    this.afterBlank = false;
    if (kind === k.SpaceList) {
      const j = c.next();
      const indent = this.raw(j).length;
      c.tested(this.grammar.afterIndentKinds);
      const n = c.kind;
      if (this.content(n, indent)) return;
      if (n === k.SpaceList && this.beside(c.pos, -1, k.ClassEnd) >= 0) {
        // A bare `:::` took the line break: one error, and the next line is still read.
        this.report(lineBreak(), BARE_CLASS_HINT);
        this.lineEnded = true;
      } else if (!this.isStop(n) && n !== Kind.EOF) this.badStatement();
      return;
    }
    if (kind === k.SpaceLine) {
      c.next();
      this.afterBlank = true;
      return;
    }
    if (!this.content(kind, 0)) this.badStatement();
  }

  /**
   * What a line holds after its indent (`indent` wide), at a token of `kind`: a node, a
   * decoration, or (only a diagram with them lexes one) an `accTitle` or `accDescr` statement.
   * Whether it was one of them, and so read.
   */
  private content(kind: number, indent: number): boolean {
    const { k } = this;
    if (this.isNodeStart(kind)) this.node(indent);
    else if (kind === k.Icon || kind === k.Class) this.decoration();
    else if (kind === k.AccTitle || kind === k.AccDescr) this.accessibility();
    else return false;
    return true;
  }

  /**
   * An `accTitle` or `accDescr` statement at the cursor, at any indent: a diagram that has them
   * reads its value; this default only steps over the token.
   */
  protected accessibility(): void {
    this.c.next();
  }

  private badStatement(): never {
    this.fail(this.grammar.statement, this.hintFor(this.c.kind));
  }

  /** `node`: an id, then an optional shape, or a shape; at `indent` (its width as written). */
  protected abstract node(indent: number): void;

  /**
   * A node's optional `NODE_ID`, recorded as a symbol: its text, or undefined without one. With
   * one, `after` is what the probe hears the parser accept next.
   */
  protected nodeId(after: number | readonly number[]): string | undefined {
    const { c } = this;
    if (c.kind !== this.k.NodeId) return undefined;
    const j = c.next();
    const id = this.raw(j);
    this.idSymbol(id, j);
    c.tested(after);
    return id;
  }

  /**
   * `NODE_DSTART NODE_DESCR`, the start of a shape, with `node.range` extended over each token
   * read: the opener's text and the text token's index.
   */
  protected shapeOpen(node: { range: Range }): { opener: string; text: number } {
    const { c } = this;
    const open = c.next();
    const opener = this.raw(open);
    node.range = { start: node.range.start, end: this.range(open).end };
    c.tested(this.k.NodeDescr);
    if (c.kind !== this.k.NodeDescr) {
      if (c.kind === Kind.EOF) this.endsOpen();
      this.fail(this.grammar.shapeText);
    }
    const text = c.next();
    node.range = { start: node.range.start, end: this.range(text).end };
    return { opener, text };
  }

  /**
   * `NODE_DEND`, the end of the shape `opener` opened, its text at token `text`: the closer's
   * index, with `node.range` extended over it.
   */
  protected shapeClose(node: { range: Range }, opener: string, text: number): number {
    const { c } = this;
    c.tested(this.k.NodeDEnd);
    if (c.kind !== this.k.NodeDEnd) {
      const closer = `\`${CLOSERS[opener] ?? ')'}\``;
      this.unclosedShape(closer, text);
      if (c.kind === Kind.EOF) this.endsOpen();
      this.fail([closer]);
    }
    const close = c.next();
    node.range = { start: node.range.start, end: this.range(close).end };
    return close;
  }

  /**
   * Where a shape's closer (`closer`, in backticks) is due and missing after its text at token
   * `text`: a diagram's own report, which may record a diagnostic and throw {@link STOP};
   * otherwise the generic missing-closer report follows.
   */
  protected unclosedShape(_closer: string, _text: number): void {
    // None.
  }

  /** `ICON` or `CLASS`, on the last node in source order. */
  protected abstract decoration(): void;
}
