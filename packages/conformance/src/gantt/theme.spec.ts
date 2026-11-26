/**
 * #385: the gantt theme variables against v12 12.2.0's resolved `getThemeVariables()` (D151:
 * v12 is the oracle). Every value comes from the shared derivation (`LIGHT_RULES`,
 * `DARK_RULES`) over shared variables; no theme spec names a gantt variable (D331). The classic
 * family's entries repair the contrast of the active outline, the `vert` marker and text on a
 * critical bar from the same shared variables (#801, spec #795 decision 2). Where v12
 * gave a theme its own gantt colour that no shared variable carries, v13 differs: those are
 * listed here as `[v12, v13]` and under "For the maintainer" in the spec #293 notes (GAPS
 * #385), so a change in either direction fails until the list is updated.
 */
import { readdirSync, readFileSync } from 'node:fs';
import {
  THEME_NAMES,
  contrastRatio,
  createTheme,
  loadTheme,
  parseColor,
  type Rgba,
  type ThemeName,
} from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { gantt } from '@mermaid-js/diagram-gantt';
import { REPO_ROOT } from '../index.ts';
import { v12Vars } from '../v12-theme.ts';
import { hex } from '../hex.ts';

const GANTT = [
  'sectionBkgColor',
  'altSectionBkgColor',
  'sectionBkgColor2',
  'excludeBkgColor',
  'gridColor',
  'todayLineColor',
  'vertLineColor',
  'taskBkgColor',
  'taskBorderColor',
  'activeTaskBkgColor',
  'activeTaskBorderColor',
  'doneTaskBkgColor',
  'doneTaskBorderColor',
  'critBkgColor',
  'critBorderColor',
  'taskTextColor',
  'taskTextOutsideColor',
  'taskTextDarkColor',
] as const;

/** Per theme, the variables whose v13 value is not v12's: `[v12, v13]`. */
const DIFFERS: Readonly<Record<string, Readonly<Record<string, readonly [string, string]>>>> = {
  'redux-color': {
    sectionBkgColor: ['#f4a8ff', '#ffffff'],
    sectionBkgColor2: ['#46ecd5', '#cccccc'],
    vertLineColor: ['#171717', '#28253d'],
    taskBkgColor: ['#ececfe', '#cccccc'],
    taskBorderColor: ['#171717', '#28253d'],
    activeTaskBorderColor: ['#ececfe', '#cccccc'],
  },
  redux: {
    sectionBkgColor2: ['#ececfe', '#cccccc'],
    vertLineColor: ['#171717', '#28253d'],
    taskBkgColor: ['#ececfe', '#cccccc'],
    taskBorderColor: ['#171717', '#28253d'],
    activeTaskBorderColor: ['#ececfe', '#cccccc'],
  },
  'redux-dark': {},
  'redux-dark-color': {
    sectionBkgColor: ['#f4a8ff', '#201f1f'],
    altSectionBkgColor: ['#333333', '#ffffff'],
    sectionBkgColor2: ['#46ecd5', '#1f2020'],
  },
  default: {
    sectionBkgColor: ['#6666ff7d', '#9a9aff'],
    sectionBkgColor2: ['#fff400', '#ececff'],
    vertLineColor: ['#000080', '#333333'],
    taskBkgColor: ['#8a90dd', '#ececff'],
    taskBorderColor: ['#534fbc', '#c7c7f1'],
    activeTaskBkgColor: ['#bfc7ff', '#ffffff'],
    activeTaskBorderColor: ['#534fbc', '#333333'],
    taskTextColor: ['#ffffff', '#333333'],
    taskTextOutsideColor: ['#000000', '#333333'],
    taskTextDarkColor: ['#000000', '#333333'],
  },
  dark: {
    sectionBkgColor: ['#b4ac76', '#4c4f4f'],
    altSectionBkgColor: ['#333333', '#ffffff'],
    sectionBkgColor2: ['#eae8d9', '#1f2020'],
    excludeBkgColor: ['#9f9758', '#eeeeee'],
    todayLineColor: ['#db5757', '#ff0000'],
    vertLineColor: ['#00bfff', '#d3d3d3'],
    taskBkgColor: ['#595c5c', '#1f2020'],
    taskBorderColor: ['#ffffff', '#cccccc'],
    activeTaskBkgColor: ['#81b1db', '#595c5c'],
    activeTaskBorderColor: ['#ffffff', '#d3d3d3'],
    doneTaskBkgColor: ['#d3d3d3', '#474949'],
    critBkgColor: ['#e83737', '#990000'],
    critBorderColor: ['#e83737', '#ff8888'],
    taskTextColor: ['#e2dcd6', '#cccccc'],
    taskTextOutsideColor: ['#d3d3d3', '#cccccc'],
    taskTextDarkColor: ['#2c2c2c', '#ffffff'],
  },
  forest: {
    sectionBkgColor: ['#6eaa49', '#aed357'],
    sectionBkgColor2: ['#6eaa49', '#cde498'],
    vertLineColor: ['#00bfff', '#000000'],
    taskBkgColor: ['#487e3a', '#cde498'],
    taskBorderColor: ['#13540c', '#abb594'],
    activeTaskBkgColor: ['#cde498', '#fafcf5'],
    activeTaskBorderColor: ['#13540c', '#000000'],
    taskTextColor: ['#ffffff', '#000000'],
  },
  neutral: {
    sectionBkgColor: ['#bdbdbd', '#c5c5c5'],
    sectionBkgColor2: ['#bdbdbd', '#eeeeee'],
    gridColor: ['#e6e6e6', '#d3d3d3'],
    todayLineColor: ['#dd4422', '#ff0000'],
    vertLineColor: ['#dd4422', '#666666'],
    taskBkgColor: ['#707070', '#eeeeee'],
    taskBorderColor: ['#575757', '#d4d4d4'],
    activeTaskBkgColor: ['#eeeeee', '#ffffff'],
    activeTaskBorderColor: ['#575757', '#666666'],
    doneTaskBkgColor: ['#bbbbbb', '#d3d3d3'],
    doneTaskBorderColor: ['#666666', '#808080'],
    critBkgColor: ['#dd4422', '#ff0000'],
    critBorderColor: ['#b1361b', '#ff8888'],
    taskTextColor: ['#ffffff', '#000000'],
    taskTextOutsideColor: ['#333333', '#000000'],
    taskTextDarkColor: ['#333333', '#000000'],
  },
  base: {
    sectionBkgColor: ['#f6f9ff', '#ffda8b'],
    vertLineColor: ['#000080', '#0b0b0b'],
    taskBorderColor: ['#eeddbb', '#d9cfbc'],
    activeTaskBorderColor: ['#fff4dd', '#0b0b0b'],
  },
  neo: {
    sectionBkgColor2: ['#ececfe', '#cccccc'],
    taskBkgColor: ['#ececfe', '#cccccc'],
    activeTaskBorderColor: ['#ececfe', '#cccccc'],
  },
  'neo-dark': {},
};

