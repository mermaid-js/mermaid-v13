/**
 * Hand-built `GitModel` fixtures for the layout specs, made as v12's DB (`gitGraphAst.ts`) makes
 * them from the statements written above each one. Ids are written out (`id:`) or `<seq>-fx`.
 * Parser-produced models replace these once T2 (#370) is on the branch.
 */
import type { FontKey, Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import { gitThemeStandIn } from '../stand-in.ts';
import type {
  GitBranch,
  GitCommit,
  GitCommitType,
  GitDirection,
  GitModel,
  GitWrittenType,
} from '../model.ts';

export interface CommitOptions {
  readonly id?: string;
  readonly tags?: readonly string[];
  readonly type?: GitWrittenType;
}

/** A tiny stand-in for v12's DB: statements in, `GitModel` out. */
export class Git {
  private readonly commits = new Map<string, GitCommit>();
  private readonly branches: { name: string; order: number; head: string | null; k: number }[];
  private current: string;
  private seq = 0;

  constructor(
    private readonly direction: GitDirection = 'LR',
    private readonly title?: string,
    readonly mainBranch = 'main'
  ) {
    this.branches = [{ name: mainBranch, order: 0, head: null, k: 0 }];
    this.current = mainBranch;
  }

  private branchOf(name: string) {
    const b = this.branches.find((x) => x.name === name);
    if (!b) throw new Error(`no branch ${name}`);
    return b;
  }

  private add(
    type: GitCommitType,
    parents: string[],
    o: CommitOptions & { message?: string; customType?: GitWrittenType }
  ): this {
    const seq = this.seq++;
    const id = o.id !== undefined && o.id !== '' ? o.id : `${seq}-fx`;
    const customId = id === o.id;
    const c: GitCommit = {
      id,
      customId,
      message: o.message ?? '',
      seq,
      type,
      ...(o.customType ? { customType: o.customType } : {}),
      tags: o.tags ?? [],
      parents,
      branch: this.current,
      astId: `c#${seq}`,
    };
    this.commits.delete(id);
    this.commits.set(id, c);
    this.branchOf(this.current).head = id;
    return this;
  }

  commit(o: CommitOptions = {}): this {
    const head = this.branchOf(this.current).head;
    const t = o.type ?? 'NORMAL';
    return this.add(t, head ? [head] : [], o);
  }

  branch(name: string, order = 0): this {
    const head = this.branchOf(this.current).head;
    this.branches.push({ name, order, head, k: this.branches.length });
    this.current = name;
    return this;
  }

  checkout(name: string): this {
    this.branchOf(name);
    this.current = name;
    return this;
  }

  merge(name: string, o: CommitOptions = {}): this {
    const a = this.branchOf(this.current).head!;
    const b = this.branchOf(name).head!;
    return this.add('MERGE', [a, b], {
      ...o,
      message: `merged branch ${name} into ${this.current}`,
      ...(o.type ? { customType: o.type } : {}),
    });
  }

  cherryPick(source: string, o: { tags?: readonly string[] } = {}): this {
    const head = this.branchOf(this.current).head!;
    return this.add('CHERRY_PICK', [head, source], { tags: o.tags ?? [`cherry-pick:${source}`] });
  }

  model(): GitModel {
    const branches: GitBranch[] = [...this.branches]
      .sort((a, b) => a.order - b.order || a.k - b.k)
      .map((b) => ({
        name: b.name,
        order: b.order,
        head: b.head,
        ...(b.name === this.mainBranch ? {} : { astId: `b:${b.name}` }),
      }));
    return {
      direction: this.direction,
      commits: [...this.commits.values()].sort((a, b) => a.seq - b.seq),
      branches,
      mainBranch: this.mainBranch,
      currentBranch: this.current,
      head: this.branchOf(this.current).head,
      ...(this.title !== undefined ? { title: this.title } : {}),
      accTitle: '',
      accDescr: '',
      warnings: [],
    };
  }
}

/** The same model drawn in another direction. */
export const turned = (m: GitModel, direction: GitDirection): GitModel => ({ ...m, direction });

/**
 * v12's in-source `commitPosition` table: main ZERO; feature A, B; merge M (`id:`); release C,
 * two cherry-picks of M and D.
 */
export function v12Positions(direction: GitDirection = 'TB'): GitModel {
  return new Git(direction)
    .commit({ id: 'ZERO' })
    .branch('feature')
    .commit({ id: 'A' })
    .commit({ id: 'B' })
    .checkout('main')
    .merge('feature', { id: 'M' })
    .checkout('main')
    .branch('release')
    .checkout('release')
    .commit({ id: 'C' })
    .cherryPick('M')
    .commit({ id: 'D' })
    .cherryPick('M')
    .model();
}

/** v12's in-source BT parallel table: main 1, 2; develop 3, 4 off 2; feature 5, 6 off 2; main 7, 8. */
export function v12Parallel(direction: GitDirection = 'BT'): GitModel {
  const g = new Git(direction);
  g.commit({ id: '1' }).commit({ id: '2' });
  g.branch('develop').commit({ id: '3' }).commit({ id: '4' });
  g.checkout('main').branch('feature').commit({ id: '5' }).commit({ id: '6' });
  g.checkout('main').commit({ id: '7' }).commit({ id: '8' });
  return g.model();
}

/** Every kind of commit, tags, merges, a cherry-pick, three lanes and a reroute. */
export function everything(direction: GitDirection = 'LR', title?: string): GitModel {
  const g = new Git(direction, title);
  g.commit({ id: 'init', tags: ['v0.1', 'first'] });
  g.commit({ type: 'HIGHLIGHT' });
  g.branch('develop')
    .commit({ id: 'dev-1' })
    .commit({ type: 'REVERSE', tags: ['rc'] });
  g.checkout('main').commit({ id: 'hotfix' });
  g.branch('feature/long-branch-name').commit().commit({ id: 'feat-2' });
  g.checkout('develop').commit({ id: 'dev-3' });
  g.checkout('main').merge('develop', { id: 'm1', tags: ['v1.0'] });
  g.checkout('feature/long-branch-name').cherryPick('dev-1');
  g.checkout('main').merge('feature/long-branch-name');
  g.commit({ id: 'tail', type: 'HIGHLIGHT', tags: ['v2.0', 'latest', 'x'] });
  return g.model();
}

/** Parent graphs with cycles (D264, GAPS.md #370): `A`, `B`, `A` and `A`, `A`. */
export function cycles(direction: GitDirection = 'LR'): GitModel {
  return new Git(direction)
    .commit({ id: 'A' })
    .commit({ id: 'B' })
    .commit({ id: 'A' })
    .branch('side')
    .commit({ id: 'S' })
    .commit({ id: 'S' })
    .checkout('main')
    .merge('side', { id: 'm' })
    .model();
}

/** A branch with no commits, and an empty main. */
export const empty = (direction: GitDirection = 'LR'): GitModel =>
  new Git(direction).branch('idle').model();

/** Every fixture, for the invariant sweeps. */
export const ALL: Readonly<Record<string, (d: GitDirection) => GitModel>> = {
  v12Positions,
  v12Parallel,
  everything,
  titled: (d) => everything(d, 'A long title over the git graph'),
  cycles,
  empty,
};

/**
 * A measurer with round numbers: every character is half the font size wide; ascent 0.8,
 * descent 0.2 and line height 1.25 font sizes.
 */
export const halfEm: Measurer = {
  id: 'half-em',
  width: (text: string, font: FontKey) => (text.length * font.size) / 2,
  metrics: (font: FontKey) => ({
    ascent: font.size * 0.8,
    descent: font.size * 0.2,
    lineHeight: font.size * 1.25,
  }),
};

/**
 * `theme` with v12's redux geometry: what a redux theme gives once T5 (#374) adds the geometry
 * variables to core. A stand-in for the specs only.
 */
export const reduxGeometry = (theme: Theme): Theme => gitThemeStandIn(theme, 'redux');
