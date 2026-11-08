/**
 * #506 (D381): the chart series palette `plotColorArray`, a shared input that names no diagram,
 * against v12 12.2.0's resolved `getThemeVariables()` in all eleven themes (D151: v12 is the
 * oracle). v12 carries it as its xyChart section's `plotColorPalette`, a comma-separated string;
 * every theme gives its ten colours as written.
 */
import { THEME_NAMES, createTheme, loadTheme } from '@mermaid-js/core/theme';
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

function v12Palette(theme: string): string[] {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize({ theme });
  const section = v12.mermaidAPI.getConfig().themeVariables.xyChart as Record<string, unknown>;
  v12.mermaidAPI.reset();
  return String(section.plotColorPalette)
    .split(',')
    .map((c) => c.trim());
}

describe('plotColorArray against v12 12.2.0 (#506, D381)', () => {
  it.each(THEME_NAMES)("%s: v12's ten chart colours, as written", async (theme) => {
    const now = createTheme(await loadTheme(theme), { cssVariables: false });
    const old = v12Palette(theme);
    expect(old).toHaveLength(10);
    expect(now.palette('plotColorArray')).toEqual(old);
  });
});
