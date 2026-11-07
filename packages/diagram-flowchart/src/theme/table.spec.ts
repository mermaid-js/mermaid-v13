/**
 * Flowchart's own theme variables (spec #414 T4, D331): the circle and cross arrowheads and the
 * per-shape node padding live in the plugin's table, keyed by family, never by theme name. The
 * point arrowhead, the rectangle, hexagon and circle padding stay in core (state and mindmap
 * read them too).
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import {
  THEME_NAMES,
  THEME_VARIABLES,
  createTheme,
  loadTheme,
  type ThemeWarning,
} from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { flowchart } from '../plugin.ts';

const { theme: table }: Pick<DiagramPlugin, 'id' | 'theme'> = flowchart;

// v12 12.2.0 markers.js, written out by hand (D152): redux and neo carry `look: neo` geometry
// (`*-margin` markers), the classic themes classic geometry.
const ARROWHEADS = [
  'circleArrowheadSize',
  'circleArrowheadGap',
  'crossArrowheadSize',
  'crossArrowheadGap',
  'crossArrowheadStrokeWidth',
];
const NEO_ARROWHEADS = [14, 3.15, 10.4, 2.96, 2];
const CLASSIC_ARROWHEADS = [11, 1.1, 9, 2, 2];

const PADDING = [
  'stadiumPaddingX',
  'stadiumPaddingY',
  'doubleCircleGap',
  'doubleCirclePadding',
  'circleMinDiameter',
  'subroutinePaddingX',
  'subroutinePaddingY',
  'cylinderPaddingX',
  'cylinderPaddingY',
  'leanPaddingX',
  'leanPaddingY',
  'oddPaddingX',
  'oddPaddingY',
];
// v12 neo, with v13's circle (D151), at flowchart.padding 15.
const REDUX_PADDING = [40, 24, 12, 16, 44, 28, 12, 24, 24, 30, 15, 42, 24];
// v12 classic at flowchart.padding 15 (padding, …, no circle minimum).
const CLASSIC_PADDING = [15, 15, 5, 15, 0, 15, 15, 15, 15, 15, 15, 15, 15];

const OWN = [...ARROWHEADS, ...PADDING];
const CLASSIC = new Set(['default', 'dark', 'forest', 'neutral', 'base']);

const themed = async (name: string, options: Parameters<typeof createTheme>[1] = {}) =>
  createTheme(await loadTheme(name as 'default'), {
    diagram: table,
    cssVariables: false,
    ...options,
  });
const read = (t: Awaited<ReturnType<typeof themed>>, names: string[], padding: number) =>
  names.map((n) => (table.vars[n]?.kind === 'padding' ? t.padding(n, padding) : t.number(n)));

describe('the flowchart theme table (#414 T4)', () => {
  it('owns its variables; core no longer names them', () => {
    expect(Object.keys(table.vars).sort()).toEqual([...OWN].sort());
    for (const name of OWN) expect(THEME_VARIABLES[name], name).toBeUndefined();
  });

  it.each(THEME_NAMES)('pins the circle and cross arrowheads of %s (D152)', async (name) => {
    const expected = CLASSIC.has(name) ? CLASSIC_ARROWHEADS : NEO_ARROWHEADS;
    expect(read(await themed(name), ARROWHEADS, 15)).toEqual(expected);
  });

  it.each(THEME_NAMES)('pins the shape padding of %s (#83, D151, D152)', async (name) => {
    const expected = CLASSIC.has(name) ? CLASSIC_PADDING : REDUX_PADDING;
    expect(read(await themed(name), PADDING, 15)).toEqual(expected);
  });

  it('scales the classic padding with the diagram padding; in redux only the lean padding', async () => {
    expect(read(await themed('default'), PADDING, 10)).toEqual([
      10, 10, 5, 10, 0, 10, 10, 10, 10, 10, 10, 10, 10,
    ]);
    // v12 neo lean and trapezoid shapes take 2 × padding / padding too.
    expect(read(await themed('redux-color'), PADDING, 10)).toEqual([
      ...REDUX_PADDING.slice(0, 9),
      20,
      10,
      42,
      24,
    ]);
  });

  it('lets themeVariables override them, as numbers, px or a multiple of padding', async () => {
    const warnings: ThemeWarning[] = [];
    const t = await themed('redux-color', {
      themeVariables: {
        crossArrowheadSize: '20px',
        circleArrowheadGap: 0,
        stadiumPaddingX: '3 * padding',
        oddPaddingY: '9px',
        cylinderPaddingX: '-4',
      },
      warn: (w) => warnings.push(w),
    });
    expect(t.number('crossArrowheadSize')).toBe(20);
    expect(t.number('circleArrowheadGap')).toBe(0);
    expect(t.padding('stadiumPaddingX', 10)).toBe(30);
    expect(t.padding('oddPaddingY', 10)).toBe(9);
    expect(t.padding('cylinderPaddingX', 10)).toBe(24);
    expect(warnings.map((w) => w.code)).toEqual(['THEME_VARIABLE_DROPPED']);
  });

  it('reads them as numbers only, with no CSS alias on the root (D152)', async () => {
    const t = await themed('redux-color', { cssVariables: true });
    t.number('crossArrowheadSize');
    t.padding('stadiumPaddingX', 15);
    expect(t.rootStyle()).toEqual({});
  });
});
