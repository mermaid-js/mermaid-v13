import { beforeAll, describe, expect, it } from 'vitest';
import * as venn from '@upsetjs/venn.js';
import type { Theme } from '@mermaid-js/core/theme';
import {
  layoutVenn,
  type Circle,
  type RegionPath,
  type VennLayout,
  type VennModel,
} from '@mermaid-js/diagram-venn';
import {
  parsedVenn,
  seededRandom,
  VENN_SEED,
  vennTestContext,
  vennTestTheme,
} from '@mermaid-js/diagram-venn/testing';
import { loadOracle } from '../oracle.ts';
import { v12DecodeEntities } from '../v12-entities.ts';
import { UNCLOSED, vennCases, vennCorpus } from './corpus.ts';
import { v12Drawn, type V12Drawn, type V12Subset } from './v12-layout.ts';

/**
 * Solver parity (spec #429 T3, D411–D413): `layoutVenn`'s circles equal what v12 drew with
 * venn.js 2.0.0 within 1e-6 of the radius, and its area loss is at or below venn.js's, for every
 * input of a generated table of two and three sets (sizes, overlaps given, missing, zero and
 * whole, a zero-size set, disjoint sets) and for the corpus sources of up to three sets. v12's
 * side is `v12-layout.ts`: v12's own pre-steps and venn.js's `VennDiagram` path (D412's one
 * solve), with venn.js imported. Text centres and region outlines are compared too.
 *
 * v12's side solves at venn.js's padding 15, as v12's visible circles did, or at the source's
 * own `venn.padding` where it sets one (D412 reads it for the one solve; v12 used it only for
 * its second). The corpus leaves out the sources whose model is a
 * listed divergence (`union-entity-sort`, the unclosed directives).
 *
 * venn.js draws from `Math.random` from eight areas on (four sets or more, or a repeated set);
 * D413 makes v13 deterministic, so v12 parity there is a listed divergence. The port itself is
 * checked there by running venn.js with `Math.random` drawing the same fixed-seed sequence, as
 * the corpus half does for its repeated sets. The corpus also leaves out what D417 lays out
 * otherwise than v12: a negative size or one too large to square (v12 drew NaN), and a
 * `venn.padding` that is negative or leaves no room (v12 drew mirrored or negative circles).
 */

let theme: Theme;
beforeAll(async () => {
  theme = await vennTestTheme();
});

/** The layout of `src` (front-matter config), which must parse without errors. */
function v13(src: string): {
  model: VennModel;
  layout: VennLayout;
  config: Readonly<Record<string, unknown>>;
} {
  const { model, diagnostics, config } = parsedVenn(src);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new Error(errors.map((d) => d.message).join('\n'));
  return { model, layout: layoutVenn(model, vennTestContext(theme, config)), config };
}

/** venn.js's path string as a {@link RegionPath}, or undefined for its `M 0 0`. */
function parsePath(d: string): RegionPath | undefined {
  const t = d.trim().split(/\s+/);
  if (t.length === 3 && t[0] === 'M' && t[1] === '0' && t[2] === '0') return undefined;
  const n = (i: number): number => Number(t[i]);
  if (t[3] === 'm') {
    // circlePath: M x y m -r 0 a r r 0 1 0 2r 0 a r r 0 1 0 -2r 0
    const x = n(1);
    const y = n(2);
    const r = -n(4);
    return {
      start: { x: x - r, y },
      arcs: [
        { radius: r, large: true, sweep: false, to: { x: x - r + r * 2, y } },
        { radius: r, large: true, sweep: false, to: { x: x - r, y } },
      ],
    };
  }
  const arcs: RegionPath['arcs'][number][] = [];
  for (let i = 3; i < t.length; i += 8) {
    arcs.push({
      radius: n(i + 1),
      large: t[i + 4] === '1',
      sweep: t[i + 5] === '1',
      to: { x: n(i + 6), y: n(i + 7) },
    });
  }
  return { start: { x: n(1), y: n(2) }, arcs };
}

interface Diff {
  /** The largest circle difference over its radius. */
  circle: number;
  /** The largest text-centre or outline difference in px. */
  point: number;
  problems: string[];
  /** v13's loss minus venn.js's. */
  loss: number;
}

