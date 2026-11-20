// cspell:words accdescr
/**
 * gitGraph parser: recursive descent over the significant {@link lex} tokens (gated against
 * v12's Langium lexer, #368), producing a {@link GitModel}, the typed AST, symbols, statement
 * spans and diagnostics (DESIGN §4.2).
 *
 * The grammar is v12's `gitGraph.langium` (with `common.langium`), ported rule for rule;
 * `grammar/gitgraph.ebnf` is the normative form:
 *
 *     GitGraph: NEWLINE* ("gitGraph" | "gitGraph" ":" | "gitGraph:" | "gitGraph" Direction ":")
 *               (NEWLINE | TitleAndAccessibilities | Statement)*
 *     Commit: "commit" ("id:" STRING | "msg:"? STRING | "tag:" STRING | "type:" CommitType)* EOL
 *     Branch: "branch" (REFERENCE | STRING) ("order:" INT)? EOL
 *     Merge: "merge" (REFERENCE | STRING) ("id:" STRING | "tag:" STRING | "type:" CommitType)* EOL
 *     Checkout: ("checkout" | "switch") (REFERENCE | STRING) EOL
 *     CherryPicking: "cherry-pick" ("id:" STRING | "tag:" STRING | "parent:" STRING)* EOL
 *     EOL: NEWLINE+ | EOF
 *
 * so it accepts and rejects what v12's parser does; nothing separates the header from the
 * first statement (`gitGraph commit` parses). Each statement that parses is handed to the
 * model builder ({@link GitBuilder}, v12's DB), whose checks are diagnostics. Unlike v12 the
 * parser does not stop at the first error: it reports it, skips to the next line break and
 * carries on (R-PARSE-4). A statement with a syntax error changes nothing.
 */
