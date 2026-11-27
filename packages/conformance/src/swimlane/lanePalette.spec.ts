/**
 * v12's `swimlanes/lanePalette.spec.ts` (upstream c9b12739f), on what v13 renders. v12 asserted
 * the CSS its stylesheet emitted (`[data-color-id]` lane rules); v13 paints the palette slot as
 * attributes on both lane rects (flowchart's per-subgraph palette, #86, `render.ts`
 * `paletteSlots`), so each case reads the rendered lane instead:
 * - each colour theme paints both halves of lane i in slot i (stroke, and fill where the theme
 *   has a background palette); the sketched outline takes the slot too (`plugin-hand-drawn`
 *   `swimlane.spec.ts`);
 * - nested subgraphs keep the generic cluster palette, lanes take the lane form;
 * - a lane with no slot is stroked `clusterBorder` (v12's `:not([data-color-id])` override);
 * - the author's `style` still wins over the palette (v12: no lane palette rule is `!important`);
 * - no empty or undefined paint;
 * - `redux-dark-color` has no background palette, so both halves take `clusterBkg` there (D768);
 * - the plain themes write no palette slot at all.
 */
import { describe, expect, it } from 'vitest';
import { THEME_NAMES, createTheme, loadTheme } from '@mermaid-js/core/theme';
import { createMermaid, type InitializeConfig } from 'mermaid';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';
import { hex } from '../hex.ts';

interface Palette {
  readonly border: string[];
  readonly bkg: string[];
  readonly clusterBkg: string;
  readonly clusterBorder: string;
}

async function paletteOf(name: (typeof THEME_NAMES)[number]): Promise<Palette> {
  const theme = createTheme(await loadTheme(name), { cssVariables: false });
  return {
    border: theme.palette('borderColorArray').map((c) => hex(String(c), (x) => x)),
    bkg: theme.palette('bkgColorArray').map((c) => hex(String(c), (x) => x)),
    clusterBkg: hex(String(theme.value('clusterBkg')), (x) => x),
    clusterBorder: hex(String(theme.value('clusterBorder')), (x) => x),
  };
}

const palettes = new Map(
  await Promise.all(THEME_NAMES.map(async (n) => [n, await paletteOf(n)] as const))
);
const COLOUR_THEMES = THEME_NAMES.filter((n) => palettes.get(n)!.border.length > 0);
const PLAIN_THEMES = THEME_NAMES.filter((n) => palettes.get(n)!.border.length === 0);

/** `n` lanes of one node each, the first holding a nested group. */
const lanes = (n: number, extra = '') =>
  'swimlane-beta TB\n' +
  Array.from({ length: n }, (_, i) =>
    i === 0
      ? '  subgraph L0\n    subgraph N0\n      a0\n    end\n  end'
      : `  subgraph L${i}\n    a${i}\n  end`
  ).join('\n') +
  extra;

async function draw(theme: string, text: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true, theme, output: { cssVariables: false } } as InitializeConfig);
  const r = await m.render('s', text);
  return { ...r, tree: parseSvg(r.svg) };
}

const classesOf = (tree: SvgView, n: SvgElement) => (tree.getAttr(n, 'class') ?? '').split(' ');

/** A lane's slot and the paint of its two halves. */
function laneOf(tree: SvgView, id: string) {
  const el = tree.find(
    (n, t) => t.getAttr(n, 'data-id') === id && classesOf(t, n).includes('swimlane')
  )[0]!;
  const half = (cls: string) => {
    const r = tree.children(el).find((k) => classesOf(tree, k).includes(cls))!;
    return {
      stroke: hex(tree.getAttr(r, 'stroke'), (x) => x),
      fill: hex(tree.getAttr(r, 'fill'), (x) => x),
    };
  };
  return {
    slot: tree.getAttr(el, 'data-color-id'),
    title: half('swimlane-title'),
    body: half('swimlane-body'),
  };
}

describe.each(COLOUR_THEMES)('%s lane palette', (theme) => {
  const { border, bkg, clusterBkg } = palettes.get(theme)!;

  it('paints both halves of lane i in slot i', async () => {
    // One lane past the palette (L0's nested group takes slot 1, so lanes take 0, 2, 3, …).
    const n = border.length;
    const { tree, warnings } = await draw(theme, lanes(n));
    expect(warnings.map((w) => w.code)).toEqual(['SWIMLANE_NESTED_LANE']);
    for (let i = 0; i < n; i++) {
      const order = i === 0 ? 0 : i + 1;
      const slot = order % border.length;
      const lane = laneOf(tree, `L${i}`);
      expect(lane.slot, `L${i}`).toBe(`color-${slot}`);
      expect(lane.title.stroke).toBe(border[slot]);
      expect(lane.body.stroke).toBe(border[slot]);
      if (bkg.length > 0) {
        expect(lane.title.fill).toBe(bkg[order % bkg.length]);
        expect(lane.body.fill).toBe(bkg[order % bkg.length]);
      } else {
        expect(lane.title.fill).toBe(clusterBkg);
        expect(lane.body.fill).toBe(clusterBkg);
      }
    }
  });

  it('keeps the generic cluster palette for a group nested in a lane', async () => {
    const { tree } = await draw(theme, lanes(2));
    const nested = tree.find((n, t) => t.getAttr(n, 'data-id') === 'N0')[0]!;
    expect(classesOf(tree, nested)).toEqual(['cluster']);
    expect(tree.getAttr(nested, 'data-color-id')).toBe('color-1');
    const rect = tree.children(nested).find((k) => tree.tag(k) === 'rect')!;
    expect(hex(tree.getAttr(rect, 'stroke'), (x) => x)).toBe(border[1]);
  });

  it('lets the author’s style win over the palette', async () => {
    const { tree } = await draw(theme, lanes(2, '\n  style L1 stroke:#123456,fill:#abcdef'));
    const lane = laneOf(tree, 'L1');
    expect(lane.slot).toBe('color-2');
    expect([lane.title.stroke, lane.body.stroke]).toEqual(['#123456', '#123456']);
    expect([lane.title.fill, lane.body.fill]).toEqual(['#abcdef', '#abcdef']);
  });

  it('writes no empty or undefined paint', async () => {
    const { svg } = await draw(theme, lanes(3, '\n  loose --> a1'));
    expect(svg).not.toMatch(/="(undefined|NaN)?"/);
  });
});

it('fills lanes from the background palette only where the theme has one', () => {
  expect(palettes.get('redux-color')!.bkg.length).toBeGreaterThan(0);
  expect(palettes.get('redux-dark-color')!.bkg).toEqual([]);
  expect(COLOUR_THEMES).toEqual(expect.arrayContaining(['redux-color', 'redux-dark-color']));
});

describe.each(PLAIN_THEMES)('%s lanes', (theme) => {
  it('write no palette slot and stroke both halves clusterBorder', async () => {
    const { clusterBkg, clusterBorder } = palettes.get(theme)!;
    const { tree, svg } = await draw(theme, lanes(3, '\n  loose --> a1'));
    expect(svg).not.toContain('data-color-id');
    for (const id of ['__swimlane_default__', 'L0', 'L1', 'L2']) {
      const lane = laneOf(tree, id);
      expect(lane.title, id).toEqual({ stroke: clusterBorder, fill: clusterBkg });
      // The body is filled as the band is (#1217, #1245, #1316, D768), the default lane too.
      expect(lane.body, id).toEqual({ stroke: clusterBorder, fill: clusterBkg });
    }
  });
});
