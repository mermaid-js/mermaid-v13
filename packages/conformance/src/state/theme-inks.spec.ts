/**
 * #827 (spec #975 T2, D638): state's text and composite-title inks in the five classic themes
 * against v12 12.2.0's resolved `stateLabelColor` (D151: v12 is the oracle), which v12 drew both
 * with: at the theme values, with `primaryTextColor` set to a light and a dark probe, and with
 * `stateLabelColor` itself set. The other v12 state colours in #827 (start dot, transitions,
 * outlines, arrowheads) stay on shared variables by D639.
 *
 * `DIFFERENCES` lists where v13 differs on purpose, and has to match exactly. v12's `default`
 * fixes `stateLabelColor` when the theme is built, before an author's `primaryTextColor` is
 * applied, so there the override never reaches state text; the other four classic themes follow
 * it, and v13 follows it in all five (D638).
 */
import { createTheme, formatColor, loadTheme, parseColor } from '@mermaid-js/core/theme';
import type { ThemeName } from '@mermaid-js/core/theme';
import { state } from '@mermaid-js/diagram-state';
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

const THEMES = ['default', 'dark', 'forest', 'neutral', 'base'] as const satisfies ThemeName[];

const CASES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  none: {},
  'primaryTextColor:light': { primaryTextColor: '#ffd966' },
  'primaryTextColor:dark': { primaryTextColor: '#2a4d69' },
  stateLabelColor: { stateLabelColor: '#7f3fbf' },
};

const DIFFERENCES: ReadonlySet<string> = new Set([
  'default / primaryTextColor:light',
  'default / primaryTextColor:dark',
]);

const hex = (v: unknown): string | undefined => {
  const rgba = typeof v === 'string' ? parseColor(v) : undefined;
  return rgba ? formatColor(rgba) : undefined;
};

function v12Label(theme: string, themeVariables: object): string | undefined {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize({ theme, themeVariables });
  const value = v12.mermaidAPI.getConfig().themeVariables.stateLabelColor;
  v12.mermaidAPI.reset();
  return hex(value);
}

describe('state text and composite-title inks against v12 (#827, D638)', () => {
  it('match v12 except the listed differences, which all still differ', async () => {
    const found: string[] = [];
    for (const theme of THEMES)
      for (const [label, themeVariables] of Object.entries(CASES)) {
        const was = v12Label(theme, themeVariables);
        expect(was, `${theme} / ${label}: v12 resolves stateLabelColor`).toBeDefined();
        const now = createTheme(await loadTheme(theme), {
          diagram: state.theme,
          themeVariables,
          cssVariables: false,
        });
        const text = hex(now.value('stateLabelColor'));
        // Titles always take the text ink, as v12's one variable drew both.
        expect(hex(now.value('compositeTitleColor')), `${theme} / ${label}`).toBe(text);
        if (text !== was) found.push(`${theme} / ${label}`);
      }
    expect(found.sort()).toEqual([...DIFFERENCES].sort());
  });
});
