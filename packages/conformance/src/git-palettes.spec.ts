/**
 * #369 (gitGraph T4a, D267): the `git`, `gitInv` and `gitBranchLabel` palettes of every built-in
 * theme against v12 12.2.0's resolved
 * `getThemeVariables()` (D151: v12 is the oracle). The theme values match in every theme, and
 * under base-colour, `darkMode` and numbered overrides they follow v12's rule.
 */
import {
  THEME_NAMES,
  createTheme,
  formatColor,
  loadTheme,
  parseColor,
  type ThemeName,
} from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { loadOracle } from './oracle.ts';

interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getConfig(): { themeVariables: Record<string, unknown> };
  };
}

await loadOracle();
const v12 = ((await import('mermaid-v12')) as unknown as { default: V12 }).default;

const PALETTES = ['git', 'gitInv', 'gitBranchLabel'] as const;
type Palettes = Record<(typeof PALETTES)[number], string[]>;

function hex(v: unknown): string {
  const rgba = typeof v === 'string' ? parseColor(v) : undefined;
  return rgba ? formatColor(rgba) : String(v);
}

function v12Vars(theme: string, themeVariables: object = {}): Record<string, unknown> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize({ theme, themeVariables });
  const vars = { ...v12.mermaidAPI.getConfig().themeVariables };
  v12.mermaidAPI.reset();
  return vars;
}

function v12Palettes(theme: string, themeVariables: object = {}): Palettes {
  const vars = v12Vars(theme, themeVariables);
  const out = {} as Palettes;
  for (const p of PALETTES) out[p] = Array.from({ length: 8 }, (_, i) => hex(vars[`${p}${i}`]));
  return out;
}

async function v13Theme(theme: ThemeName, themeVariables?: object) {
  return createTheme(await loadTheme(theme), {
    cssVariables: false,
    themeVariables: themeVariables as Record<string, unknown>,
  });
}

async function v13Palettes(theme: ThemeName, themeVariables?: object): Promise<Palettes> {
  const t = await v13Theme(theme, themeVariables);
  const out = {} as Palettes;
  for (const p of PALETTES) out[p] = t.palette(p).map(hex);
  return out;
}

describe('git, gitInv and gitBranchLabel against v12 12.2.0 (#369, D267)', () => {
  it.each(THEME_NAMES)('%s: the theme values', async (theme) => {
    expect(await v13Palettes(theme)).toEqual(v12Palettes(theme));
  });

  it.each(THEME_NAMES)(
    '%s: under primaryColor, secondaryColor and tertiaryColor',
    async (theme) => {
      const vars = { primaryColor: '#3366cc', secondaryColor: '#cc6633', tertiaryColor: '#66cc33' };
      expect(await v13Palettes(theme, vars)).toEqual(v12Palettes(theme, vars));
    }
  );

  it.each(THEME_NAMES)('%s: under primaryColor alone', async (theme) => {
    const vars = { primaryColor: '#3366cc' };
    expect(await v13Palettes(theme, vars)).toEqual(v12Palettes(theme, vars));
  });

  it.each(THEME_NAMES)('%s: under darkMode', async (theme) => {
    const vars = { darkMode: true };
    expect(await v13Palettes(theme, vars)).toEqual(v12Palettes(theme, vars));
  });

  it.each(THEME_NAMES)('%s: labels follow a labelTextColor override as v12 does', async (theme) => {
    const vars = { labelTextColor: '#3366cc' };
    expect((await v13Palettes(theme, vars)).gitBranchLabel).toEqual(
      v12Palettes(theme, vars).gitBranchLabel
    );
  });

  it.each(THEME_NAMES)('%s: a numbered override replaces its slot verbatim', async (theme) => {
    const vars = { git4: '#123456', gitInv5: '#654321', gitBranchLabel6: '#abcdef' };
    const now = await v13Palettes(theme, vars);
    expect([now.git[4], now.gitInv[5], now.gitBranchLabel[6]]).toEqual([
      '#123456',
      '#654321',
      '#abcdef',
    ]);
    expect(now).toEqual(v12Palettes(theme, vars));
  });

  it.each(THEME_NAMES)('%s: gitInv follows a git override where v12 does', async (theme) => {
    const vars = { git1: '#123456' };
    expect(await v13Palettes(theme, vars)).toEqual(v12Palettes(theme, vars));
  });
});

// D334: in dark and neutral the git palette reads `cScale<n>` (v12 read `pie<n+1>`, which v12
// derives from `cScale`): an author's `cScale<n>` moves it, as in v12, and an author's `pie<n>`
// does not (v12 ignores it there too).
describe('dark and neutral git follow cScale, not pie (D334)', () => {
  it.each(['dark', 'neutral'] as const)('%s', async (theme) => {
    for (const vars of [
      { cScale1: '#abcdef', cScale5: '#fedcba' },
      { pie2: '#111111', pie5: '#222222' },
    ])
      expect((await v13Palettes(theme, vars)).git, JSON.stringify(vars)).toEqual(
        v12Palettes(theme, vars).git
      );
  });
});
