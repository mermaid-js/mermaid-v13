// cspell:words LALR
/**
 * User journey parser: recursive descent over the {@link lex} tokens (gated against v12's jison
 * lexer, #310), producing a {@link JourneyModel}, the typed AST, symbols, statement spans and
 * diagnostics (DESIGN §4.2).
 *
 * The grammar is v12's `journey.jison` (LALR), ported rule for rule (`grammar/journey.ebnf` is
 * the normative form; the dead `SPACE statement` and `EOF` lines are gone), so it accepts and
 * rejects what jison does: `journey`, then statements and line breaks in any order (statements
 * need no separator), then the end of the text. `accDescr {`, its `}` and comments are trivia
 * here, as jison returns no token for them. Values convert as v12's grammar actions and DB did
 * (`journeyDb.js`, `commonDb.ts`). Unlike jison it does not stop at the first error: it reports
 * it, skips to the next line break and carries on (R-PARSE-4).
 *
 * Text that ends inside an accessibility value (`accTitle:`, `accDescr:` or an unclosed
 * `accDescr {` at the end) is rejected, as v12 rejected it: jison's lexer gave no `EOF` after the
 * value there (GAPS #310, #302).
 */
import {
  cook,
  firstHole,
  Kind,
  kindSet,
  LineIndex,
  nodeId,
  ParseState,
  Probe,
  ProbeCursor,
  sourceView,
  STOP,
  syncTo,
  TokenCursor,
} from '@mermaid-js/core/parser-kit';
import type {
  AstId,
  ParseOptions,
  ParseResult,
  Range,
  SourceView,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { JourneyModel, JourneySection, JourneyTask } from '../model.ts';
import type {
  JourneyActorNode,
  JourneyDocument,
  JourneySectionNode,
  JourneyStatementNode,
  JourneyTaskNode,
  JourneyTextStatementNode,
} from './ast.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

export interface JourneyParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
}

export type JourneyParseResult = ParseResult<JourneyModel, JourneyDocument>;

/** Text jison matched without returning a token, and comments: trivia to the parser. */
const SKIPPED = kindSet(Kind.Comment, Kind.Directive, T.AccDescrMultiline, T.AccDescrMultilineEnd);
const COMMENTS = kindSet(Kind.Comment, Kind.Directive);
/** Where recovery resumes (R-PARSE-4): the next line break or the end of the text. */
const BOUNDARY = kindSet(Kind.EOF, Kind.Newline, T.Eof);
/** What may start a statement, or come instead of one, as a probe records it (R-LANG-7). */
const STATEMENT_KINDS = [
  T.Title,
  T.AccTitle,
  T.AccDescr,
  T.Section,
  T.TaskName,
  Kind.Newline,
  Kind.EOF,
];

const HEADER = ['`journey`'];
const STATEMENT = [
  'a statement such as `title`, `section` or `accTitle:`',
  'a task such as `Make tea: 5: Me`',
];
const TASK_DATA = ['`:` and a score, e.g. `Make tea: 5`'];

