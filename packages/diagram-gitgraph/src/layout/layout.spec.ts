import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { createTheme, loadTheme, type Theme, type ThemeSpec } from '@mermaid-js/core/theme';
import type { GitModel } from '../model.ts';
import * as fx from './fixtures.ts';
import { gitLayoutViolations, layoutGitGraph, type GitLayout } from './index.ts';

let classic: ThemeSpec;
beforeAll(async () => {
  classic = await loadTheme('default');
});

interface Options {
  readonly redux?: boolean;
  readonly themeVariables?: Record<string, unknown>;
}

function lay(model: GitModel, gitGraph: Record<string, unknown> = {}, o: Options = {}): GitLayout {
  const base: Theme = createTheme(classic, { themeVariables: o.themeVariables ?? {} });
  return layoutGitGraph(model, {
    config: { gitGraph } as ResolvedConfig,
    measurer: fx.halfEm,
    theme: o.redux ? fx.reduxGeometry(base) : base,
  });
}

const at = (l: GitLayout) => Object.fromEntries(l.commits.map((c) => [c.id, [c.x, c.y]]));

describe('lanes follow setBranchPosition', () => {
  it('puts LR lanes 50 apart, 90 with rotateCommitLabel (the default)', () => {
    const m = fx.v12Positions('LR');
    expect(lay(m).lanes.map((l) => [l.branch, l.index, l.pos])).toEqual([
      ['main', 0, 0],
      ['feature', 1, 90],
      ['release', 2, 180],
    ]);
    expect(lay(m, { rotateCommitLabel: false }).lanes.map((l) => l.pos)).toEqual([0, 50, 100]);
  });

  it('adds half the branch name in TB and BT, measured in the theme font', () => {
    // 16px: 'main' 32, 'feature' 56 wide.
    const m = fx.v12Positions('TB');
    expect(lay(m).lanes.map((l) => l.pos)).toEqual([0, 106, 224]);
    expect(lay(fx.turned(m, 'BT'), { rotateCommitLabel: false }).lanes.map((l) => l.pos)).toEqual([
      0, 66, 144,
    ]);
  });
});

describe('lanes make room where v12 drew branch labels over each other', () => {
  // v12 spaces a TB lane by half the previous name only, so a long next name ran into it.
  const long = (dir: 'TB' | 'LR', names: string[]) => {
    const g = new fx.Git(dir).commit();
    for (const n of names) g.checkout('main').branch(n).commit();
    return g.model();
  };

  it('moves a lane out where its label would overlap, until it clears the previous one by 10', () => {
    // 'main' box spans -26…24; the 184-wide name's box starts 102 left of its lane.
    const l = lay(long('TB', ['a-very-long-branch-name']));
    expect(l.lanes.map((x) => x.pos)).toEqual([0, 136]);
    expect(
      l.lanes[1]!.label!.box.x - (l.lanes[0]!.label!.box.x + l.lanes[0]!.label!.box.width)
    ).toBe(10);
  });

  it('keeps v12 positions where the labels did not meet, and without showBranches', () => {
    expect(lay(long('TB', ['dev'])).lanes.map((x) => x.pos)).toEqual([0, 106]);
    expect(
      lay(long('TB', ['a-very-long-branch-name']), { showBranches: false }).lanes.map((x) => x.pos)
    ).toEqual([0, 106]);
  });

  it('LR: moves a lane down for a branch name of several lines', () => {
    // Four lines are 80 tall: boxes 24 and 84 tall meet 50 apart; clear by 10, they are 64.
    const l = lay(long('LR', ['one\ntwo\nthree\nfour']), { rotateCommitLabel: false });
    expect(l.lanes.map((x) => x.pos)).toEqual([0, 64]);
    expect(l.lanes[1]!.label!.text.lines).toEqual(['one', 'two', 'three', 'four']);
    expect(lay(long('LR', ['one\ntwo\nthree']), { rotateCommitLabel: false }).lanes[1]!.pos).toBe(
      50
    );
  });
});

