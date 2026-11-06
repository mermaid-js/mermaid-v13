/**
 * #327: the journey theme variables against v12 12.2.0's resolved `getThemeVariables()`
 * (D151: v12 is the oracle). `fillType0`–`fillType7` are each theme's v12 value (GAPS "Hue
 * rotation": literals, as the DSL has no hue turn); `faceColor` is v12's `.face` fallback,
 * which no v12 theme overrides; `actor0`–`actor5` have no value in any theme (D249), so the
 * renderer uses `journey.actorColours`.
 */
import {
  THEME_NAMES,
  createTheme,
  formatColor,
  loadTheme,
  parseColor,
} from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { loadOracle } from '../oracle.ts';

interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getConfig(): { themeVariables: Record<string, unknown> };
  };
}

await loadOracle();
const v12 = ((await import('mermaid-v12')) as unknown as { default: V12 }).default;

function v12Vars(theme: string): Record<string, unknown> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize({ theme });
  return { ...v12.mermaidAPI.getConfig().themeVariables };
}

const hex = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const rgba = parseColor(v);
  return rgba ? formatColor(rgba) : undefined;
};

const FILLS = Array.from({ length: 8 }, (_, i) => `fillType${i}`);
const ACTORS = Array.from({ length: 6 }, (_, i) => `actor${i}`);

describe('journey theme variables against v12 12.2.0 (#327, D249)', () => {
  it.each(THEME_NAMES.map((n) => [n]))('%s: fillType0–7 are v12’s', async (name) => {
    const old = v12Vars(name);
    const theme = createTheme(await loadTheme(name), { cssVariables: false });
    expect(FILLS.map((f) => hex(theme.value(f)))).toEqual(FILLS.map((f) => hex(old[f])));
  });

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: faceColor is v12’s fallback, actors unset',
    async (name) => {
      const old = v12Vars(name);
      const theme = createTheme(await loadTheme(name), { cssVariables: false });
      expect(old.faceColor).toBeUndefined();
      expect(hex(theme.value('faceColor'))).toBe('#fff8dc');
      for (const a of ACTORS) {
        expect(old[a], a).toBeUndefined();
        expect(theme.value(a), a).toBe('currentColor');
      }
    }
  );

  it('base: fillType0 and fillType1 follow a custom primaryColor and secondaryColor, as v12', async () => {
    const themeVariables = { primaryColor: '#1d3557', secondaryColor: '#a8dadc' };
    v12.mermaidAPI.reset();
    v12.mermaidAPI.initialize({ theme: 'base', themeVariables });
    const old = v12.mermaidAPI.getConfig().themeVariables;
    const theme = createTheme(await loadTheme('base'), { themeVariables, cssVariables: false });
    expect([hex(theme.value('fillType0')), hex(theme.value('fillType1'))]).toEqual([
      hex(old.fillType0),
      hex(old.fillType1),
    ]);
  });
});