/** Parse a user journey. Never throws: problems are error diagnostics. */
export function parseJourney(src: string, options: JourneyParseOptions = {}): JourneyParseResult {
  return new JourneyParser(src, options).parse();
}

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class JourneyParser {
  private readonly pre: PreprocessResult;
  private readonly view: SourceView;
  private readonly tokens: TokenStream;
  private readonly st = new ParseState();
  private readonly c: TokenCursor;
  /** Only in a probe parse (R-LANG-7, D95). */
  private readonly probe: Probe | undefined;
  private readonly children: JourneyStatementNode[] = [];
  /** Mentions per actor name, for `a:<name>@<n>`. */
  private readonly mentions = new Map<string, number>();
  private lines: LineIndex | undefined;

  constructor(
    private readonly src: string,
    private readonly options: JourneyParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    if (options.probe === undefined) {
      this.tokens = lex(src, pre.bodyStart, this.view);
      this.c = new TokenCursor(this.tokens, SKIPPED);
      return;
    }
    // Every token kind extends the word it ends: names and data run to their `:` or line end.
    const probe = (this.probe = new Probe(src, options.probe));
    if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
    this.tokens = lex(src, pre.bodyStart, this.view, probe);
    // The cursor marks an offset inside a comment or directive as outside code.
    this.c = new ProbeCursor(this.tokens, probe, SKIPPED);
  }

  parse(): JourneyParseResult {
    this.header();
    this.document();
    const warnings = this.st.diagnostics.list.filter((d) => d.severity === 'warning');
    const model = buildModel(this.children, warnings, this.pre.frontMatter?.title);
    const ast: JourneyDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: this.src.length },
      children: this.children,
    };
    return this.st.result(model, ast, this.tokens, this.options, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  private start(j: number): number {
    return this.tokens.start[j] ?? 0;
  }

  private end(j: number): number {
    return this.tokens.end[j] ?? 0;
  }

  /** A token's text as v12's parser read it (removed spans dropped, entities decoded). */
  private raw(j: number): string {
    return cook(this.src, this.start(j), this.end(j), this.view);
  }

  /** `[start, end)` without the blanks at either end (unless that leaves nothing). */
  private trim(start: number, end: number): Range {
    let s = start;
    let e = end;
    while (s < e && /\s/.test(this.src[s] ?? '')) s++;
    while (e > s && /\s/.test(this.src[e - 1] ?? '')) e--;
    return s < e ? { start: s, end: e } : { start, end };
  }

  /** The range of tokens `a` to `b`, blanks off both ends. */
  private span(a: number, b = a): Range {
    return this.trim(this.start(a), this.end(b));
  }

  /** The nearest token before (`dir` -1) or after (+1) `j` that is not a comment, or -1. */
  private neighbour(j: number, dir: 1 | -1): number {
    const { kind, length } = this.tokens;
    for (let k = j + dir; k >= 0 && k < length; k += dir) {
      if (COMMENTS[kind[k] ?? 0] !== 1) return k;
    }
    return -1;
  }

  // ---- errors and recovery ------------------------------------------------------------

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the current token. */
  private found(): string {
    const { c } = this;
    const k = c.kind;
    if (k === Kind.EOF || k === T.Eof) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    const t = this.raw(c.pos).trim();
    if (t === '') return 'nothing';
    return t.length > 24 ? `\`${t.slice(0, 24)}…\`` : `\`${t}\``;
  }

  /** Report what was found where `names` were expected, then stop the statement. */
  private fail(names: string[], why: string | undefined): never {
    const { c } = this;
    const k = c.kind;
    const empty = k === Kind.Newline || k === T.Eof || k === Kind.EOF;
    const where = empty ? { start: c.start, end: c.start } : this.span(c.pos);
    this.st.diagnostics.unexpected('UNEXPECTED', where, names, this.found(), undefined, why);
    throw STOP;
  }

  /** Run one statement rule; on failure, skip to the end of the line. */
  private statement(rule: () => void): void {
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      syncTo(this.c, BOUNDARY);
    }
  }

  /** Add a node, and its span, to the document. */
  private add(node: JourneyStatementNode, kind: string): void {
    this.st.statement(kind, node.range);
    this.children.push(node);
  }

  // ---- document -----------------------------------------------------------------------

  /** `journey`. Without it, the rest is still read as statements. */
  private header(): void {
    this.statement(() => {
      const { c } = this;
      if (!c.at(T.Journey)) this.fail(HEADER, 'a user journey starts with `journey`');
      const range = this.span(c.next());
      this.add({ id: this.st.ids.statement('st'), type: 'Header', range }, 'header');
    });
  }

  /** `{ statement | NEWLINE } EOF`. */
  private document(): void {
    const { c } = this;
    for (;;) {
      c.tested(STATEMENT_KINDS);
      const k = c.kind;
      if (k === Kind.EOF) break;
      if (k === Kind.Newline || k === T.Eof) {
        c.next();
        continue;
      }
      this.statement(() => this.line());
    }
  }

  /** One statement (jison `statement`). */
  private line(): void {
    const k = this.c.kind;
    if (k === T.Title) return this.title();
    if (k === T.AccTitle || k === T.AccDescr) return this.accessibility(k);
    if (k === T.AccDescrMultilineValue) return this.multilineDescription();
    if (k === T.Section) return this.section();
    if (k === T.TaskName) return this.task();
    this.fail(STATEMENT, this.explain());
  }

  /** Why the current token cannot start a statement. */
  private explain(): string | undefined {
    const { c } = this;
    const k = c.kind;
    if (k === T.Journey) return '`journey` starts the diagram and comes only once';
    if (k === T.Invalid) {
      return '`;` does not end a statement in a user journey: put each statement on its own line';
    }
    if (k === T.TaskData || k === T.Colon) {
      const before = this.tokens.kind[this.neighbour(c.pos, -1)];
      if (before === T.Section) return 'a section name cannot hold `:`';
      return 'a task needs a name before its `:`, e.g. `Make tea: 5`';
    }
    return undefined;
  }

  /** `title <text>`: v12 `substr(6)`, untrimmed. */
  private title(): void {
    const j = this.c.next();
    this.text('Title', this.span(j), this.raw(j).slice(6), 'title');
  }

  private text(
    type: JourneyTextStatementNode['type'],
    range: Range,
    text: string,
    kind: string
  ): void {
    this.add({ id: this.st.ids.statement('st'), type, range, text }, kind);
  }

  /** `accTitle: …` and `accDescr: …`: the rest of the line (or the next line), trimmed. */
  private accessibility(k: number): void {
    const { c } = this;
    const first = c.next();
    // The value always follows: its rule matches the empty rest of the text too.
    const value = c.next();
    const title = k === T.AccTitle;
    if (this.start(value) === this.end(value)) {
      // Only at the end of the text: `\s*` after the `:` takes every blank and line break.
      this.st.diagnostics.error(
        title ? 'MISSING_ACC_TITLE' : 'MISSING_ACC_DESCR',
        title
          ? 'The text ends after `accTitle:` without a title. Write the accessible title after it, e.g. `accTitle: My working day`.'
          : 'The text ends after `accDescr:` without a description. Write the accessible description after it, e.g. `accDescr: How a day at work feels`.',
        this.span(first)
      );
      throw STOP;
    }
    const raw = this.raw(value).trim();
    this.text(
      title ? 'AccTitle' : 'AccDescr',
      this.span(first, value),
      title ? raw : raw.replace(/\n\s+/g, '\n'),
      title ? 'accTitle' : 'accDescr'
    );
  }

  /** `accDescr { … }`: the text up to `}`, trimmed, line indents dropped. */
  private multilineDescription(): void {
    const j = this.c.pos;
    const open = this.neighbour(j, -1);
    const opener = open >= 0 && this.tokens.kind[open] === T.AccDescrMultiline ? open : j;
    const close = this.neighbour(j, 1);
    if (close < 0 || this.tokens.kind[close] !== T.AccDescrMultilineEnd) {
      const at = this.start(opener);
      this.st.diagnostics.error(
        'UNCLOSED_DESCRIPTION',
        `Unclosed description: the \`accDescr {\` at line ${this.lineOf(at)} has no closing \`}\`. Add \`}\` after the description.`,
        this.span(opener)
      );
      throw STOP;
    }
    this.c.next();
    const text = this.raw(j).trim().replace(/\n\s+/g, '\n');
    this.text('AccDescr', this.span(opener, close), text, 'accDescr');
  }

  /** `section <name>`: v12 `substr(8)`, untrimmed. */
  private section(): void {
    const j = this.c.next();
    const name = this.raw(j).slice(8);
    const node: JourneySectionNode = {
      id: this.st.ids.subgraph(name),
      type: 'Section',
      range: this.span(j),
      name,
    };
    this.add(node, 'section');
  }

  /** `<name> :<data>`: the score and actors as v12's `addTask` read them. */
  private task(): void {
    const { c } = this;
    const first = c.next();
    const name = this.raw(first);
    if (!c.at(T.TaskData)) this.fail(TASK_DATA, this.explainTask(first, name));
    const j = c.next();
    const data = this.raw(j);
    const pieces = data.slice(1).split(':');
    const people = pieces.length === 1 ? [] : (pieces[1] ?? '').split(',').map((s) => s.trim());
    const node: JourneyTaskNode = {
      id: this.st.ids.statement('t'),
      type: 'Task',
      range: this.span(first, j),
      name,
      score: Number(pieces[0]),
      data,
      people,
      children: this.actors(j, people),
    };
    this.add(node, 'task');
  }

  /** Why the task name at token `first` has no data after it. */
  private explainTask(first: number, name: string): string {
    const { kind } = this.tokens;
    for (let k = first + 1; k < this.c.pos; k++) {
      if (kind[k] === Kind.Comment) {
        return 'the rest of the line is a comment (`%%` or `#`), so the task has no `:` and score';
      }
    }
    const word = name.trim().toLowerCase();
    if (word === 'title') return 'write the title after `title`, e.g. `title My working day`';
    if (word === 'section') return 'write the name after `section`, e.g. `section Go to work`';
    if (this.c.kind === T.Colon) return 'write the score after the `:`, e.g. `Make tea: 5`';
    return 'a task is written `<name>: <score>: <actors>`, e.g. `Make tea: 5: Me`';
  }

  /**
   * The named actors of the data token `j`, one node each: `people` as the model reads them,
   * ranges from the source (a directive inside the data gives every mention the data's range).
   */
  private actors(j: number, people: readonly string[]): JourneyActorNode[] {
    const s = this.start(j);
    const e = this.end(j);
    const hole = this.view.holes[firstHole(this.view, s)];
    const exact = !hole || hole.start >= e;
    // Entities keep their `:` and `,` places in the source, so the pieces line up.
    const text = this.src.slice(s, e);
    let at = text.indexOf(':', 1) + 1;
    const colon = text.indexOf(':', at);
    const last = colon < 0 ? text.length : colon;
    const out: JourneyActorNode[] = [];
    for (const name of people) {
      const comma = text.indexOf(',', at);
      const stop = comma < 0 || comma > last ? last : comma;
      const piece = text.slice(at, stop);
      const lead = piece.length - piece.trimStart().length;
      const range = exact
        ? { start: s + at + lead, end: s + at + lead + piece.trim().length }
        : { start: s, end: e };
      at = stop + 1;
      if (name === '') continue;
      const n = (this.mentions.get(name) ?? 0) + 1;
      this.mentions.set(name, n);
      const id: AstId = `a:${nodeId(name).slice(2)}${n === 1 ? '' : `@${n}`}`;
      this.st.symbol(name, 'actor', range, n === 1 ? 'def' : 'ref');
      out.push({ id, type: 'Actor', range, name });
    }
    return out;
  }
}