describe('commits follow drawCommits without parallelCommits', () => {
  it('steps 50 from 40 in TB, in seq order, on the lane (v12 commitPosition table)', () => {
    expect(at(lay(fx.v12Positions('TB')))).toEqual({
      ZERO: [0, 40],
      A: [106, 90],
      B: [106, 140],
      M: [0, 190],
      C: [224, 240],
      '5-fx': [224, 290],
      D: [224, 340],
      '7-fx': [224, 390],
    });
  });

  it('steps 50 from 10 in LR, 2 above the lane (classic) or 7 below it (redux)', () => {
    const m = fx.v12Positions('LR');
    const l = lay(m);
    expect(l.commits.map((c) => c.x)).toEqual([10, 60, 110, 160, 210, 260, 310, 360]);
    expect(l.commits.map((c) => c.y)).toEqual([-2, 88, 88, -2, 178, 178, 178, 178]);
    expect(lay(m, {}, { redux: true }).commits.map((c) => c.y)).toEqual([
      7, 97, 97, 7, 187, 187, 187, 187,
    ]);
  });

  it('reverses BT: the last commit at the top', () => {
    const l = lay(fx.v12Positions('BT'));
    expect(l.commits.map((c) => c.y)).toEqual([390, 340, 290, 240, 190, 140, 90, 40]);
  });
});

describe('parallelCommits places each commit one step after its closest parent', () => {
  const ys = (l: GitLayout) => l.commits.map((c) => c.y);

  it('TB: 50 below the lowest parent, roots at 40', () => {
    expect(ys(lay(fx.v12Parallel('TB'), { parallelCommits: true }))).toEqual([
      40, 90, 140, 190, 140, 190, 140, 190,
    ]);
  });

  it('LR: 50 right of the rightmost parent, roots at 10', () => {
    const l = lay(fx.v12Parallel('LR'), { parallelCommits: true });
    expect(l.commits.map((c) => c.x)).toEqual([10, 60, 110, 160, 110, 160, 110, 160]);
  });

  it('BT: v12 setParallelBTPos table (roots 30 below the deepest), then one step up', () => {
    // v12's table after setParallelBTPos: 210, 160, 110, 60, 110, 60, 110, 60; drawCommits
    // then takes COMMIT_STEP off each.
    const l = lay(fx.v12Parallel('BT'), { parallelCommits: true });
    expect(at(l)).toEqual({
      '1': [0, 170],
      '2': [0, 120],
      '3': [106, 70],
      '4': [106, 20],
      '5': [224, 70],
      '6': [224, 20],
      '7': [0, 70],
      '8': [0, 20],
    });
  });

  it('ends on parent cycles: a parent made later or the commit itself does not count', () => {
    for (const dir of ['LR', 'TB', 'BT'] as const) {
      const l = lay(fx.cycles(dir), { parallelCommits: true });
      expect(l.commits).toHaveLength(fx.cycles(dir).commits.length);
      for (const c of l.commits) expect(Number.isFinite(c.x + c.y)).toBe(true);
    }
  });
});

describe('branch lines and labels follow drawBranches', () => {
  // 'main' at 16px is 32 × 20 (ascent 12.8): its first baseline is v12's, 1em below the
  // label group's top.
  it('LR: the box left of 0, 30 more with rotateCommitLabel, the line from 0 to maxPos', () => {
    const [main] = lay(fx.v12Positions('LR')).lanes;
    expect(main!.line).toEqual({ x1: 0, y1: -2, x2: 400, y2: -2 });
    expect(main!.label!.box).toEqual({ x: -85, y: -14, width: 50, height: 24 });
    expect(main!.label!.radius).toBe(4);
    const t = main!.label!.text;
    expect([t.x, t.y + t.baseline, t.width, t.lines]).toEqual([-76, 2, 32, ['main']]);
    const flat = lay(fx.v12Positions('LR'), { rotateCommitLabel: false }).lanes[0]!.label!;
    expect([flat.box.x, flat.text.x]).toEqual([-55, -46]);
  });

  it('LR redux: 16 × 12 more room, square corners, centred on the line 7 below the lane', () => {
    const [main] = lay(fx.v12Positions('LR'), {}, { redux: true }).lanes;
    expect(main!.line!.y1).toBe(7);
    expect(main!.label!.box).toEqual({ x: -85, y: -11, width: 66, height: 36 });
    expect(main!.label!.radius).toBe(0);
    const t = main!.label!.text;
    expect([t.x, t.y + t.baseline]).toEqual([-68, 11]);
  });

  it('TB and BT: the box above the first commit or below the last, the line 30 to maxPos', () => {
    const tb = lay(fx.v12Positions('TB')).lanes[0]!;
    expect(tb.line).toEqual({ x1: 0, y1: 30, x2: 0, y2: 430 });
    expect(tb.label!.box).toEqual({ x: -26, y: 0, width: 50, height: 24 });
    expect([tb.label!.text.x, tb.label!.text.y + tb.label!.text.baseline]).toEqual([-21, 16]);
    const bt = lay(fx.v12Positions('BT')).lanes[0]!;
    expect(bt.line).toEqual({ x1: 0, y1: 430, x2: 0, y2: 30 });
    expect(bt.label!.box.y).toBe(430);
  });

  it('TB and BT redux: the box shifted 11 left and 22 away from the commits', () => {
    const tb = lay(fx.v12Positions('TB'), {}, { redux: true }).lanes[0]!.label!;
    expect(tb.box).toEqual({ x: -37, y: -22, width: 66, height: 36 });
    const bt = lay(fx.v12Positions('BT'), {}, { redux: true }).lanes[0]!.label!;
    expect(bt.box.y).toBe(452);
    // v12: the label group at maxPos + 2 × 12 + 4.
    expect(bt.text.y + bt.text.baseline).toBe(430 + 28 + 16);
  });

  it('draws neither without showBranches', () => {
    const l = lay(fx.v12Positions('LR'), { showBranches: false });
    expect(l.lanes.every((x) => x.line === undefined && x.label === undefined)).toBe(true);
  });
});

