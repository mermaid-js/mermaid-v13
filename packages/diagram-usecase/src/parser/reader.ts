// cspell:words accdescr
/**
 * The usecase parser's token reader (#563): the token arrays the rules read (v12's significant
 * tokens: the lexer's, without the spans v12 removed before lexing), and how a rule fails and
 * the parse recovers. A rule that fails records a diagnostic and throws {@link STOP}; the
 * statement loop skips to the line end (R-PARSE-4). Messages name what was expected in Mermaid
 * terms, never a token kind or grammar rule (R-ERR-5), and start where v12's parser reported
 * the error, so the first error's offset is v12's (D473).
 */
import {
  formatExpected,
  Kind,
  LineIndex,
  ParseState,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type { ParseOptions, Range, RelatedInfo } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import {
  USECASE_UNCLOSED_JSON,
  USECASE_UNCLOSED_MARKDOWN,
  USECASE_UNCLOSED_STEREOTYPE,
} from '../codes.ts';
import { lex } from './lexer.ts';
import type { Lexed } from './lexer.ts';
import { ARROW_SET, EXPECTED, KEYWORD_LINE, LINE_END } from './tables.ts';
import { shown } from './text.ts';
import { T } from './tokens.ts';

export interface UsecaseParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
}

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
class Stop extends Error {}
export const STOP = new Stop();

