// cspell:words LALR
/**
 * Gantt parser: recursive descent over the {@link lex} tokens (gated against v12's jison lexer,
 * #377), producing a {@link GanttModel}, the typed AST, statement spans and diagnostics
 * (DESIGN §4.3).
 *
 * The grammar is v12's `gantt.jison` (LALR), ported rule for rule; `grammar/gantt.ebnf` is the
 * normative form. Statements need no separator: every statement starts with its own token, and
 * jison's `NL` is only skipped (its `\s+` rule takes the line breaks after blanks anyway). The
 * parser reads the tokens jison returned plus the openers and closers of its start conditions
 * (`click `, `href "`, `call `, `(`, `)`, `accDescr {`, `}`), for which jison returns none.
 * Values are what v12's DB stored (`model.ts`); nothing is scheduled (D274).
 *
 * jison rejects: a first token that is not `gantt`, a second `gantt`, a task text with no data
 * after it, data with no task text, a `click` with neither `href` nor `call`, an ISO date or
 * `accDescription` where a statement starts, `%%{` with no directive name, and a text that ends
 * inside a value (an unclosed `accDescr {`, link or call). v12's DB adds task data that is only
 * tags (a `TypeError` in `addTask`); its `topAxis` statement threw too, which v13 accepts
 * (D273). Unlike jison the parser does not stop at the first error: it reports it, skips to the
 * next line and carries on (R-PARSE-4).
 */
