/**
 * D117: the classic themes' ER row fills (`rowOdd`, `rowEven`) equal v12's exactly. v12
 * derives them with khroma's HSL `lighten`/`darken`; v13's `lightenHsl`/`darkenHsl` rules
 * reproduce that (dark and neutral set the rows once from their own colours, so they are
 * constants there). Checked against the v12 theme objects loaded by the conformance oracle,
 * with each theme's own colours and with an author's `primaryColor`/`mainBkg`.
 */
import { createTheme, loadTheme } from '@mermaid-js/core/theme';
import { DIAGRAM_TABLES } from './diagram-themes.ts';
import { describe, expect, it } from 'vitest';
import { v12Vars } from './v12-theme.ts';
import { hex } from './hex.ts';

const THEMES = ['default', 'base', 'dark', 'forest', 'neutral'] as const;
const FILLS = [undefined, '#3366cc', '#552222', '#c0ffee', '#000000', '#ffffff'];

const notAColour = (value: string): never => {
  throw new Error(`not a colour: ${value}`);
};

function v12Rows(theme: string, fill: string | undefined): [string, string] {
  const themeVariables = fill === undefined ? {} : { primaryColor: fill, mainBkg: fill };
  const vars = v12Vars(theme, themeVariables);
  return [hex(vars.rowOdd as string, notAColour), hex(vars.rowEven as string, notAColour)];
}

async function v13Rows(
  theme: (typeof THEMES)[number],
  fill: string | undefined
): Promise<[string, string]> {
  const themeVariables = fill === undefined ? {} : { primaryColor: fill, mainBkg: fill };
  const t = createTheme(await loadTheme(theme), {
    diagram: DIAGRAM_TABLES.er,
    cssVariables: false,
    themeVariables,
  });
  return [hex(t.color('rowOdd'), notAColour), hex(t.color('rowEven'), notAColour)];
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