// ---- model ----------------------------------------------------------------------------

/**
 * The model as v12's DB held it: sections and tasks in source order, every section line kept,
 * the last `title`, `accTitle` and `accDescr` (the front-matter title when there is no
 * `title`, D218), actors unique and sorted by code unit.
 */
function buildModel(
  nodes: readonly JourneyStatementNode[],
  warnings: JourneyModel['warnings'],
  frontMatterTitle: string | undefined
): JourneyModel {
  let title: string | undefined;
  let accTitle = '';
  let accDescr = '';
  const sections: JourneySection[] = [];
  const tasks: JourneyTask[] = [];
  const actors = new Set<string>();
  for (const n of nodes) {
    if (n.type === 'Title') title = n.text;
    else if (n.type === 'AccTitle') accTitle = n.text;
    else if (n.type === 'AccDescr') accDescr = n.text;
    else if (n.type === 'Section') sections.push({ ast: n.id, name: n.name });
    else if (n.type === 'Task') {
      const at = sections.length - 1;
      for (const p of n.people) actors.add(p);
      tasks.push({
        ast: n.id,
        name: n.name,
        score: n.score,
        people: n.people,
        mentions: n.children.map((c) => c.id),
        section: at < 0 ? '' : (sections[at] as JourneySection).name,
        ...(at < 0 ? {} : { sectionIndex: at }),
      });
    }
  }
  title ??= frontMatterTitle;
  return {
    sections,
    tasks,
    actors: [...actors].sort(),
    ...(title === undefined ? {} : { title }),
    accTitle,
    accDescr,
    warnings,
  };
}
