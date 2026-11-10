/**
 * Event modeling's own theme table (spec #527 T4, D527): v12's `em*` values keyed by family and
 * the `dark` trait, and `emTextColor`. Expected colours are v12 12.2.0's `getThemeVariables()`
 * (probed once, written out by hand). T5's oracle spec compares all eleven themes.
 */
import { createTheme, loadTheme, type Rgba, type ThemeName } from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { theme as table } from './table.ts';

const resolve = async (name: ThemeName, themeVariables?: Record<string, unknown>) =>
  createTheme(await loadTheme(name), {
    diagram: table,
    cssVariables: false,
    ...(themeVariables ? { themeVariables } : {}),
  });

/** Channels within 1.5 of `want` (v12 kept HSL fractions, v13 rounds to bytes). */
function near(got: Rgba | undefined, want: readonly number[]): void {
  expect(got).toBeDefined();
  for (let i = 0; i < 3; i++) expect(Math.abs(got![i]! - want[i]!)).toBeLessThanOrEqual(1.5);
}

/** v12 `theme-default.js:457-470`, the same in forest, neutral and base. */
const LIGHT: Readonly<Record<string, readonly number[]>> = {
  emUiFill: [255, 255, 255],
  emUiStroke: [219, 218, 218],
  emProcessorFill: [237, 179, 246],
  emProcessorStroke: [184, 140, 191],
  emReadModelFill: [211, 241, 162],
  emReadModelStroke: [163, 183, 50],
  emCommandFill: [188, 214, 254],
  emCommandStroke: [103, 154, 195],
  emEventFill: [255, 183, 120],
  emEventStroke: [193, 154, 15],
  emSwimlaneBackgroundOdd: [250, 250, 250],
  emSwimlaneBackgroundStroke: [240, 240, 240],
};

/** v12 `theme-dark.js:419-433` as v12 resolved it. */
const DARK: Readonly<Record<string, readonly number[]>> = {
  emUiFill: [45, 45, 45],
  emUiStroke: [85, 85, 85],
  emProcessorFill: [120, 81, 123], // hsl(296.13, 20.26%, 40%)
  emProcessorStroke: [138, 109, 140],
  emReadModelFill: [84, 124, 62], // hsl(98.67, 33.33%, 36.47%)
  emReadModelStroke: [109, 140, 92],
  emCommandFill: [62, 84, 124], // hsl(218.67, 33.33%, 36.47%)
  emCommandStroke: [92, 109, 140],
  emEventFill: [124, 95, 62], // hsl(32, 33.33%, 36.47%)
  emEventStroke: [140, 117, 92],
  emSwimlaneBackgroundOdd: [64, 64, 64], // hsl(0, 0%, 25%)
  emSwimlaneBackgroundStroke: [82, 82, 82], // hsl(0, 0%, 32%)
  emRelationStroke: [211, 211, 211], // lightgrey
  emArrowhead: [211, 211, 211],
};

describe('event modeling theme table', () => {
  it("gives every classic light theme v12's literals and lineColor (D527)", async () => {
    for (const name of ['default', 'forest', 'neutral', 'base'] as const) {
      const t = await resolve(name);
      for (const [v, want] of Object.entries(LIGHT)) near(t.rgba(v), want);
      expect(t.value('emRelationStroke'), name).toBe(t.value('lineColor'));
      expect(t.value('emArrowhead'), name).toBe(t.value('lineColor'));
    }
    near((await resolve('default')).rgba('emRelationStroke'), [51, 51, 51]);
    near((await resolve('neutral')).rgba('emArrowhead'), [102, 102, 102]);
  });

  it("gives dark v12 dark's values", async () => {
    const t = await resolve('dark');
    for (const [v, want] of Object.entries(DARK)) near(t.rgba(v), want);
  });

  it('keys the dark entry by the theme trait: darkMode keeps the literals, as in v12', async () => {
    const t = await resolve('base', { darkMode: true });
    for (const [v, want] of Object.entries(LIGHT)) near(t.rgba(v), want);
  });

  it('gives the redux and neo families the same entries by trait (D527)', async () => {
    for (const name of ['redux', 'redux-color', 'neo'] as const) {
      const t = await resolve(name);
      for (const [v, want] of Object.entries(LIGHT)) near(t.rgba(v), want);
      expect(t.value('emRelationStroke'), name).toBe(t.value('lineColor'));
    }
    for (const name of ['redux-dark', 'redux-dark-color', 'neo-dark'] as const) {
      const t = await resolve(name);
      near(t.rgba('emProcessorFill'), DARK.emProcessorFill!);
      near(t.rgba('emUiFill'), DARK.emUiFill!);
      expect(t.value('emArrowhead'), name).toBe(t.value('lineColor'));
    }
  });

  it('colours text with textColor, a new variable (D527)', async () => {
    for (const name of ['default', 'dark', 'redux-dark', 'neo'] as const) {
      const t = await resolve(name);
      expect(t.value('emTextColor'), name).toBe(t.value('textColor'));
    }
  });

  it('keeps an author value of every variable, flat (no nested section)', async () => {
    const t = await resolve('dark', {
      emSwimlaneBackgroundOdd: '#123456',
      emEventFill: '#abcdef',
      emTextColor: '#ff0000',
    });
    expect(t.value('emSwimlaneBackgroundOdd')).toBe('#123456');
    expect(t.value('emEventFill')).toBe('#abcdef');
    expect(t.value('emTextColor')).toBe('#ff0000');
    const author = await resolve('default', { lineColor: '#00ff00' });
    near(author.rgba('emRelationStroke'), [0, 255, 0]);
  });
});
