// cspell:words LALR
/**
 * Timeline parser: recursive descent over the {@link lex} tokens (gated against v12's jison
 * lexer, #308), producing a {@link TimelineModel}, the typed AST, statement spans and
 * diagnostics (DESIGN §4.3).
 *
 * The grammar is v12's `timeline.jison` (LALR), ported rule for rule; `grammar/timeline.ebnf`
 * is the normative form. It needs no separators: every token starts a statement, and v12's
 * `NEWLINE` is only skipped (its `\s+` rule eats line breaks after blanks anyway). The parser
 * reads the tokens jison returned: `accDescr {` and its `}`, for which jison returns none, are
 * trivia here, as are comments. Values are what v12's DB stored (raw text; `model.ts`).
 *
 * jison rejects four things: a first token that is not the header, a header keyword later, a
 * `:` that starts no event (`INVALID`), and a text that ends inside an accessibility value (no
 * `EOF` token: an unclosed `accDescr {`, or `accTitle:` with nothing after it at the end). v12's
 * DB adds a fifth: an event before any period (a `TypeError`). Unlike jison the parser does not
 * stop at the first error: it reports it, skips to the next line and carries on (R-PARSE-4).
 */
import {
  cook,
  CR,
  Kind,
  kindSet,
  LF,
  LineIndex,
  ParseState,
  sourceView,
  TokenCursor,
} from '@mermaid-js/core/parser-kit';
import type { ParseOptions, ParseResult, Range, SourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type {
  TimelineDirection,
  TimelineEvent,
  TimelineModel,
  TimelinePeriod,
  TimelineSection,
} from '../model.ts';
import type {
  TimelineDocument,
  TimelineEventNode,
  TimelineStatementNode,
  TimelineTextStatementNode,
} from './ast.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

export interface TimelineParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
}

export type TimelineParseResult = ParseResult<TimelineModel, TimelineDocument>;

const HEADERS = [T.Timeline, T.TimelineLR, T.TimelineTD];
const DIRECTION: Readonly<Record<number, TimelineDirection>> = {
  [T.Timeline]: 'LR',
  [T.TimelineLR]: 'LR',
  [T.TimelineTD]: 'TD',
};

/** `accDescr {` and its `}` (jison returns no token for them) and comments: trivia here. */
const SKIPPED = kindSet(
  Kind.Comment,
  Kind.Directive,
  Kind.Space,
  T.AccDescrMultiline,
  T.AccDescrMultilineEnd
);
const COMMENTS = kindSet(Kind.Comment, Kind.Directive, Kind.Space);

const HEADER = ['`timeline`'];
const TEXT = ['text'];
const STATEMENT = [
  'a time period such as `2002`',
  'an event such as `: LinkedIn`',
  'a statement such as `section` or `title`',
];
const HEADER_HINT = 'a timeline starts with `timeline`, `timeline LR` or `timeline TD`';
const EVENT_HINT = 'an event is `:`, a blank and its text, e.g. `2002 : LinkedIn`';
const EVENT_BEFORE_PERIOD =
  'An event needs a time period before it: write it as `<period> : <event>`, e.g. `2002 : LinkedIn`';
const BARE_SECTION = '; a bare `section` takes the next line as its name';

/** The prefix v12's grammar cut off each token's text (`$1.substr(n)`). */
const TITLE_PREFIX = 'title '.length;
const SECTION_PREFIX = 'section '.length;
const EVENT_PREFIX = ': '.length;

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
class Stop extends Error {}
const STOP = new Stop();

/** Parse a timeline diagram. Never throws: problems are error diagnostics. */
export function parseTimeline(
  src: string,
  options: TimelineParseOptions = {}
): TimelineParseResult {
  return new TimelineParser(src, options).parse();
}

/** A period while its events are read. */
interface OpenPeriod extends TimelinePeriod {
  readonly events: TimelineEvent[];
}

/**
 * One parse. Each grammar rule is a method; a rule that fails records a diagnostic and throws
 * {@link STOP}, and the statement loop recovers.
 */
class TimelineParser {
  private readonly pre: PreprocessResult;
  private readonly view: SourceView;
  private readonly st = new ParseState();
  private readonly c: TokenCursor;
  private readonly children: TimelineStatementNode[] = [];
  private readonly sections: TimelineSection[] = [];
  private readonly periods: OpenPeriod[] = [];
  private direction: TimelineDirection = 'LR';
  private title: TimelineTextStatementNode | undefined;
  private accTitle = '';
  private accDescr = '';
  /** An error at the end of the text was reported (the text ends inside a value). */
  private endReported = false;
  private lines: LineIndex | undefined;

  constructor(
    private readonly src: string,
    private readonly options: TimelineParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.c = new TokenCursor(lex(src, pre.bodyStart, this.view), SKIPPED);
  }

