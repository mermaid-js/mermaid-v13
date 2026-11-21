import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from './index.ts';
import { parseSvg } from './svg-tree.ts';

// A fork or join bar is 70 × 10 and turns to 10 × 70 where the flow runs left to right (v12,
// D604, #402). The flow direction is the nearest subgraph's own `direction`, else the diagram's.
const DIR = join(REPO_ROOT, 'e2e/diagrams/flowchart/baseline/shapes');

/** The `[width, height]` of the rect each named node draws, from the rendered SVG. */
async function bars(fixture: string, ids: string[]): Promise<Record<string, [number, number]>> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const { svg } = await m.render('mermaid-0', await readFile(join(DIR, fixture), 'utf8'));
  const tree = parseSvg(svg);
  const out: Record<string, [number, number]> = {};
  for (const id of ids) {
    const node = tree.find((n, t) => t.getAttr(n, 'data-id') === id)[0]!;
    const rect = tree.find({ tag: 'rect' }).find((r) => {
      for (let p = r.parent; p; p = p.parent) if (p === node) return true;
      return false;
    })!;
    out[id] = [Number(tree.getAttr(rect, 'width')), Number(tree.getAttr(rect, 'height'))];
  }
  return out;
}

describe('flowchart fork and join direction (#402, D604)', () => {
  it('draws a 10 × 70 bar in a left-to-right diagram', async () => {
    expect(await bars('fork.mmd', ['s'])).toEqual({ s: [10, 70] });
  });

  it('draws a 70 × 10 bar in a top-down diagram, fork and join alike', async () => {
    expect(await bars('fork-tb.mmd', ['f', 'j'])).toEqual({ f: [70, 10], j: [70, 10] });
  });

  it('follows the subgraph direction, not the diagram direction', async () => {
    expect(await bars('fork-subgraph-direction.mmd', ['f', 'g'])).toEqual({
      f: [10, 70],
      g: [70, 10],
    });
    expect(await bars('fork-lr-down-subgraph.mmd', ['h', 'g'])).toEqual({
      h: [10, 70],
      g: [70, 10],
    });
  });
});
