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
  Probe,
  ProbeCursor,
  sourceView,
  TokenCursor,
} from '@mermaid-js/core/parser-kit';
import type {
  ParseOptions,
  ParseResult,
  Range,
  SourceView,
  StatementSpan,
} from '@mermaid-js/core/parser-kit';
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

/**
 * Comments: trivia here. `accDescr {` and its `}` are read (jison returns no token for them),
 * so an empty `accDescr {}` is a statement of its own; `grammar/timeline.ebnf` names them too.
 */
const SKIPPED = kindSet(Kind.Comment, Kind.Directive, Kind.Space);

// What the parser accepts at its decision points, for the probe (R-LANG-7, D95). Constants,
// so a parse without a probe allocates nothing for them.
/** What may start a statement. */
const STATEMENT_KINDS = [
  T.Period,
  T.Event,
  T.Section,
  T.Title,
  T.AccTitle,
  T.AccDescr,
  T.AccDescrMultiline,
];
/** After `timeline` on its line: the direction words that make it `timeline LR`/`TD`. */
const DIRECTIONS = [T.TimelineLR, T.TimelineTD];
/**
 * Kinds a probe's cursor follows rather than extends when the token ends at the offset:
 * punctuation (the `}` closing `accDescr {`, a `:` that starts no event).
 */