/** Rounded to 1e-9, so float noise does not hide v12's numbers. */
const r = <T>(v: T): T =>
  JSON.parse(JSON.stringify(v), (_, x: unknown) =>
    typeof x === 'number' ? Math.round(x * 1e9) / 1e9 : x
  ) as T;

describe('commit labels follow drawCommitLabel', () => {
  // 'ZERO' at 10px is 20 × 12.5 (ascent 8).
  it('LR: under the bullet, rotated by v12’s translate and rotate(-45) about the raw position', () => {
    const zero = lay(fx.v12Positions('LR')).commits[0]!;
    expect(zero.label!.box).toEqual({ x: -2, y: 11.5, width: 24, height: 16.5 });
    expect([zero.label!.text.x, zero.label!.text.y + zero.label!.text.baseline]).toEqual([0, 23]);
    expect(r(zero.label!.transform)).toEqual({ dx: -18.9, dy: 16.8, angle: -45, cx: 0, cy: -2 });
    const flat = lay(fx.v12Positions('LR'), { rotateCommitLabel: false }).commits[0]!;
    expect(flat.label!.transform).toBeUndefined();
  });

  it('TB: left of the bullet, rotated about its centre', () => {
    const zero = lay(fx.v12Positions('TB')).commits[0]!;
    expect(zero.label!.box).toEqual({ x: -41, y: 28, width: 24, height: 16.5 });
    expect([zero.label!.text.x, zero.label!.text.y + zero.label!.text.baseline]).toEqual([
      -36, 40.5,
    ]);
    expect(zero.label!.transform).toEqual({ dx: 0, dy: 0, angle: -45, cx: 0, cy: 40 });
  });

  it('labels a merge only with id:, never a cherry-pick, nothing without showCommitLabel', () => {
    const labels = (l: GitLayout) => l.commits.filter((c) => c.label).map((c) => c.id);
    expect(labels(lay(fx.v12Positions('LR')))).toEqual(['ZERO', 'A', 'B', 'M', 'C', 'D']);
    const all = fx.everything('LR');
    const merges = all.commits.filter((c) => c.type === 'MERGE');
    expect(merges.map((c) => c.customId)).toEqual([true, false]);
    expect(labels(lay(all))).toContain('m1');
    expect(labels(lay(all))).not.toContain(merges[1]!.id);
    expect(labels(lay(all, { showCommitLabel: false }))).toEqual([]);
  });
});

