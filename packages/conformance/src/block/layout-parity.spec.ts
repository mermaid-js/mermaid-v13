import { beforeAll, describe, expect, it } from 'vitest';
import { layoutBlock } from '@mermaid-js/diagram-block';
import {
  blockGrid,
  placeGrid,
  sizeGrid,
  type GridNode,
  blockTestContext,
  blockTestTheme,
  parsedBlock,
} from '@mermaid-js/diagram-block/testing';
import type { CorpusItem } from '../types.ts';
import { blockCorpus } from './corpus.ts';
import { layout as v12Layout, type V12Block } from './v12-layout.ts';

/**
 * Grid parity (spec #521 T3): the linear grid (`sizeGrid`, `placeGrid`) gives every block the
 * centre and size v12's own `layout.ts` gives it (`v12-layout.ts`, verbatim, O(2^depth)), from
 * the same measured leaves, on every corpus source v12's code can run (the e2e fixtures and the
 * v12 spec and syntax-page strings). `layoutBlock`'s cells are that grid.
 *
 * Left out, asserted: the sources with a labelled composite, whose label band is D444's (v12
 * put the label under the children). The corpus has no spacer over the 100,000-cell cap (D445)
 * since #558 moved that source to the cases (`block-cases/space-over-the-cap-is-cut`), which
 * this spec does not read; `layout-stress.spec.ts` lays the same spacer out.
 *
 * v12 sizes a block at depth d 2^d times, and the repeats are not idempotent (a spanning child
 * grows by `padding · (span − 1) / span` each time). The grid replays v12's calls, a block with
 * children at most 16 times (`BLOCK_METRICS.maxSizings`), so it is v12's result exactly wherever
 * composites nest at most 4 deep: the generated trees (seeded; spans, columns, `auto`, spaces,
 * empty composites, composites wider than their children) check one to four levels. Five levels
 * deep v12 sizes the innermost 32 times: measured on 300 trees, 97 differ, by a median of
 * 544 px and at most 27,405 px (v12's own growth; pending a D-id, D440, GAPS #555).
 */

let corpus: CorpusItem[];
beforeAll(async () => {
  corpus = await blockCorpus();
});

/** The grid as v12's `Block` tree: v12's root block, each node at its measured size. */
function v12Tree(node: GridNode, id: string): V12Block {
  return {
    id,
    type: node.space ? 'space' : 'composite',
    ...(node.columns !== undefined ? { columns: node.columns } : {}),
    widthInColumns: node.span,
    children: node.children.map((c, i) => v12Tree(c, `${id}.${i}`)),
    size: { width: node.w, height: node.h, x: 0, y: 0 },
  };
}

/** Every node's box, `[x, y, w, h]`, in pre-order (v12's root left out). */
function boxes(node: GridNode, out: number[][] = []): number[][] {
  for (const c of node.children) {
    out.push([c.x, c.y, c.w, c.h]);
    boxes(c, out);
  }
  return out;
}

/** The same for v12's tree. */
function v12Boxes(node: V12Block, out: number[][] = []): number[][] {
  for (const c of node.children) {
    const s = c.size!;
    out.push([s.x, s.y, s.width, s.height]);
    v12Boxes(c, out);
  }
  return out;
}

/** The largest difference between two box lists, relative to the box sizes. */
function worst(a: number[][], b: number[][]): number {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const scale = Math.max(1, Math.abs(a[i]![2]!), Math.abs(a[i]![3]!));
    for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(a[i]![k]! - b[i]![k]!) / scale);
  }
  return d;
}

const depth = (n: GridNode): number => 1 + Math.max(0, ...n.children.map(depth));

