// cspell:words LALR SPACELINE SPACELIST
/**
 * Ishikawa parser: recursive descent over the {@link lex} tokens (gated against v12's jison
 * lexer, #580), producing an {@link IshikawaModel}, the typed AST, symbols, statement spans and
 * diagnostics (DESIGN §4.2, spec #519).
 *
 * The grammar is v12's `ishikawa.jison` (LALR), ported rule for rule; `grammar/ishikawa.ebnf`
 * is the normative form:
 *
 *     start     = [ SPACELINE ( SPACELINE | NL )* ] ISHIKAWA [ NL ] ( statement stop )+
 *     stop      = ( NL | EOF | SPACELINE ) ( NL | EOF )*
 *     statement = SPACELIST [ TEXT ] | TEXT | SPACELINE
 *
 * A `stop` takes one blank or comment line (`SPACELINE`) at most, and a blank or comment line is
 * a statement where one may start, so they pair up: a line of text after an even number of them
 * (an odd number right after the header) is a syntax error, as in v12. The lexer never fails, so
 * the only other errors are a line starting with the keyword and a header with nothing after it.
 *
 * The model is v12's DB (`ishikawaDb.ts`), which never throws: the first line of text is the
 * effect (its indent ignored); the first cause's indent is the baseline, each cause's level is
 * `max(1, indent − baseline + 1)`, and the open causes are popped while the top one's level is
 * at least the new one's. Unlike jison the parser does not stop at the first error: it reports
 * it and goes on at the next line (R-PARSE-4), reading a line that only came one blank line too
 * early or late as a line, so N errors give N diagnostics.
 *
 * Symbols (D497): each cause is a `cause` symbol, its own definition with no references.
 * Statement spans: `header`, `effect`, and `cause`, each holding the spans of the causes under
 * it (for folding). The D496 warnings are made here: `ISHIKAWA_EMPTY` and
 * `ISHIKAWA_INDENT_CLAMPED`.
 */
import {
  Kind,
  kindSet,
  LineIndex,
  ParseState,
  sourceView,
  TokenCursor,
} from '@mermaid-js/core/parser-kit';
import type {
  ParseOptions,
  ParseResult,
  Range,
  RelatedInfo,
  StatementSpan,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { ISHIKAWA_EMPTY, ISHIKAWA_INDENT_CLAMPED } from '../codes.ts';
import type { IshikawaCause, IshikawaEffect, IshikawaModel } from '../model.ts';
import type { IshikawaDocument, IshikawaLineNode } from './ast.ts';
import { lex } from './lexer.ts';
import type { Lexed } from './lexer.ts';
import { T } from './tokens.ts';

export interface IshikawaParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
}

export type IshikawaParseResult = ParseResult<IshikawaModel, IshikawaDocument>;

/** What ends a statement: a line break, the end, or a blank or comment line. */
const STOPS = kindSet(Kind.Newline, T.Eof, T.SpaceLine, T.CommentLine);
/** A blank or comment line (jison's `SPACELINE`). */
const BLANK_LINES = kindSet(T.SpaceLine, T.CommentLine);

// What the parser expects, in Mermaid terms (R-ERR-2, R-ERR-5).
const HEADER = ['`ishikawa`', '`ishikawa-beta`'];
const LINE = ['a line of text: the effect or a cause'];
const LINE_BREAK = ['a line break'];

const HEADER_HINT = 'an Ishikawa diagram starts with `ishikawa` or `ishikawa-beta`';
const KEYWORD_HINT =
  'a line may not start with the keyword: `ishikawa` starts the diagram and comes only once; reword the line, as in `The ishikawa way`';
const EMPTY_HEADER_HINT = 'end the header line with a line break, then write the effect';
const PAIRS_HINT =
  'remove a blank or comment line above it, or add one: mermaid@12 reads the blank and comment lines between two lines in pairs (blank lines in a row count as one), and rejects a line here';
