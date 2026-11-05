import { describe, expect, it } from 'vitest';
import { createTheme, loadTheme, THEME_NAMES, type ThemeName } from './index.ts';

// v12 12.2.0 markers.js, written out by hand (D152). Redux themes carry `look: neo` geometry
// (`*-margin` markers); classic themes carry classic geometry.
const NEO = {
  arrowheadGap: 4,
  arrowheadLength: 10.5,
  arrowheadWidth: 12.78,
  circleArrowheadSize: 14,
  circleArrowheadGap: 3.15,
  crossArrowheadSize: 10.4,
  crossArrowheadGap: 2.96,
  crossArrowheadStrokeWidth: 2,
};
const CLASSIC = {
  arrowheadGap: 0,
  arrowheadLength: 8,
  arrowheadWidth: 8,
  circleArrowheadSize: 11,
  circleArrowheadGap: 1.1,
  crossArrowheadSize: 9,
  crossArrowheadGap: 2,
  crossArrowheadStrokeWidth: 2,
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
    const r = await resolve('redux-color', { arrowheadGap: 0, crossArrowheadSize: '20px' });
    expect(r.arrowheadGap).toBe(0);
    expect(r.crossArrowheadSize).toBe(20);
    expect((await resolve('default', { arrowheadGap: 4 })).arrowheadGap).toBe(4);
  });

  it('reads them as numbers only, with no CSS alias on the root', async () => {
    const t = createTheme(await loadTheme('redux-color'));
    t.number('arrowheadGap');
    expect(t.rootStyle()).toEqual({});
  });
});
