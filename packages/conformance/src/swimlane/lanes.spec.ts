/**
 * Swimlane lane drawing and warnings (spec #528 "Flowchart side", D535, D536, #598), through the
 * public `render()`: each top-level subgraph laid out by the `swimlane` engine draws as v12's
 * swimlane cluster (`g.cluster.swimlane` holding `rect.swimlane-body`, `rect.swimlane-title`
 * and the label), with the title band on top for TB/BT and on the left, label turned −90°, for
 * LR/RL. The engine's default lane draws with no label; nested subgraphs stay plain boxes.
 * Fixtures are `e2e/diagrams/swimlanes`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { swimlane } from '@mermaid-js/core/layout/swimlane';
import { createMermaid, type InitializeConfig } from 'mermaid';
import { REPO_ROOT } from '../index.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';

const fixture = (name: string): string =>
  readFileSync(join(REPO_ROOT, 'e2e/diagrams/swimlanes/pr-check', `${name}.mmd`), 'utf8');

async function draw(text: string, config: InitializeConfig = {}) {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  const r = await m.render('s', text);
  return { ...r, tree: parseSvg(r.svg) };
}

const classesOf = (tree: SvgView, n: SvgElement): string[] =>
  (tree.getAttr(n, 'class') ?? '').split(' ');

interface Lane {
  readonly id: string;
  readonly ast?: string;
  readonly el: SvgElement;
  readonly body: Rect;
  readonly title: Rect;
  readonly label?: SvgElement;
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const rectOf = (tree: SvgView, n: SvgElement): Rect => {
  const at = (k: string) => Number(tree.getAttr(n, k));
  return { x: at('x'), y: at('y'), width: at('width'), height: at('height') };
};

/** Every lane group, in drawing order. */
function lanesOf(tree: SvgView): Lane[] {
  return tree
    .find((n, t) => classesOf(t, n).includes('swimlane'))
    .map((el) => {
      const kids = tree.children(el);
      const part = (cls: string) => kids.find((k) => classesOf(tree, k).includes(cls))!;
      return {
        id: tree.getAttr(el, 'data-id')!,
        ast: tree.getAttr(el, 'data-ast'),
        el,
        body: rectOf(tree, part('swimlane-body')),
        title: rectOf(tree, part('swimlane-title')),
        label: kids.find((k) => classesOf(tree, k).includes('swimlane-label')),
      };
    });
}

const close = (a: number, b: number): boolean => Math.abs(a - b) < 0.02;

describe('lane title bands in all four directions (D536)', () => {
  const cases = [
    ['subgraph-in-lane-tb', 'TB'],
    ['lane-title-bands-bt', 'BT'],
    ['subgraph-in-lane-lr', 'LR'],
    ['lane-title-bands-rl', 'RL'],
  ] as const;

  it.each(cases)('%s (%s)', async (name, direction) => {
    const text = fixture(name);
    expect(text).toContain(`swimlane-beta ${direction}\n`);
    const { tree } = await draw(text);
    const lanes = lanesOf(tree);
    expect(lanes.length).toBeGreaterThanOrEqual(2);
    const turned = direction === 'LR' || direction === 'RL';
    for (const { id, body, title, label } of lanes) {
      // v12's order: the body, then the title band, then the label.
      if (turned) {
        // The band is a strip on the left, as tall as the lane; the body takes the rest.
        expect(close(title.height, body.height), id).toBe(true);
        expect(close(title.y, body.y), id).toBe(true);
        expect(close(title.x + title.width, body.x), id).toBe(true);
        expect(title.width).toBeLessThan(body.width);
      } else {
        // The band is a strip on top, as wide as the lane; the body is under it.
        expect(close(title.width, body.width), id).toBe(true);
        expect(close(title.x, body.x), id).toBe(true);
        expect(close(title.y + title.height, body.y), id).toBe(true);
        expect(title.height).toBeLessThan(body.height);
      }
      if (!label) continue;
      // Centred in the band, turned to read upward when the band is on the left.
      const x = Number(tree.getAttr(label, 'x'));
      expect(close(x, title.x + title.width / 2), id).toBe(true);
      const transform = tree.getAttr(label, 'transform');
      if (turned) expect(transform).toMatch(/^rotate\(-90,[\d.]+,[\d.]+\)$/);
      else expect(transform).toBeUndefined();
    }
  });

  it('draws RL lanes as LR lanes, the band on the left (v12 put it on the right: listed fix)', async () => {
    const rl = lanesOf((await draw(fixture('lane-title-bands-rl'))).tree);
    const lr = lanesOf(
      (await draw(fixture('lane-title-bands-rl').replace('swimlane-beta RL', 'swimlane-beta LR')))
        .tree
    );
    const bands = (lanes: Lane[]) => lanes.map((l) => [l.id, l.title.x, l.title.width]);
    expect(bands(rl)).toEqual(bands(lr));
  });

  it('grows a lane across the flow to hold a title longer than its content', async () => {
    for (const name of ['lane-title-bands-bt', 'lane-title-bands-rl']) {
      const text = fixture(name);
      const short = text.replace('L2[Warehouse and dispatch, second shift]', 'L2[W]');
      const across = async (t: string) => {
        const l2 = lanesOf((await draw(t)).tree).find((l) => l.id === 'L2')!;
        return name.endsWith('rl') ? l2.title.height : l2.title.width;
      };
      // The deterministic measurer makes the long title about 237 wide: lane = title + 2 × 20.
      expect(await across(text)).toBeGreaterThan((await across(short)) + 30);
    }
  });
});