describe('tags follow drawCommitTags', () => {
  const tagged = (dir: 'LR' | 'TB') =>
    new fx.Git(dir).commit({ id: 'T', tags: ['v1', 'v22'] }).model();

  // 10px: 'v1' 10 wide, 'v22' 15, both 12.5 tall (ascent 8); the flags take the widest.
  it('LR: stacked upward 20 apart, the last nearest the commit, as flags pointing left', () => {
    const [v1, v22] = r(lay(tagged('LR')).commits[0]!.tags);
    expect(v22!.tag).toBe('v22');
    expect([v22!.text.x, v22!.text.y + v22!.text.baseline]).toEqual([2.5, -18]);
    expect(v22!.points).toEqual([
      { x: -9.5, y: -19.2 },
      { x: -9.5, y: -23.2 },
      { x: -1.5, y: -29.45 },
      { x: 21.5, y: -29.45 },
      { x: 21.5, y: -12.95 },
      { x: -1.5, y: -12.95 },
    ]);
    expect(v22!.hole).toEqual({ x: -5.5, y: -21.2, r: 1.5 });
    expect([v1!.text.x, v1!.text.y + v1!.text.baseline, v1!.hole.y]).toEqual([5, -38, -41.2]);
    expect(v22!.transform).toBeUndefined();
  });

  it('TB: beside the bullet, rotated 45° about the raw position and shifted (12, 12)', () => {
    const [v1, v22] = r(lay(tagged('TB')).commits[0]!.tags);
    expect(v22!.points).toEqual([
      { x: 0, y: 32 },
      { x: 0, y: 28 },
      { x: 10, y: 21.75 },
      { x: 29, y: 21.75 },
      { x: 29, y: 38.25 },
      { x: 10, y: 38.25 },
    ]);
    expect(v22!.hole).toEqual({ x: 2, y: 30, r: 1.5 });
    expect([v22!.text.x, v22!.text.y + v22!.text.baseline]).toEqual([5, 33]);
    expect(v22!.transform).toEqual({ dx: 12, dy: 12, angle: 45, cx: 0, cy: 30 });
    expect(v22!.textTransform).toEqual({ dx: 14, dy: 14, angle: 45, cx: 0, cy: 30 });
    expect(v1!.hole.y).toBe(50);
  });
});

describe('arrows follow drawArrow', () => {
  const path = (l: GitLayout, from: string, to: string) =>
    l.arrows
      .find((a) => a.from === from && a.to === to)!
      .path.map((c) =>
        c.op === 'A' ? `A${c.r},${c.sweep} ${c.x} ${c.y}` : `${c.op} ${c.x} ${c.y}`
      )
      .join(' ');

  const merged = (dir: 'LR' | 'TB' | 'BT') =>
    new fx.Git(dir)
      .commit({ id: 'c0' })
      .branch('dev')
      .commit({ id: 'd1' })
      .checkout('main')
      .merge('dev', { id: 'm' })
      .model();

  it('LR: down into a branch with a 20 px corner, straight along a lane, across into a merge', () => {
    const l = lay(merged('LR'));
    expect(path(l, 'c0', 'd1')).toBe('M 10 -2 L 10 68 A20,0 30 88 L 60 88');
    expect(path(l, 'c0', 'm')).toBe('M 10 -2 L 110 -2');
    expect(path(l, 'd1', 'm')).toBe('M 60 88 L 90 88 A20,0 110 68 L 110 -2');
    // A merge's second parent takes the source lane's colour; the rest the commit's.
    expect(l.arrows.map((a) => [a.from, a.to, a.lane, a.rerouted])).toEqual([
      ['c0', 'd1', 1, false],
      ['c0', 'm', 0, false],
      ['d1', 'm', 1, false],
    ]);
  });

  it('TB and BT: across, then along the commit axis', () => {
    expect(path(lay(merged('TB')), 'c0', 'd1')).toBe('M 0 40 L 86 40 A20,1 106 60 L 106 90');
    expect(path(lay(merged('BT')), 'c0', 'd1')).toBe('M 0 140 L 86 140 A20,0 106 120 L 106 90');
  });

  it('reroutes round a commit in the way on a free lane, coloured by the source going up', () => {
    const m = new fx.Git('LR')
      .commit({ id: 'c0' })
      .branch('dev')
      .commit({ id: 'd1' })
      .commit({ id: 'd2' })
      .checkout('main')
      .cherryPick('d1')
      .model();
    const cp = m.commits.at(-1)!.id;
    const l = lay(m);
    // Lanes taken: the branch lines (-2, 88); the free lane halfway, 43; then x 110.
    expect(path(l, 'd1', cp)).toBe('M 60 88 L 60 53 A10,1 70 43 L 150 43 A10,0 160 33 L 160 -2');
    const a = l.arrows.find((x) => x.from === 'd1' && x.to === cp)!;
    expect([a.lane, a.rerouted]).toEqual([1, true]);
  });

  it('takes the branch lines as lanes only with showBranches, as v12 did', () => {
    const m = new fx.Git('LR')
      .commit({ id: 'c0' })
      .branch('dev')
      .commit({ id: 'd1' })
      .checkout('main')
      .branch('rel')
      .commit({ id: 'r1' })
      .commit({ id: 'r2' })
      .checkout('main')
      .cherryPick('r1')
      .model();
    const laneY = (l: GitLayout) => l.arrows.find((x) => x.from === 'r1' && x.rerouted)!.path[2]!.y;
    // Halfway between the outer lanes is dev's line (88): one try further in, 70.
    expect(laneY(lay(m))).toBe(70);
    expect(laneY(lay(m, { showBranches: false }))).toBe(88);
  });

  it('draws no arrow for a self-parent (D264) and ends on parent cycles', () => {
    const l = lay(fx.cycles('LR'));
    expect(l.arrows.map((a) => [a.from, a.to])).toEqual([
      ['A', 'B'],
      ['B', 'A'],
      ['A', 'm'],
      ['S', 'm'],
    ]);
  });
});

