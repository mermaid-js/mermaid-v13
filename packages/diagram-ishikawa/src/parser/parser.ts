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
 * `ISHIKAWA_INDENT_CLAMPED` (with `clampPerCause`, one information diagnostic per clamped
 * cause instead).
 *
 * With `probe` (R-LANG-7, D95, #584) the rules also record what they would accept at that
 * offset: the header keyword (after the blank and comment lines before it), what starts a
 * statement, the text after an indent, and what ends a statement. The lexer has no start
 * conditions, so the probe's mode is `INITIAL` in code.
 */
import {
  Kind,
  kindSet,
  LineIndex,
  ParseState,
  Probe,
  ProbeCursor,
  sourceView,
  syncTo,
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
import { causeId, EFFECT_ID } from './ast-ids.ts';
import type { IshikawaDocument, IshikawaLineNode } from './ast.ts';
import { KEYWORD_REWORD, KEYWORDS } from './keywords.ts';
import { lex } from './lexer.ts';
import type { Lexed } from './lexer.ts';
import { T } from './tokens.ts';

export interface IshikawaParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /**
   * One `info` `ISHIKAWA_INDENT_CLAMPED` at each clamped cause, in place of the one warning
   * listing them all (D496): what an editor shows (spec #519 "Language facet").
   */
  clampPerCause?: boolean;
}

export type IshikawaParseResult = ParseResult<IshikawaModel, IshikawaDocument>;

// The kinds of each decision point, as lists (what the probe records, R-LANG-7, D95) and as
// sets (what the parser tests); each set is made from its list. Constants, so a parse without a
// probe allocates nothing for them.
/** A blank or comment line (jison's `SPACELINE`): before the header, or a statement. */
const BLANK_LINE_KINDS = [T.SpaceLine, T.CommentLine];
const BLANK_LINES = kindSet(...BLANK_LINE_KINDS);
/** What may start a statement: an indent, a line of text, a blank or comment line. */
const STATEMENT_KINDS = [T.SpaceList, T.Text, ...BLANK_LINE_KINDS];
/** What ends a statement: a line break, the end, or a blank or comment line. */
const STOP_KINDS = [Kind.Newline, T.Eof, ...BLANK_LINE_KINDS];
const STOPS = kindSet(...STOP_KINDS);
/** What an error after an indent names: the text or keyword after it, not the blanks. */
const AFTER_INDENT = kindSet(T.Text, T.Ishikawa);
/**
 * Kinds a probe's cursor follows rather than extends when the token ends at the offset: an
 * indent and a blank line (the cursor is then where a line's text goes).
 */
const PROBE_FOLLOWS = kindSet(T.SpaceList, T.SpaceLine);

/**
 * What a statement read, for the message of a missing separator after it: a line of text, a
 * bare indent, a blank line, or a comment line.
 */
type Read = 'line' | 'indent' | 'blank' | 'comment';

// What the parser expects, in Mermaid terms (R-ERR-2, R-ERR-5).
const HEADER = KEYWORDS.map((k) => `\`${k}\``);
const LINE = ['a line of text: the effect or a cause'];
const LINE_BREAK = ['a line break'];

const HEADER_HINT = 'an Ishikawa diagram starts with `ishikawa` or `ishikawa-beta`';
const KEYWORD_HINT = `a line may not start with the keyword: \`ishikawa\` starts the diagram and comes only once; ${KEYWORD_REWORD}`;
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

/** How many clamped causes the render's one `ISHIKAWA_INDENT_CLAMPED` names; `related` has all. */
const CLAMP_NAMED = 10;

/** Author text as a message quotes it: in backticks, at most 24 characters. */
const quote = (text: string): string =>
  text.length > 24 ? `\`${text.slice(0, 24)}…\`` : `\`${text}\``;

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
  /** Its AST id, which the ids of the causes under it extend. */
  ast: string;
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
  /** Probe mode only (R-LANG-7). */
  private readonly probe: Probe | undefined;
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
    if (options.probe === undefined) {
      this.c = new TokenCursor(this.lexed.tokens);
      return;
    }
    const probe = (this.probe = new Probe(src, options.probe, PROBE_FOLLOWS));
    if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
    // v12's lexer has no start conditions.
    probe.lexed(probe.offset, probe.offset, 'INITIAL');
    // The cursor marks an offset inside a comment or directive as outside code.
    this.c = new ProbeCursor(this.lexed.tokens, probe);
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
    return st.result(model, ast, this.lexed.tokens, this.options, this.probe);
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

  /** The kind of the token an error message names: the current one, or the one after blanks. */
  private namedKind(): number {
    const { c } = this;
    return c.kind === T.SpaceList && AFTER_INDENT[c.peek()] ? c.peek() : c.kind;
  }

  /**
   * Where an error is and how its message names it: the current token, or the text or keyword
   * after blanks (past any trivia between, as the cursor skips it). The cursor stays.
   */
  private named(): { range: Range; found: string } {
    const { c } = this;
    const at = c.pos;
    if (c.kind === T.SpaceList && AFTER_INDENT[c.peek()]) c.next();
    const named = { range: c.range, found: this.found(c.pos) };
    c.pos = at;
    return named;
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
    return text === '' ? 'blanks' : quote(text);
  }

  /** Report what was found where `names` were expected, with a hint. */
  private report(names: string[], hint?: string): void {
    const { range, found } = this.named();
    const d = this.st.diagnostics.unexpected('UNEXPECTED', range, names, found);
    if (hint) d.message = `${d.message.slice(0, -1)}; ${hint}.`;
  }

  /** Report, then stop the statement. */
  private fail(names: string[], hint?: string): never {
    this.report(names, hint);
    throw STOP;
  }

  /** Skip to the next statement after an error (R-PARSE-4): the next line break, and past it. */
  private recover(): void {
    syncTo(this.c, STOPS);
    this.separator();
  }

  // ---- grammar ------------------------------------------------------------------------

  /** `start`: blank and comment lines, then the keyword and an optional line break. */
  private start(): void {
    const { c } = this;
    c.tested(BLANK_LINE_KINDS);
    if (BLANK_LINES[c.kind]) {
      // `spaceLines`.
      c.next();
      while (BLANK_LINES[c.kind] || c.kind === Kind.Newline) c.next();
    }
    if (!c.at(T.Ishikawa)) {
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
        this.stop(this.statement());
      } catch (error) {
        if (error !== STOP) throw error;
        this.recover();
      }
    }
  }

  /** `statement`: an indent and an optional line of text, a line of text, or a blank line. */
  private statement(): Read {
    const { c } = this;
    c.tested(STATEMENT_KINDS);
    const k = c.kind;
    if (k === T.SpaceList) {
      const indent = this.raw(c.next()).length;
      if (!c.at(T.Text)) return 'indent';
      this.line(indent);
      return 'line';
    }
    if (k === T.Text) {
      this.line(0);
      return 'line';
    }
    if (BLANK_LINES[k]) {
      c.next();
      return k === T.CommentLine ? 'comment' : 'blank';
    }
    if (k === T.Ishikawa) this.fail(LINE, KEYWORD_HINT);
    this.fail(LINE, this.headerRange ? EMPTY_HEADER_HINT : undefined);
  }

  /**
   * `stop` after a statement that read `read`: a line break, the end, or a blank or comment
   * line; then line breaks.
   */
  private stop(read: Read): void {
    const { c } = this;
    c.tested(STOP_KINDS);
    if (STOPS[c.kind]) {
      this.separator();
      return;
    }
    if (this.namedKind() === T.Ishikawa) this.fail(LINE, KEYWORD_HINT);
    if (read === 'blank' || read === 'comment') {
      // A line one blank line too early or late: one error, and the line is still read. Only a
      // line separator ends a comment line without a separator after it (a line break would be
      // one), so the text after a comment line is on its line.
      this.report(LINE_BREAK, read === 'comment' ? SEPARATOR_HINT : PAIRS_HINT);
      // The line is still read, but what is tested on it now is recovery.
      this.probe?.freeze();
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
      this.effect = { ast: EFFECT_ID, text, range };
      this.children.push({ id: EFFECT_ID, type: 'Effect', range, text, indent });
      this.st.statement('effect', range);
      this.stack.push({ level: 0, causes: this.causes, ast: EFFECT_ID, span: undefined });
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
    const ast = causeId(parent.ast, parent.causes.length + 1);
    const cause: OpenCause = { ast, text, level, range, causes: [] };
    parent.causes.push(cause);
    if (indent < this.baseline) this.clamped.push(cause);
    this.children.push({ id: ast, type: 'Cause', range, text, indent, level });
    st.symbol(text, 'cause', range, 'def');
    const span = st.beginStatement('cause', range.start);
    stack.push({ level, causes: cause.causes, ast, span });
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
    const shown = (c: OpenCause) => `${quote(c.text)} at line ${this.lineOf(c.range.start)}`;
    if (this.options.clampPerCause) {
      // The editor's: the indent's meaning at each line it changes.
      for (const c of clamped) {
        d.add(
          'info',
          ISHIKAWA_INDENT_CLAMPED,
          `Indented less than the first cause (${shown(baseline)}), so read as a top-level cause. Indent it at least as deep as the first cause to nest it.`,
          c.range
        );
      }
      return;
    }
    // Every clamped cause by name, up to a cap (the public warning has no `related`).
    const named = clamped.slice(0, CLAMP_NAMED).map(shown);
    const more = clamped.length - named.length;
    const list = named.join(', ') + (more > 0 ? `, and ${more} more` : '');
    const message =
      clamped.length === 1
        ? `A cause is indented less than the first cause (${shown(baseline)}), so it is read as a top-level cause: ${list}. Indent it at least as deep as the first cause to nest it.`
        : `${clamped.length} causes are indented less than the first cause (${shown(baseline)}), so they are read as top-level causes: ${list}. Indent them at least as deep as the first cause to nest them.`;
    const related: RelatedInfo[] = clamped.map((c) => ({
      message: `${shown(c)} is indented less than the first cause, so it is a top-level cause.`,
      range: c.range,
    }));
    d.warning(ISHIKAWA_INDENT_CLAMPED, message, first.range, { related });
  }
}
