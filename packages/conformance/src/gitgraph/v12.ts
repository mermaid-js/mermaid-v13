/**
 * The v12 side of gitGraph parity: a plain-data snapshot of mermaid\@12's gitGraph DB, and the
 * normalisation both sides go through.
 *
 * Normalisation, chosen so the snapshot holds what v12 drew and nothing else:
 * - text has v12's `encodeEntities` placeholders decoded back to what the author wrote;
 * - a derived id (`<seq>-<7 hex digits>` on the commit of that `seq`) is `<seq>-*` wherever it
 *   appears (ids, parents, `cherry-pick:` tags): v12's digits are random, v13's are derived
 *   from the sequence number (D260);
 * - the title is the in-text one: the oracle never passes the front matter on, so
 *   `getDiagramTitle()` holds no front-matter title (the v13 side leaves it out too).
 */
import { decodeEntities as d } from '../flowchart/v12.ts';

/** `diagram.type` values mermaid\@12 reports for gitGraph sources. */
export const GITGRAPH_V12_TYPES = ['gitGraph'];

export interface GitCommitSnapshot {
  id: string;
  message: string;
  seq: number;
  /** v12's `commitType` code: NORMAL 0, REVERSE 1, HIGHLIGHT 2, MERGE 3, CHERRY_PICK 4. */
  type: number;
  /** A merge's `type:` code, when given. */
  customType?: number;
  /** Merges only (v12 sets it on merges). */
  customId?: boolean;
  tags: string[];
  parents: string[];
  branch: string;
}

export interface GitSnapshot {
  direction: string;
  commits: GitCommitSnapshot[];
  /** Branch names in drawing order (`getBranchesAsObjArray`). */
  branches: string[];
  /** `[branch, head id]`, sorted by branch name. */
  heads: [string, string | null][];
  currentBranch: string;
  head: string | null;
  title: string;
  accTitle: string;
  accDescr: string;
}

interface CommitV12 {
  id: string;
  message: string;
  seq: number;
  type: number;
  customType?: number;
  customId?: boolean;
  tags: string[];
  parents: string[];
  branch: string;
}

interface GitDbV12 {
  getCommitsArray(): CommitV12[];
  getBranchesAsObjArray(): { name: string }[];
  getBranches(): Map<string, string | null>;
  getCurrentBranch(): string;
  getHead(): CommitV12 | null;
  getDirection(): string;
  getDiagramTitle(): string;
  getAccTitle(): string;
  getAccDescription(): string;
}

/** Sorts `[name, …]` pairs by name, code unit by code unit. */
export function byName(a: [string, unknown], b: [string, unknown]): number {
  if (a[0] === b[0]) return 0;
  return a[0] < b[0] ? -1 : 1;
}

/** `<seq>-*` for derived ids, everywhere they appear. */
export function normaliseIds(snapshot: GitSnapshot): GitSnapshot {
  const derived = new Map<string, string>();
  for (const c of snapshot.commits) {
    if (new RegExp(`^${c.seq}-[0-9a-f]{7}$`).test(c.id)) derived.set(c.id, `${c.seq}-*`);
  }
  const id = (x: string) => derived.get(x) ?? x;
  const tag = (t: string) =>
    t.replace(/^(cherry-pick:)([^|]*)/, (_m, p: string, x: string) => p + id(x));
  return {
    ...snapshot,
    commits: snapshot.commits.map((c) => ({
      ...c,
      id: id(c.id),
      parents: c.parents.map(id),
      tags: c.tags.map(tag),
    })),
    heads: snapshot.heads.map(([b, h]) => [b, h === null ? null : id(h)]),
    head: snapshot.head === null ? null : id(snapshot.head),
  };
}

export function gitGraphV12Snapshot(dbValue: unknown): GitSnapshot {
  const db = dbValue as GitDbV12;
  const commits = db.getCommitsArray().map((c): GitCommitSnapshot => {
    const out: GitCommitSnapshot = {
      id: d(c.id),
      message: d(c.message),
      seq: c.seq,
      type: c.type,
      tags: c.tags.map(d),
      parents: c.parents.map(d),
      branch: d(c.branch),
    };
    if (c.customType !== undefined) out.customType = c.customType;
    if (c.customId !== undefined) out.customId = c.customId;
    return out;
  });
  return normaliseIds({
    direction: db.getDirection(),
    commits,
    branches: db.getBranchesAsObjArray().map((b) => d(b.name)),
    heads: [...db.getBranches()]
      .map(([b, h]): [string, string | null] => [d(b), h === null ? null : d(h)])
      .sort(byName),
    currentBranch: d(db.getCurrentBranch()),
    head: db.getHead() ? d(db.getHead()?.id ?? '') : null,
    title: d(db.getDiagramTitle()),
    accTitle: d(db.getAccTitle()),
    accDescr: d(db.getAccDescription()),
  });
}