describe('bounds and title (D224, D265)', () => {
  const one = (title?: string) => new fx.Git('LR', title).commit({ id: 'c' }).model();
  const bare = { showBranches: false, showCommitLabel: false };

  it('hold what is drawn plus diagramPadding (8 by default)', () => {
    // The bullet at (10, -2), radius 10.
    expect(lay(one(), bare).bounds).toEqual({ x: -8, y: -20, width: 36, height: 36 });
    expect(lay(one(), { ...bare, diagramPadding: 0 }).bounds).toEqual({
      x: 0,
      y: -12,
      width: 20,
      height: 20,
    });
  });

  it('warns once and uses the default for a length that is not a number of at least 0', () => {
    const warnings: string[] = [];
    const base = createTheme(classic, {});
    const l = layoutGitGraph(one(), {
      config: { gitGraph: { ...bare, diagramPadding: -3 } } as ResolvedConfig,
      measurer: fx.halfEm,
      theme: base,
      warn: (d) => warnings.push(d.code),
    });
    expect(l.bounds.x).toBe(-8);
    expect(warnings).toEqual(['GIT_CONFIG_IGNORED']);
  });

  it('centres the title over the drawing, its baseline titleTopMargin above 0, at 18px', () => {
    // 'Hi' at 18px is 18 wide, ascent 14.4.
    const t = lay(one('Hi'), bare).title!;
    expect([t.x, t.y + t.baseline, t.font.size, t.lines]).toEqual([1, -25, 18, ['Hi']]);
    expect(lay(one('Hi'), { ...bare, titleTopMargin: 40 }).title!.y + t.baseline).toBe(-40);
    expect(lay(one('Hi'), bare).bounds.y).toBeCloseTo(-25 - 14.4 - 8);
    expect(lay(one(), bare).title).toBeUndefined();
    expect(lay(one('  '), bare).title).toBeUndefined();
  });
});

describe('invariants', () => {
  const DIRS = ['LR', 'TB', 'BT'] as const;
  const cases = Object.entries(fx.ALL).flatMap(([name, make]) =>
    DIRS.flatMap((dir) =>
      [false, true].flatMap((parallelCommits) =>
        [false, true].map((redux) => ({ name, dir, parallelCommits, redux, make }))
      )
    )
  );

  it.each(cases)(
    '$name $dir parallel=$parallelCommits redux=$redux',
    ({ dir, parallelCommits, redux, make }) => {
      const model = make(dir);
      for (const extra of [{}, { rotateCommitLabel: false }, { showBranches: false }]) {
        const l = lay(model, { parallelCommits, ...extra }, { redux });
        expect(gitLayoutViolations(model, l, { parallelCommits })).toEqual([]);
      }
    }
  );

  it('catch a layout that breaks them', () => {
    const model = fx.everything('LR');
    const l = lay(model);
    const [c0, c1, ...rest] = l.commits;
    const broken: GitLayout = {
      ...l,
      commits: [{ ...c0!, x: c0!.x + 1 }, { ...c1!, y: Number.NaN }, ...rest],
      bounds: { ...l.bounds, width: 1 },
    };
    const v = gitLayoutViolations(model, broken);
    expect(v.some((x) => x.includes('is NaN'))).toBe(true);
    const shifted = gitLayoutViolations(model, {
      ...l,
      commits: [{ ...c0!, x: c0!.x + 1 }, c1!, ...rest],
    });
    expect(shifted.some((x) => x.includes('one step after'))).toBe(true);
    expect(shifted.some((x) => x.includes('starts at'))).toBe(true);
    expect(
      gitLayoutViolations(model, { ...l, bounds: { ...l.bounds, width: 1 } }).some((x) =>
        x.includes('outside the bounds')
      )
    ).toBe(true);
  });
});
