/**
 * Test-only adapter for the ported v12 gitGraph specs (R-TEST-3), backed by the v13 parse. The
 * specs' expectations are kept as v12 wrote them; this file only translates names and shapes:
 *
 * - `parser.parse` and `db` stand for v12's `gitGraphParser` and `gitGraphAst` DB: `parse`
 *   rejects with the first error, worded as v12's DB worded that check (the code names the
 *   check, the quoted names in v13's message fill v12's sentence), and the getters read
 *   the model: commits as a `Map` by id with v12's numeric types, branches as a `Map` of heads;
 * - `log.warn` receives v12's `Commit ID <id> already exists` for each `GIT_DUPLICATE_ID`;
 * - `db.prettyPrint` only logged in v12 (debug level), so it does nothing here;
 * - `gitGraphParse` stands for `@mermaid-js/parser`'s Langium parse: `value` is the AST as
 *   Langium built it (the statements, the last of each text line) and the errors are the syntax
 *   errors (the DB's checks are not Langium's).
 */
import type { Diagnostic } from '@mermaid-js/core/parser-kit';
import type { GitCommit, GitCommitType, GitModel } from '../model.ts';
import { parseGitGraph } from '../parser/index.ts';

const TYPE_CODE: Readonly<Record<GitCommitType, number>> = {
  NORMAL: 0,
  REVERSE: 1,
  HIGHLIGHT: 2,
  MERGE: 3,
  CHERRY_PICK: 4,
};

/** v12's message for each DB check, from the quoted names of v13's message. */
const V12_MESSAGES: Readonly<Record<string, (names: string[]) => string>> = {
  GIT_BRANCH_EXISTS: ([b]) =>
    `Trying to create an existing branch. (Help: Either use a new name if you want create a new branch or try using "checkout ${b}")`,
  GIT_UNKNOWN_BRANCH: ([b]) =>
    `Trying to checkout branch which is not yet created. (Help try using "branch ${b}")`,
  GIT_MERGE_INTO_ITSELF: ([b]) => `Cannot merge branch '${b}' into itself.`,
  GIT_MERGE_CURRENT_BRANCH: () => 'Incorrect usage of "merge". Cannot merge a branch to itself',
  GIT_MERGE_NO_COMMITS: ([c]) => `Incorrect usage of "merge". Current branch (${c})has no commits`,
  GIT_MERGE_UNKNOWN_BRANCH: ([b]) =>
    `Incorrect usage of "merge". Branch to be merged (${b}) does not exist`,
  GIT_MERGE_EMPTY_BRANCH: ([b]) =>
    `Incorrect usage of "merge". Branch to be merged (${b}) has no commits`,
  GIT_MERGE_SAME_HEAD: () => 'Incorrect usage of "merge". Both branches have same head',
  GIT_MERGE_DUPLICATE_ID: ([id]) =>
    `Incorrect usage of "merge". Commit with id:${id} already exists, use different custom id`,
  GIT_CHERRY_PICK_UNKNOWN_COMMIT: () =>
    'Incorrect usage of "cherryPick". Source commit id should exist and provided',
  GIT_CHERRY_PICK_NOT_A_PARENT: () =>
    'Invalid operation: The specified parent commit is not an immediate parent of the cherry-picked commit.',
  GIT_CHERRY_PICK_MERGE_PARENT: () =>
    'Incorrect usage of cherry-pick: If the source commit is a merge commit, an immediate parent commit must be specified.',
  GIT_CHERRY_PICK_SAME_BRANCH: () =>
    'Incorrect usage of "cherryPick". Source commit is already on current branch',
  GIT_CHERRY_PICK_NO_COMMITS: ([c]) =>
    `Incorrect usage of "cherry-pick". Current branch (${c})has no commits`,
};

