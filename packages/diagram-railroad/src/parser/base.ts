// cspell:words accdescr betax
/**
 * What the four railroad parsers share (D511, pitfall 6): one class per notation
 * (`ir/parser.ts`, `ebnf/parser.ts`, `abnf/parser.ts`, `peg/parser.ts`) extends
 * {@link RailroadParser}, which reads the part every v12 grammar has the same:
 *
 *     entry: HEADER (TITLE | ACC_TITLE | ACC_DESCR)* Rule*
 *     Rule:  NAME <define> <definition> ';'
 *
 * (`railroad{,-ebnf,-abnf,-peg}.langium`), and each subclass reads its notation's definition
 * into a {@link Draft} with v12's mappings. Recursive descent over the significant tokens of the
 * gated lexers (#608), producing the {@link RailroadModel}, the AST, `rule` symbols, statement
 * spans and diagnostics (DESIGN §4.2).
 *
 * It accepts and rejects what v12's parsers do. Unlike v12 it does not stop at the first error:
 * it reports it and resumes at the next rule (R-PARSE-4): after the next `;`, or at a name
 * followed by the notation's `=` (a rule whose `;` is missing). A rule that does not parse is
 * left out of the model.
 */
import { DEFAULT_LIMITS, LIMIT_CODES } from '@mermaid-js/core/limits';
import {
  cook,
  Kind,
  kindSet,
  LineIndex,
  ParseState,
  Probe,
  significantTokens,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type {
  ExpectedTable,
  ParseOptions,
  ParseResult,
  Range,
  SourceView,
  TokenStream,
  TokenView,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { RailroadModel, RailroadRule } from '../model.ts';
import type { RailroadDocument, RailroadStatementNode, RailroadTextNode } from './ast.ts';
import { accDescrValue, accTitleValue, titleValue } from './convert.ts';
import { RAILROAD_HEADERS } from './detect.ts';
import { LEXERS } from './lexers.ts';
import { RAILROAD_TRIVIA, T } from './tokens.ts';
import type { RailroadNotation } from './tokens.ts';
import { build } from './tree.ts';
import type { Draft } from './tree.ts';

export interface RailroadParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /**
   * The notation to read the text as; by default the one its header names (`detectRailroad`),
   * IR when it names none.
   */
  notation?: RailroadNotation;
  /**
   * How deep expressions may nest (core `DEFAULT_LIMITS.maxDepth`, R-SEC-5): the levels of a
   * rule's tree, a rule's definition being level 1.
   */
  maxDepth?: number;
}

export type RailroadParseResult = ParseResult<RailroadModel, RailroadDocument>;

/** `rule` symbols' kind (D517). */
export const RULE_SYMBOL = 'rule';

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at rule level. One instance,
 * so its stack is captured once.
 */
class Stop extends Error {}
export const STOP = new Stop();

const TEXT = [T.Title, T.AccTitle, T.AccDescr];
/** What ends an alternative: found where an element should start, the alternative is empty. */
const EMPTY_ENDS = [T.Pipe, T.Slash, T.Semi, T.RParen, T.RBracket, T.RBrace];

/** What a token before a missing element needs, where it is not an alternative's start. */
const OPERAND: Readonly<Record<number, string>> = {
  [T.Minus]: '`-` needs an element after it',
  [T.Comma]: '`,` needs an element after it',
  [T.Repeat]: 'a repeat needs an element after it',
  [T.ExactRepeat]: 'a repeat needs an element after it',
  [T.Amp]: '`&` needs an element after it',
  [T.Bang]: '`!` needs an element after it',
};

/**
 * Groups and calls the parser reads inside one another before it stops: a guard for the stack,
 * apart from `maxDepth`, since a group that draws nothing (`((a))`) adds no level to the model.
 * Node's default stack holds about 1,500 PEG groups (the deepest recursion of the four), so
 * this leaves room for smaller stacks (workers, browsers).
 */
const NESTING_GUARD = 500;

/**
 * Not a token: what the parser expects where a rule starts (a name, then `=`), for the
 * expected tables, which name it apart from a name inside an expression.
 */
export const RULE_START = -1;

/** The keyword of each header statement token, also its probe mode. */
const VALUE_WORDS: Readonly<Record<number, string>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'accTitle',
  [T.AccDescr]: 'accDescr',
};

const KIND_OF: Readonly<Record<number, RailroadTextNode['type']>> = {
  [T.Title]: 'Title',
  [T.AccTitle]: 'AccTitle',
  [T.AccDescr]: 'AccDescr',
};

