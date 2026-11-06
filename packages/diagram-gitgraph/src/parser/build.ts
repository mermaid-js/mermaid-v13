/**
 * The gitGraph model builder: v12's `gitGraphAst.ts` DB (`commit`, `branch`, `merge`,
 * `cherryPick`, `checkout`, `getBranchesAsObjArray`, `getCommitsArray`), ported call for call,
 * and fed by the parser one statement at a time, as v12's `gitGraphParser.ts` fed its DB.
 *
 * Unlike v12 it never throws: each of v12's checks is an error diagnostic with its own code,
 * ranged on the offending argument, and the statement then changes nothing (R-PARSE-4), so the
 * next statement goes on from the same state. Ids without `id:` are derived (D260), and a
 * repeated commit id warns, with `related` at the first (D264). Messages say what is wrong in
 * gitGraph's terms and how to fix it; none names a token or a rule (R-ERR-5). The ported v12
 * specs map the codes back to v12's wording (`src/v12-specs/adapter.ts`).
 */
import type { AstId, Diagnostics, Range } from '@mermaid-js/core/parser-kit';
import type { GitBranch, GitCommit, GitWrittenType } from '../model.ts';
import type { GitValue } from './ast.ts';

interface CherryPickInput {
  id?: GitValue;
  parent?: GitValue;
  /** Absent without `tag:`. */
  tags?: readonly string[];
  astId: AstId;
  keyword: Range;
}

/** The 32-bit golden-ratio constant of Pele's `nextId` (D260). */
const GOLDEN = 0x9e3779b1;

/** One parse's git state: v12's `GitGraphState`, less what the grammar cannot reach. */
export class GitBuilder {
  /** By id, in first-insertion order; a later commit with the same id replaces the value. */
  private readonly commits = new Map<string, GitCommit>();
  /** Where each commit id was given (the `id:` value, or the statement for a derived id). */
  private readonly idAt = new Map<string, Range>();
  /** Each branch's head id, `null` while it has none; creation order. */
  private readonly heads = new Map<string, string | null>();
  private readonly config = new Map<string, { order: number; astId?: AstId }>();
  private head: GitCommit | null = null;
  private current: string;
  private seq = 0;

  /**
   * @param written - every `id:` value in the text, so that a derived id never takes one that a
   *   later statement writes out (v12's random digits practically never did).
   */
  constructor(
    private readonly diagnostics: Diagnostics,
    readonly mainBranch: string,
    mainBranchOrder: number,
    private readonly written: ReadonlySet<string> = new Set()
  ) {
    this.current = mainBranch;
    this.heads.set(mainBranch, null);
    this.config.set(mainBranch, { order: mainBranchOrder });
  }

  /**
   * Pele's `nextId` (D260): `<seq>-` and seven hex digits of a multiplicative hash of the
   * sequence number; an id already in use, or written anywhere in the text, moves to the next
   * salt.
   */
  private nextId(): string {
    for (let salt = this.seq + 1; ; salt += GOLDEN) {
      const hex = (Math.imul(salt, GOLDEN) >>> 0).toString(16).padStart(8, '0').slice(0, 7);
      const id = `${this.seq}-${hex}`;
      if (!this.commits.has(id) && !this.written.has(id)) return id;
    }
  }

  private add(commit: GitCommit, at: Range): void {
    this.head = commit;
    this.commits.set(commit.id, commit);
    this.idAt.set(commit.id, at);
    this.heads.set(this.current, commit.id);
  }

  private headOf(branch: string): GitCommit | undefined {
    const id = this.heads.get(branch);
    return id ? this.commits.get(id) : undefined;
  }

  /** v12 `commit`. */
  commit(input: {
    id?: GitValue;
    message: string;
    type?: GitWrittenType;
    tags: readonly string[];
    astId: AstId;
    keyword: Range;
  }): void {
    const given = input.id?.value;
    const id = given || this.nextId();
    const first = this.idAt.get(id);
    if (input.id && given && first) {
      this.diagnostics.warning(
        'GIT_DUPLICATE_ID',
        `The commit id \`${given}\` is already used: this commit replaces the earlier one, which is no longer drawn. Give each commit its own id.`,
        input.id.range,
        { related: [{ message: `\`${given}\` is first used here`, range: first }] }
      );
    }
    this.add(
      {
        id,
        customId: !!given,
        message: input.message,
        seq: this.seq++,
        type: input.type ?? 'NORMAL',
        tags: Object.freeze([...input.tags]),
        parents: Object.freeze(this.head ? [this.head.id] : []),
        branch: this.current,
        astId: input.astId,
      },
      input.id && given ? input.id.range : input.keyword
    );
  }