import {
  cook,
  CR,
  Kind,
  kindSet,
  LF,
  LineIndex,
  ParseState,
  significantTokens,
  skipTo,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type {
  AstId,
  ParseOptions,
  ParseResult,
  Range,
  SourceView,
  StatementSpan,
  TokenView,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type {
  GanttCall,
  GanttClick,
  GanttModel,
  GanttSection,
  GanttTag,
  GanttTask,
  GanttWeekday,
  GanttWeekend,
} from '../model.ts';
import type {
  GanttDocument,
  GanttSettingName,
  GanttStatementNode,
  GanttTaskNode,
  GanttTextStatementNode,
} from './ast.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

export interface GanttParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
}

export type GanttParseResult = ParseResult<GanttModel, GanttDocument>;

/** Comments, directives and dropped `;`: trivia here. */
const SKIPPED = kindSet(Kind.Comment, Kind.Directive, Kind.Space);
/** Where recovery stops: a line break, jison's `EOF`, the end. */
const LINE_END = kindSet(Kind.Newline, T.Eof, Kind.EOF);
/**
 * Tokens that continue a statement on a later line (the values and closers of jison's start
 * conditions): recovery does not take them for the start of the next statement.
 */
const CONTINUES = kindSet(
  T.AccTitleValue,
  T.AccDescrValue,
  T.AccDescrMultilineValue,
  T.AccDescrMultilineEnd,
  T.ClickId,
  T.ClickEnd,
  T.Href,
  T.HrefEnd,
  T.CallbackName,
  T.CallbackEmptyArgs,
  T.CallbackArgsOpen,
  T.CallbackArgs,
  T.CallbackArgsClose,
  Kind.Error
);

/** Settings whose value is the text after the keyword: the prefix v12 cut (`$1.substr(n)`). */
const VALUE_SETTINGS: Readonly<Record<number, readonly [GanttSettingName, number]>> = {
  [T.DateFormat]: ['dateFormat', 11],
  [T.AxisFormat]: ['axisFormat', 11],
  [T.TickInterval]: ['tickInterval', 13],
  [T.Includes]: ['includes', 9],
  [T.Excludes]: ['excludes', 9],
  [T.TodayMarker]: ['todayMarker', 12],
};
const WEEKDAY: Readonly<Record<number, GanttWeekday>> = {
  [T.WeekdayMonday]: 'monday',
  [T.WeekdayTuesday]: 'tuesday',
  [T.WeekdayWednesday]: 'wednesday',
  [T.WeekdayThursday]: 'thursday',
  [T.WeekdayFriday]: 'friday',
  [T.WeekdaySaturday]: 'saturday',
  [T.WeekdaySunday]: 'sunday',
};
const WEEKEND: Readonly<Record<number, GanttWeekend>> = {
  [T.WeekendFriday]: 'friday',
  [T.WeekendSaturday]: 'saturday',
};
/** v12's `tags`, in the order `getTaskTags` tries them. */
const TAGS: readonly GanttTag[] = ['active', 'done', 'crit', 'milestone', 'vert'];
const TAG_PATTERNS = TAGS.map((t) => new RegExp(`^\\s*${t}\\s*$`));

const TITLE_PREFIX = 'title '.length;
const SECTION_PREFIX = 'section '.length;

const HEADER = ['`gantt`'];
const STATEMENT = [
  'a task such as `Design :a1, 2024-01-01, 3d`',
  'a section such as `section Planning`',
  'a setting such as `dateFormat YYYY-MM-DD`',
  'a statement such as `title` or `click`',
];
const TASK_DATA = ['task data such as `:3d` or `:a1, 2024-01-01, 3d`'];
const CLICK_ACTION = ['a link such as `href "https://…"`', 'a callback such as `call show()`'];
const CLICK_IDS = ['task ids such as `a1,a2`'];
const LINK = ['a link between the quotes'];
const FUNCTION = ['a function name'];

const HEADER_HINT = 'a gantt chart starts with `gantt`';
const TASK_HINT = 'a task is its text, `:` and its data, e.g. `Design :a1, 2024-01-01, 3d`';
const DATA_HINT = 'task data comes after the task text, e.g. `Design :3d`';
const DATE_HINT = 'a task text cannot start with a date such as `2024-01-01`';
const ACC_DESCRIPTION_HINT = 'write an accessible description as `accDescr: <text>`';
const DIRECTIVE_HINT = 'a directive is written `%%{init: {…}}%%`';
const CLICK_HINT = 'write `click <ids> href "<url>"` or `click <ids> call <function>()`';
const LINK_HINT = 'a link is written `href "<url>"` after `click <ids>`';
const CALL_HINT = 'a callback is written `call <function>()` after `click <ids>`';

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
class Stop extends Error {}
const STOP = new Stop();

/** Parse a gantt diagram. Never throws: problems are error diagnostics. */
export function parseGantt(src: string, options: GanttParseOptions = {}): GanttParseResult {
  return new GanttParser(src, options).parse();
}

/** The mutable model while it is read. */
interface Draft {
  title?: string;
  titleAst?: AstId;
  accTitle: string;
  accDescr: string;
  dateFormat: string;
  axisFormat: string;
  tickInterval?: string;
  todayMarker: string;
  includes: string[];
  excludes: string[];
  /** The tokens of {@link Draft.includes} and {@link Draft.excludes}, to merge in linear time. */
  seen: { includes: Set<string>; excludes: Set<string> };
  inclusiveEndDates: boolean;
  topAxis: boolean;
  weekday?: GanttWeekday;
  weekend: GanttWeekend;
}

/**
 * One parse. Each grammar rule is a method; a rule that fails records a diagnostic and throws
 * {@link STOP}, and the statement loop recovers.
 */
class GanttParser {
  private readonly pre: PreprocessResult;
  private readonly view: SourceView;
  private readonly st = new ParseState();
  /** The significant tokens (trivia left out), and the read position in them. */
  private readonly t: TokenView;
  private i = 0;
  private readonly stream: ReturnType<typeof lex>;
  private readonly children: GanttStatementNode[] = [];
  private readonly sections: GanttSection[] = [];
  private readonly tasks: GanttTask[] = [];
  private readonly clicks: GanttClick[] = [];
  private readonly draft: Draft = {
    accTitle: '',
    accDescr: '',
    dateFormat: '',
    axisFormat: '',
    todayMarker: '',
    includes: [],
    excludes: [],
    seen: { includes: new Set(), excludes: new Set() },
    inclusiveEndDates: false,
    topAxis: false,
    weekend: 'saturday',
  };
  /** v12 `taskCnt`: the tasks given an id `task<n>`. */
  private autoIds = 0;
  /** Tasks per id, for `t:<id>@n`. */
  private readonly taskIds = new Map<string, number>();
  /** An error at the end of the text was reported (the text ends inside a value). */
  private endReported = false;
  /** A header was read; a missing one was reported once, so a later one is the header. */
  private headerSeen = false;
  /** jison's `EOF` token was read (the text did not end inside a value). */
  private eofSeen = false;
  private lines: LineIndex | undefined;
  /** The open section's statement span: the statements after it nest in it (folding, D259). */
  private openSection: StatementSpan | undefined;
  /** The first token of the statement being read. */
  private statementStart = 0;

  constructor(
    private readonly src: string,
    private readonly options: GanttParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.stream = lex(src, pre.bodyStart, this.view);
    this.t = significantTokens(this.stream, SKIPPED);
  }

  parse(): GanttParseResult {
    this.header();
    this.document();
    this.closeSection(this.src.length);
    const { st, pre, src, draft } = this;
    const model: { -readonly [K in keyof GanttModel]: GanttModel[K] } = {
      source: src,
      accTitle: draft.accTitle,
      accDescr: draft.accDescr,
      dateFormat: draft.dateFormat,
      axisFormat: draft.axisFormat,
      todayMarker: draft.todayMarker,
      includes: draft.includes,
      excludes: draft.excludes,
      inclusiveEndDates: draft.inclusiveEndDates,
      topAxis: draft.topAxis,
      weekend: draft.weekend,
      sections: this.sections,
      tasks: this.tasks,
      clicks: this.clicks,
      warnings: st.diagnostics.list.filter((d) => d.severity === 'warning'),
    };
    if (draft.tickInterval !== undefined) model.tickInterval = draft.tickInterval;
    if (draft.weekday !== undefined) model.weekday = draft.weekday;
    // v12 set the front-matter title before parsing, so an in-text one replaces it (D218).
    const title = draft.title ?? (pre.frontMatter?.title || undefined);
    if (title !== undefined) model.title = title;
    if (draft.titleAst !== undefined) model.titleAst = draft.titleAst;
    const ast: GanttDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.stream, this.options);
  }

  // ---- tokens -------------------------------------------------------------------------

  private kind(j = this.i): number {
    return this.t.kind[j] ?? Kind.EOF;
  }

  /** Move to the next token (stays on the last). Returns the index moved from. */
  private next(): number {
    const j = this.i;
    if (j < this.t.length - 1) this.i++;
    return j;
  }

  /** A token's text as v12's parser read it (removed spans cut, entities decoded). */
  private raw(j = this.i): string {
    return cook(this.src, this.t.start[j] ?? 0, this.t.end[j] ?? 0, this.view);
  }

  private range(j = this.i): Range {
    return { start: this.t.start[j] ?? 0, end: this.t.end[j] ?? 0 };
  }

  private span(from: number, to: number): Range {
    return { start: this.t.start[from] ?? 0, end: this.t.end[to] ?? 0 };
  }

  private add(node: GanttStatementNode, kind: string): void {
    this.st.statement(kind, node.range);
    this.children.push(node);
  }

  private statementId(): AstId {
    return this.st.ids.statement('st');
  }

  // ---- errors and recovery ------------------------------------------------------------

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the current token. */
  private found(): string {
    const k = this.kind();
    if (k === Kind.EOF || k === T.Eof) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    // One line of it: a bare `title` or `section` takes the next line.
    const text = this.raw().trim();
    if (text === '') return 'the end of the text';
    const line = /^[^\n\r]*/.exec(text)?.[0] ?? '';
    const cut = line.length > 24 ? line.slice(0, 24) : line;
    return cut.length < text.length ? `\`${cut}…\`` : `\`${text}\``;
  }

  /** Report what was found where `names` were expected, then stop the statement. */
  private fail(names: string[], hint?: string, at: Range = this.range()): never {
    const d = this.st.diagnostics.unexpected('UNEXPECTED', at, names, this.found());
    if (hint) d.message = `${d.message.slice(0, -1)}; ${hint}.`;
    if (this.kind() === Kind.EOF) this.endReported = true;
    throw STOP;
  }

  /** Whether the source has a line break in `[from, to)`. */
  private breaksIn(from: number, to: number): boolean {
    for (let p = from; p < to; p++) {
      const ch = this.src.charCodeAt(p);
      if (ch === LF || ch === CR) return true;
    }
    return false;
  }

  /** Whether the token at `j` starts a line: a line break lies between `from` and it. */
  private startsLine(from: number, j: number): boolean {
    return CONTINUES[this.kind(j)] !== 1 && this.breaksIn(from, this.t.start[j] ?? 0);
  }

  /**
   * Skip to the next statement after an error (R-PARSE-4): a line break, jison's `EOF`, the end,
   * or a token on a later line (jison's `\s+` takes the line breaks after blanks, and a `click`
   * takes the line break after its ids). A failing token on a later line than its statement's
   * first token starts the next statement itself; the values of a start condition never do.
   */
  private recover(): void {
    const first = this.statementStart;
    if (this.i > first && this.startsLine(this.t.start[first] ?? 0, this.i)) return;
    const end = skipTo(this.t, this.i, LINE_END);
    if (end === this.i) return;
    // Stop early at a token on a later line than the one before it.
    let k = this.i + 1;
    while (k < end && !this.startsLine(this.t.start[k - 1] ?? 0, k)) k++;
    this.i = Math.min(k, this.t.length - 1);
  }

  /** Run one statement rule; on failure, skip to the next statement. */
  private statement(rule: () => void): void {
    this.statementStart = this.i;
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover();
    }
  }

  // ---- grammar ------------------------------------------------------------------------

  /** `gantt`. Without it the rest is still read. */
  private header(): void {
    this.statement(() => {
      if (this.kind() !== T.Gantt) this.fail(HEADER, HEADER_HINT);
      this.takeHeader();
    });
  }

  private takeHeader(): void {
    this.headerSeen = true;
    const j = this.next();
    this.add({ id: this.statementId(), type: 'Header', range: this.range(j) }, 'header');
  }

  /** `document EOF`: lines up to jison's `EOF` token. */
  private document(): void {
    for (;;) {
      const k = this.kind();
      if (k === Kind.EOF) break;
      if (k === T.Eof) {
        this.eofSeen = true;
        this.next();
        continue;
      }
      if (k === Kind.Newline) {
        this.next();
        continue;
      }
      this.statement(() => this.line());
    }
    if (!this.eofSeen && !this.endReported) this.endsInValue();
  }

  /** jison `statement`. */
  private line(): void {
    const k = this.kind();
    const setting = VALUE_SETTINGS[k];
    if (setting) this.valueSetting(setting[0], setting[1]);
    else if (k === T.TaskText) this.task();
    else if (k === T.Section) this.section();
    else if (k === T.ClickKeyword) this.click();
    else if (k === T.Title) this.titleStatement();
    else if (k === T.AccTitle || k === T.AccDescr) this.accStatement(k);
    else if (k === T.AccDescrMultiline) this.multilineDescription();
    else if (k === T.InclusiveEndDates || k === T.TopAxis) this.flagSetting(k);
    else if (WEEKDAY[k] !== undefined || WEEKEND[k] !== undefined) this.weekSetting(k);
    else if (k === T.Gantt) {
      // The missing header was reported; one error, one diagnostic.
      if (!this.headerSeen) this.takeHeader();
      else this.fail(STATEMENT, '`gantt` starts the chart and comes only once');
    } else if (k === T.OpenDirective) this.openDirective();
    else if (CONTINUES[k] === 1) {
      // The rest of a value whose opener recovery skipped: already reported.
      this.next();
    } else this.fail(STATEMENT, this.hintFor(k));
  }

  private hintFor(k: number): string | undefined {
    if (k === T.TaskData || k === T.Colon) return DATA_HINT;
    if (k === T.Date) return DATE_HINT;
    if (k === T.AccDescription) return ACC_DESCRIPTION_HINT;
    if (k === T.HrefKeyword) return LINK_HINT;
    if (k === T.CallKeyword) return CALL_HINT;
    return undefined;
  }

  /**
   * `%%{` where no directive starts: jison's first rule begins a start condition the grammar
   * never declares, and its lexer throws on the next token. Reported over `%%{` and the rest of
   * its line.
   */
  private openDirective(): void {
    const j = this.next();
    let end = this.t.end[j] ?? 0;
    if (this.kind() === Kind.Error) end = Math.max(end, this.t.end[this.next()] ?? 0);
    this.st.diagnostics.error(
      'UNEXPECTED',
      `Unexpected \`%%{\` at line ${this.lineOf(this.t.start[j] ?? 0)}: ${DIRECTIVE_HINT}, and a comment \`%% …\`.`,
      { start: this.t.start[j] ?? 0, end }
    );
    throw STOP;
  }

  /** `dateFormat`, `axisFormat`, `tickInterval`, `includes`, `excludes`, `todayMarker`. */
  private valueSetting(setting: GanttSettingName, prefix: number): void {
    const j = this.next();
    const value = this.raw(j).slice(prefix);
    const d = this.draft;
    if (setting === 'dateFormat') d.dateFormat = value;
    else if (setting === 'axisFormat') d.axisFormat = value;
    else if (setting === 'tickInterval') d.tickInterval = value;
    else if (setting === 'todayMarker') d.todayMarker = value;
    else if (setting === 'includes') mergeTokens(d.includes, d.seen.includes, value);
    else mergeTokens(d.excludes, d.seen.excludes, value);
    this.add(
      { id: this.statementId(), type: 'Setting', range: this.range(j), setting, value },
      setting
    );
  }

  /** `inclusiveEndDates`; `topAxis` (D273: v12's grammar called a DB function it lacked). */
  private flagSetting(k: number): void {
    const j = this.next();
    const setting = k === T.TopAxis ? 'topAxis' : 'inclusiveEndDates';
    if (setting === 'topAxis') this.draft.topAxis = true;
    else this.draft.inclusiveEndDates = true;
    this.add(
      { id: this.statementId(), type: 'Setting', range: this.range(j), setting, value: '' },
      setting
    );
  }

  /** `weekday <day>`, `weekend friday|saturday`. */
  private weekSetting(k: number): void {
    const j = this.next();
    const day = WEEKDAY[k];
    const setting = day ? 'weekday' : 'weekend';
    const value = day ?? WEEKEND[k] ?? 'saturday';
    if (day) this.draft.weekday = day;
    else this.draft.weekend = value as GanttWeekend;
    this.add(
      { id: this.statementId(), type: 'Setting', range: this.range(j), setting, value },
      setting
    );
  }

  /** `title`: v12 `setDiagramTitle($1.substr(6))`; the last one wins. */
  private titleStatement(): void {
    const j = this.next();
    const node: GanttTextStatementNode = {
      id: this.statementId(),
      type: 'Title',
      range: this.range(j),
      text: this.raw(j).slice(TITLE_PREFIX),
    };
    this.draft.title = node.text;
    this.draft.titleAst = node.id;
    this.add(node, 'title');
  }

  /** `acc_title acc_title_value` or `acc_descr acc_descr_value`, trimmed. */
  private accStatement(k: number): void {
    const first = this.next();
    // The value always follows: its rule matches the empty rest of a line too.
    const value = this.next();
    if (this.kind() === Kind.EOF) {
      // Nothing after `accTitle:` at the very end: jison's lexer returned no `EOF` after it.
      this.emptyValueAtEnd(k, this.range(first));
      throw STOP;
    }
    const title = k === T.AccTitle;
    const text = description(this.raw(value).trim(), title);
    if (title) this.draft.accTitle = text;
    else this.draft.accDescr = text;
    this.add(
      {
        id: this.statementId(),
        type: title ? 'AccTitle' : 'AccDescr',
        range: this.span(first, value),
        text,
      },
      title ? 'accTitle' : 'accDescr'
    );
  }

  /**
   * `accDescr { … }`: the text up to `}`, trimmed. `accDescr {}` sets nothing (jison returned
   * no token at all), but is a statement of its own.
   */
  private multilineDescription(): void {
    const open = this.next();
    let text: string | undefined;
    if (this.kind() === T.AccDescrMultilineValue) {
      const value = this.next();
      if (this.kind() !== T.AccDescrMultilineEnd) {
        this.unclosed('UNCLOSED_DESCRIPTION', 'description', 'accDescr {', '}', open);
      }
      text = description(this.raw(value).trim(), false);
    }
    // The lexer writes a `}` or a value after every `accDescr {`.
    const close = this.next();
    if (text !== undefined) this.draft.accDescr = text;
    this.add(
      { id: this.statementId(), type: 'AccDescr', range: this.span(open, close), text: text ?? '' },
      'accDescr'
    );
  }

  /**
   * `section`: v12 `addSection($1.substr(8))`. Its statement span is a block holding every
   * statement up to the next section, so it folds to the line before it (D259; the AST stays
   * flat).
   */
  private section(): void {
    const j = this.next();
    const text = this.raw(j).slice(SECTION_PREFIX);
    const range = this.range(j);
    this.closeSection(range.start, true);
    const ast = this.st.ids.subgraph(text.trim());
    this.sections.push({ ast, text });
    this.children.push({ id: ast, type: 'Section', range, text });
    this.openSection = this.st.beginStatement('section', range.start);
    this.openSection.range.end = range.end;
  }

  /**
   * End the open section's span at the start of the line holding `at`, the next `section` (it
   * folds to the line before the next; blank and comment lines included), or at `at`, the end
   * of the text; never before its own token.
   */
  private closeSection(at: number, next = false): void {
    const span = this.openSection;
    if (!span) return;
    this.openSection = undefined;
    let end = at;
    if (next) while (end > span.range.end && !this.breaksIn(end - 1, end)) end--;
    this.st.endStatement(span, Math.max(end, span.range.end));
  }

  /** `taskTxt taskData`: v12 `addTask($1, $2)`. */
  private task(): void {
    const textAt = this.next();
    const k = this.kind();
    if (k !== T.TaskData) this.fail(TASK_DATA, k === T.Colon ? undefined : TASK_HINT);
    const dataAt = this.next();
    const text = this.raw(textAt);
    const data = this.raw(dataAt);
    const range = this.span(textAt, dataAt);
    const node: GanttTaskNode = { id: '', type: 'Task', range, text, data };
    const parsed = splitData(data);
    if (!parsed) {
      // v12's `addTask` threw a TypeError here; the statement still stands in the AST.
      node.id = this.statementId();
      this.st.diagnostics.error(
        'GANTT_TASK_NO_DATA',
        'A task needs a start, an end or a duration after its tags, e.g. `Design :done, 2024-01-01, 3d`.',
        this.range(dataAt)
      );
      this.add(node, 'task');
      return;
    }
    const { tags, fields } = parsed;
    const many = fields.length >= 3;
    // More than three fields: v12's `parseData` set no id (and counted none), so the task
    // takes the statement's AST id, and the next task has no previous id (D274: the
    // schedule rejects this task first).
    const tooMany = fields.length > 3;
    let id = '';
    if (!many) id = `task${++this.autoIds}`;
    else if (!tooMany) id = fields[0] ?? '';
    const prev = this.tasks[this.tasks.length - 1];
    const section = this.sections.length - 1;
    let ast: string;
    if (tooMany) ast = this.statementId();
    else {
      const n = (this.taskIds.get(id) ?? 0) + 1;
      this.taskIds.set(id, n);
      ast = n === 1 ? `t:${esc(id)}` : `t:${esc(id)}@${n}`;
    }
    const task: { -readonly [K in keyof GanttTask]: GanttTask[K] } = {
      ast,
      id,
      text,
      tags,
      fields,
      end: fields[many ? 2 : fields.length - 1] ?? '',
      range,
      dataRange: this.range(dataAt),
    };
    if (section >= 0) task.section = section;
    if (fields.length > 1) task.start = fields[many ? 1 : 0] ?? '';
    if (prev && prev.fields.length <= 3) task.prevId = prev.id;
    this.tasks.push(task);
    node.id = ast;
    if (!tooMany) node.task = id;
    this.add(node, 'task');
  }

  /**
   * `clickStatement`: `click <ids>`, then `call <fn>[(<args>)]` and/or `href "<url>"`, either
   * first. v12 called `setClickEvent` before `setLink` whatever the order.
   */
  private click(): void {
    const first = this.next();
    if (this.kind() !== T.ClickId || this.t.end[this.i] === this.t.start[this.i]) {
      this.fail(CLICK_IDS, CLICK_HINT);
    }
    const idsAt = this.next();
    const ids = this.raw(idsAt).split(',');
    // The one blank or line break after the ids (none at the very end).
    if (this.kind() === T.ClickEnd) this.next();
    let href: string | undefined;
    let call: GanttCall | undefined;
    let last: number;
    const k = this.kind();
    if (k === T.CallKeyword) {
      [call, last] = this.callback();
      if (this.kind() === T.HrefKeyword) [href, last] = this.link();
    } else if (k === T.HrefKeyword) {
      [href, last] = this.link();
      if (this.kind() === T.CallKeyword) [call, last] = this.callback();
    } else this.fail(CLICK_ACTION, CLICK_HINT);
    const ast = this.st.ids.statement('click');
    const range = this.span(first, last);
    const click: { -readonly [K in keyof GanttClick]: GanttClick[K] } = { ast, ids, range };
    if (href !== undefined) click.href = href;
    if (call) click.call = call;
    this.clicks.push(click);
    const node: GanttStatementNode = { id: ast, type: 'Click', range, ids };
    if (href !== undefined) node.href = href;
    if (call) {
      node.callback = { targets: ids, name: call.name };
      if (call.args !== undefined) node.callback.args = call.args;
    }
    this.add(node, 'click');
  }

  /** `call <name>(<args>)`, `call <name>()`. Returns the call and its last token. */
  private callback(): [GanttCall, number] {
    const keyword = this.next();
    if (this.kind() !== T.CallbackName) this.fail(FUNCTION, CALL_HINT);
    const nameAt = this.next();
    const name = this.raw(nameAt);
    const k = this.kind();
    if (k === T.CallbackEmptyArgs) return [{ name }, this.next()];
    if (k !== T.CallbackArgsOpen) {
      // No `(`: the name ran to the end of the text.
      this.endReported = true;
      this.st.diagnostics.error(
        'UNCLOSED_CALLBACK',
        `The \`call\` at line ${this.lineOf(this.t.start[keyword] ?? 0)} has no \`(\` after its function name. Write it as \`call <function>()\`.`,
        this.firstLine(keyword, nameAt)
      );
      throw STOP;
    }
    const open = this.next();
    // `(` is always followed by its arguments (`()` and blanks only are one token).
    const argsAt = this.next();
    if (this.kind() !== T.CallbackArgsClose) {
      this.unclosed('UNCLOSED_CALLBACK_ARGS', 'callback arguments', '(', ')', open);
    }
    return [{ name, args: this.raw(argsAt) }, this.next()];
  }

  /** `href "<url>"`. Returns the link and its last token. */
  private link(): [string, number] {
    const open = this.next();
    if (this.kind() !== T.Href) this.fail(LINK, LINK_HINT);
    const url = this.raw(this.next());
    if (this.kind() !== T.HrefEnd) this.unclosed('UNCLOSED_STRING', 'link', 'href "', '"', open);
    return [url, this.next()];
  }

  /** The source range from token `a` to the end of the first line of token `b`. */
  private firstLine(a: number, b: number): Range {
    const start = this.t.start[a] ?? 0;
    let end = this.t.start[b] ?? start;
    const stop = this.t.end[b] ?? end;
    while (end < stop && !this.breaksIn(end, end + 1)) end++;
    return { start, end: Math.max(end, this.t.end[a] ?? start) };
  }

  /** A value that runs to the end of the text: its opener at token `open` is never closed. */
  private unclosed(
    code: string,
    what: string,
    opener: string,
    closer: string,
    open: number
  ): never {
    this.endReported = true;
    const at = this.t.start[open] ?? 0;
    this.st.diagnostics.error(
      code,
      `Unclosed ${what}: the \`${opener}\` at line ${this.lineOf(at)} has no closing \`${closer}\`. Add \`${closer}\` after it.`,
      this.range(open)
    );
    throw STOP;
  }

  /**
   * The text ended inside a value, so jison's lexer returned no `EOF`, and no statement reported
   * it (recovery skipped the value): report it at its opener.
   */
  private endsInValue(): void {
    for (let j = this.t.length - 1; j >= 0; j--) {
      const k = this.kind(j);
      const at = this.t.start[j] ?? 0;
      if (k === T.AccDescrMultiline)
        return this.reportUnclosed('UNCLOSED_DESCRIPTION', 'description', 'accDescr {', '}', j);
      if (k === T.HrefKeyword)
        return this.reportUnclosed('UNCLOSED_STRING', 'link', 'href "', '"', j);
      if (k === T.CallbackArgsOpen)
        return this.reportUnclosed('UNCLOSED_CALLBACK_ARGS', 'callback arguments', '(', ')', j);
      if (k === T.AccTitle || k === T.AccDescr) return this.emptyValueAtEnd(k, this.range(j));
      if (k === T.CallKeyword || k === T.ClickKeyword) {
        this.endReported = true;
        this.st.diagnostics.error(
          'UNEXPECTED',
          `The \`${k === T.CallKeyword ? 'call' : 'click'}\` at line ${this.lineOf(at)} runs to the end of the text; ${k === T.CallKeyword ? CALL_HINT : CLICK_HINT}.`,
          this.range(j)
        );
        return;
      }
    }
  }

  private reportUnclosed(
    code: string,
    what: string,
    opener: string,
    closer: string,
    j: number
  ): void {
    try {
      this.unclosed(code, what, opener, closer, j);
    } catch (error) {
      if (error !== STOP) throw error;
    }
  }

  /**
   * `accTitle:` or `accDescr:` with nothing after it at the very end. Reported where the text
   * belongs: after the keyword and the blanks on its line.
   */
  private emptyValueAtEnd(k: number, keyword: Range): void {
    this.endReported = true;
    const word = k === T.AccTitle ? 'accTitle' : 'accDescr';
    let p = keyword.start;
    while (p < keyword.end && !this.breaksIn(p, p + 1)) p++;
    const at = { start: p, end: p };
    const d = this.st.diagnostics.unexpected('UNEXPECTED', at, ['text'], 'the end of the text');
    d.message = `${d.message.slice(0, -1)}; write it as \`${word}: <text>\`.`;
  }
}