/**
 * Kinds a probe's cursor follows rather than extends: punctuation and strings (right after
 * `(` or `"a"` the parser expects what comes next, not more of the same token).
 */
const PROBE_FOLLOWS = kindSet(
  T.Equals,
  T.Semi,
  T.LParen,
  T.RParen,
  T.Comma,
  T.Define,
  T.Pipe,
  T.LBracket,
  T.RBracket,
  T.LBrace,
  T.RBrace,
  T.Question,
  T.Star,
  T.Plus,
  T.Minus,
  T.Slash,
  T.Arrow,
  T.Amp,
  T.Bang,
  T.Dot,
  T.String,
  T.Special
);

/**
 * The probe's mode at `o` (R-LANG-7). The lexers have no modes (Langium's have none), so the
 * mode names what the offset is in: `title`, `accTitle` or `accDescr` past that keyword,
 * `string` inside a string (closed or not), else `INITIAL` (code).
 */
function probeMode(src: string, tokens: TokenStream, o: number): string {
  for (let j = 0; j < tokens.length; j++) {
    const start = tokens.start[j] ?? 0;
    const end = tokens.end[j] ?? 0;
    if (start >= o) break;
    if (end < o) continue;
    const kind = tokens.kind[j] ?? Kind.EOF;
    const c = src[start];
    if (kind === T.String && o < end) return 'string';
    if (kind === Kind.Error && (c === '"' || c === "'")) return 'string';
    const word = VALUE_WORDS[kind];
    if (!word) continue;
    const k = start + word.length;
    const block = kind === T.AccDescr && /^\s*\{/.test(src.slice(k, end));
    if (o > k && (o < end || !block)) return word;
  }
  return 'INITIAL';
}

/**
 * One parse of one notation. Each grammar rule is a method that returns what it read; a rule
 * that fails records a diagnostic and throws {@link STOP}, and the rule loop recovers.
 */
export abstract class RailroadParser {
  protected readonly pre: PreprocessResult;
  private readonly view: SourceView;
  protected readonly full: TokenStream;
  protected readonly t: TokenView;
  protected i = 0;
  protected readonly st = new ParseState();
  private readonly probe: Probe | undefined;
  private readonly children: RailroadStatementNode[] = [];
  private readonly rules: RailroadRule[] = [];
  private lines: LineIndex | undefined;
  /** Rules per name so far, for the ids' `@n` and duplicate warnings, and the first's line. */
  private readonly named = new Map<string, { count: number; line: number }>();
  /** Header statements per kind so far, for their ids' `@n`. */
  private readonly texts = new Map<string, number>();
  private readonly maxDepth: number;
  /** Groups and calls open around the current token, for {@link NESTING_GUARD}. */
  private nest = 0;
  /** The last value of each (Langium's assignments: the last one wins, an empty one too). */
  private title = '';
  private accTitle = '';
  private accDescr = '';

  /** The notation's header keyword (`railroad-beta`, …). */
  protected readonly headerWord: string;
  /** What follows a rule's name: `=` (IR, ABNF), `=` or `::=` (EBNF), `<-` (PEG). */
  protected abstract readonly defines: readonly number[];
  /** Human names for what the parser expects, by token kind (R-ERR-2, R-ERR-5). */
  protected abstract readonly expected: ExpectedTable;

  constructor(
    protected readonly src: string,
    protected readonly notation: RailroadNotation,
    private readonly options: RailroadParseOptions,
    /**
     * The text's preprocess result when the caller computed it for detection: used in place of
     * computing it again, and its diagnostics reported as if the parser had.
     */
    computed?: PreprocessResult
  ) {
    this.headerWord = RAILROAD_HEADERS.find(([n]) => n === notation)?.[1] ?? 'railroad-beta';
    this.maxDepth = options.maxDepth ?? DEFAULT_LIMITS.maxDepth;
    const pre = (this.pre = options.preprocessed ?? computed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.full = LEXERS[notation](src, pre.bodyStart, this.view);
    this.t = significantTokens(this.full, RAILROAD_TRIVIA);
    if (options.probe !== undefined) {
      const probe = (this.probe = new Probe(src, options.probe, PROBE_FOLLOWS));
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      else probe.trivia(this.full);
      probe.lexed(probe.offset, probe.offset, probeMode(src, this.full, probe.offset));
    }
  }

  parse(): RailroadParseResult {
    const { st, src } = this;
    this.statement(() => this.header());
    this.headerStatements();
    this.ruleList();
    const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
    // D218: the in-text title if non-empty, else the front-matter one.
    const title = this.title || this.pre.frontMatter?.title;
    const model: RailroadModel = Object.freeze({
      notation: this.notation,
      rules: Object.freeze(this.rules),
      ...(title ? { title } : {}),
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      warnings: Object.freeze(warnings),
    });
    const ast: RailroadDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.full, this.options, this.probe);
  }

  /** The rule's definition, after its `=` (`::=`, `<-`), up to its `;`. */
  protected abstract definition(): Draft;

  // ---- tokens -------------------------------------------------------------------------

  protected kind(j = this.i): number {
    return this.t.kind[j] ?? Kind.EOF;
  }

  protected range(j = this.i): Range {
    return { start: this.t.start[j] ?? 0, end: this.t.end[j] ?? 0 };
  }

  protected span(from: number, to: number): Range {
    return { start: this.range(from).start, end: this.range(to).end };
  }

  /** A token's text as v12's lexer read it (removed spans dropped, entities decoded). */
  protected raw(j = this.i): string {
    const { start, end } = this.range(j);
    return cook(this.src, start, end, this.view);
  }

  /** Whether token `j` is a name followed by the notation's `=`: the start of a rule. */
  protected startsRule(j = this.i): boolean {
    return this.kind(j) === T.Id && this.defines.includes(this.kind(j + 1));
  }

  /**
   * Probe hook: the parser tests the current token for `kinds` (a constant list), or would
   * accept them there. Records them when it is the probed token.
   */
  protected tested(kinds: readonly number[]): void {
    const p = this.probe;
    if (p?.isAt(this.t, this.i, this.pre.bodyStart)) p.tested(kinds, this.range().start);
  }

  /** Consume a token of `kind` and return its index, or fail. */
  protected expect(kind: number): number {
    this.tested([kind]);
    if (this.kind() !== kind) this.fail([kind]);
    return this.i++;
  }

  /**
   * `d`, unless its tree is deeper than `maxDepth` levels: then the limit's error, and stop the
   * rule (so each rule that is too deep has its own error).
   */
  protected deep(d: Draft): Draft {
    if (d.height <= this.maxDepth) return d;
    this.st.diagnostics.error(
      LIMIT_CODES.maxDepth,
      `Expressions are nested ${d.height} deep here, over the limit of ${this.maxDepth}. The limit is set by the page or app that renders the diagram.`,
      d.range
    );
    throw STOP;
  }

  /**
   * Read a nested expression with `read` (a group's or a call's contents). Only the levels the
   * model draws count towards `maxDepth` ({@link deep}); the groups open are counted against a
   * stack guard (the larger of `maxDepth` and {@link NESTING_GUARD}) before reading, so deep
   * nesting never exhausts the stack.
   */
  protected nested<R>(at: Range, read: () => R): R {
    this.nest++;
    try {
      const guard = Math.max(this.maxDepth, NESTING_GUARD);
      if (this.nest > guard) {
        this.st.diagnostics.error(
          LIMIT_CODES.maxDepth,
          `Groups are nested more than ${guard} deep here, more than the parser reads.`,
          at
        );
        throw STOP;
      }
      return read();
    } finally {
      this.nest--;
    }
  }

  /**
   * Where an element should start: the current token, unless it starts the next rule, which
   * cut this one short. Then report the missing element where it goes, after the last token.
   */
  protected startElement(want: readonly number[]): void {
    this.tested(want);
    if (this.startsRule() || this.kind() === Kind.EOF) this.fail(want, undefined, this.gap());
  }

  /** Zero-width, right after the last token read. */
  private gap(): Range {
    const at = this.range(this.i - 1).end;
    return { start: at, end: at };
  }

  /** A nonterminal's name: a reference to the rule of that name (D517). */
  protected reference(name: string, range: Range): void {
    this.st.symbol(name, RULE_SYMBOL, range, 'ref');
  }

  // ---- errors and recovery ------------------------------------------------------------

  protected lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the current token. */
  private found(): string {
    if (this.kind() === Kind.EOF) return 'the end of the text';
    const text = this.raw().trim();
    const line = text.split('\n', 1)[0] ?? '';
    return line.length > 24 || line !== text ? `\`${line.slice(0, 24)}…\`` : `\`${line}\``;
  }

  /**
   * Report what was found where one of `want` was expected, then stop the rule. `where` is the
   * current token, or the gap after the last one where the rule was cut short.
   */
  protected fail(want: readonly number[], hint?: string, where: Range = this.range()): never {
    if (this.kind() === Kind.Error) this.badCharacters(this.range());
    const d = this.st.diagnostics.unexpected(
      'UNEXPECTED',
      where,
      this.expected.names(want),
      this.found()
    );
    const why = hint ?? this.explain(want);
    if (why) d.message = `${d.message.slice(0, -1)}; ${why}.`;
    throw STOP;
  }

  /**
   * Why the current token cannot go where the parser is, when there is more to say than what
   * it expected: a rule that starts without its `;` before it, a header statement among the
   * rules, a name that starts with `title`. Subclasses add their notation's own.
   */
  protected explain(want: readonly number[]): string | undefined {
    const k = this.kind();
    if (want.includes(T.Semi) && this.startsRule()) return 'every rule ends with `;`';
    if (
      k === T.Title &&
      this.kind(this.i + 1) === T.Id &&
      this.range(this.i + 1).start === this.range().end
    ) {
      return `a name that starts with \`title\` reads as a \`title\` line, so \`${this.raw()}${this.raw(this.i + 1)}\` cannot be a name; rename it`;
    }
    // Where EBNF, ABNF and PEG expect an element (IR expects a keyword there).
    if (want.includes(T.String) && want.includes(T.Id)) {
      const before = this.kind(this.i - 1);
      const operand = OPERAND[before];
      if (operand) return operand;
      if (this.defines.includes(before))
        return `a rule needs a definition after \`${this.raw(this.i - 1)}\``;
      if (EMPTY_ENDS.includes(k) || this.startsRule()) return 'an alternative cannot be empty';
    }
    if (TEXT.includes(k)) {
      return `\`${VALUE_WORDS[k] ?? 'title'}\` goes on its own line after \`${this.headerWord}\`, before the rules`;
    }
    if (k === T.Header) return `a diagram has one \`${this.headerWord}\`, at its start`;
    return undefined;
  }

  /**
   * Text no token rule matched: an unclosed string or comment, an `accDescr {` with no `}`, or
   * stray characters.
   */
  private badCharacters(where: Range): never {
    const { st } = this;
    const text = this.raw();
    const line = this.lineOf(where.start);
    const q = text[0];
    // ABNF strings take `"` only.
    if (q === '"' || (q === "'" && this.notation !== 'railroadAbnf')) {
      st.diagnostics.error(
        'UNCLOSED_STRING',
        `Unclosed string: the \`${q}\` at line ${line} has no closing \`${q}\`. Add \`${q}\` after the text.`,
        where,
        { expected: [`\`${q}\``] }
      );
      throw STOP;
    }
    const open = this.src.slice(where.start, where.start + 2);
    if (open === '/*') {
      st.diagnostics.error(
        'UNCLOSED_COMMENT',
        `Unclosed comment: the \`/*\` at line ${line} has no closing \`*/\`.`,
        where,
        { expected: ['`*/`'] }
      );
      throw STOP;
    }
    const shown = text.length > 24 ? `${text.slice(0, 24)}…` : text;
    st.diagnostics.error(
      'UNEXPECTED_CHARACTER',
      `Unexpected character \`${shown}\`${this.characterHint(text)}.`,
      where
    );
    throw STOP;
  }

  /** What to add after "Unexpected character `…`": `; ` and a hint, or nothing. */
  protected characterHint(_text: string): string {
    return '';
  }

  /**
   * Skip to where the next rule can start (R-PARSE-4): past the next `;`, or at a name followed
   * by `=` (the rule before it lacks its `;`), or the end.
   */
  private recover(): void {
    this.probe?.freeze();
    for (;;) {
      const k = this.kind();
      if (k === Kind.EOF || this.startsRule()) return;
      this.i++;
      if (k === T.Semi) return;
    }
  }

  /** Run one rule of the grammar; on failure, recover. */
  private statement(rule: () => void): void {
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover();
    }
  }

  // ---- rules --------------------------------------------------------------------------

  /** The header keyword. One that is misspelt or in the wrong case is reported and skipped. */
  private header(): void {
    this.tested([T.Header]);
    const k = this.kind();
    if (k === T.Header) {
      const range = this.range(this.i++);
      this.st.statement('header', range);
      this.children.push({ id: 'railroad', type: 'Header', range });
      return;
    }
    const word = this.headerWord;
    const text = this.raw();
    const found = this.found();
    const where = this.range();
    if (k === Kind.EOF || text.toLowerCase().startsWith(word)) {
      // A header in another case, or glued to more text (`railroad-betax`): skip it.
      if (k !== Kind.EOF) this.i++;
      let why = `put a blank or a line break after \`${word}\``;
      if (text !== word && text.toLowerCase() === word) {
        why = 'the keyword is written in lower case';
      } else if (k === Kind.EOF) why = `a diagram starts with \`${word}\``;
      this.st.diagnostics.error(
        'UNEXPECTED',
        `Expected \`${word}\`, got ${found}; ${why}.`,
        where,
        { expected: [`\`${word}\``] }
      );
      return;
    }
    // No header: report it, skip what stands in its place (another notation's header), and
    // read the rest as header statements and rules.
    if (!this.startsRule() && !TEXT.includes(k)) this.i++;
    this.st.diagnostics.error(
      'UNEXPECTED',
      `Expected \`${word}\`, got ${found}; a diagram starts with \`${word}\`.`,
      where,
      { expected: [`\`${word}\``] }
    );
  }

  /** `(TITLE | ACC_TITLE | ACC_DESCR)*` after the header. */
  private headerStatements(): void {
    for (;;) {
      this.tested(TEXT);
      const k = this.kind();
      if (!TEXT.includes(k)) return;
      this.text(k);
    }
  }

  /** `(TITLE | ACC_TITLE | ACC_DESCR)`: one header statement. */
  private text(k: number): void {
    const j = this.i++;
    const image = this.raw(j);
    const type = KIND_OF[k] ?? 'Title';
    const range = this.range(j);
    let text: string;
    if (type === 'Title') text = this.title = titleValue(this.notation, image);
    else if (type === 'AccTitle') text = this.accTitle = accTitleValue(image);
    else text = this.accDescr = accDescrValue(image);
    const word = VALUE_WORDS[k] ?? 'title';
    const n = (this.texts.get(word) ?? 0) + 1;
    this.texts.set(word, n);
    const node: RailroadTextNode = { id: n === 1 ? word : `${word}@${n}`, type, range, text };
    this.children.push(node);
    this.st.statement(word, range);
  }

  /** `Rule*` and the end of the text. */
  private ruleList(): void {
    for (;;) {
      this.tested([T.Id, Kind.EOF]);
      const k = this.kind();
      if (k === Kind.EOF) return;
      const before = this.i;
      this.statement(() => {
        if (k !== T.Id) this.fail([RULE_START, Kind.EOF]);
        this.rule();
      });
      // Never stall: a failure that recovery could not move past skips one token.
      if (this.i === before && this.kind() !== Kind.EOF) this.i++;
    }
  }

  /**
   * `NAME <define> <definition> ';'`. A rule that fails leaves no trace but its diagnostic: no
   * model rule, no AST node and no symbols (its name and references are dropped).
   */
  private rule(): void {
    const symbols = this.st.symbols.length;
    try {
      this.ruleBody();
    } catch (error) {
      this.st.symbols.length = symbols;
      throw error;
    }
  }

  private ruleBody(): void {
    const n = this.i++;
    const name = this.raw(n);
    const nameRange = this.range(n);
    this.st.symbol(name, RULE_SYMBOL, nameRange, 'def');
    this.tested(this.defines);
    if (!this.defines.includes(this.kind())) this.fail(this.defines);
    this.i++;
    const draft = this.definition();
    this.tested([T.Semi]);
    if (this.kind() !== T.Semi && (this.startsRule() || this.kind() === Kind.EOF)) {
      // The rule ends (the next rule starts, or the text) without its `;`: where it goes.
      this.fail([T.Semi], undefined, this.gap());
    }
    const semi = this.expect(T.Semi);
    const range = this.span(n, semi);
    this.st.statement('rule', range);
    const seen = this.named.get(name);
    const count = (seen?.count ?? 0) + 1;
    const line = this.lineOf(nameRange.start);
    this.named.set(name, { count, line: seen?.line ?? line });
    if (seen) {
      // D517: drawn twice, as in v12, which warned and kept both.
      this.st.diagnostics.warning(
        'RAILROAD_DUPLICATE_RULE',
        `The rule \`${name}\` is already defined at line ${seen.line}: both definitions are drawn.`,
        nameRange
      );
    }
    const astId = count === 1 ? `rule:${name}` : `rule:${name}@${count}`;
    const [definition, expression] = build(draft, `${astId}/0`);
    this.rules.push(Object.freeze({ name, astId, definition, range }));
    this.children.push({ id: astId, type: 'Rule', range, name, nameRange, children: [expression] });
  }
}
