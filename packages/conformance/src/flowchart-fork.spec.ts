import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from './index.ts';
import { parseSvg } from './svg-tree.ts';

// A fork or join bar is 70 × 10 and turns to 10 × 70 where the flow runs left to right (v12,
// D604, #402). The flow direction is the nearest subgraph's own `direction`, else the diagram's.
const DIR = join(REPO_ROOT, 'e2e/diagrams/flowchart/baseline/shapes');

/** The rendered SVG of a fixture under `e2e/diagrams/`, parsed. */
async function rendered(path: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const { svg } = await m.render(
    'mermaid-0',
    await readFile(join(REPO_ROOT, 'e2e/diagrams', path), 'utf8')
  );
  return parseSvg(svg);
}

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

// v12 flowcharts drew the fork and fr-circ hollow: its stylesheet filled `.node rect` and
// `.node circle` with mainBkg over the shapes' own fill (decision 4 of #1163, D683, #1152).
describe('flowchart fork, join and fr-circ are hollow (#1152, D683)', () => {
  /** The paint of each element node `id` draws, from the rendered SVG. */
  async function paint(fixture: string, id: string, tag: 'rect' | 'circle') {
    const tree = await rendered(`flowchart/baseline/shapes/${fixture}`);
    const node = tree.find((n, t) => t.getAttr(n, 'data-id') === id)[0]!;
    return tree
      .find({ tag })
      .filter((r) => {
        for (let p = r.parent; p; p = p.parent) if (p === node) return true;
        return false;
      })
      .map((r) => ({
        fill: tree.getAttr(r, 'fill'),
        stroke: tree.getAttr(r, 'stroke'),
        rx: tree.getAttr(r, 'rx'),
        r: tree.getAttr(r, 'r'),
      }));
  }

  it('draws the bar with square corners, filled mainBkg and stroked nodeBorder', async () => {
    expect(await paint('fork-tb.mmd', 'f', 'rect')).toEqual([
      { fill: 'var(--_mb)', stroke: 'var(--_nb)', rx: undefined, r: undefined },
    ]);
  });

  it('draws fr-circ as a ring 14 across round one 5 across, both hollow', async () => {
    const hollow = { fill: 'var(--_mb)', stroke: 'var(--_nb)', rx: undefined };
    expect(await paint('fr-circ.mmd', 's', 'circle')).toEqual([
      { ...hollow, r: '7' },
      { ...hollow, r: '2.5' },
    ]);
  });

  it("leaves the state diagram's own fork and join filled in the line colour", async () => {
    const tree = await rendered('state-diagram/pr-check/should-render-forks-and-joins.mmd');
    const forks = tree
      .find({ tag: 'rect' })
      .filter((r) => tree.getAttr(r, 'class') === 'fork-join');
    expect(forks.length).toBeGreaterThan(0);
    for (const b of forks) {
      expect(tree.getAttr(b, 'fill')).toBe('var(--_l)');
      expect(tree.getAttr(b, 'stroke')).toBe('var(--_l)');
    }
  });
});
