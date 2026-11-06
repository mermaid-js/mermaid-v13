// Mindmap layout (spec #294 T3): shape sizes against v12's formulas, the icon slot (D297), the
// graph the engines get, and the layout invariants on hand-built models. Labels are measured
// with `gridMeasurer` (10 px a character, 20 px a line), so the expected sizes are worked out
// by hand from v12's shape files, not from the code under test.
import { describe, expect, it } from 'vitest';
import { tree } from '@mermaid-js/core/layout/tree';
import type { MindmapShape } from '../model.ts';
import { contextFor, fixtureModel, themeNamed } from './fixtures.ts';
import { layoutMindmap } from './layout.ts';

/** The one node of a root-only mindmap, laid out with `config` over the defaults. */
async function only(label: string, shape: MindmapShape, config = {}, icon?: string) {
  const ctx = contextFor(tree, await themeNamed(), config);
  const layout = layoutMindmap(fixtureModel([{ label, shape, depth: 0, icon }]), ctx);
  return layout.mindmap.nodes[0]!;
}

const size = (n: { width: number; height: number }) => [n.width, n.height];

describe('shape sizes at default config (v12 formulas, padding 10)', () => {
  it('default: label + 4·padding wide, label + padding high (defaultMindmapNode.ts)', async () => {
    const n = await only('abcd', 'default');
    expect(n.frame).toMatchObject({ width: 80, height: 30 });
    expect(size(n)).toEqual([80, 30]);
  });

  it('rounded: 15 on each side whatever the padding (renderer override, roundedRect.ts)', async () => {
    expect(size(await only('abcd', 'rounded'))).toEqual([70, 50]);
    expect(size(await only('abcd', 'rounded', { mindmap: { padding: 5 } }))).toEqual([70, 50]);
  });

  it('rect: 20 across and 10 down on each side whatever the padding (squareRect.ts)', async () => {
    expect(size(await only('abcd', 'rect'))).toEqual([80, 40]);
    expect(size(await only('abcd', 'rect', { mindmap: { padding: 30 } }))).toEqual([80, 40]);
  });

  it("circle: diameter = the label's diagonal + 2·padding (circle.ts; padding reaches it, GAPS #387)", async () => {
    const n = await only('abcd', 'circle');
    expect(n.width).toBeCloseTo(Math.sqrt(40 ** 2 + 20 ** 2) + 20, 9);
    expect(n.height).toBe(n.width);
    expect((await only('abcd', 'circle', { mindmap: { padding: 0 } })).width).toBeCloseTo(
      Math.sqrt(2000),
      9
    );
  });

  it('cloud: a frame of label + padding, the node the bulging path round it (cloud.ts)', async () => {
    const n = await only('abcd', 'cloud');
    expect(n.frame).toMatchObject({ width: 50, height: 30 });
    expect(n.outline?.arcs).toHaveLength(10);
    // The arcs reach out of the frame on every side (`getBBox` of the path, as v12 sized it).
    expect(n.width).toBeGreaterThan(50);
    expect(n.height).toBeGreaterThan(30);
  });

  it('bang: label + 5·padding by label + 4·padding, at least label + 20 (bang.ts)', async () => {
    expect((await only('abcd', 'bang')).frame).toMatchObject({ width: 90, height: 60 });
    const tight = await only('abcd', 'bang', { mindmap: { padding: 0 } });
    expect(tight.frame).toMatchObject({ width: 60, height: 40 });
    expect(tight.outline?.arcs).toHaveLength(14);
  });

  it('hexagon: padding doubled; h = label + 20, w = label + 2h/4 + 20 (hexagon.ts)', async () => {
    const n = await only('abcd', 'hexagon');
    expect(size(n)).toEqual([80, 40]);
    expect(n.point).toBe(10);
    expect(size(await only('abcd', 'hexagon', { mindmap: { padding: 5 } }))).toEqual([65, 30]);
  });

  it('default honours mindmap.padding', async () => {
    expect(size(await only('abcd', 'default', { mindmap: { padding: 5 } }))).toEqual([60, 25]);
  });
});

describe('labels', () => {
  it('wrap at mindmap.maxNodeWidth in every shape (D287)', async () => {
    const config = { mindmap: { maxNodeWidth: 50 } };
    for (const shape of ['default', 'rect', 'rounded', 'hexagon', 'circle'] as const) {
      const n = await only('aaaa bbbb cccc', shape, config);
      expect([n.label.width, n.label.height], shape).toEqual([40, 60]);
    }
    expect((await only('aaaa bbbb cccc', 'rect')).label.width).toBe(140);
  });

  it('are markdown: `**x**` is bold, line breaks start lines', async () => {
    const n = await only('**bold** text<br>two', 'default');
    expect(n.label.lines).toHaveLength(2);
    expect(n.label.lines[0]![0]!.text).toBe('bold');
  });

  it("keep v12's multi-line text without the blank lines round it", async () => {
    const n = await only('\n  The root\n', 'rect');
    expect(n.label.lines.length).toBe(1);
    expect(n.label.width).toBe(80);
  });

  it('are measured in the theme font', async () => {
    const seen: string[] = [];
    const t = await themeNamed();
    const ctx = contextFor(
      tree,
      t,
      {},
      {
        id: 'spy',
        width: (text, font) => (
          seen.push(`${font.family}/${font.size}/${font.weight}`),
          text.length
        ),
        metrics: () => ({ ascent: 1, descent: 0, lineHeight: 1 }),
      }
    );
    layoutMindmap(fixtureModel([{ label: 'a', depth: 0 }]), ctx);
    expect(seen[0]).toBe(`${t.value('fontFamily')}/${t.number('fontSize')}/400`);
  });
});

describe('the icon slot (D297)', () => {
  it('widens a shape by 50 and makes it at least 60 high, the icon left of the label', async () => {
    const n = await only('abcd', 'default', {}, 'mdi:fire');
    expect(size(n)).toEqual([130, 60]);
    expect(n.labelAt).toEqual({ x: 25, y: 0 });
    expect(n.icon).toEqual({ at: { x: -20, y: 0 }, slot: 50, glyph: 40 });
  });

  it('grows a circle by 50 both ways, the icon row above the label', async () => {
    const plain = await only('abcd', 'circle');
    const n = await only('abcd', 'circle', {}, 'fa fa-book');
    expect(n.width).toBeCloseTo(plain.width + 50, 9);
    expect(n.height).toBeCloseTo(plain.height + 50, 9);
    expect(n.labelAt).toEqual({ x: 0, y: 25 });
    expect(n.icon).toEqual({ at: { x: 0, y: -10 }, slot: 50, glyph: 40 });
  });

  it('keeps a tall node its height', async () => {
    const n = await only('a<br>b<br>c<br>d', 'rect', {}, 'x');
    expect(size(n)).toEqual([10 + 40 + 50, 80 + 20]);
  });
});

describe('config', () => {
  it('warns and uses the default for a padding or width it cannot take (pitfall 22)', async () => {
    const ctx = contextFor(tree, await themeNamed(), {
      mindmap: { padding: -1, maxNodeWidth: 0 },
    });
    const n = layoutMindmap(fixtureModel([{ label: 'abcd', depth: 0 }]), ctx).mindmap.nodes[0]!;
    expect(size(n)).toEqual([80, 30]);
    expect(ctx.warnings.map((w) => [w.code, w.path])).toEqual([
      ['MINDMAP_CONFIG_IGNORED', 'mindmap.padding'],
      ['MINDMAP_CONFIG_IGNORED', 'mindmap.maxNodeWidth'],
    ]);
  });
});