import { APOSTROPHE, DQUOTE, ExpectedTable, Kind, kindSet } from '@mermaid-js/core/parser-kit';
import { ID_CONTROL, ID_RESERVED, idEscaper, STOP } from '@mermaid-js/shared/parser/support';
import {
  RuleParser,
  textStatements,
  textValue,
  TITLE_STATEMENT,
  unclosedLabel,
  withoutIndent,
} from '@mermaid-js/shared/parser/rule';
import type {
  AstId,
  ParseOptions,
  ParseResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import type { RuleGrammar, TextValues } from '@mermaid-js/shared/parser/rule';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { GitDirection, GitModel, GitWrittenType } from '../model.ts';
import type {
  GitCommitNode,
  GitGraphDocument,
  GitMergeNode,
  GitStatementNode,
  GitValue,
} from './ast.ts';
import { GitBuilder, WRITTEN_TYPES } from './build.ts';
import { stringValue } from './convert.ts';
import { lex } from './lexer.ts';
import { GITGRAPH_TRIVIA, T } from './tokens.ts';

export interface GitGraphParseOptions extends ParseOptions {
  /** `gitGraph.mainBranchName`: the branch that exists before the first statement. */
  mainBranchName?: string;
  /** `gitGraph.mainBranchOrder`: its place among the branches. */
  mainBranchOrder?: number;
  /** The integrator's cap on commits and branches, the main branch included (core `DEFAULT_LIMITS.maxNodes` when absent, R-SEC-5). */
  maxNodes?: number;
}

export type GitGraphParseResult = ParseResult<GitModel, GitGraphDocument>;

/** v12's `gitGraph` config defaults (`config.schema.yaml`). */
const MAIN_BRANCH = 'main';
const MAIN_ORDER = 0;

const TEXT = [T.Title, T.AccTitle, T.AccDescr];
const STATEMENT = [T.Commit, T.Branch, T.Merge, T.Checkout, T.Switch, T.CherryPick];
const LINE_END = [Kind.Newline, Kind.EOF];
const DOC = [...STATEMENT, ...TEXT, ...LINE_END];
const HEAD = [T.GitGraph, T.GitGraphColon, Kind.Newline];
const DIRECTIONS = [T.LR, T.TB, T.BT];
const AFTER_GIT_GRAPH = [T.Colon, ...DIRECTIONS, ...DOC];
const NAME = [T.Reference, T.String];
const TYPES = [T.Normal, T.Reverse, T.Highlight];
const COMMIT_OPTIONS = [T.Id, T.Msg, T.String, T.Tag, T.Type];
const MERGE_OPTIONS = [T.Id, T.Tag, T.Type];
const PICK_OPTIONS = [T.Id, T.Tag, T.Parent];
const AFTER_BRANCH = [T.Order, ...LINE_END];

/**
 * Kinds a probe's cursor follows rather than extends: the `…:` keywords and `:`, and a string,
 * which its closing quote ends (right after `id:"a"` the parser expects the next option).
 */
const PROBE_FOLLOWS = kindSet(
  T.GitGraphColon,
  T.Colon,
  T.Id,
  T.Msg,
  T.Tag,
  T.Type,
  T.Parent,
  T.Order,
  T.String
);

/** `title`, `accTitle` and `accDescr` by token kind; a keyword is also its probe mode. */
export const TEXTS = /* @__PURE__ */ textStatements(T.Title, T.AccTitle, T.AccDescr);

/**
 * The probe's mode at `o` (R-LANG-7). The lexer has no modes (Langium's has none), so the
 * mode names what the offset is in: `title`, `accTitle` or `accDescr` past the keyword of
 * that statement, `string` inside a string (closed or not), else `INITIAL` (code).
 */
function probeMode(src: string, tokens: TokenStream, o: number): string {
  for (let j = 0; j < tokens.length; j++) {
    const start = tokens.start[j] ?? 0;
    const end = tokens.end[j] ?? 0;
    if (start >= o) break;
    const kind = tokens.kind[j] ?? Kind.EOF;
    const c = src.charCodeAt(start);
    // An unclosed string: its quote alone is an error token and the lexer reads the rest of
    // the line as code, but the author is still writing the string, to the end of the line.
    if (kind === Kind.Error && (c === DQUOTE || c === APOSTROPHE)) {
      if (!/[\n\r]/.test(src.slice(start, o))) return 'string';
      continue;
    }
    if (end < o) continue;
    if (kind === T.String && o < end) return 'string';
    const word = TEXTS[kind]?.word;
    if (!word) continue;
    let k = start;
    while (/[\t ]/.test(src.charAt(k))) k++;
    k += word.length;
    // A block `accDescr { … }` ends at its `}`; the other values run to the line end.
    const block = kind === T.AccDescr && /^\s*\{/.test(src.slice(k, end));
    if (o > k && (o < end || !block)) return word;
  }
  return 'INITIAL';
}

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
const EXPECTED = new ExpectedTable([
  ['`gitGraph`', [T.GitGraph, T.GitGraphColon]],
  ['a direction `LR`, `TB` or `BT`', DIRECTIONS],
  ['`:`', [T.Colon]],
  ['a statement such as `commit`, `branch`, `checkout`, `merge` or `cherry-pick`', STATEMENT],
  ['`title`, `accTitle:` or `accDescr`', TEXT],
  ['a branch name', [T.Reference]],
  ['a quoted text such as `"text"`', [T.String]],
  ['an option such as `id:` or `tag:`', [T.Id, T.Msg, T.Tag, T.Type, T.Parent, T.Order]],
  ['a commit type `NORMAL`, `REVERSE` or `HIGHLIGHT`', TYPES],
  ['a whole number such as `1`', [T.Int]],
  ['a line break', [Kind.Newline]],
  ['the end of the text', [Kind.EOF]],
]);

const DIRECTION_OF: Record<number, GitDirection> = { [T.LR]: 'LR', [T.TB]: 'TB', [T.BT]: 'BT' };
const ONE_PER_LINE = 'put each statement on a line of its own';
/** The word keywords, for "case-sensitive" and "put a blank after" hints. */
const KEYWORDS = ['cherry-pick', 'checkout', 'commit', 'branch', 'switch', 'merge'];
/** The options each statement takes, for hints. */
const OPTIONS_OF: Record<number, string> = {
  [T.Commit]: '`commit` takes `id:`, `msg:` (or a quoted message), `tag:` and `type:`',
  [T.Merge]: '`merge <branch>` takes `id:`, `tag:` and `type:`',
  [T.CherryPick]: '`cherry-pick` takes `id:`, `parent:` and `tag:`',
  [T.Branch]: '`branch <name>` takes `order:`',
};

/**
 * `%`, `>`, `@` and `#` percent-encoded, as in every AST id (DESIGN §4.2), and so are the
 * characters XML 1.0 cannot hold (C0 controls but tab, LF and CR; DEL; lone surrogates; U+FFFE,
 * U+FFFF), which a name can carry through `\0`, `\b`, `\f`, `\v` or the source: the SVG writer
 * drops them, so `data-ast` would not be the id. Two hex digits up to U+007F, four above, so
 * the encoding stays one-to-one.
 */
const esc = /* @__PURE__ */ idEscaper(`${ID_RESERVED}${ID_CONTROL}`);

/** Parse a git graph. Never throws: problems are error diagnostics. */
export function parseGitGraph(
  src: string,
  options: GitGraphParseOptions = {}
): GitGraphParseResult {
  return new GitGraphParser(src, options).parse();
}

const GRAMMAR: RuleGrammar = {
  lex,
  trivia: GITGRAPH_TRIVIA,
  probeFollows: PROBE_FOLLOWS,
  probeMode,
};

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class GitGraphParser extends RuleParser<PreprocessResult> {
  private readonly git: GitBuilder;
  private readonly children: GitStatementNode[] = [];
  /** `#k` ordinals per id base (`c`, `m:dev`, `cp:A`, `co:dev`, `st`). */
  private readonly ordinals = new Map<string, number>();
  private direction: GitDirection = 'LR';
  /** The last in-text value of each (v12's Langium assignments: the last one wins). */
  private readonly texts: TextValues = { title: '', accTitle: '', accDescr: '' };

  constructor(
    src: string,
    private readonly options: GitGraphParseOptions
  ) {
    const given = options.preprocessed;
    super(src, given ?? preprocess(src), !given, GRAMMAR, options.probe);
    this.git = new GitBuilder(
      this.st.diagnostics,
      options.mainBranchName ?? MAIN_BRANCH,
      options.mainBranchOrder ?? MAIN_ORDER,
      this.writtenIds(),
      options.maxNodes
    );
  }

  parse(): GitGraphParseResult {
    const { st, src, git } = this;
    this.statement(() => this.header());
    this.document();
    const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
    // D265 (as D218): the in-text title if non-empty, else the front-matter one.
    const title = this.texts.title || this.pre.frontMatter?.title;
    const model: GitModel = Object.freeze({
      direction: this.direction,
      commits: Object.freeze(git.commitList()),
      branches: Object.freeze(git.branchList()),
      mainBranch: git.mainBranch,
      currentBranch: git.currentBranch,
      head: git.headId,
      ...(title ? { title } : {}),
      accTitle: this.texts.accTitle,
      accDescr: this.texts.accDescr,
      warnings: Object.freeze(warnings),
    });
    const ast: GitGraphDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.full, this.options, this.probe);
  }

  /**
   * Every `id:` value a `commit` or `merge` writes (the ids the text defines), which derived ids
   * keep clear of (see {@link GitBuilder}). A cherry-pick's `id:` names an existing commit, so
   * it may name a derived id.
   */
  private writtenIds(): Set<string> {
    const ids = new Set<string>();
    const { kind } = this.t;
    let statement: number | undefined;
    for (let j = 0; j + 1 < this.t.length; j++) {
      const k = kind[j] ?? Kind.EOF;
      if (k === Kind.Newline) statement = undefined;
      else if (STATEMENT.includes(k)) statement = k;
      else if (
        k === T.Id &&
        kind[j + 1] === T.String &&
        (statement === T.Commit || statement === T.Merge)
      ) {
        ids.add(stringValue(this.raw(j + 1)));
      }
    }
    return ids;
  }

  // ---- tokens -------------------------------------------------------------------------

  /** `base#k`: the k-th id handed out for `base`. */
  private ordinal(base: string): AstId {
    const n = (this.ordinals.get(base) ?? 0) + 1;
    this.ordinals.set(base, n);
    return `${base}#${n}`;
  }

  /** `st:<k>`, for the header and the title and accessibility lines. */
  private line(): AstId {
    const n = (this.ordinals.get('st') ?? 0) + 1;
    this.ordinals.set('st', n);
    return `st:${n}`;
  }

  // ---- errors and recovery ------------------------------------------------------------

  /** Report what was found where one of `want` was expected, then stop the statement. */
  protected override fail(want: readonly number[], hint?: string): never {
    const { st } = this;
    // `title` and the accessibility tokens take the blanks before them.
    const where = withoutIndent(this.src, this.range());
    if (this.kind() === Kind.Error) this.badCharacters(where);
    st.diagnostics.unexpected(
      'UNEXPECTED',
      where,
      EXPECTED.names(want),
      this.found(),
      undefined,
      hint ?? this.explain()
    );
    throw STOP;
  }

  /**
   * Text no token rule matched: an unclosed string, or stray characters. (An unclosed
   * `accDescr {` or an `accTitle` without `:` lexes as a name, which {@link explain} covers.)
   */
  private badCharacters(where: Range): never {
    const { st } = this;
    const text = this.raw();
    const line = this.lineOf(where.start);
    if (unclosedLabel(st.diagnostics, text, line, where, 'text')) throw STOP;
    const shown = text.length > 24 ? `${text.slice(0, 24)}…` : text;
    let why = '';
    if (text.startsWith(';'))
      why = `; \`;\` does not end a statement in a git graph: ${ONE_PER_LINE}`;
    else if (/^[^\w\s"']/.test(text)) {
      why =
        '; a branch name is letters, digits, `_`, `-`, `.` and `/`: quote any other name, e.g. `"my branch"`';
    }
    st.diagnostics.error('UNEXPECTED_CHARACTER', `Unexpected character \`${shown}\`${why}.`, where);
    throw STOP;
  }

  private explain(): string | undefined {
    const k = this.kind();
    if (k === T.GitGraph || k === T.GitGraphColon)
      return 'a git graph has one `gitGraph`, at its start';
    if (DIRECTIONS.includes(k))
      return 'the direction goes on the `gitGraph` line, as `gitGraph TB:`';
    if (STATEMENT.includes(k) || TEXT.includes(k)) return ONE_PER_LINE;
    if (k !== T.Reference) return undefined;
    const word = this.raw();
    if (word === 'accTitle') return 'write the accessible title as `accTitle: …`';
    if (word === 'accDescr') {
      return 'write the accessible description as `accDescr: …`, or as `accDescr { … }` closed by `}`';
    }
    const keyword = KEYWORDS.find((w) => w.toLowerCase() === word.toLowerCase());
    if (keyword) return `keywords are case-sensitive: write \`${keyword}\``;
    const glued = KEYWORDS.find((w) => word.startsWith(w));
    if (glued) return `put a blank after \`${glued}\``;
    return undefined;
  }

  // ---- rules --------------------------------------------------------------------------

  /** `NEWLINE* ("gitGraph" | "gitGraph" ":" | "gitGraph:" | "gitGraph" Direction ":")` */
  private header(): void {
    for (;;) {
      this.tested(HEAD);
      if (this.kind() !== Kind.Newline) break;
      this.i++;
    }
    this.tested(HEAD);
    const k = this.kind();
    if (k !== T.GitGraph && k !== T.GitGraphColon) {
      const glued = k === T.Reference && this.raw().startsWith('gitGraph');
      this.fail(
        [T.GitGraph],
        glued
          ? '`gitGraph` is followed by a blank, a `:` or the end of the line'
          : 'a git graph starts with `gitGraph`'
      );
    }
    const range = this.range(this.i++);
    let direction: GitDirection | undefined;
    if (k === T.GitGraph) {
      this.tested(AFTER_GIT_GRAPH);
      const next = this.kind();
      if (next === T.Colon) range.end = this.range(this.i++).end;
      else if (DIRECTIONS.includes(next)) {
        direction = DIRECTION_OF[next];
        this.i++;
        const colon = this.expect(T.Colon, 'a direction takes a `:` after it, as `gitGraph TB:`');
        range.end = this.range(colon).end;
      }
    }
    if (direction) this.direction = direction;
    this.st.statement('header', range);
    this.children.push({
      id: this.line(),
      type: 'Header',
      range,
      ...(direction ? { direction } : {}),
    });
  }

  /** `(NEWLINE | TitleAndAccessibilities | Statement)* EOF` */
  private document(): void {
    for (;;) {
      this.tested(DOC);
      const k = this.kind();
      if (k === Kind.EOF) return;
      if (k === Kind.Newline) {
        this.i++;
        continue;
      }
      this.statement(() => {
        if (k === T.Commit) this.commit();
        else if (k === T.Branch) this.branch();
        else if (k === T.Merge) this.merge();
        else if (k === T.Checkout || k === T.Switch) this.checkout(k);
        else if (k === T.CherryPick) this.cherryPick();
        else if (TEXT.includes(k)) this.text(k);
        else this.fail([...STATEMENT, ...TEXT]);
      });
    }
  }

  /** `EOL: NEWLINE+ | EOF` (the loop takes the line breaks after the first). */
  private eol(statement: number, options: readonly number[]): void {
    this.tested([...options, ...LINE_END]);
    const k = this.kind();
    if (k === Kind.EOF) return;
    if (k !== Kind.Newline) {
      let hint: string | undefined;
      if (STATEMENT.includes(k) || TEXT.includes(k)) hint = ONE_PER_LINE;
      else if (k === T.Reference && /^\w+$/.test(this.raw()) && options.length > 0) {
        hint = `${OPTIONS_OF[statement] ?? ''}, each written as \`name:\``;
      } else if (options.length > 0) hint = OPTIONS_OF[statement];
      this.fail([...options, ...LINE_END], hint);
    }
    this.i++;
  }

  /** The end of the last token read, for statement ranges. */
  private lastEnd(): number {
    return this.t.end[this.i - 1] ?? 0;
  }

  /** `STRING`, converted. */
  private string(after: string): GitValue {
    const j = this.expect(T.String, `${after} takes a quoted text, as \`${after}"text"\``);
    return { value: stringValue(this.raw(j)), range: this.range(j) };
  }

  /** `REFERENCE | STRING`: a branch name. */
  private name(keyword: string): GitValue {
    this.tested(NAME);
    const k = this.kind();
    if (k === T.Reference) {
      const j = this.i++;
      return { value: this.raw(j), range: this.range(j) };
    }
    if (k === T.String) {
      const j = this.i++;
      return { value: stringValue(this.raw(j)), range: this.range(j) };
    }
    let hint: string | undefined;
    if (k === T.Title) {
      // D269: `title` starts a title line wherever it is, so `branch titled` cannot be a name.
      hint = `a name that starts with \`title\` must be quoted, as \`${keyword} "titled"\``;
    } else if (k === T.Int) {
      hint = `a name that starts with a number must be quoted, as \`${keyword} "123"\``;
    } else if (STATEMENT.includes(k) || DIRECTIONS.includes(k) || TYPES.includes(k)) {
      hint = `quote a name that is a keyword, as \`${keyword} "${this.raw().trim()}"\``;
    } else if (k === Kind.Newline || k === Kind.EOF) {
      hint = `write the branch name after \`${keyword}\``;
    }
    this.fail(NAME, hint);
  }

  /** `"type:" (NORMAL | REVERSE | HIGHLIGHT)` after `type:`. */
  private commitType(): GitWrittenType {
    this.tested(TYPES);
    const k = this.kind();
    if (!TYPES.includes(k)) this.fail(TYPES);
    // The kind check above leaves only `NORMAL`, `REVERSE` and `HIGHLIGHT`, all in the table.
    return WRITTEN_TYPES[this.raw(this.i++)]!;
  }

  /** `Commit: "commit" ("id:" STRING | "msg:"? STRING | "tag:" STRING | "type:" type)* EOL` */
  private commit(): void {
    const keyword = this.range(this.i++);
    let commitId: GitValue | undefined;
    let message: GitValue | undefined;
    let commitType: GitWrittenType | undefined;
    const tags: GitValue[] = [];
    for (;;) {
      this.tested(COMMIT_OPTIONS);
      const k = this.kind();
      if (k === T.Id) {
        this.i++;
        commitId = this.string('id:');
      } else if (k === T.Msg) {
        this.i++;
        message = this.string('msg:');
      } else if (k === T.String) message = this.string('msg:');
      else if (k === T.Tag) {
        this.i++;
        tags.push(this.string('tag:'));
      } else if (k === T.Type) {
        this.i++;
        commitType = this.commitType();
      } else break;
    }
    const range = { start: keyword.start, end: this.lastEnd() };
    this.eol(T.Commit, COMMIT_OPTIONS);
    const astId = commitId?.value ? this.id(`c:${esc(commitId.value)}`) : this.ordinal('c');
    const node: GitCommitNode = {
      id: astId,
      type: 'Commit',
      range,
      ...(commitId ? { commitId } : {}),
      ...(message ? { message } : {}),
      tags,
      ...(commitType ? { commitType } : {}),
    };
    this.children.push(node);
    this.st.statement('commit', range);
    if (commitId) this.st.symbol(commitId.value, 'commit', commitId.range, 'def');
    this.git.commit({
      ...(commitId ? { id: commitId } : {}),
      message: message?.value ?? '',
      ...(commitType ? { type: commitType } : {}),
      tags: tags.map((t) => t.value),
      astId,
      keyword,
    });
  }

  /** `Branch: "branch" (REFERENCE | STRING) ("order:" INT)? EOL` */
  private branch(): void {
    const keyword = this.range(this.i++);
    const name = this.name('branch');
    let order: number | undefined;
    this.tested(AFTER_BRANCH);
    if (this.kind() === T.Order) {
      this.i++;
      const j = this.expect(T.Int, '`order:` takes a whole number, as `order: 2`');
      order = Number(this.raw(j));
    }
    const range = { start: keyword.start, end: this.lastEnd() };
    this.eol(T.Branch, order === undefined ? [T.Order] : []);
    const base = `b:${esc(name.value)}`;
    const id = this.id(base);
    this.children.push({
      id,
      type: 'Branch',
      range,
      name,
      ...(order === undefined ? {} : { order }),
    });
    this.st.statement('branch', range);
    this.st.symbol(name.value, 'branch', name.range, id === base ? 'def' : 'ref');
    this.git.branch(name, order ?? 0, id);
  }

  /** `Merge: "merge" (REFERENCE | STRING) ("id:" STRING | "tag:" STRING | "type:" type)* EOL` */
  private merge(): void {
    const keyword = this.range(this.i++);
    const branch = this.name('merge');
    let commitId: GitValue | undefined;
    let commitType: GitWrittenType | undefined;
    const tags: GitValue[] = [];
    for (;;) {
      this.tested(MERGE_OPTIONS);
      const k = this.kind();
      if (k === T.Id) {
        this.i++;
        commitId = this.string('id:');
      } else if (k === T.Tag) {
        this.i++;
        tags.push(this.string('tag:'));
      } else if (k === T.Type) {
        this.i++;
        commitType = this.commitType();
      } else break;
    }
    const range = { start: keyword.start, end: this.lastEnd() };
    this.eol(T.Merge, MERGE_OPTIONS);
    const astId = this.ordinal(`m:${esc(branch.value)}`);
    const node: GitMergeNode = {
      id: astId,
      type: 'Merge',
      range,
      branch,
      ...(commitId ? { commitId } : {}),
      tags,
      ...(commitType ? { commitType } : {}),
    };
    this.children.push(node);
    this.st.statement('merge', range);
    this.st.symbol(branch.value, 'branch', branch.range, 'ref');
    if (commitId) this.st.symbol(commitId.value, 'commit', commitId.range, 'def');
    this.git.merge({
      branch,
      ...(commitId ? { id: commitId } : {}),
      ...(commitType ? { type: commitType } : {}),
      tags: tags.map((t) => t.value),
      astId,
      keyword,
    });
  }

  /** `Checkout: ("checkout" | "switch") (REFERENCE | STRING) EOL` */
  private checkout(k: number): void {
    const keyword = this.range(this.i++);
    const word = k === T.Switch ? 'switch' : 'checkout';
    const branch = this.name(word);
    const range = { start: keyword.start, end: this.lastEnd() };
    this.eol(k, []);
    const id = this.ordinal(`co:${esc(branch.value)}`);
    this.children.push({ id, type: 'Checkout', range, keyword: word, branch });
    this.st.statement('checkout', range);
    this.st.symbol(branch.value, 'branch', branch.range, 'ref');
    this.git.checkout(branch);
  }

  /** `CherryPicking: "cherry-pick" ("id:" STRING | "tag:" STRING | "parent:" STRING)* EOL` */
  private cherryPick(): void {
    const keyword = this.range(this.i++);
    let commitId: GitValue | undefined;
    let parent: GitValue | undefined;
    const tags: GitValue[] = [];
    for (;;) {
      this.tested(PICK_OPTIONS);
      const k = this.kind();
      if (k === T.Id) {
        this.i++;
        commitId = this.string('id:');
      } else if (k === T.Parent) {
        this.i++;
        parent = this.string('parent:');
      } else if (k === T.Tag) {
        this.i++;
        tags.push(this.string('tag:'));
      } else break;
    }
    const range = { start: keyword.start, end: this.lastEnd() };
    // A missing `id:` is the rest of the statement still to be written: it is reported after
    // the statement and the blanks on its line, so a just-completed `cherry-pick ` holds none.
    let gap = range.end;
    while (/[\t ]/.test(this.src.charAt(gap))) gap++;
    this.eol(T.CherryPick, PICK_OPTIONS);
    const astId = this.ordinal(`cp:${esc(commitId?.value ?? '')}`);
    this.children.push({
      id: astId,
      type: 'CherryPick',
      range,
      ...(commitId ? { commitId } : {}),
      ...(parent ? { parent } : {}),
      tags,
    });
    this.st.statement('cherryPick', range);
    if (commitId) this.st.symbol(commitId.value, 'commit', commitId.range, 'ref');
    if (parent) this.st.symbol(parent.value, 'commit', parent.range, 'ref');
    this.git.cherryPick({
      ...(commitId ? { id: commitId } : {}),
      ...(parent ? { parent } : {}),
      // v12: Langium's empty array became `undefined`, so no `tag:` gives the default tag.
      ...(tags.length > 0 ? { tags: tags.map((t) => t.value) } : {}),
      astId,
      keyword,
      missing: { start: gap, end: gap },
    });
  }

  /** `(ACC_DESCR | ACC_TITLE | TITLE) EOL` */
  private text(k: number): void {
    const j = this.i++;
    const image = this.raw(j);
    const { type, word } = TEXTS[k] ?? TITLE_STATEMENT;
    const range = withoutIndent(this.src, this.range(j));
    this.eol(k, []);
    const text = (this.texts[word] = textValue(type, image));
    this.children.push({ id: this.line(), type, range, text });
    this.st.statement(word, range);
  }
}