  /** v12 `branch`: create it at the current head and check it out. */
  branch(name: GitValue, order: number, astId: AstId): void {
    if (this.heads.has(name.value)) {
      this.diagnostics.error(
        'GIT_BRANCH_EXISTS',
        `The branch \`${name.value}\` already exists. Give the new branch another name, or write \`checkout ${name.value}\` to switch to it.`,
        name.range
      );
      return;
    }
    this.heads.set(name.value, this.head ? this.head.id : null);
    this.config.set(name.value, { order, astId });
    this.switchTo(name.value);
  }

  /** v12 `checkout` (and `switch`). */
  checkout(name: GitValue): void {
    if (!this.heads.has(name.value)) {
      this.diagnostics.error(
        'GIT_UNKNOWN_BRANCH',
        `There is no branch \`${name.value}\` to check out yet. Create it first with \`branch ${name.value}\`.`,
        name.range
      );
      return;
    }
    this.switchTo(name.value);
  }

  private switchTo(name: string): void {
    this.current = name;
    this.head = this.headOf(name) ?? null;
  }

  /** v12 `merge`: its seven checks in v12's order, then the merge commit. */
  merge(input: {
    branch: GitValue;
    id?: GitValue;
    type?: GitWrittenType;
    tags: readonly string[];
    astId: AstId;
    keyword: Range;
  }): void {
    const { diagnostics: d, current } = this;
    const other = input.branch.value;
    const at = input.branch.range;
    const customId = input.id?.value;
    const currentCommit = this.headOf(current);
    const otherHead = this.heads.get(other);
    const otherCommit = otherHead ? this.commits.get(otherHead) : undefined;
    if (currentCommit && otherCommit && currentCommit.branch === other) {
      d.error(
        'GIT_MERGE_INTO_ITSELF',
        `Cannot merge \`${other}\` here: the head of the current branch \`${current}\` is a commit of \`${other}\`, so the branch would be merged into itself. Add a commit on \`${current}\` first.`,
        at
      );
      return;
    }
    if (current === other) {
      d.error(
        'GIT_MERGE_CURRENT_BRANCH',
        `Cannot merge \`${other}\` into itself: it is the current branch. Check out the branch to merge into first, e.g. \`checkout ${this.mainBranch}\`.`,
        at
      );
      return;
    }
    if (!currentCommit) {
      d.error(
        'GIT_MERGE_NO_COMMITS',
        `Cannot merge into \`${current}\`: the current branch has no commits yet. Add a \`commit\` on \`${current}\` before the merge.`,
        at
      );
      return;
    }
    if (!this.heads.has(other)) {
      d.error(
        'GIT_MERGE_UNKNOWN_BRANCH',
        `There is no branch \`${other}\` to merge. Create it with \`branch ${other}\` and commit on it first.`,
        at
      );
      return;
    }
    if (!otherCommit) {
      d.error(
        'GIT_MERGE_EMPTY_BRANCH',
        `Cannot merge \`${other}\`: it has no commits yet. Add a \`commit\` on \`${other}\` before the merge.`,
        at
      );
      return;
    }
    if (currentCommit === otherCommit) {
      d.error(
        'GIT_MERGE_SAME_HEAD',
        `Cannot merge \`${other}\` into \`${current}\`: both branches end at the same commit, so there is nothing to merge. Add a commit on \`${other}\` first.`,
        at
      );
      return;
    }
    if (input.id && customId && this.commits.has(customId)) {
      const first = this.idAt.get(customId);
      d.error(
        'GIT_MERGE_DUPLICATE_ID',
        `The commit id \`${customId}\` is already used, and a merge needs an id of its own. Choose another id.`,
        input.id.range,
        first ? { related: [{ message: `\`${customId}\` is first used here`, range: first }] } : {}
      );
      return;
    }
    const head = this.head;
    this.add(
      {
        id: customId || this.nextId(),
        customId: !!customId,
        message: `merged branch ${other} into ${current}`,
        seq: this.seq++,
        type: 'MERGE',
        ...(input.type ? { customType: input.type } : {}),
        tags: Object.freeze([...input.tags]),
        parents: Object.freeze(head ? [head.id, otherHead ?? ''] : []),
        branch: current,
        astId: input.astId,
      },
      input.id && customId ? input.id.range : input.keyword
    );
  }