describe('gantt theme variables against v12 12.2.0 (#385, D151, D331)', () => {
  it.each(THEME_NAMES.map((n) => [n]))('%s: v12’s values but the listed ones', async (name) => {
    const old = v12Vars(name);
    const theme = createTheme(await loadTheme(name), { diagram: gantt.theme, cssVariables: false });
    const differs: Record<string, [string, string]> = {};
    for (const v of GANTT) {
      const pair: [string, string] = [hex(old[v], String), hex(theme.value(v), String)];
      if (pair[0] !== pair[1]) differs[v] = pair;
    }
    expect(differs).toEqual(DIFFERS[name]);
  });

  /** The CSS a classic theme writes for one gantt variable. */
  const css = async (name: ThemeName, variable: string): Promise<string | undefined> => {
    const theme = createTheme(await loadTheme(name), { diagram: gantt.theme });
    theme.color(variable);
    return theme.rootStyle()[`--_${gantt.theme.vars[variable]!.alias}`];
  };
  const CLASSIC = ['default', 'dark', 'forest', 'neutral', 'base'] as const;

  it("keeps bar text on the theme's text, so a host's --mermaid-textColor reaches it (D574)", async () => {
    for (const name of CLASSIC)
      expect(await css(name, 'taskTextColor'), name).toBe(
        'var(--mermaid-taskTextColor,var(--_tx))'
      );
  });

  // The line colour as the named themes pin it where v12 keeps its own (`guideLineColor`, D656).
  it('outlines the active bar in the line colour in the classic themes (D574, D656)', async () => {
    for (const name of CLASSIC)
      expect(await css(name, 'activeTaskBorderColor'), name).toBe(
        'var(--mermaid-activeTaskBorderColor,var(--_gdl))'
      );
  });

  // #1249, D726: the first band is visibly a band, in every classic theme, against the page
  // behind it and against the third band, which reads `mainBkg`.
  describe('the first section band is distinct (#1249, D726)', () => {
    const BAND = 1.2;
    const rgba = (v: unknown): Rgba => parseColor(String(v))!;
    it.each(CLASSIC.map((n) => [n]))(
      '%s: at least 1.2:1 against the background and band 3',
      async (name) => {
        const theme = createTheme(await loadTheme(name), {
          diagram: gantt.theme,
          cssVariables: false,
        });
        const band = rgba(theme.value('sectionBkgColor'));
        expect(contrastRatio(band, rgba(theme.value('background')))).toBeGreaterThanOrEqual(BAND);
        expect(contrastRatio(band, rgba(theme.value('sectionBkgColor2')))).toBeGreaterThanOrEqual(
          BAND
        );
      }
    );

    it.each(CLASSIC.map((n) => [n]))("%s: an author's sectionBkgColor still wins", async (name) => {
      const theme = createTheme(await loadTheme(name), {
        diagram: gantt.theme,
        cssVariables: false,
        themeVariables: { sectionBkgColor: '#123456' },
      });
      expect(hex(theme.value('sectionBkgColor'), String)).toBe('#123456');
    });
  });

  it('v12 draws a clickable label #003163 in every theme: a renderer constant, no variable', () => {
    for (const name of THEME_NAMES)
      expect(hex(v12Vars(name).taskTextClickableColor, String)).toBe('#003163');
  });

  it('names no gantt variable in a theme spec (D331)', () => {
    const dir = `${REPO_ROOT}/packages/core/src/theme/specs`;
    for (const file of readdirSync(dir)) {
      // Code only: a comment may cite where v12 took a colour from.
      const text = readFileSync(`${dir}/${file}`, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const v of GANTT) expect(text, `${file}: ${v}`).not.toMatch(new RegExp(`\\b${v}\\b`));
    }
  });
});
