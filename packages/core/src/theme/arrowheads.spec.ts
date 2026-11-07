import { describe, expect, it } from 'vitest';
import { createTheme, loadTheme, THEME_NAMES, type ThemeName } from './index.ts';

// v12 12.2.0 markers.js, written out by hand (D152). Redux themes carry `look: neo` geometry
// (`*-margin` markers); classic themes carry classic geometry.
// Flowchart's circle and cross arrowheads: diagram-flowchart/src/theme/table.spec.ts (#414 T4).
const NEO = {
  arrowheadGap: 4,
  arrowheadLength: 10.5,
  arrowheadWidth: 12.78,
};
const CLASSIC = {
  arrowheadGap: 0,
  arrowheadLength: 8,
  arrowheadWidth: 8,
};
const EXPECTED: Record<ThemeName, typeof NEO> = {
  redux: NEO,
  'redux-color': NEO,
  'redux-dark': NEO,
  'redux-dark-color': NEO,
  default: CLASSIC,
  dark: CLASSIC,
  forest: CLASSIC,
  neutral: CLASSIC,
  base: CLASSIC,
  neo: NEO,
  'neo-dark': NEO,
};

const resolve = async (name: ThemeName, themeVariables?: Record<string, unknown>) => {
  const t = createTheme(await loadTheme(name), { themeVariables });
  return Object.fromEntries(Object.keys(NEO).map((k) => [k, t.number(k)]));
};

describe('arrowhead geometry per theme (D152)', () => {
  it('covers every shipped theme', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...THEME_NAMES].sort());
  });

  it.each(THEME_NAMES)('pins the arrowhead values of %s', async (name) => {
    expect(await resolve(name)).toEqual(EXPECTED[name]);
  });

  it('lets themeVariables override them, as numbers or px lengths', async () => {
    const r = await resolve('redux-color', { arrowheadGap: 0, arrowheadLength: '20px' });
    expect(r.arrowheadGap).toBe(0);
    expect(r.arrowheadLength).toBe(20);
    expect((await resolve('default', { arrowheadGap: 4 })).arrowheadGap).toBe(4);
  });

  it('reads them as numbers only, with no CSS alias on the root', async () => {
    const t = createTheme(await loadTheme('redux-color'));
    t.number('arrowheadGap');
    expect(t.rootStyle()).toEqual({});
  });
});