  parse(): TimelineParseResult {
    this.header();
    this.document();
    const { st, pre, src } = this;
    const model: { -readonly [K in keyof TimelineModel]: TimelineModel[K] } = {
      direction: this.direction,
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      sections: this.sections,
      periods: this.periods,
      warnings: st.diagnostics.list.filter((d) => d.severity === 'warning'),
    };
    if (this.title) {
      model.title = this.title.text;
      model.titleAst = this.title.id;
    } else if (pre.frontMatter?.title !== undefined) model.title = pre.frontMatter.title;
    const ast: TimelineDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.c.tokens, this.options);
  }

  // ---- tokens -------------------------------------------------------------------------

  /** A token's text as v12's parser read it (removed spans cut, entities decoded). */
  private raw(j = this.c.pos): string {
    const t = this.c.tokens;
    return cook(this.src, t.start[j] ?? 0, t.end[j] ?? 0, this.view);
  }

  private range(j: number): Range {
    const t = this.c.tokens;
    return { start: t.start[j] ?? 0, end: t.end[j] ?? 0 };
  }

  private add(node: TimelineStatementNode, kind: string): void {
    this.st.statement(kind, node.range);
    this.children.push(node);
  }

  private statementId(): string {
    return this.st.ids.statement('st');
  }

  // ---- errors and recovery ------------------------------------------------------------

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the current token. */
  private found(): string {
    const k = this.c.kind;
    if (k === Kind.EOF || k === T.Eof) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    const t = this.raw().trim();
    return t.length > 24 ? `\`${t.slice(0, 24)}…\`` : `\`${t}\``;
  }

  /** Report what was found where `names` were expected, then stop the statement. */
  private fail(names: string[], hint?: string, at: Range = this.c.range): never {
    const d = this.st.diagnostics.unexpected('UNEXPECTED', at, names, this.found());
    if (hint) d.message = `${d.message.slice(0, -1)}; ${hint}.`;
    throw STOP;
  }

  /**
   * Skip to the next statement after an error (R-PARSE-4): the next line, a line break or the
   * end. A token on a later line counts as a line start, since jison's `\s+` takes the line
   * breaks that follow blanks.
   */
  private recover(): void {
    const { c, src } = this;
    c.recovering();
    for (;;) {
      const k = c.kind;
      if (k === Kind.EOF || k === T.Eof || k === Kind.Newline) return;
      const end = c.end;
      c.next();
      for (let i = end; i < c.start; i++) {
        const ch = src.charCodeAt(i);
        if (ch === LF || ch === CR) return;
      }
    }
  }

  /** Run one statement rule; on failure, skip to the next statement. */
  private statement(rule: () => void): void {
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover();
    }
  }

  // ---- grammar ------------------------------------------------------------------------

  /** `timeline_header`: `timeline`, `timeline LR` or `timeline TD`. Without it the rest is still read. */
  private header(): void {
    this.statement(() => {
      const { c } = this;
      const k = c.kind;
      if (!HEADERS.includes(k)) this.fail(HEADER, HEADER_HINT);
      this.direction = DIRECTION[k] ?? 'LR';
      const j = c.next();
      this.add(
        { id: this.statementId(), type: 'Header', range: this.range(j), direction: this.direction },
        'header'
      );
    });
  }

  /** `document EOF`: statements and line breaks up to jison's `EOF` token. */
  private document(): void {
    const { c } = this;
    for (;;) {
      const k = c.kind;
      if (k === Kind.EOF) break;
      if (k === T.Eof) return;
      if (k === Kind.Newline) {
        c.next();
        continue;
      }
      this.statement(() => this.line());
    }
    if (!this.endReported) this.endsInValue();
  }

  /**
   * The text ended inside an accessibility value, so jison's lexer returned no `EOF`, and no
   * statement reported it (recovery skipped the value): report it at its keyword.
   */
  private endsInValue(): void {
    const t = this.c.tokens;
    for (let j = t.length - 1; j >= 0; j--) {
      const k = t.kind[j] ?? 0;
      if (k === T.AccDescrMultiline) return this.unclosedDescription(t.start[j] ?? 0);
      if (k === T.AccTitle || k === T.AccDescr) return this.emptyValueAtEnd(k, this.range(j));
    }
  }

  /** `accTitle:` or `accDescr:` with nothing after it at the very end. */
  private emptyValueAtEnd(k: number, at: Range): void {
    this.endReported = true;
    const word = k === T.AccTitle ? 'accTitle' : 'accDescr';
    const d = this.st.diagnostics.unexpected('UNEXPECTED', at, TEXT, 'the end of the text');
    d.message = `${d.message.slice(0, -1)}; write it as \`${word}: <text>\`.`;
  }

  /** `accDescr {` with no `}` after it: the description runs to the end of the text. */
  private unclosedDescription(at: number): void {
    this.endReported = true;
    this.st.diagnostics.error(
      'UNCLOSED_DESCRIPTION',
      `Unclosed description: the \`accDescr {\` at line ${this.lineOf(at)} has no closing \`}\`. Add \`}\` after the description.`,
      { start: at, end: Math.min(this.src.length, at + 'accDescr'.length) }
    );
  }

  /** jison `statement`. */
  private line(): void {
    const k = this.c.kind;
    if (k === T.Period) this.period();
    else if (k === T.Event) this.event();
    else if (k === T.Section) this.section();
    else if (k === T.Title) this.titleStatement();
    else if (k === T.AccTitle || k === T.AccDescr) this.accStatement(k);
    else if (k === T.AccDescrMultilineValue) this.multilineDescription();
    else if (HEADERS.includes(k))
      this.fail(STATEMENT, '`timeline` starts the diagram and comes only once');
    else this.fail(STATEMENT, k === T.Invalid ? EVENT_HINT : undefined);
  }

  /** `period`: v12 `addTask($1, 0, '')`. */
  private period(): void {
    const j = this.c.next();
    const n = this.periods.length + 1;
    const text = this.raw(j);
    const section = this.sections.length - 1;
    const period: OpenPeriod = {
      ast: `per:${n}`,
      text,
      ...(section >= 0 ? { section } : {}),
      events: [],
    };
    this.periods.push(period);
    this.add({ id: period.ast, type: 'Period', range: this.range(j), text }, 'period');
  }

  /** `event`: v12 `addEvent($1.substr(2))`, to the last period. */
  private event(): void {
    const j = this.c.next();
    const text = this.raw(j).slice(EVENT_PREFIX);
    const range = this.range(j);
    const p = this.periods.length - 1;
    const period = this.periods[p];
    const node: TimelineEventNode = { id: '', type: 'Event', range, text };
    if (period) {
      node.id = `ev:${p + 1}.${period.events.length + 1}`;
      node.period = p;
      period.events.push({ ast: node.id, text });
    } else {
      // v12's DB threw a TypeError here; the statement still stands in the AST.
      node.id = this.statementId();
      const last = this.children[this.children.length - 1];
      const bare =
        last?.type === 'Section' && /^section[\n\r]/i.test(this.src.slice(last.range.start));
      this.st.diagnostics.error(
        'TIMELINE_EVENT_BEFORE_PERIOD',
        `${EVENT_BEFORE_PERIOD}${bare ? BARE_SECTION : ''}.`,
        range
      );
    }
    this.add(node, 'event');
  }

  /** `section`: v12 `addSection($1.substr(8))`. */
  private section(): void {
    const j = this.c.next();
    const n = this.sections.length + 1;
    const text = this.raw(j).slice(SECTION_PREFIX);
    this.sections.push({ ast: `sec:${n}`, text });
    this.add({ id: `sec:${n}`, type: 'Section', range: this.range(j), text }, 'section');
  }

  /** `title`: v12 `setDiagramTitle($1.substr(6))`; the last one wins. */
  private titleStatement(): void {
    const j = this.c.next();
    const node: TimelineTextStatementNode = {
      id: this.statementId(),
      type: 'Title',
      range: this.range(j),
      text: this.raw(j).slice(TITLE_PREFIX),
    };
    this.title = node;
    this.add(node, 'title');
  }

  /** `acc_title acc_title_value` or `acc_descr acc_descr_value`, trimmed. */
  private accStatement(k: number): void {
    const { c } = this;
    const first = c.next();
    // The value always follows: its rule matches the empty rest of a line too.
    const value = c.next();
    if (c.kind === Kind.EOF) {
      // Nothing after `accTitle:` at the very end: jison's lexer returned no `EOF` after it.
      this.emptyValueAtEnd(k, this.range(first));
      throw STOP;
    }
    const title = k === T.AccTitle;
    const text = description(this.raw(value).trim(), title);
    const node: TimelineTextStatementNode = {
      id: this.statementId(),
      type: title ? 'AccTitle' : 'AccDescr',
      range: { start: this.range(first).start, end: this.range(value).end },
      text,
    };
    if (title) this.accTitle = text;
    else this.accDescr = text;
    this.add(node, title ? 'accTitle' : 'accDescr');
  }

  /** `accDescr { … }`: the text up to `}`, trimmed; `accDescr {` and `}` join its range. */
  private multilineDescription(): void {
    const { c } = this;
    const t = c.tokens;
    const j = c.next();
    const range = this.range(j);
    for (let o = j - 1; o >= 0; o--) {
      const k = t.kind[o] ?? 0;
      if (k === T.AccDescrMultiline) range.start = t.start[o] ?? range.start;
      if (COMMENTS[k] !== 1) break;
    }
    let closed = false;
    for (let o = j + 1; o < t.length; o++) {
      const k = t.kind[o] ?? 0;
      if (k === T.AccDescrMultilineEnd) {
        range.end = t.end[o] ?? range.end;
        closed = true;
      }
      if (COMMENTS[k] !== 1) break;
    }
    if (!closed) {
      this.unclosedDescription(range.start);
      throw STOP;
    }
    const text = description(this.raw(j).trim(), false);
    this.accDescr = text;
    this.add({ id: this.statementId(), type: 'AccDescr', range, text }, 'accDescr');
  }
}

/** v12's common DB: `setAccDescription` folds the blanks after each line break. */
function description(text: string, title: boolean): string {
  return title ? text : text.replace(/\n\s+/g, '\n');
}
