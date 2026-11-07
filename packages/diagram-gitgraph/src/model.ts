/**
 * The gitGraph model (spec #292): what the parser (#370) produces and the layout (#371) and the
 * language facet (#372) read. Plain, frozen data. It ports what v12's `gitGraphAst.ts` DB held
 * after a parse. Shared contract of the gitGraph tickets: change it only additively, and say so
 * in the run notes (`v13/docs/agents/runs/292/GAPS.md`).
 *
 * Text is kept as written (D263): ids, messages, tags and branch names are the source values
 * after string conversion (quotes off, `\x` unescaped), never v12's `&lt;`, `&gt;`, `&equals;`.
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

export type GitDirection = 'LR' | 'TB' | 'BT';

/** v12's `commitType` names (`gitGraphTypes.ts`): what a commit is drawn as. */
export type GitCommitType = 'NORMAL' | 'REVERSE' | 'HIGHLIGHT' | 'MERGE' | 'CHERRY_PICK';

/** The types `type:` can name. */
export type GitWrittenType = 'NORMAL' | 'REVERSE' | 'HIGHLIGHT';

export interface GitCommit {
  /** The `id:` value, or a derived `<seq>-<7 hex digits>` (D260). */
  readonly id: string;
  /** Whether `id:` gave the id (a non-empty one). v12 draws a merge's label only then. */
  readonly customId: boolean;
  /**
   * `msg:` (or the bare string), `''` without one; for a merge `merged branch <b> into <c>`, for
   * a cherry-pick `cherry-picked <source message> into <c>`, as v12 wrote them.
   */
  readonly message: string;
  /** Creation order, from 0. */
  readonly seq: number;
  readonly type: GitCommitType;
  /** A merge's `type:`, which it is drawn as (v12 `customType`). Absent otherwise. */
  readonly customType?: GitWrittenType;
  /**
   * Tags in source order; `tag: ""` stays an empty tag on a commit or merge, and is dropped on
   * a cherry-pick. A cherry-pick without `tag:` gets `cherry-pick:<source>` (with
   * `|parent:<p>` for a merge source).
   */
  readonly tags: readonly string[];
  /**
   * Parent ids: none for a root, the branch head otherwise; a merge adds the merged branch's
   * head, a cherry-pick its source. A duplicate id can make a parent itself or a later commit
   * (D264): readers must not assume the parent graph is acyclic.
   */
  readonly parents: readonly string[];
  /** The branch the commit was made on. */
  readonly branch: string;
  /** The statement that made it: `c:<id>`, `c#<k>`, `m:<branch>#<k>` or `cp:<source>#<k>`. */
  readonly astId: AstId;
}

export interface GitBranch {
  readonly name: string;
  /** `order:`, 0 without one (v12's `?? 0`); the main branch's is `mainBranchOrder`. */
  readonly order: number;
  /** The id of the branch's latest commit, `null` while it has none. */
  readonly head: string | null;
  /** `b:<name>`; absent for the main branch, which no statement makes. */
  readonly astId?: AstId;
}

export interface GitModel {
  /** The header's direction, `LR` without one. */
  readonly direction: GitDirection;
  /**
   * Commits by `seq`. A commit whose id a later commit reuses is gone (D264): the later one
   * replaced it, as in v12's map.
   */
  readonly commits: readonly GitCommit[];
  /** Branches in drawing order: by `order`, ties in creation order (main first among them). */
  readonly branches: readonly GitBranch[];
  /** `mainBranchName`. */
  readonly mainBranch: string;
  /** The branch checked out at the end. */
  readonly currentBranch: string;
  /** The id of the commit checked out at the end, `null` when its branch has none. */
  readonly head: string | null;
  /** The in-text `title` if non-empty, else the front-matter `title` (D265); absent when neither. */
  readonly title?: string;
  readonly accTitle: string;
  readonly accDescr: string;
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`): `GIT_DUPLICATE_ID`. */
  readonly warnings: readonly Diagnostic[];
}