/** v13's layout against v12's drawn geometry. */
function compare(layout: VennLayout, v12: V12Drawn): Diff {
  const problems: string[] = [];
  let circle = 0;
  let point = 0;
  const ids = Object.keys(v12.circles);
  const mine: Record<string, Circle> = {};
  for (const area of layout.areas) if (area.circle) mine[area.sets[0]!] = area.circle;
  if (Object.keys(mine).sort().join() !== [...ids].sort().join()) {
    problems.push(`sets ${Object.keys(mine).join()} against ${ids.join()}`);
    return { circle: Infinity, point: Infinity, problems, loss: Infinity };
  }
  for (const id of ids) {
    const a = mine[id]!;
    const b = v12.circles[id]!;
    const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.radius - b.radius));
    circle = Math.max(circle, d / b.radius);
  }
  if (layout.areas.length !== v12.data.length) {
    problems.push(`${layout.areas.length} areas against ${v12.data.length}`);
  }
  layout.areas.forEach((area, i) => {
    const datum = v12.data[i];
    if (!datum || datum.sets.join() !== area.sets.join()) {
      problems.push(`area ${i}: ${area.sets.join()} against ${datum?.sets.join()}`);
      return;
    }
    const c = v12.textCentres[datum.sets.join(',')]!;
    if (c.disjoint) {
      if (area.centre) problems.push(`area ${area.sets.join()}: a centre where venn.js has none`);
    } else if (!area.centre) {
      problems.push(`area ${area.sets.join()}: no centre`);
    } else {
      point = Math.max(point, Math.abs(area.centre.x - c.x), Math.abs(area.centre.y - c.y));
    }
    const path = parsePath(venn.intersectionAreaPath(datum.sets.map((s) => v12.circles[s]!)));
    if ((path === undefined) !== (area.path === undefined)) {
      problems.push(
        `area ${area.sets.join()}: outline ${JSON.stringify(area.path)} against ${JSON.stringify(path)}`
      );
    } else if (path && area.path) {
      if (path.arcs.length !== area.path.arcs.length) {
        problems.push(
          `area ${area.sets.join()}: ${area.path.arcs.length} arcs against ${path.arcs.length}`
        );
        return;
      }
      const pts = [
        [area.path.start, path.start],
        ...area.path.arcs.map((a, k) => [a.to, path.arcs[k]!.to]),
      ] as const;
      for (const [p, q] of pts) point = Math.max(point, Math.abs(p.x - q.x), Math.abs(p.y - q.y));
      area.path.arcs.forEach((a, k) => {
        const b = path.arcs[k]!;
        point = Math.max(point, Math.abs(a.radius - b.radius));
        if (a.large !== b.large || a.sweep !== b.sweep) {
          problems.push(`area ${area.sets.join()}: arc ${k} flags differ`);
        }
      });
    }
  });
  const areas = venn.lossFunction as (c: unknown, a: readonly V12Subset[]) => number;
  const full = addMissing(v12.data);
  const loss = areas(mine, full) - areas(v12.circles, full);
  return { circle, point, problems, loss };
}

/** `run` with `Math.random` drawing v13's fixed-seed sequence (D413). */
function withSeed<T>(run: () => T): T {
  const random = Math.random;
  Math.random = seededRandom(VENN_SEED);
  try {
    return run();
  } finally {
    Math.random = random;
  }
}

/** venn.js's `addMissingAreas` (not exported): every pair with no overlap of its own, at 0. */
function addMissing(data: readonly V12Subset[]): V12Subset[] {
  const out = data.map((d) => ({ ...d }));
  const ids = data.filter((d) => d.sets.length === 1).map((d) => d.sets[0]!);
  const pairs = new Set(
    data.flatMap((d) =>
      d.sets.length === 2 ? [d.sets.join(';'), [...d.sets].reverse().join(';')] : []
    )
  );
  ids.sort((a, b) => {
    if (a === b) return 0;
    return a < b ? -1 : +1;
  });
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      if (!pairs.has(`${ids[i]};${ids[j]}`)) out.push({ sets: [ids[i]!, ids[j]!], size: 0 });
  return out;
}

