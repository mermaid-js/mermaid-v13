import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { layered, type LayoutGraph, type LayoutModel } from '@mermaid-js/core/layout';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from './index.ts';

// #399, D601: a rank gap is never smaller than an arrowhead plus its lead, so the edge between
// two subgraph frames stays visible at a tiny `rankSpacing`. Literal values above it stay literal.
const FIXTURE = 'e2e/diagrams/flowchart/baseline/subgraphs/tiny-spacing-edge-between.mmd';
/** The default theme's arrowhead point: its gap (4) and length (10.5), `NEO_ARROWHEADS`. */
const ARROWHEAD = 4 + 10.5;
/** What the line is trimmed by under that head (gap and length less 1), and the lead after it. */
const FLOOR = 4 + (10.5 - 1) + 6;

async function frames(source: string): Promise<LayoutModel> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  let out: LayoutModel | undefined;
  m.registerLayoutLoaders(
    ['layered', 'dagre'].map((name) => ({
      name,
      loader: () =>
        Promise.resolve((g: LayoutGraph) => {
          out = layered(g);
          return out;
        }),
    }))
  );
  await m.render('mermaid-0', source);
  if (!out) throw new Error('no layout captured');
  return out;
}

/** The space between the X and Y frames, along the flow (LR). */
const gap = (model: LayoutModel): number => {
  const x = model.groups.get('X')!;
  const y = model.groups.get('Y')!;
  return y.x - y.width / 2 - (x.x + x.width / 2);
};

describe('minimum rank gap between subgraphs', () => {
  const source = readFileSync(join(REPO_ROOT, FIXTURE), 'utf8');

  it('holds the arrowhead between two frames at spacing 1', async () => {
    const held = gap(await frames(source));
    expect(held).toBeGreaterThanOrEqual(ARROWHEAD);
    expect(held).toBe(FLOOR);
  });

  it('keeps a rank spacing just above the floor literal', async () => {
    const just = Math.floor(FLOOR) + 1;
    const near = source.replaceAll('rankSpacing: 1', `rankSpacing: ${just}`);
    expect(gap(await frames(near))).toBe(just);
  });

  it('keeps a literal rank spacing above the floor', async () => {
    const wide = source.replaceAll('rankSpacing: 1', 'rankSpacing: 200');
    expect(gap(await frames(wide))).toBe(200);
  });
});