/** The tokens of one parse, the cursor, and the errors and recovery of the rules. */
export abstract class UsecaseReader {
  protected readonly pre: PreprocessResult;
  /** v12's lexed text; token `j` is `text[at[j], to[j])`. */
  protected readonly text: string;
  protected readonly kinds: number[] = [];
  protected readonly starts: number[] = [];
  protected readonly ends: number[] = [];
  protected readonly ats: number[] = [];
  protected readonly tos: number[] = [];
  protected readonly full: Lexed['tokens'];
  protected readonly input: Lexed['input'];
  protected i = 0;
  /** The first token of the statement being read. */
  protected stmt = 0;
  protected readonly st = new ParseState();
  /** Error tokens already reported. */
  private readonly reported = new Set<number>();
  /** After an `accDescr {` with no `}`: skip its lines, up to one that starts with a keyword. */
  protected description = false;
  /** Inside `@{ … }`: an error skips to its `}`. */
  protected metadataOpen = false;
  private lines: LineIndex | undefined;

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
    for (let j = 0; j < tokens.length; j++) {
      const k = tokens.kind[j] ?? Kind.EOF;
      const a = at[j] ?? -1;
      // The spans v12 removed before lexing are trivia; the text's own `%%` lines are not.
      if (k !== Kind.EOF && a < 0) continue;
      const eof = k === Kind.EOF;
      this.kinds.push(k);
      this.starts.push(eof ? src.length : (tokens.start[j] ?? 0));
      this.ends.push(eof ? src.length : (tokens.end[j] ?? 0));
      this.ats.push(eof ? this.text.length : a);
      this.tos.push(eof ? this.text.length : (to[j] ?? a));
    }
  }

  // ---- tokens -------------------------------------------------------------------------

  protected kind(j = this.i): number {
    return this.kinds[j] ?? Kind.EOF;
  }

  protected range(j = this.i): Range {
    const last = this.kinds.length - 1;
    const k = Math.min(j, last);
    return { start: this.starts[k] ?? 0, end: this.ends[k] ?? 0 };
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
    return this.ends[this.i - 1] ?? 0;
  }

  /** Consume a token of `kind` and return its index, or fail. */
  protected expect(kind: number, hint?: string): number {
    if (this.kind() !== kind) this.fail([kind], hint);
    return this.i++;
  }

  /** Consume a token of one of `kinds` and return its index, or fail. */
  protected expectOne(set: Uint8Array, kinds: readonly number[], hint?: string): number {
    if (set[this.kind()] !== 1) this.fail(kinds, hint);
    return this.i++;
  }

  protected skipNewlines(): void {
    while (this.kind() === Kind.Newline) this.i++;
  }

  /** `lineEnd: NEWLINE | EOF`; what else may come here is `want`, for the message. */
  protected lineEnd(want: readonly number[] = LINE_END, hint?: string): void {
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
  protected fail(want: readonly number[], hint?: string): never {
    this.unexpected(this.i, this.i, want, hint);
    throw STOP;
  }

  /**
   * Report token `j` where one of `want` was expected, the range from token `from` (where v12's
   * parser reported a failed choice: the start of the statement or of the item) to `j`.
   */
  protected unexpected(from: number, j: number, want: readonly number[], hint?: string): void {
    const k = this.kind(j);
    if (k === Kind.Error) {
      this.lexError(j);
      return;
    }
    if (k === T.UnclosedMarkdownString) return this.unclosed(j, from, 'markdown');
    if (k === T.UnclosedStereotypeText) return this.unclosed(j, from, 'stereotype');
    if (k === T.UnclosedJsonObjectLiteral) return this.unclosed(j, from, 'json');
    const names = EXPECTED.names(want);
    const why = hint ?? this.explain(j, want);
    const message = `Expected ${formatExpected(names)}, got ${this.found(j)}${why ? `; ${why}` : ''}.`;
    const range = { start: this.range(from).start, end: this.range(j).end };
    this.st.diagnostics.error('UNEXPECTED', message, range, { expected: names });
  }

  /** A hint for an unexpected token, when one helps. */
  protected explain(j: number, want: readonly number[]): string | undefined {
    const k = this.kind(j);
    const statement = this.kind(this.stmt);
    if (k === T.Percent && this.kind(j + 1) === T.Percent) {
      return 'a comment `%%` goes on a line of its own';
    }
    if (k === T.End) return 'this `end` closes no `systemBoundary`';
    if (k === T.Usecase) return 'a diagram has one `usecase-beta`, at its start';
    if (k === T.CssIdentifier && want.includes(T.Identifier)) {
      return 'an id is letters, digits and `_`; write `my_node`, or a label in quotes';
    }
    if (k === T.LabelSymbol && want.includes(T.Identifier)) {
      return 'an id is ASCII letters, digits and `_`; put other text in a label, such as `A("…")`';
    }
    if (statement === T.Actor && j > this.stmt && ARROW_SET[k] === 1) {
      return 'a list of actors takes no relation; write the relation on its own line';
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

  /**
   * Skip to the next line break after an error (R-PARSE-4), reporting the unmatched text on the
   * way. Inside `@{ … }`, skip to its `}` first; after an unclosed `accDescr {`, skip to a line
   * that starts with a keyword (the description's lines are text, not statements).
   */
  protected recover(): void {
    const metadata = this.metadataOpen;
    const description = this.description;
    this.metadataOpen = false;
    this.description = false;
    if (metadata) {
      for (;;) {
        const k = this.kind();
        if (k === Kind.EOF) return;
        if (k === T.RBrace) {
          this.i++;
          break;
        }
        if (k === Kind.Newline && KEYWORD_LINE[this.kind(this.lineStart(this.i))] === 1) break;
        if (k === Kind.Error) this.lexError(this.i);
        this.i++;
      }
    }
    for (;;) {
      const k = this.kind();
      if (k === Kind.EOF) return;
      if (k === Kind.Newline) {
        if (!description) return;
        const next = this.lineStart(this.i);
        if (KEYWORD_LINE[this.kind(next)] === 1 || this.kind(next) === Kind.EOF) {
          this.i = next;
          return;
        }
      } else if (k === Kind.Error) this.lexError(this.i);
      this.i++;
    }
  }

  /** The first token of the line after the line breaks at `j`. */
  protected lineStart(j: number): number {
    let n = j;
    while (this.kind(n) === Kind.Newline) n++;
    return n;
  }

  /** Run one statement rule; on failure, recover. */
  protected statement(rule: () => void): void {
    this.stmt = this.i;
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover();
    }
  }
}