const SEPARATOR_HINT =
  'a comment ends at a line separator (U+2028 or U+2029), and the text after it may not follow on that line; start it on a line of its own';

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
class Stop extends Error {}
const STOP = new Stop();

/** Parse an ishikawa diagram. Never throws: problems are error diagnostics. */
export function parseIshikawa(
  src: string,
  options: IshikawaParseOptions = {}
): IshikawaParseResult {
  return new IshikawaParser(src, options).parse();
}

/** A model cause while the tree is built: the same fields, writable. */
interface OpenCause {
  ast: string;
  text: string;
  level: number;
  range: Range;
  causes: OpenCause[];
}

/** An open entry of v12's stack: the effect (level 0) or a cause, and its statement span. */
interface Open {
  level: number;
  /** The causes under it; the model's top-level ones for the effect. */
  causes: OpenCause[];
  /** The id prefix of the causes under it: `cause:` for the effect, else `<ast>.`. */
  prefix: string;
  /** A cause's span, which holds the spans of the causes under it; none for the effect. */
  span: StatementSpan | undefined;
}

/**
 * One parse. Each grammar rule is a method; a rule that fails records a diagnostic and throws
 * {@link STOP}, and the statement loop recovers.
 */
class IshikawaParser {
  private readonly pre: PreprocessResult;
  private readonly lexed: Lexed;
  private readonly st = new ParseState();
  private readonly c: TokenCursor;
  private readonly children: IshikawaLineNode[] = [];
  private headerRange: Range | undefined;
  private effect: IshikawaEffect | undefined;
  private readonly causes: OpenCause[] = [];
  /** v12's stack; the effect at the bottom once read. */
  private readonly stack: Open[] = [];
  /** v12's `baseLevel`: the first cause's indent. */
  private baseline: number | undefined;
  /** Causes indented less than the baseline (`ISHIKAWA_INDENT_CLAMPED`). */
  private readonly clamped: OpenCause[] = [];
  /** The end of the last line of text read, where the open causes' spans end. */
  private lastEnd = 0;
  /** The kind of the last statement read, for the hints. */
  private last = 0;
  private lines: LineIndex | undefined;

  constructor(
    private readonly src: string,
    private readonly options: IshikawaParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    const view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.lexed = lex(src, pre.bodyStart, view);
    this.c = new TokenCursor(this.lexed.tokens);
  }