/** The source of a table row: its sets, then its overlaps (`undefined`: not written). */
function source(sets: Record<string, number>, overlaps: [string[], number | undefined][]): string {
  const lines = Object.entries(sets).map(([id, size]) => `  set ${id}:${size}`);
  for (const [ids, size] of overlaps)
    if (size !== undefined) lines.push(`  union ${ids.join(',')}:${size}`);
  return ['venn-beta', ...lines].join('\n');
}

/** The v12 subsets of a table row, as v12's DB stores them. */
function subsets(
  sets: Record<string, number>,
  overlaps: [string[], number | undefined][]
): V12Subset[] {
  const out: V12Subset[] = Object.entries(sets).map(([id, size]) => ({ sets: [id], size }));
  for (const [ids, size] of overlaps)
    if (size !== undefined) out.push({ sets: [...ids].sort(), size });
  return out;
}

interface Row {
  name: string;
  sets: Record<string, number>;
  overlaps: [string[], number | undefined][];
}

/** The generated table: two- and three-set inputs. */
function table(): Row[] {
  const rows: Row[] = [];
  const SIZES = [1, 3, 10, 40];
  for (const a of SIZES)
    for (const b of SIZES) {
      const min = Math.min(a, b);
      for (const ab of [undefined, 0, min / 4, min / 2, min, min * 2]) {
        rows.push({
          name: `A${a} B${b} AB${ab}`,
          sets: { A: a, B: b },
          overlaps: [[['A', 'B'], ab]],
        });
      }
    }
  // A zero-size set, alone and with an overlap; two zero sets.
  rows.push({ name: 'A0 B5', sets: { A: 0, B: 5 }, overlaps: [[['A', 'B'], 1]] });
  rows.push({
    name: 'A5 B0 C3',
    sets: { A: 5, B: 0, C: 3 },
    overlaps: [
      [['A', 'C'], 1],
      [['B', 'C'], 1],
    ],
  });
  rows.push({ name: 'A0 B0 C3', sets: { A: 0, B: 0, C: 3 }, overlaps: [] });
  const TRIPLES = [
    [10, 10, 10],
    [12, 8, 4],
    [30, 5, 2],
    [1, 1, 20],
  ];
  for (const [a, b, c] of TRIPLES) {
    const sizes = { A: a!, B: b!, C: c! };
    const pick = (x: number, y: number) => [undefined, 0, Math.min(x, y) / 3, Math.min(x, y)];
    for (const ab of pick(a!, b!))
      for (const ac of pick(a!, c!))
        for (const bc of pick(b!, c!)) {
          const given = [ab, ac, bc].filter((v): v is number => v !== undefined && v > 0);
          const abc = given.length === 3 ? Math.min(...given) / 2 : undefined;
          for (const triple of abc === undefined ? [undefined] : [undefined, abc]) {
            rows.push({
              name: `A${a} B${b} C${c} AB${ab} AC${ac} BC${bc} ABC${triple}`,
              sets: sizes,
              overlaps: [
                [['A', 'B'], ab],
                [['A', 'C'], ac],
                [['B', 'C'], bc],
                [['A', 'B', 'C'], triple],
              ],
            });
          }
        }
  }
  // Three sets with only the triple given: v12's added pairs (`min(a, b) / 4`).
  for (const [a, b, c] of TRIPLES) {
    rows.push({
      name: `A${a} B${b} C${c} ABC only`,
      sets: { A: a!, B: b!, C: c! },
      overlaps: [[['A', 'B', 'C'], Math.min(a!, b!, c!) / 5]],
    });
  }
  return rows;
}