const PROBE_FOLLOWS = kindSet(T.AccDescrMultilineEnd, T.Invalid);

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
  /** Probe mode only (R-LANG-7). */
  private readonly probe: Probe | undefined;
  private readonly children: TimelineStatementNode[] = [];
  private readonly sections: TimelineSection[] = [];
  private readonly periods: OpenPeriod[] = [];
  private direction: TimelineDirection = 'LR';
  private title: string | undefined;
  private accTitle = '';
  private accDescr = '';
  /** An error at the end of the text was reported (the text ends inside a value). */
  private endReported = false;
  /** A header was read; a missing one was reported once, so a later one is the header. */
  private headerSeen = false;
  private lines: LineIndex | undefined;
  /** The open section's statement span: the statements after it nest in it (folding, D259). */
  private openSection: StatementSpan | undefined;

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
    if (options.probe === undefined) {
      this.c = new TokenCursor(lex(src, pre.bodyStart, this.view), SKIPPED);
      return;
    }
    const probe = (this.probe = new Probe(src, options.probe, PROBE_FOLLOWS));
    if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
    // The cursor marks an offset inside a comment or directive as outside code.
    this.c = new ProbeCursor(lex(src, pre.bodyStart, this.view, probe), probe, SKIPPED);
  }

  parse(): TimelineParseResult {
    this.header();
    this.document();
    this.closeSection(this.src.length);
    const { st, pre, src } = this;
    const model: { -readonly [K in keyof TimelineModel]: TimelineModel[K] } = {
      direction: this.direction,
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      sections: this.sections,
      periods: this.periods,
      warnings: st.diagnostics.list.filter((d) => d.severity === 'warning'),
    };
    // A non-empty in-text title wins (D218); a blank one falls back to the front matter's.
    const text = this.title;
    const front = pre.frontMatter?.title;
    if (text !== undefined && (text.trim() !== '' || front === undefined)) model.title = text;
    else if (front !== undefined) model.title = front;
    const ast: TimelineDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.c.tokens, this.options, this.probe);
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
    // One line of it: a bare `title` or `section` takes the next line, `: ` may end a line.
    const t = this.raw().trim();
    const line = /^[^\n\r]*/.exec(t)?.[0] ?? '';
    const cut = line.length > 24 ? line.slice(0, 24) : line;
    return cut.length < t.length ? `\`${cut}…\`` : `\`${t}\``;
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
   * breaks that follow blanks; so does the token after one that runs over a line break (`::`
   * at a line end: the last `:` and the line break start an event).
   */
  private recover(): void {
    const { c } = this;
    c.recovering();
    for (;;) {
      const k = c.kind;
      if (k === Kind.EOF || k === T.Eof || k === Kind.Newline) return;
      const start = c.start;
      c.next();
      if (this.breaksIn(start, c.start)) return;
    }
  }

  /** Whether the source has a line break in `[from, to)`. */
  private breaksIn(from: number, to: number): boolean {
    for (let i = from; i < to; i++) {
      const ch = this.src.charCodeAt(i);
      if (ch === LF || ch === CR) return true;
    }
    return false;
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
      c.tested(HEADERS);
      if (!HEADERS.includes(c.kind)) this.fail(HEADER, HEADER_HINT);
      this.takeHeader();
    });
  }

  private takeHeader(): void {
    const { c } = this;
    this.headerSeen = true;
    const plain = c.kind === T.Timeline;
    this.direction = DIRECTION[c.kind] ?? 'LR';
    const j = c.next();
    // `timeline LR` is one token: on the line of a bare `timeline`, a word may still make it one.
    const probe = this.probe;
    if (plain && probe && !this.breaksIn(c.tokens.end[j] ?? 0, Math.min(c.start, probe.offset)))
      c.tested(DIRECTIONS);
    this.add(
      { id: this.statementId(), type: 'Header', range: this.range(j), direction: this.direction },
      'header'
    );
  }

  /** `document EOF`: statements and line breaks up to jison's `EOF` token. */
  private document(): void {
    const { c } = this;
    for (;;) {
      const k = c.kind;
      c.tested(this.headerSeen ? STATEMENT_KINDS : HEADERS);
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
   * statement reported it (recovery skipped the value): report it after its keyword.
   */
  private endsInValue(): void {
    const t = this.c.tokens;
    for (let j = t.length - 1; j >= 0; j--) {
      const k = t.kind[j] ?? 0;
      if (k === T.AccDescrMultiline) return this.unclosedDescription(t.start[j] ?? 0);
      if (k === T.AccTitle || k === T.AccDescr) return this.emptyValueAtEnd(k, this.range(j));
    }
  }

  /**
   * `accTitle:` or `accDescr:` with nothing after it at the very end. Reported where the text
   * belongs: after the keyword and the blanks on its line (the keyword took the line breaks
   * after them too), so a just-completed `accTitle: ` is the statement still to be written.
   */
  private emptyValueAtEnd(k: number, keyword: Range): void {
    this.endReported = true;
    const word = k === T.AccTitle ? 'accTitle' : 'accDescr';
    let p = keyword.start;
    while (p < keyword.end && !this.breaksIn(p, p + 1)) p++;
    const at = { start: p, end: p };
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
    else if (k === T.AccDescrMultiline) this.multilineDescription();
    else if (k === T.AccDescrMultilineValue || k === T.AccDescrMultilineEnd) {
      // The rest of an `accDescr { … }` whose opener recovery skipped: already reported.
      this.c.next();
    } else if (HEADERS.includes(k)) {
      // The missing header was reported; one error, one diagnostic.
      if (!this.headerSeen) this.takeHeader();
      else this.fail(STATEMENT, '`timeline` starts the diagram and comes only once');
    } else this.fail(STATEMENT, k === T.Invalid ? EVENT_HINT : undefined);
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

  /**
   * `section`: v12 `addSection($1.substr(8))`. Its statement span is a block holding every
   * statement up to the next section, so it folds to the line before it (D259; the AST stays
   * flat).
   */
  private section(): void {
    const j = this.c.next();
    const n = this.sections.length + 1;
    const text = this.raw(j).slice(SECTION_PREFIX);
    const range = this.range(j);
    this.closeSection(range.start, true);
    this.sections.push({ ast: `sec:${n}`, text });
    this.children.push({ id: `sec:${n}`, type: 'Section', range, text });
    this.openSection = this.st.beginStatement('section', range.start);
    this.openSection.range.end = range.end;
  }

  /**
   * End the open section's span at the start of the line holding `at`, the next `section` (D259:
   * it folds to the line before the next; blank and comment lines included), or at `at`, the
   * end of the text; never before its own token.
   */
  private closeSection(at: number, next = false): void {
    const span = this.openSection;
    if (!span) return;
    this.openSection = undefined;
    let end = at;
    if (next) while (end > span.range.end && !this.breaksIn(end - 1, end)) end--;
    this.st.endStatement(span, Math.max(end, span.range.end));
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
    this.title = node.text;
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

  /**
   * `accDescr { … }`: the text up to `}`, trimmed. `accDescr {}` sets nothing (jison returned
   * no token at all), but is a statement of its own.
   */
  private multilineDescription(): void {
    const { c } = this;
    const open = c.next();
    let text: string | undefined;
    if (c.kind === T.AccDescrMultilineValue) {
      const value = c.next();
      if (c.kind !== T.AccDescrMultilineEnd) {
        this.unclosedDescription(this.range(open).start);
        throw STOP;
      }
      text = description(this.raw(value).trim(), false);
    }
    // The lexer writes a `}` or a value after every `accDescr {`.
    const close = c.next();
    if (text !== undefined) this.accDescr = text;
    this.add(
      {
        id: this.statementId(),
        type: 'AccDescr',
        range: { start: this.range(open).start, end: this.range(close).end },
        text: text ?? '',
      },
      'accDescr'
    );
  }
}

/** v12's common DB: `setAccDescription` folds the blanks after each line break. */
function description(text: string, title: boolean): string {
  return title ? text : text.replace(/\n\s+/g, '\n');
}