  /** v12 `cherryPick`: its five reachable checks in v12's order, then the new commit. */
  cherryPick(input: CherryPickInput): void {
    const source = this.pickSource(input);
    if (!source) return;
    const { current } = this;
    const parent = input.parent?.value;
    const head = this.head;
    const tag = `cherry-pick:${source.id}${source.type === 'MERGE' ? `|parent:${parent ?? ''}` : ''}`;
    this.add(
      {
        id: this.nextId(),
        customId: false,
        message: `cherry-picked ${source.message} into ${current}`,
        seq: this.seq++,
        type: 'CHERRY_PICK',
        tags: Object.freeze(input.tags ? input.tags.filter(Boolean) : [tag]),
        parents: Object.freeze(head ? [head.id, source.id] : []),
        branch: current,
        astId: input.astId,
      },
      input.keyword
    );
  }

  /** The commit a cherry-pick copies, or `undefined` after reporting the check that failed. */
  private pickSource(input: CherryPickInput): GitCommit | undefined {
    const { diagnostics: d, current } = this;
    const sourceId = input.id?.value;
    const source = sourceId ? this.commits.get(sourceId) : undefined;
    if (!source) {
      d.error(
        'GIT_CHERRY_PICK_UNKNOWN_COMMIT',
        sourceId
          ? `There is no commit \`${sourceId}\` to cherry-pick. Name the commit with \`id:\` where it is made, and cherry-pick it after that.`
          : 'A cherry-pick needs the id of the commit to copy, e.g. `cherry-pick id:"A"`.',
        input.id?.range ?? input.keyword
      );
      return undefined;
    }
    const parent = input.parent?.value;
    if (input.parent && parent && !source.parents.includes(parent)) {
      d.error(
        'GIT_CHERRY_PICK_NOT_A_PARENT',
        source.parents.length > 0
          ? `\`${parent}\` is not a parent of \`${source.id}\`: \`parent:\` names one of ${source.parents.map((p) => `\`${p}\``).join(' or ')}.`
          : `\`${parent}\` is not a parent of \`${source.id}\`, which has none: leave \`parent:\` out.`,
        input.parent.range
      );
      return undefined;
    }
    if (source.type === 'MERGE' && !parent) {
      d.error(
        'GIT_CHERRY_PICK_MERGE_PARENT',
        `\`${source.id}\` is a merge commit: say which of its parents to follow with \`parent:\`, e.g. \`cherry-pick id:"${source.id}" parent:"${source.parents[0] ?? ''}"\`.`,
        input.id?.range ?? input.keyword
      );
      return undefined;
    }
    if (source.branch === current) {
      d.error(
        'GIT_CHERRY_PICK_SAME_BRANCH',
        `\`${source.id}\` is already on the current branch \`${current}\`. Check out another branch before cherry-picking it.`,
        input.id?.range ?? input.keyword
      );
      return undefined;
    }
    if (!this.headOf(current)) {
      d.error(
        'GIT_CHERRY_PICK_NO_COMMITS',
        `Cannot cherry-pick onto \`${current}\`: the current branch has no commits yet. Add a \`commit\` on \`${current}\` first.`,
        input.id?.range ?? input.keyword
      );
      return undefined;
    }
    return source;
  }

  /** The commits by `seq` (v12 `getCommitsArray`). */
  commitList(): readonly GitCommit[] {
    return [...this.commits.values()].sort((a, b) => a.seq - b.seq).map((c) => Object.freeze(c));
  }

  /** The branches in drawing order (v12 `getBranchesAsObjArray`: by order, a stable sort). */
  branchList(): readonly GitBranch[] {
    const list: GitBranch[] = [];
    for (const [name, { order, astId }] of this.config) {
      const head = this.heads.get(name) ?? null;
      list.push(Object.freeze(astId ? { name, order, head, astId } : { name, order, head }));
    }
    return list.sort((a, b) => a.order - b.order);
  }

  get currentBranch(): string {
    return this.current;
  }

  get headId(): string | null {
    return this.head?.id ?? null;
  }
}

/** The commit types `type:` names, as the model spells them. */
export const WRITTEN_TYPES: Readonly<Record<string, GitWrittenType>> = {
  NORMAL: 'NORMAL',
  REVERSE: 'REVERSE',
  HIGHLIGHT: 'HIGHLIGHT',
};