describe('venn layout parity with venn.js 2.0.0 (D411, D412)', () => {
  it('equals v12 on every two- and three-set input of the generated table', () => {
    const rows = table();
    const failures: string[] = [];
    let worstCircle = 0;
    let worstPoint = 0;
    let worstLoss = -Infinity;
    for (const row of rows) {
      const { layout } = v13(source(row.sets, row.overlaps));
      const { width, height } = layout;
      const diff = compare(
        layout,
        v12Drawn({ subsets: subsets(row.sets, row.overlaps), width, height })
      );
      worstCircle = Math.max(worstCircle, diff.circle);
      worstPoint = Math.max(worstPoint, diff.point);
      worstLoss = Math.max(worstLoss, diff.loss);
      if (diff.circle > 1e-6 || diff.point > 1e-6 || diff.loss > 1e-9 || diff.problems.length > 0)
        failures.push(
          `${row.name}: circle ${diff.circle}, point ${diff.point}, loss ${diff.loss}; ${diff.problems.join('; ')}`
        );
    }
    expect(rows.length).toBe(391);
    expect(failures.slice(0, 10)).toEqual([]);
    expect(worstCircle).toBeLessThanOrEqual(1e-6);
    expect(worstPoint).toBeLessThanOrEqual(1e-6);
    expect(worstLoss).toBeLessThanOrEqual(1e-9);
  }, 120_000);

  it('equals v12 on the corpus sources of up to three sets', async () => {
    const oracle = await loadOracle();
    const failures: string[] = [];
    let compared = 0;
    for (const item of [...(await vennCorpus()), ...vennCases()]) {
      if (item.id.startsWith(UNCLOSED) || item.id.includes('union-entity-sort')) continue;
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted) continue;
      const db = v12.db as { getSubsetData(): V12Subset[] };
      const data = db.getSubsetData().map((s) => ({ ...s, sets: s.sets.map(v12DecodeEntities) }));
      const ids = new Set(data.flatMap((s) => s.sets));
      // Four sets or more: D413; negative sizes: D417 lays them out as 0, v12 drew NaN.
      const invalid = (n: number): boolean => n < 0 || !Number.isFinite(n * n);
      if (ids.size > 3 || data.some((s) => invalid(s.size)) || data.length === 0) continue;
      const { model, layout, config } = v13(item.source);
      const { width, height } = layout;
      const own = config.padding;
      if (typeof own === 'number' && (own < 0 || own !== layout.padding)) continue;
      const v12Layout = withSeed(() =>
        v12Drawn({
          subsets: data,
          width,
          height,
          ...(model.title !== undefined ? { title: model.title } : {}),
          ...(typeof own === 'number' ? { padding: own } : {}),
        })
      );
      const diff = compare(layout, v12Layout);
      compared++;
      if (diff.circle > 1e-6 || diff.point > 1e-6 || diff.loss > 1e-9 || diff.problems.length > 0)
        failures.push(
          `${item.id}: circle ${diff.circle}, point ${diff.point}, loss ${diff.loss}; ${diff.problems.join('; ')}`
        );
    }
    expect(failures.slice(0, 10)).toEqual([]);
    expect(compared).toBe(183);
  }, 120_000);

  it('equals venn.js on four to six sets when venn.js draws the same fixed-seed sequence (D413)', () => {
    const pick = seededRandom(7);
    const failures: string[] = [];
    let mds = 0;
    for (let n = 0; n < 60; n++) {
      const count = 4 + (n % 3);
      const ids = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, count);
      const sets: Record<string, number> = {};
      for (const id of ids) sets[id] = 1 + Math.floor(pick() * 20);
      const overlaps: [string[], number | undefined][] = [];
      for (let i = 0; i < count; i++)
        for (let j = i + 1; j < count; j++) {
          const r = pick();
          const min = Math.min(sets[ids[i]!]!, sets[ids[j]!]!);
          overlaps.push([
            [ids[i]!, ids[j]!],
            r < 0.3 ? undefined : r < 0.5 ? 0 : Math.round(min * r * 50) / 100,
          ]);
        }
      // From eight areas on venn.js tries the MDS start, which draws random numbers.
      if (count + overlaps.length >= 8) mds++;
      const src = source(sets, overlaps);
      const { layout } = v13(src);
      const { width, height } = layout;
      const v12 = withSeed(() => v12Drawn({ subsets: subsets(sets, overlaps), width, height }));
      const diff = compare(layout, v12);
      if (diff.circle > 1e-6 || diff.point > 1e-6 || diff.problems.length > 0)
        failures.push(
          `${src.replace(/\n/g, ' ')}: circle ${diff.circle}; ${diff.problems.join('; ')}`
        );
    }
    expect(mds).toBe(60);
    expect(failures.slice(0, 5)).toEqual([]);
  }, 120_000);
});