describe('the default lane', () => {
  it('draws the engine lane for loose nodes, with no label and no data-ast', async () => {
    const { tree, warnings } = await draw(fixture('default-swimlane-for-unassigned-nodes'));
    // The fixture's v12 `htmlLabels` key is CONFIG_REMOVED_KEY; nothing else.
    expect(warnings.map((w) => w.code)).toEqual(['CONFIG_REMOVED_KEY']);
    const lanes = lanesOf(tree);
    expect(lanes.map((l) => l.id)).toEqual(['__swimlane_default__', 'OwnedLane']);
    const loose = lanes[0]!;
    expect(loose.ast).toBeUndefined();
    expect(loose.label).toBeUndefined();
    expect(lanes[1]!.ast).toBe('s:OwnedLane');
  });

  it('takes the palette slot after every subgraph (v12 colorIndex = max + 1)', async () => {
    const { tree } = await draw(fixture('synthetic-default-lane-colour'), {
      output: { cssVariables: false },
    });
    const slot = (l: Lane) => tree.getAttr(l.el, 'data-color-id');
    const lanes = lanesOf(tree);
    expect(lanes.map(slot)).toEqual(['color-1', 'color-0']);
    const nested = await draw(
      fixture('subgraph-in-lane-tb').replace('  B --> C', '  X --> A\n  B --> C')
    );
    // Sales (0), its Intake group (1), Warehouse (2): the default lane takes 3.
    expect(
      lanesOf(nested.tree).map((l) => [l.id, nested.tree.getAttr(l.el, 'data-color-id')])
    ).toEqual([
      ['__swimlane_default__', 'color-3'],
      ['L1', 'color-0'],
      ['L2', 'color-2'],
    ]);
  });

  it('draws no lanes for a flowchart laid out by layered', async () => {
    const text = fixture('default-swimlane-for-unassigned-nodes').replace(
      'swimlane-beta',
      'flowchart'
    );
    const { tree, svg } = await draw(text);
    expect(lanesOf(tree)).toEqual([]);
    expect(svg).not.toContain('__swimlane_default__');
  });
});

describe('nested groups', () => {
  it('draws a subgraph nested in a lane as a plain subgraph box', async () => {
    const { tree } = await draw(fixture('subgraph-in-lane-lr'));
    const g1 = tree.find((n, t) => t.getAttr(n, 'data-id') === 'G1')[0]!;
    expect(classesOf(tree, g1)).toEqual(['cluster']);
    expect(tree.children(g1).map((k) => tree.tag(k))).toEqual(['rect', 'text']);
    expect(lanesOf(tree).map((l) => l.id)).toEqual(['L1', 'L2']);
  });
});

describe('lanes follow the engine that laid out, not the layout name', () => {
  const text = fixture('subgraph-in-lane-tb');

  it('draws no lanes and warns nothing swimlane on a placeholder render (layered stands in)', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    await m.preload({ types: ['flowchart'] });
    const r = m.renderSync(text, { placeholders: true });
    expect(r.warnings.map((w) => w.code)).toEqual(['PLACEHOLDER']);
    expect(lanesOf(parseSvg(r.svg))).toEqual([]);
  });

  it('draws lanes for an engine registered under another name', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    m.registerLayoutLoaders([{ name: 'lanes', loader: () => Promise.resolve(swimlane) }]);
    const body = text.replace(/^---[\s\S]*?---\n/, '');
    const r = await m.render('s', `---\nconfig:\n  layout: lanes\n---\n${body}`);
    expect(r.warnings.map((w) => w.code)).toEqual(['SWIMLANE_NESTED_LANE']);
    expect(lanesOf(parseSvg(r.svg)).map((l) => l.id)).toEqual(['L1', 'L2']);
  });
});