  parse(): IshikawaParseResult {
    this.start();
    this.document();
    const open = this.stack[1];
    if (open?.span) this.st.endStatement(open.span, this.lastEnd);
    this.warnings();
    const { st, pre, src } = this;
    st.diagnostics.list.sort((a, b) => a.range.start - b.range.start);
    const title = pre.frontMatter?.title;
    const model: IshikawaModel = {
      ...(this.effect ? { effect: this.effect } : {}),
      causes: this.causes as IshikawaCause[],
      ...(title ? { title } : {}),
      warnings: st.diagnostics.list.filter((d) => d.severity === 'warning'),
    };
    const ast: IshikawaDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.lexed.tokens, this.options);
  }

  // ---- tokens -------------------------------------------------------------------------

  /** A token's text as v12's parser read it (`Lexed.text`). */
  private raw(j = this.c.pos): string {
    return this.lexed.text(j);
  }

  private range(j: number): Range {
    const t = this.c.tokens;
    return { start: t.start[j] ?? 0, end: t.end[j] ?? 0 };
  }

  /** The source range of token `j` without the blanks at either end. */
  private trimmed(j: number): Range {
    let { start, end } = this.range(j);
    const { src } = this;
    while (start < end && /\s/.test(src.charAt(start))) start++;
    while (end > start && /\s/.test(src.charAt(end - 1))) end--;
    return { start, end };
  }

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  // ---- errors and recovery ------------------------------------------------------------

  /** The token an error message names: the current one (the text after it, for blanks). */
  private named(): number {
    const { c } = this;
    if (c.kind !== T.SpaceList) return c.pos;
    const next = this.c.tokens.kind[c.pos + 1];
    return next === T.Text || next === T.Ishikawa ? c.pos + 1 : c.pos;
  }

  /** How an error message names token `j`. */
  private found(j: number): string {
    const k = this.c.tokens.kind[j] ?? Kind.EOF;
    const r = this.range(j);
    // v12's appended line break is zero-width: the end of the text too.
    if (k === Kind.EOF || k === T.Eof || r.start === r.end) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    if (k === T.CommentLine) return 'a comment';
    if (k === T.SpaceLine) return 'a blank line';
    const text = this.raw(j).trim();
    if (text === '') return 'blanks';
    return text.length > 24 ? `\`${text.slice(0, 24)}…\`` : `\`${text}\``;
  }

  /** Report what was found where `names` were expected, with a hint. */
  private report(names: string[], hint?: string): void {
    const j = this.named();
    const range = this.range(j);
    const d = this.st.diagnostics.unexpected('UNEXPECTED', range, names, this.found(j));
    if (hint) d.message = `${d.message.slice(0, -1)}; ${hint}.`;
  }

  /** Report, then stop the statement. */
  private fail(names: string[], hint?: string): never {
    this.report(names, hint);
    throw STOP;
  }

  /** Skip to the next statement after an error (R-PARSE-4): the next line break, and past it. */
  private recover(): void {
    const { c } = this;
    while (c.kind !== Kind.EOF && !STOPS[c.kind]) c.next();
    this.separator();
  }

  // ---- grammar ------------------------------------------------------------------------

  /** `start`: blank and comment lines, then the keyword and an optional line break. */
  private start(): void {
    const { c } = this;
    if (BLANK_LINES[c.kind]) {
      // `spaceLines`.
      c.next();
      while (BLANK_LINES[c.kind] || c.kind === Kind.Newline) c.next();
    }
    if (c.kind !== T.Ishikawa) {
      this.report(HEADER, HEADER_HINT);
      // The lines are still read; line breaks before them are no statement.
      while (c.kind === Kind.Newline || c.kind === T.Eof) c.next();
      return;
    }
    this.headerRange = c.range;
    this.st.statement('header', c.range);
    c.next();
    c.eat(Kind.Newline);
  }

  /** `document`: statements, each followed by a separator, to the end; at least one. */
  private document(): void {
    const { c } = this;
    // One statement at least, unless the header was reported missing (one error, one diagnostic).
    let first = this.headerRange !== undefined;
    while (first || c.kind !== Kind.EOF) {
      first = false;
      try {
        this.statement();
        this.stop();
      } catch (error) {
        if (error !== STOP) throw error;
        this.recover();
      }
    }
  }

  /** `statement`: an indent and an optional line of text, a line of text, or a blank line. */
  private statement(): void {
    const { c } = this;
    const k = c.kind;
    this.last = k;
    if (k === T.SpaceList) {
      const indent = this.raw(c.next()).length;
      if (c.kind === T.Text) this.line(indent);
      return;
    }
    if (k === T.Text) {
      this.line(0);
      return;
    }
    if (BLANK_LINES[k]) {
      c.next();
      return;
    }
    if (k === T.Ishikawa) this.fail(LINE, KEYWORD_HINT);
    this.fail(LINE, this.headerRange ? EMPTY_HEADER_HINT : undefined);
  }

  /** `stop`: a line break, the end, or a blank or comment line; then line breaks. */
  private stop(): void {
    const { c } = this;
    if (STOPS[c.kind]) {
      this.separator();
      return;
    }
    const k = this.c.tokens.kind[this.named()];
    if (k === T.Ishikawa) this.fail(LINE, KEYWORD_HINT);
    if (BLANK_LINES[this.last]) {
      // A line one blank line too early or late: one error, and the line is still read.
      const between = this.src.slice(this.range(c.pos - 1).end, c.start);
      const separated = this.last === T.CommentLine && !between.includes('\n');
      this.report(LINE_BREAK, separated ? SEPARATOR_HINT : PAIRS_HINT);
      return;
    }
    this.fail(LINE_BREAK);
  }

  /** The separator at the cursor (one of `stop`'s), then line breaks and the end. */
  private separator(): void {
    const { c } = this;
    if (c.kind === Kind.EOF) return;
    c.next();
    while (c.kind === Kind.Newline || c.kind === T.Eof) c.next();
  }

  // ---- model --------------------------------------------------------------------------

  /** The line of text at the cursor, indented `indent`: v12's `addNode(indent, text.trim())`. */
  private line(indent: number): void {
    const j = this.c.next();
    const text = this.raw(j).trim();
    const range = this.trimmed(j);
    /** Where the causes popped below end: the last line of text before this one. */
    const before = this.lastEnd;
    this.lastEnd = range.end;
    if (!this.effect) {
      this.effect = { ast: 'effect', text, range };
      this.children.push({ id: 'effect', type: 'Effect', range, text, indent });
      this.st.statement('effect', range);
      this.stack.push({ level: 0, causes: this.causes, prefix: 'cause:', span: undefined });
      return;
    }
    this.baseline ??= indent;
    const level = Math.max(1, indent - this.baseline + 1);
    const { stack, st } = this;
    for (let top = stack[stack.length - 1]; stack.length > 1 && top && top.level >= level; ) {
      stack.pop();
      if (top.span) st.endStatement(top.span, before);
      top = stack[stack.length - 1];
    }
    const parent = stack[stack.length - 1]!;
    const ast = `${parent.prefix}${parent.causes.length + 1}`;
    const cause: OpenCause = { ast, text, level, range, causes: [] };
    parent.causes.push(cause);
    if (indent < this.baseline) this.clamped.push(cause);
    this.children.push({ id: ast, type: 'Cause', range, text, indent, level });
    st.symbol(text, 'cause', range, 'def');
    const span = st.beginStatement('cause', range.start);
    stack.push({ level, causes: cause.causes, prefix: `${ast}.`, span });
  }

  /** The D496 warnings. */
  private warnings(): void {
    const d = this.st.diagnostics;
    const header = this.headerRange;
    if (!this.effect && !d.hasErrors) {
      const at = header ?? { start: this.pre.bodyStart, end: this.pre.bodyStart };
      const keyword = header ? this.src.slice(header.start, header.end) : 'ishikawa-beta';
      d.warning(
        ISHIKAWA_EMPTY,
        `The diagram has no effect, so nothing is drawn. Write the effect on the line after \`${keyword}\`.`,
        at
      );
    }
    const { clamped } = this;
    const first = clamped[0];
    const baseline = this.causes[0];
    if (!first || !baseline) return;
    const shown = (c: OpenCause) =>
      `${c.text.length > 24 ? `\`${c.text.slice(0, 24)}…\`` : `\`${c.text}\``} at line ${this.lineOf(c.range.start)}`;
    const many = clamped.length > 1;
    const list = clamped.slice(0, 3).map(shown).join(', ') + (clamped.length > 3 ? ', …' : '');
    const related: RelatedInfo[] = clamped.map((c) => ({
      message: `${shown(c)} is indented less than the first cause, so it is a top-level cause.`,
      range: c.range,
    }));
    d.warning(
      ISHIKAWA_INDENT_CLAMPED,
      `${many ? `${clamped.length} causes are` : 'A cause is'} indented less than the first cause (${shown(baseline)}), so ${many ? 'they are' : 'it is'} read as top-level causes: ${list}. Indent ${many ? 'them' : 'it'} at least as deep as the first cause to nest ${many ? 'them' : 'it'}.`,
      first.range,
      { related }
    );
  }
}