describe('block grid parity with v12', () => {
  it('gives every block v12 centre and size on every corpus source', async () => {
    const failures: string[] = [];
    const banded: string[] = [];
    let compared = 0;
    let nested = 0;
    for (const item of corpus) {
      const { model, diagnostics, config, resolved } = parsedBlock(item.source);
      if (diagnostics.some((d) => d.severity === 'error')) continue;
      // In the source's own theme: the redux family's shape padding is v12 neo's.
      const ctx = blockTestContext(await blockTestTheme(resolved), config);
      const { root, padding } = blockGrid(model, ctx);
      const hasBand = (n: GridNode): boolean => n.band > 0 || n.children.some(hasBand);
      if (hasBand(root)) {
        banded.push(item.id);
        continue;
      }
      const v12 = v12Tree(root, 'root');
      v12Layout(v12, padding);
      sizeGrid(root, padding, 16);
      placeGrid(root, padding);
      const d = worst(v12Boxes(v12), boxes(root));
      if (!(d < 1e-9)) failures.push(`${item.id}: ${d}`);
      // `layoutBlock`'s cells are this grid.
      const cells = layoutBlock(model, ctx).blocks.map((b) => [
        b.cell.x + b.cell.width / 2,
        b.cell.y + b.cell.height / 2,
        b.cell.width,
        b.cell.height,
      ]);
      if (!(worst(cells, boxes(root)) < 1e-9)) failures.push(`${item.id}: layoutBlock's cells`);
      compared++;
      if (depth(root) > 3) nested++;
    }
    expect(failures).toEqual([]);
    // The baselines (#558) show D444's band, so each has a labelled composite.
    expect(banded.filter((id) => id.startsWith('e2e/')).sort()).toEqual([
      ...[
        'config/padding-and-fixed-width',
        ...['default', 'neo-dark', 'neo', 'redux'].map((t) => `handdrawn/${t}`),
        ...['off', 'on-dark', 'on', 'style-beats-the-palette'].map((p) => `palette/${p}`),
        ...['base-cluster-overrides', 'default', 'neo-dark', 'neo', 'redux'].map(
          (t) => `themes/${t}`
        ),
      ].map((f) => `e2e/baseline/${f}.mmd`),
      'e2e/nightly-check/composite-with-a-label.mmd',
      'e2e/pr-check/label-syntax.mmd',
    ]);
    expect(compared).toBeGreaterThan(90);
    // Composites inside composites are in the comparison too.
    expect(nested).toBeGreaterThan(5);
  });
});

/** A fixed-seed generator (a linear congruential one), so the trees are the same each run. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

interface TreeOptions {
  readonly levels: number;
  readonly spans: boolean;
}

/** A random tree of `levels` levels of composites below the root, leaves sized at random. */
function tree(rnd: () => number, { levels, spans }: TreeOptions, level = 0): GridNode {
  const int = (a: number, b: number): number => a + Math.floor(rnd() * (b - a + 1));
  const children: GridNode[] = [];
  for (let k = int(1, 4); k > 0; k--) {
    const r = rnd();
    const span = spans ? int(1, 3) : 1;
    if (level < levels && r < 0.4) {
      children.push({ ...tree(rnd, { levels, spans }, level + 1), span });
    } else if (r < 0.5) {
      children.push({ space: true, span: 1, band: 0, children: [], w: 0, h: 0, x: 0, y: 0 });
    } else {
      const [w, h] = r < 0.55 ? [0, 0] : [int(20, 120), int(20, 60)];
      children.push({ space: false, span, band: 0, children: [], w, h, x: 0, y: 0 });
    }
  }
  // A composite starts at 0 wide (no label) or wider (a leaf type that keeps children).
  const w = level > 0 && rnd() < 0.2 ? int(10, 300) : 0;
  return {
    space: false,
    span: 1,
    ...(rnd() < 0.6 ? { columns: rnd() < 0.2 ? -1 : int(1, 4) } : {}),
    band: 0,
    children,
    w,
    h: 0,
    x: 0,
    y: 0,
  };
}

/** How many of `n` generated trees the linear grid lays out as v12 does. */
function agreeing(n: number, options: TreeOptions, seed: number): number {
  const rnd = seeded(seed);
  let same = 0;
  for (let i = 0; i < n; i++) {
    const root = tree(rnd, options);
    const v12 = v12Tree(root, 'root');
    v12Layout(v12, 8);
    sizeGrid(root, 8, 16);
    placeGrid(root, 8);
    // v12's strict comparisons can flip on float noise: compare to 1e-6.
    if (worst(v12Boxes(v12), boxes(root)) < 1e-6) same++;
  }
  return same;
}

describe('block grid parity with v12 on generated trees', () => {
  it('agrees with v12 wherever composites nest at most four deep', () => {
    expect(agreeing(1000, { levels: 1, spans: true }, 7)).toBe(1000);
    expect(agreeing(1000, { levels: 2, spans: true }, 13)).toBe(1000);
    expect(agreeing(1000, { levels: 2, spans: false }, 11)).toBe(1000);
    expect(agreeing(1000, { levels: 3, spans: true }, 17)).toBe(1000);
    expect(agreeing(300, { levels: 4, spans: true }, 19)).toBe(300);
  }, 120_000);

  it('stops at 16 sizings a block, five levels down (v12: 32)', () => {
    // Measured: 203 of 300 agree; v12's repeats grow the rest by a median of 544 px.
    expect(agreeing(300, { levels: 5, spans: true }, 23)).toBe(203);
  }, 120_000);
});
