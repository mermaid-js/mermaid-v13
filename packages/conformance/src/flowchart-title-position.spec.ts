import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from './index.ts';

// Subgraph title positions (mermaid-js/mermaid#2977), through `createMermaid().render()`:
// `flowchart.subGraphTitlePosition` for every subgraph, `id@{ titlePosition }` for one.
const DIR = join(REPO_ROOT, 'e2e/diagrams/flowchart');

interface Cluster {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Where the title is in the frame, each 0 to 1: 0.5 is the middle. */
  across: number;
  down: number;
}

const CLUSTER =
  /<g class="cluster[^"]*" data-id="([^"]*)"[^>]*><rect x="([^"]*)" y="([^"]*)" width="([^"]*)" height="([^"]*)"[^>]*\/><text class="cluster-label"[^>]* x="([^"]*)" y="([^"]*)"/g;

async function render(name: string, frontMatter = '') {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const source = await readFile(join(DIR, name), 'utf8');
  const { svg, warnings } = await m.render('mermaid-0', frontMatter + source);
  const clusters = new Map<string, Cluster>();
  for (const [, id, ...numbers] of svg.matchAll(CLUSTER)) {
    const [x, y, width, height, tx, ty] = numbers.map(Number) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    clusters.set(id!, {
      left: x,
      right: x + width,
      top: y,
      bottom: y + height,
      across: (tx - x) / width,
      down: (ty - y) / height,
    });
  }
  return { svg, clusters, warnings };
}

describe('flowchart subgraph title position', () => {
  it('puts each subgraph title where its own titlePosition says', async () => {
    const { clusters, warnings } = await render(
      'baseline/subgraphs/title-position-per-subgraph.mmd'
    );
    expect(warnings).toEqual([]);
    const at = (id: string) => clusters.get(id)!;
    for (const id of ['tl', 'tc', 'tr', 'plain', 'inner']) expect(at(id).down).toBeLessThan(0.3);
    for (const id of ['bl', 'bc', 'br']) expect(at(id).down).toBeGreaterThan(0.7);
    for (const id of ['tl', 'bl']) expect(at(id).across).toBeLessThan(0.4);
    for (const id of ['tr', 'br']) expect(at(id).across).toBeGreaterThan(0.6);
    for (const id of ['tc', 'bc', 'plain', 'inner']) expect(at(id).across).toBeCloseTo(0.5, 2);
  });

  it('draws top-center as it draws a subgraph with no position', async () => {
    const { clusters } = await render('baseline/subgraphs/title-position-per-subgraph.mmd');
    const [set, unset] = [clusters.get('tc')!, clusters.get('plain')!];
    expect(set.bottom - set.top).toBeCloseTo(unset.bottom - unset.top, 2);
    expect(set.right - set.left).toBeCloseTo(unset.right - unset.left, 2);
    expect(set.down).toBeCloseTo(unset.down, 4);
  });

  it('keeps a subgraph the same size with its title at the bottom', async () => {
    const { clusters } = await render('baseline/subgraphs/title-position-per-subgraph.mmd');
    const [top, low] = [clusters.get('tl')!, clusters.get('bl')!];
    expect(low.bottom - low.top).toBeCloseTo(top.bottom - top.top, 2);
    expect(low.right - low.left).toBeCloseTo(top.right - top.left, 2);
  });

  it('follows flowchart.subGraphTitlePosition, and a subgraph overrides it', async () => {
    const all = await render('baseline/subgraphs/title-position-config.mmd');
    expect(all.warnings).toEqual([]);
    const only = all.clusters.get('handlers.py')!;
    expect(only.across).toBeLessThan(0.4);
    expect(only.down).toBeGreaterThan(0.7);

    const mixed = await render('baseline/subgraphs/title-position-edge-from-above.mmd');
    expect(mixed.warnings).toEqual([]);
    const items = mixed.clusters.get('Items')!;
    expect(items.across).toBeLessThan(0.4);
    expect(items.down).toBeLessThan(0.3);
    const notes = mixed.clusters.get('Notes')!;
    expect(notes.across).toBeCloseTo(0.5, 2);
    expect(notes.down).toBeGreaterThan(0.7);
  });

  it('ignores a value that is not a position, with one warning each', async () => {
    const { clusters, warnings } = await render('nightly-check/title-position-unknown.mmd');
    expect(warnings.map((w) => w.code)).toEqual([
      'FLOWCHART_CONFIG_IGNORED',
      'FLOWCHART_TITLE_POSITION',
    ]);
    expect(warnings[0]!.message).toContain('flowchart.subGraphTitlePosition');
    expect(warnings[1]!.message).toContain('"two"');
    for (const c of clusters.values()) {
      expect(c.across).toBeCloseTo(0.5, 2);
      expect(c.down).toBeLessThan(0.3);
    }
  });

  it('leaves text output as it is', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const source = await readFile(
      join(DIR, 'baseline/subgraphs/title-position-config.mmd'),
      'utf8'
    );
    // The same diagram with the key at a value that changes nothing.
    const plain = source.replace('subGraphTitlePosition: bottom-left', 'nodeSpacing: 50');
    const moved = await m.render('mermaid-0', source, { format: 'ascii' });
    const kept = await m.render('mermaid-0', plain, { format: 'ascii' });
    expect(moved.text).toContain('handlers.py');
    expect(moved.text).toBe(kept.text);
    expect(moved.warnings).toEqual(kept.warnings);
  });
});
