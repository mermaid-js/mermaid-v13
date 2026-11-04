/**
 * D117: the classic themes' ER row fills (`rowOdd`, `rowEven`) equal v12's exactly. v12
 * derives them with khroma's HSL `lighten`/`darken`; v13's `lightenHsl`/`darkenHsl` rules
 * reproduce that (dark and neutral set the rows once from their own colours, so they are
 * constants there). Checked against the v12 theme objects loaded by the conformance oracle,
 * with each theme's own colours and with an author's `primaryColor`/`mainBkg`.
 */
import { createTheme, formatColor, loadTheme, parseColor } from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { loadOracle } from './oracle.ts';

interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getConfig(): { themeVariables: Record<string, string> };
  };
}

await loadOracle();
const v12 = ((await import('mermaid-v12')) as unknown as { default: V12 }).default;

const THEMES = ['default', 'base', 'dark', 'forest', 'neutral'] as const;
const FILLS = [undefined, '#3366cc', '#552222', '#c0ffee', '#000000', '#ffffff'];

const hex = (value: string): string => {
  const rgba = parseColor(value);
  if (!rgba) throw new Error(`not a colour: ${value}`);
  return formatColor(rgba);
};

function v12Rows(theme: string, fill: string | undefined): [string, string] {
  v12.mermaidAPI.reset();
  const themeVariables = fill === undefined ? {} : { primaryColor: fill, mainBkg: fill };
  v12.mermaidAPI.initialize({ theme, themeVariables });
  const vars = v12.mermaidAPI.getConfig().themeVariables;
  return [hex(vars.rowOdd as string), hex(vars.rowEven as string)];
}

async function v13Rows(
  theme: (typeof THEMES)[number],
  fill: string | undefined
): Promise<[string, string]> {
  const themeVariables = fill === undefined ? {} : { primaryColor: fill, mainBkg: fill };
  const t = createTheme(await loadTheme(theme), { cssVariables: false, themeVariables });
  return [hex(t.color('rowOdd')), hex(t.color('rowEven'))];
}

describe('classic ER row fills equal v12 (D117)', () => {
  for (const theme of THEMES) {
    it(`${theme}: rowOdd and rowEven`, async () => {
      for (const fill of FILLS) {
        expect(await v13Rows(theme, fill), `${theme} ${fill ?? '(theme colours)'}`).toEqual(
          v12Rows(theme, fill)
        );
      }
    });
  }
});
