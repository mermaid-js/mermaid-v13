// cspell:words accdescr
/**
 * The usecase parser's token reader (#563): the tokens the rules read, and how a rule fails and
 * the parse recovers. A rule that fails records a diagnostic and throws a {@link Stop}; the
 * statement loop recovers as the stop says (R-PARSE-4). Messages name what was expected in
 * Mermaid terms, never a token kind or grammar rule (R-ERR-5), and start where v12's parser
 * reported the error, so the first syntax error's offset is v12's (D473).
 *
 * The tokens are the lexer's stream without the spans v12 removed before lexing, filtered by
 * hand rather than with the kit's `significantTokens()`: a removed comment line and the `%%`
 * line v12's comment removal left (v12's `COMMENT` token, which the grammar reads) are both
 * `Kind.Comment`, and only the lexer's text offset (`at < 0` for a removed span) tells them
 * apart. Each token also keeps its offsets into the text v12 lexed (`ats`, `tos`), which labels
 * and ids are sliced from.
 */
import {
  Kind,
  kindSet,
  LineIndex,
  ParseState,
  Probe,
  skipTo,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type {
  ParseOptions,
  Range,
  RelatedInfo,
  TokenStream,
  TokenView,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import {
  USECASE_UNCLOSED_JSON,
  USECASE_UNCLOSED_MARKDOWN,
  USECASE_UNCLOSED_STEREOTYPE,
} from '../codes.ts';
import { lex } from './lexer.ts';
import type { Lexed } from './lexer.ts';
import type { UsecaseLimitOptions } from './limits.ts';
import { EXPECTED, KEYWORD_LINE, LINE_END, PROBE_FOLLOWS, WORD_KINDS } from './tables.ts';
import { shown } from './text.ts';
import { LABEL_TEXT, T } from './tokens.ts';

export interface UsecaseParseOptions extends ParseOptions, UsecaseLimitOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
}

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level, which
 * recovers as `skip` says: to the line end, through the `}` of the `@{ … }` the error is in, or
 * past the lines of an `accDescr {` that has no `}` (they are text, not statements). One
 * instance per kind, so a stack is captured once.
 */
export class Stop extends Error {
  constructor(readonly skip: 'line' | 'metadata' | 'description') {
    super(skip);
  }
}
export const STOP = new Stop('line');
export const STOP_IN_METADATA = new Stop('metadata');
export const STOP_IN_DESCRIPTION = new Stop('description');

/** Where plain recovery stops: a line end, or text no rule matched (it is reported). */
const SKIP_TO = kindSet(Kind.Newline, Kind.Error);
const SKIP_IN_METADATA = kindSet(Kind.Newline, Kind.Error, T.RBrace);
const P_NEWLINE = [Kind.Newline];
const P_COMMA = [T.Comma];

/**
 * The probe's mode at `o` (R-LANG-7): v12's lexer mode there (`default`, `jsonBody`,
 * `stereotype`: the mode of the step whose text holds `o`, else of the first step after it), or
 * the value `o` is inside: `string` in a quoted or Markdown text (closed or not), `acc` in the
 * text of `accTitle:`, `accDescr:` or `accDescr { … }`, `jsonBody` inside a JSON object. Read
 * from the token stream, whose kinds give the lexer's mode changes (`push_mode`, `pop_mode`).
 */
function probeMode(src: string, tokens: TokenStream, o: number): string {
  let mode = 'default';
  for (let j = 0; j < tokens.length; j++) {
    const k = tokens.kind[j] ?? Kind.EOF;
    const s = tokens.start[j] ?? 0;
    const e = tokens.end[j] ?? 0;
    const value = s < o && o <= e ? valueMode(src, k, s, e, o) : undefined;
    if (value !== undefined) return value;
    if (k === Kind.EOF || s >= o || e > o) return mode;
    mode = MODE_AFTER[k] ?? mode;
  }
  return mode;
}

/** The lexer mode after a token of each kind that changes it (`push_mode`, `pop_mode`). */
const MODE_AFTER: Readonly<Record<number, string>> = {
  [T.JsonDeclarationStart]: 'jsonBody',
  [T.StereotypeStart]: 'stereotype',
  [T.JsonObjectLiteral]: 'default',
  [T.UnclosedJsonObjectLiteral]: 'default',
  [T.StereotypeEnd]: 'default',
  [T.UnclosedStereotypeText]: 'default',
};

/** The value mode at `o` inside token `[s, e)` of kind `k` (`s < o <= e`), if it holds a value. */
function valueMode(src: string, k: number, s: number, e: number, o: number): string | undefined {
  const inside = o < e;
  switch (k) {
    case T.PlainString:
    case T.MarkdownString:
      return inside ? 'string' : undefined;
    case T.UnclosedMarkdownString:
      return 'string';
    case T.JsonObjectLiteral:
      return inside ? 'jsonBody' : undefined;
    case T.UnclosedJsonObjectLiteral:
      return 'jsonBody';
    case T.AccTitleLine:
    case T.AccDescrLine:
    case T.AccDescrBlock: {
      const block = k === T.AccDescrBlock;
      const open = src.slice(s, e).search(block ? /\{/ : /:/);
      return open >= 0 && o > s + open && (inside || !block) ? 'acc' : undefined;
    }
    case Kind.Error:
      // An unclosed quote: the rest of its line is the text.
      return /^["']/.test(src.charAt(s)) && !/[\n\r]/.test(src.slice(s, o)) ? 'string' : undefined;
    default:
      return undefined;
  }
}

/** The tokens of one parse, the cursor, and the errors and recovery of the rules. */
export abstract class UsecaseReader {
  protected readonly pre: PreprocessResult;
  /** v12's lexed text; token `j` is `text[ats[j], tos[j])`. */
  protected readonly text: string;
  protected readonly t: TokenView;
  protected readonly ats: Int32Array;
  protected readonly tos: Int32Array;
  protected readonly full: Lexed['tokens'];
  protected readonly input: Lexed['input'];
  protected i = 0;
  protected readonly st = new ParseState();
  /** Error tokens already reported. */
  private readonly reported = new Set<number>();
  private lines: LineIndex | undefined;
  /** With `probe` (R-LANG-7): what the rules test at that offset. */
  protected readonly probe: Probe | undefined;

  constructor(
    protected readonly src: string,
    protected readonly opts: UsecaseParseOptions
  ) {
    const pre = (this.pre = opts.preprocessed ?? preprocess(src));
    if (!opts.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    const view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    const lexed = lex(src, pre.bodyStart, view);
    this.full = lexed.tokens;
    this.input = lexed.input;
    this.text = lexed.input.text;
    const { tokens, at, to } = lexed;
    let n = 0;
    for (let j = 0; j < tokens.length; j++) if ((at[j] ?? -1) >= 0 || j === tokens.length - 1) n++;
    const kind = new Uint16Array(n);
    const start = new Uint32Array(n);
    const end = new Uint32Array(n);
    this.ats = new Int32Array(n);
    this.tos = new Int32Array(n);
    let o = 0;
    for (let j = 0; j < tokens.length; j++) {
      const k = tokens.kind[j] ?? Kind.EOF;
      const a = at[j] ?? -1;
      const eof = k === Kind.EOF;
      // The spans v12 removed before lexing are trivia; the text's own `%%` lines are not.
      if (!eof && a < 0) continue;
      kind[o] = k;
      start[o] = eof ? src.length : (tokens.start[j] ?? 0);
      end[o] = eof ? src.length : (tokens.end[j] ?? 0);
      this.ats[o] = eof ? this.text.length : a;
      this.tos[o] = eof ? this.text.length : (to[j] ?? a);
      o++;
    }
    this.t = { kind, start, end, length: n };
    if (opts.probe !== undefined) {
      const probe = (this.probe = new Probe(src, opts.probe, PROBE_FOLLOWS));
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      else probe.trivia(this.full);
      // Ignored when the offset is outside code.
      probe.lexed(probe.offset, probe.offset, probeMode(src, this.full, probe.offset));
    }
  }

  /**
   * Probe hook: the rule tests token `j` for `kinds` (a constant list), or would accept them
   * there. Recorded when `j` is the probed token.
   */
  protected tested(kinds: readonly number[], j = this.i): void {
    const p = this.probe;
    if (p?.isAt(this.t, j, this.pre.bodyStart)) p.tested(kinds, this.t.start[j] ?? 0);
  }

  // ---- tokens -------------------------------------------------------------------------

  protected kind(j = this.i): number {
    return this.t.kind[j] ?? Kind.EOF;
  }

  protected range(j = this.i): Range {
    const k = Math.min(j, this.t.length - 1);
    return { start: this.t.start[k] ?? 0, end: this.t.end[k] ?? 0 };
  }

  /** Token `j` as v12's lexer read it (without the line break v12 appended). */
  protected raw(j: number, trim = 0): string {
    const at = this.ats[j] ?? 0;
    const to = Math.min(this.tos[j] ?? at, this.text.length - 1);
    return this.text.slice(at + trim, Math.max(at + trim, to - trim));
  }

  /** The raw text from token `a` to token `b`, both included. */
  protected rawSpan(a: number, b: number): string {
    const to = Math.min(this.tos[b] ?? 0, this.text.length - 1);
    return this.text.slice(this.ats[a] ?? 0, to);
  }

  /** The end of the last token read. */
  protected end(): number {
    return this.t.end[this.i - 1] ?? 0;
  }

  /** Consume a token of `kind` and return its index, or fail. */
  protected expect(kind: number, hint?: string): number {
    this.tested([kind]);
    if (this.kind() !== kind) this.fail([kind], hint);
    return this.i++;
  }

  /** Consume a token of one of `kinds` and return its index, or fail (`names` for the message). */
  protected expectOne(
    set: Uint8Array,
    kinds: readonly number[],
    hint?: string,
    names?: string[]
  ): number {
    this.tested(kinds);
    if (set[this.kind()] !== 1) this.fail(kinds, hint, names);
    return this.i++;
  }

  protected skipNewlines(): void {
    for (;;) {
      this.tested(P_NEWLINE);
      if (this.kind() !== Kind.Newline) return;
      this.i++;
    }
  }

  /** `read`, then `',' read` while a `,` follows: the items of a list. */
  protected commaList<R>(read: () => R): R[] {
    const out = [read()];
    for (;;) {
      this.tested(P_COMMA);
      if (this.kind() !== T.Comma) return out;
      this.i++;
      out.push(read());
    }
  }

  /** `lineEnd: NEWLINE | EOF`; what else may come here is `want`, for the message. */
  protected lineEnd(want: readonly number[] = LINE_END, hint?: string): void {
    this.tested(want);
    this.tested(LINE_END);
    const k = this.kind();
    if (k === Kind.EOF) return;
    if (k !== Kind.Newline) this.fail([...want, ...LINE_END], hint);
    this.i++;
  }

  // ---- errors and recovery ------------------------------------------------------------

  protected lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the token at `j`. */
  protected found(j = this.i): string {
    const k = this.kind(j);
    if (k === Kind.EOF) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    const text = shown(this.raw(j)).trim();
    const line = text.split('\n', 1)[0] ?? '';
    return line.length > 24 || line !== text ? `\`${line.slice(0, 24)}…\`` : `\`${line}\``;
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  protected fail(want: readonly number[], hint?: string, names?: string[]): never {
    this.unexpected({ from: this.i, at: this.i, want, hint, names });
    throw STOP;
  }

  /**
   * Report token `at` where one of `want` was expected (`names` overrides their human names),
   * the range from token `from` (where v12's parser reported a failed choice: the start of the
   * statement) to `at`.
   */
  protected unexpected(p: {
    from: number;
    at: number;
    want: readonly number[];
    hint?: string | undefined;
    names?: string[] | undefined;
  }): void {
    const { from, at } = p;
    const k = this.kind(at);
    if (k === Kind.Error) {
      this.lexError(at);
      return;
    }
    if (k === T.UnclosedMarkdownString) return this.unclosed(at, from, 'markdown');
    if (k === T.UnclosedStereotypeText) return this.unclosed(at, from, 'stereotype');
    if (k === T.UnclosedJsonObjectLiteral) return this.unclosed(at, from, 'json');
    const names = p.names ?? EXPECTED.names(p.want);
    const why = p.hint ?? this.hint(at, p.want);
    const range = { start: this.range(from).start, end: this.range(at).end };
    const found = `${this.found(at)}${why ? `; ${why}` : ''}`;
    this.st.diagnostics.unexpected('UNEXPECTED', range, names, found);
  }

  /** A hint for the token at `j` where one of `want` was expected, when one helps. */
  protected hint(j: number, want: readonly number[]): string | undefined {
    const k = this.kind(j);
    const wantsId = want.includes(T.Identifier);
    if (k === T.Percent && this.kind(j + 1) === T.Percent) {
      return 'a comment `%%` goes on a line of its own';
    }
    if (k === T.End) return 'this `end` closes no `systemBoundary`';
    if (k === T.Usecase) return 'a diagram has one `usecase-beta`, at its start';
    if (k === T.CssIdentifier && wantsId) {
      return 'an id is letters, digits and `_`; write `my_node`, or a label in quotes';
    }
    if (k === T.LabelSymbol && wantsId) {
      return 'an id is ASCII letters, digits and `_`; put other text in a label, such as `A("…")`';
    }
    if (wantsId && LABEL_TEXT[k] === 1 && WORD_KINDS.includes(k) && k !== T.Identifier) {
      return `\`${this.raw(j)}\` is a keyword; quote it to use it as a name`;
    }
    if (want.includes(Kind.Newline) && KEYWORD_LINE[k] === 1) {
      return 'each statement goes on a line of its own';
    }
    return undefined;
  }

  /** Text no token rule matched: a quote without its closing quote, or `<<` before a line break. */
  protected lexError(j: number): void {
    if (this.reported.has(j)) return;
    this.reported.add(j);
    const where = this.range(j);
    const line = this.lineOf(where.start);
    const text = this.raw(j);
    if (text.startsWith('"') || text.startsWith("'")) {
      const q = text.charAt(0);
      this.st.diagnostics.error(
        'UNCLOSED_STRING',
        `Unclosed quote: the \`${q}\` at line ${line} has no closing \`${q}\` on its line. Add \`${q}\` after the text.`,
        where,
        { expected: [`\`${q}\``] }
      );
      return;
    }
    this.st.diagnostics.error(
      USECASE_UNCLOSED_STEREOTYPE,
      `Unclosed stereotype: the \`<<\` before line ${line + 1} has no text and \`>>\` on its line. Write \`<<text>>\` on one line.`,
      where,
      { expected: ['`>>`'] }
    );
  }

  /** An unclosed Markdown text, stereotype or JSON object (each reads to its line or text end). */
  protected unclosed(j: number, from: number, what: 'markdown' | 'stereotype' | 'json'): void {
    // From where v12's parser reported it: the token, or the statement a failed choice opened.
    const where = { start: this.range(from).start, end: this.range(j).end };
    const line = this.lineOf(this.range(j).start);
    const d = this.st.diagnostics;
    if (what === 'markdown') {
      d.error(
        USECASE_UNCLOSED_MARKDOWN,
        `Unclosed Markdown text: the quote and backtick at line ${line} have no closing backtick and quote. Close the text with a backtick and a quote.`,
        where,
        { expected: ['a backtick and a quote'] }
      );
    } else if (what === 'stereotype') {
      d.error(
        USECASE_UNCLOSED_STEREOTYPE,
        `Unclosed stereotype: the \`<<\` at line ${line} has no \`>>\` on its line. Write \`<<text>>\` on one line.`,
        where,
        { expected: ['`>>`'] }
      );
    } else {
      d.error(
        USECASE_UNCLOSED_JSON,
        `Unclosed JSON object: the \`{\` at line ${line} has no closing \`}\`. Close every \`{\` and \`"\` of the object.`,
        where,
        { expected: ['`}`'] }
      );
    }
  }

  /** A model check's error (v12's model builder). */
  protected modelError(code: string, message: string, range: Range, related?: RelatedInfo[]): void {
    this.st.diagnostics.error(code, message, range, related ? { related } : undefined);
  }

  /** Skip to the first token of `stops` (or EOF), reporting the unmatched text on the way. */
  private skip(stops: Uint8Array): void {
    for (;;) {
      this.i = skipTo(this.t, this.i, stops);
      if (this.kind() !== Kind.Error) return;
      this.lexError(this.i++);
    }
  }

  /**
   * Recover after `stop` (R-PARSE-4): skip to the next line break. Inside `@{ … }`, first through
   * its `}` (unless a line that starts with a keyword comes first); after an unclosed
   * `accDescr {`, on to a line that starts with a keyword.
   */
  protected recover(stop: Stop): void {
    this.probe?.freeze();
    if (stop.skip === 'metadata') {
      for (;;) {
        this.skip(SKIP_IN_METADATA);
        const k = this.kind();
        if (k === T.RBrace) {
          this.i++;
          break;
        }
        if (k !== Kind.Newline || KEYWORD_LINE[this.kind(this.lineStart(this.i))] === 1) break;
        this.i++;
      }
    }
    for (;;) {
      this.skip(SKIP_TO);
      if (stop.skip !== 'description' || this.kind() !== Kind.Newline) return;
      const next = this.lineStart(this.i);
      if (KEYWORD_LINE[this.kind(next)] === 1 || this.kind(next) === Kind.EOF) {
        this.i = next;
        return;
      }
      this.i = next;
    }
  }

  /** The first token of the line after the line breaks at `j`. */
  protected lineStart(j: number): number {
    let n = j;
    while (this.kind(n) === Kind.Newline) n++;
    return n;
  }

  /** Run one statement rule and return what it read; on failure, recover and return none. */
  protected statement<R>(rule: () => R): R | undefined {
    try {
      return rule();
    } catch (error) {
      if (!(error instanceof Stop)) throw error;
      this.recover(error);
      return undefined;
    }
  }
}