describe('warnings (D226, D536)', () => {
  it('SWIMLANE_SHARED_NODE for a node listed again in a group nested in another lane', async () => {
    const text =
      'swimlane-beta TB\n  subgraph A\n    a\n  end\n  subgraph B\n    subgraph C\n      a\n    end\n  end';
    const { warnings } = await draw(text);
    expect(warnings).toEqual([
      {
        code: 'SWIMLANE_SHARED_NODE',
        message: 'Swimlane node "a" is listed in lanes "A" and "B"; it is drawn in "A" only.',
        astIds: ['s:A', 's:B'],
      },
      expect.objectContaining({ code: 'SWIMLANE_NESTED_LANE', astIds: ['s:C'] }),
    ]);
  });

  it('names a subgraph listed in two lanes as a subgraph', async () => {
    const text =
      'swimlane-beta TB\n  subgraph A\n    subgraph S\n      x\n    end\n  end\n  subgraph B\n    S\n  end';
    const { warnings } = await draw(text);
    expect(warnings.find((w) => w.code === 'SWIMLANE_SHARED_NODE')?.message).toBe(
      'Swimlane subgraph "S" is listed in lanes "A" and "B"; it is drawn in "A" only.'
    );
  });

  it('SWIMLANE_SHARED_NODE: a node in two lanes stays in the first, both lanes in astIds', async () => {
    const { warnings, tree } = await draw(fixture('shared-node-in-two-lanes'));
    expect(warnings).toEqual([
      {
        code: 'SWIMLANE_SHARED_NODE',
        message:
          'Swimlane node "a" is listed in lanes "lane1" and "phase1"; it is drawn in "lane1" only.',
        astIds: ['s:lane1', 's:phase1'],
      },
    ]);
    // Drawn once, inside lane1.
    const a = tree.find((n, t) => t.getAttr(n, 'data-id') === 'a');
    expect(a).toHaveLength(1);
  });

  it('SWIMLANE_SHARED_NODE resolves a node kept by a nested group to its lane', async () => {
    const { warnings } = await draw(fixture('synthetic-shared-node-nested-lane'));
    expect(warnings.map((w) => [w.code, w.astIds])).toEqual([
      ['SWIMLANE_SHARED_NODE', ['s:lane1', 's:lane2']],
      ['SWIMLANE_NESTED_LANE', ['s:inner']],
    ]);
    expect(warnings[0]!.message).toContain('"lane1" and "lane2"');
  });

  it('SWIMLANE_NESTED_LANE: one per subgraph nested in a lane', async () => {
    const { warnings } = await draw(fixture('subgraph-in-lane-tb'));
    expect(warnings).toEqual([
      {
        code: 'SWIMLANE_NESTED_LANE',
        message:
          'Swimlane subgraph "G1" is nested in "L1"; only top-level subgraphs are lanes, so it is drawn as a plain box.',
        astIds: ['s:G1'],
      },
    ]);
  });

  it('is silent for a node listed in a lane and in a group nested inside it', async () => {
    const text =
      'swimlane-beta TB\n  subgraph L[Lane]\n    subgraph G\n      a\n    end\n    a\n  end';
    const { warnings } = await draw(text);
    expect(warnings.map((w) => w.code)).toEqual(['SWIMLANE_NESTED_LANE']);
  });

  it('warns only when the swimlane engine lays the render out (D535)', async () => {
    const shared = fixture('shared-node-in-two-lanes');
    const nested = fixture('subgraph-in-lane-tb');
    const body = (text: string) => text.replace(/^---[\s\S]*?---\n/, '');
    const layout = (name: string, text: string) =>
      `---\nconfig:\n  layout: ${name}\n---\n${body(text)}`;
    for (const text of [shared, nested]) {
      expect((await draw(text.replace('swimlane-beta', 'flowchart'))).warnings).toEqual([]);
      const layered = await draw(layout('layered', text));
      expect(layered.warnings).toEqual([]);
      expect(lanesOf(layered.tree)).toEqual([]);
    }
    // Any flowchart may select the engine: its top-level subgraphs are lanes, with the warnings.
    const r = await draw(layout('swimlane', nested.replace('swimlane-beta', 'flowchart')));
    expect(r.warnings.map((w) => w.code)).toEqual(['SWIMLANE_NESTED_LANE']);
    expect(lanesOf(r.tree).map((l) => l.id)).toEqual(['L1', 'L2']);
  });
});