/** v12's common DB: `setAccDescription` folds the blanks after each line break. */
function description(text: string, title: boolean): string {
  return title ? text : text.replace(/\n\s+/g, '\n');
}

/** v12 `mergeTokens`: lower case, split on blanks and commas, each token once, appended. */
function mergeTokens(list: string[], seen: Set<string>, text: string): void {
  for (const t of text.toLowerCase().split(/[\s,]+/)) {
    if (t === '' || seen.has(t)) continue;
    seen.add(t);
    list.push(t);
  }
}

/**
 * v12 `parseData`: the data after its `:` split on `,`, the leading tags taken off (v12
 * `getTaskTags`: any order, each `^\s*tag\s*$`), the rest trimmed. Undefined when nothing is
 * left after the tags (v12 threw a TypeError there).
 */
function splitData(data: string): { tags: GanttTag[]; fields: string[] } | undefined {
  const parts = (data.startsWith(':') ? data.slice(1) : data).split(',');
  const tags: GanttTag[] = [];
  let k = 0;
  for (let found = true; found; ) {
    found = false;
    for (let t = 0; t < TAGS.length; t++) {
      const part = parts[k];
      if (part === undefined) return undefined;
      if (!(TAG_PATTERNS[t] as RegExp).test(part)) continue;
      const tag = TAGS[t] as GanttTag;
      if (!tags.includes(tag)) tags.push(tag);
      k++;
      found = true;
    }
  }
  if (k >= parts.length) return undefined;
  return { tags, fields: parts.slice(k).map((f) => f.trim()) };
}

/** `%`, `>`, `@` and `#` in an id, percent-encoded as core's AST ids are. */
function esc(name: string): string {
  return /[%>@#]/.test(name)
    ? name.replace(/[%>@#]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
    : name;
}