const names = (d: Diagnostic) => [...d.message.matchAll(/`([^`]*)`/g)].map((m) => m[1] ?? '');
const v12Message = (d: Diagnostic) => V12_MESSAGES[d.code]?.(names(d)) ?? d.message;

/** A commit as v12's DB held it. */
interface CommitV12 {
  id: string;
  message: string;
  seq: number;
  type: number;
  tags: string[];
  parents: string[];
  branch: string;
  customType?: number;
  customId?: boolean;
}

function v12Commit(c: GitCommit): CommitV12 {
  const out: CommitV12 = {
    id: c.id,
    message: c.message,
    seq: c.seq,
    type: TYPE_CODE[c.type],
    tags: [...c.tags],
    parents: [...c.parents],
    branch: c.branch,
  };
  if (c.type === 'MERGE') {
    out.customType = c.customType ? TYPE_CODE[c.customType] : undefined;
    out.customId = c.customId;
  }
  return out;
}

export const log = {
  warn(...args: unknown[]): void {
    void args;
  },
};

class GitGraphDB {
  private model: GitModel | undefined;

  clear(): void {
    this.model = undefined;
  }

  load(model: GitModel): void {
    this.model = model;
  }

  getCommits(): Map<string, CommitV12> {
    return new Map((this.model?.commits ?? []).map((c) => [c.id, v12Commit(c)]));
  }

  getCommitsArray(): CommitV12[] {
    return [...this.getCommits().values()];
  }

  getBranches(): Map<string, string | null> {
    return new Map((this.model?.branches ?? []).map((b) => [b.name, b.head]));
  }

  getBranchesAsObjArray(): { name: string }[] {
    return (this.model?.branches ?? []).map((b) => ({ name: b.name }));
  }

  getCurrentBranch(): string {
    return this.model?.currentBranch ?? 'main';
  }

  getDirection(): string {
    return this.model?.direction ?? 'LR';
  }

  getHead(): CommitV12 | null {
    const id = this.model?.head;
    return (id && this.getCommits().get(id)) || null;
  }

  getAccTitle(): string {
    return this.model?.accTitle ?? '';
  }

  getAccDescription(): string {
    return this.model?.accDescr ?? '';
  }

  /** v12 logged the history at debug level; nothing to do. */
  prettyPrint(): void {
    // Nothing drawn or returned.
  }
}

export const db = new GitGraphDB();

export const parser = {
  parse(text: string): Promise<void> {
    const result = parseGitGraph(text);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) return Promise.reject(new Error(v12Message(error)));
    for (const d of result.diagnostics) {
      if (d.code === 'GIT_DUPLICATE_ID') log.warn(`Commit ID ${names(d)[0] ?? ''} already exists`);
    }
    db.load(result.model);
    return Promise.resolve();
  },
};

/** A statement as Langium's AST held it. */
type LangiumStatement = { $type: string } & Record<string, unknown>;

interface LangiumGitGraph {
  $type: 'GitGraph';
  statements: LangiumStatement[];
  title?: string;
  accTitle?: string;
  accDescr?: string;
}

export function gitGraphParse(text: string): {
  value: LangiumGitGraph;
  lexerErrors: string[];
  parserErrors: string[];
} {
  const { ast, diagnostics } = parseGitGraph(text);
  const value: LangiumGitGraph = { $type: 'GitGraph', statements: [] };
  const opt = (k: string, v: unknown) => (v === undefined ? {} : { [k]: v });
  for (const n of ast.children) {
    if (n.type === 'Commit') {
      value.statements.push({
        $type: 'Commit',
        ...opt('id', n.commitId?.value),
        ...opt('message', n.message?.value),
        tags: n.tags.map((t) => t.value),
        ...opt('type', n.commitType),
      });
    } else if (n.type === 'Branch') {
      value.statements.push({ $type: 'Branch', name: n.name.value, ...opt('order', n.order) });
    } else if (n.type === 'Merge') {
      value.statements.push({
        $type: 'Merge',
        branch: n.branch.value,
        ...opt('id', n.commitId?.value),
        tags: n.tags.map((t) => t.value),
        ...opt('type', n.commitType),
      });
    } else if (n.type === 'Checkout') {
      value.statements.push({ $type: 'Checkout', branch: n.branch.value });
    } else if (n.type === 'CherryPick') {
      value.statements.push({
        $type: 'CherryPicking',
        ...opt('id', n.commitId?.value),
        tags: n.tags.map((t) => t.value),
        ...opt('parent', n.parent?.value),
      });
    } else if (n.type === 'Title') value.title = n.text;
    else if (n.type === 'AccTitle') value.accTitle = n.text;
    else if (n.type === 'AccDescr') value.accDescr = n.text;
  }
  const errors = diagnostics.filter((d) => d.severity === 'error' && !d.code.startsWith('GIT_'));
  return { value, lexerErrors: [], parserErrors: errors.map((d) => d.message) };
}
