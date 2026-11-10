/**
 * The `swimlane.*` engine keys (#601, D534) through the public `render()`, on their
 * `e2e/diagrams/swimlanes` fixtures: each draws differently from the same source with the key
 * flipped, in the way its description says. And `layout: swimlane` on another graph type (D535),
 * a class diagram in `e2e/diagrams/class-diagram`: its namespaces are laid out as lanes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from '../index.ts';
import { parseSvg, type SvgView } from '../svg-tree.ts';

const read = (path: string): string => readFileSync(join(REPO_ROOT, 'e2e/diagrams', path), 'utf8');
const fixture = (name: string): string => read(`swimlanes/pr-check/${name}.mmd`);

async function draw(text: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const r = await m.render('s', text);
  return { ...r, tree: parseSvg(r.svg) };
}

/** `text` with the config line `from` (exactly one, front matter indentation) replaced. */
function flip(text: string, from: string, to: string): string {
  const line = new RegExp(`^ {4}${from}(\r?)$`, 'm');
  expect(text).toMatch(line);
  return text.replace(line, `    ${to}$1`);
}

const classesOf = (tree: SvgView, el: ReturnType<SvgView['find']>[number]): string[] =>
  (tree.getAttr(el, 'class') ?? '').split(' ');

/** Each group's id and first rect, in drawing order, for groups with class `cls`. */
function boxes(tree: SvgView, cls: string) {
  return tree
    .find((n, t) => classesOf(t, n).includes(cls))
    .map((el) => {
      const rect = tree.children(el).find((k) => tree.getAttr(k, 'x') !== undefined)!;
      const at = (k: string) => Number(tree.getAttr(rect, k));
      return { id: tree.getAttr(el, 'data-id')!, x: at('x'), y: at('y'), height: at('height') };
    });
}

/** Every edge line's path data (an edge group's first path; markers follow it), in order. */
const edgePaths = (tree: SvgView): string[] =>
  tree
    .find((n, t) => classesOf(t, n).includes('flowchart-link'))
    .map((el) => tree.getAttr(tree.children(el).find((k) => tree.getAttr(k, 'd'))!, 'd')!);

describe('swimlane.* keys on their fixtures (D534)', () => {
  it('lineHops: gap cuts each crossing; false draws the same routes unbroken', async () => {
    const gap = await draw(fixture('line-hops-gap'));
    const off = await draw(fixture('line-hops-off'));
    expect(gap.warnings).toEqual([]);
    expect(off.warnings).toEqual([]);
    const [g, o] = [edgePaths(gap.tree), edgePaths(off.tree)];
    expect(g).toHaveLength(o.length);
    expect(g.length).toBeGreaterThan(0);
    const moves = (paths: string[]) => paths.join(' ').split('M').length;
    // A gap breaks a run in two: one more move per hop, never an arc.
    expect(moves(g)).toBeGreaterThan(moves(o));
    expect(g.join(' ')).not.toMatch(/A/);
    // The default (`arc`) hops with arcs instead.
    const arc = await draw(flip(fixture('line-hops-off'), 'lineHops: false', 'lineHops: arc'));
    expect(edgePaths(arc.tree).join(' ')).toMatch(/A/);
  });

  it('automaticLaneOrdering: true puts the busy lanes next to each other', async () => {
    const text = fixture('automatic-lane-ordering');
    const across = async (source: string) =>
      boxes((await draw(source)).tree, 'swimlane')
        .sort((a, b) => a.y - b.y)
        .map((l) => l.id);
    expect(await across(text)).toEqual(['Intake', 'Review', 'Delivery', 'Archive', 'Records']);
    const source = flip(text, 'automaticLaneOrdering: true', 'automaticLaneOrdering: false');
    expect(await across(source)).toEqual(['Intake', 'Archive', 'Review', 'Records', 'Delivery']);
  });

  it('ignoreCrossLaneEdges: false ranks with the cross-lane edges', async () => {
    const text = fixture('ignore-cross-lane-edges-off');
    const nodeYs = async (source: string) => {
      const { tree, warnings } = await draw(source);
      expect(warnings).toEqual([]);
      return tree
        .find((n, t) => classesOf(t, n).includes('node'))
        .map((el) => `${tree.getAttr(el, 'data-id')}:${tree.getAttr(el, 'transform')}`);
    };
    const ranked = await nodeYs(text);
    const own = await nodeYs(
      flip(text, 'ignoreCrossLaneEdges: false', 'ignoreCrossLaneEdges: true')
    );
    expect(ranked).toHaveLength(7);
    expect(ranked).not.toEqual(own);
  });
});

describe('layout: swimlane on another graph type (D535)', () => {
  it('lays a class diagram out with its namespaces as lanes', async () => {
    const text = read('class-diagram/pr-check/layout-swimlane-namespaces.mmd');
    const r = await draw(text);
    expect(r.diagramType).toBe('classDiagram');
    expect(r.warnings).toEqual([]);
    const lanes = boxes(r.tree, 'namespace');
    expect(lanes.map((l) => l.id)).toEqual(['Domain', 'Infra']);
    // Side by side across a TB flow, stretched to one length.
    const [a, b] = lanes as [(typeof lanes)[0], (typeof lanes)[0]];
    expect(a.y).toBeCloseTo(b.y, 2);
    expect(a.height).toBeCloseTo(b.height, 2);
    expect(b.x).toBeGreaterThan(a.x);
    // Class draws no lanes of its own: lane bands are flowchart's.
    expect(boxes(r.tree, 'swimlane')).toEqual([]);
    expect((await draw(text)).svg).toBe(r.svg);
  });
});
