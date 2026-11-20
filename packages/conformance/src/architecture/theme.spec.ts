/**
 * #618: architecture's five theme variables (its own `DiagramPlugin.theme` table, D322, D331)
 * against v12 12.2.0's `getThemeVariables()` in all eleven themes (D151: v12 is the oracle).
 * v12 kept them flat (`archEdgeColor`, `archEdgeArrowColor`, `archEdgeWidth`,
 * `archGroupBorderColor`, `archGroupBorderWidth`, `architectureTypes.ts:185-191`) and
 * `architectureStyles.ts` read them as they were. Colours compare as hex, lengths as px numbers
 * (v12's `3` has no unit; `2px` has).
 *
 * Every value that differs is in `DIFFERENCES` with its decision, and the list must match the
 * differences found exactly: D541, `base` pinned `#777` edges and `#000` borders that no trait
 * separates from `default`, so it takes the family rule (MIGRATION.md, "Architecture diagram").
 */
import { architecture } from '@mermaid-js/diagram-architecture';
import {
  THEME_NAMES,
  createTheme,
  loadTheme,
  type Theme,
  type ThemeName,
} from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { v12Vars } from '../v12-theme.ts';
import { hex } from '../hex.ts';

const VARS = architecture.theme.vars;
const NAMES = Object.keys(VARS).sort();
const isColour = (name: string): boolean => VARS[name]?.kind === 'color';

const v13Theme = async (
  name: ThemeName,
  themeVariables?: Readonly<Record<string, unknown>>
): Promise<Theme> =>
  createTheme(await loadTheme(name), {
    cssVariables: false,
    diagram: architecture.theme,
    ...(themeVariables ? { themeVariables } : {}),
  });

const now = (t: Theme, name: string): string | number | undefined =>
  isColour(name) ? hex(t.value(name)) : t.number(name);
const then = (
  vars: Readonly<Record<string, unknown>>,
  name: string
): string | number | undefined =>
  isColour(name) ? hex(vars[name]) : Number.parseFloat(String(vars[name]));

/** Every variable where v13 differs from v12, by theme, with its decision. */
const D541 = 'D541: v12’s base pinned #777 / #000; base takes the family rule';
const DIFFERENCES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  base: { archEdgeArrowColor: D541, archEdgeColor: D541, archGroupBorderColor: D541 },
};

/** The variables whose v13 value is not v12's, in one theme. */
async function differing(
  name: ThemeName,
  themeVariables?: Readonly<Record<string, unknown>>
): Promise<string[]> {
  const old = v12Vars(name, themeVariables);
  const theme = await v13Theme(name, themeVariables);
  return NAMES.filter((n) => now(theme, n) !== then(old, n));
}

describe('architecture theme variables against v12 12.2.0 (#618, D541)', () => {
  it("covers v12's five arch* variables, flat, with no section", () => {
    const keys = Object.keys(v12Vars('default'))
      .filter((k) => k.startsWith('arch'))
      .sort();
    expect(NAMES).toEqual(keys);
    expect(architecture.theme.section).toBeUndefined();
  });

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: every architecture variable is v12’s, apart from the listed differences',
    async (name) => {
      expect(await differing(name)).toEqual(Object.keys(DIFFERENCES[name] ?? {}).sort());
    }
  );

  it('base: v12 drew #777 edges and #000 borders, v13 the family rule (D541)', async () => {
    const old = v12Vars('base');
    expect(hex(old.archEdgeColor)).toBe('#777777');
    expect(hex(old.archEdgeArrowColor)).toBe('#777777');
    expect(hex(old.archGroupBorderColor)).toBe('#000000');
    const theme = await v13Theme('base');
    expect(hex(theme.value('archEdgeColor'))).toBe(hex(theme.value('lineColor')));
    expect(hex(theme.value('archEdgeArrowColor'))).toBe(hex(theme.value('lineColor')));
    expect(hex(theme.value('archGroupBorderColor'))).toBe(hex(theme.value('calloutBorder')));
  });

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: an author’s arch* variables win, as in v12',
    async (name) => {
      const own = {
        archEdgeColor: '#123456',
        archEdgeArrowColor: '#abcdef',
        archEdgeWidth: '5',
        archGroupBorderColor: '#fedcba',
        archGroupBorderWidth: '4px',
      };
      expect(await differing(name, own)).toEqual([]);
      const theme = await v13Theme(name, own);
      expect(hex(theme.value('archEdgeColor'))).toBe('#123456');
      expect(theme.number('archEdgeWidth')).toBe(5);
      expect(theme.number('archGroupBorderWidth')).toBe(4);
    }
  );

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: author lineColor and primaryBorderColor, against v12',
    async (name) => {
      const author = { lineColor: '#ff00ff', primaryBorderColor: '#00ff00' };
      const old = v12Vars(name, author);
      const theme = await v13Theme(name, author);
      // The edges follow an author lineColor where v12's did, and in base. v12's did in nine:
      // dark's updateColors() resets lineColor to lightgrey first, and v13's dark keeps it too
      // (defaultLinkColor, D656); base pinned #777 (D541), and v13's base takes the rule.
      expect(hex(old.archEdgeColor) === '#ff00ff').toBe(!['dark', 'base'].includes(name));
      const edge = name === 'dark' ? '#d3d3d3' : '#ff00ff';
      expect(hex(theme.value('archEdgeColor'))).toBe(edge);
      expect(hex(theme.value('archEdgeArrowColor'))).toBe(edge);
      // The borders follow an author primaryBorderColor (calloutBorder, D332), where v12's kept
      // the constructor's colour (MIGRATION.md, "Architecture diagram").
      expect(hex(theme.value('archGroupBorderColor'))).toBe('#00ff00');
      expect(hex(old.archGroupBorderColor)).not.toBe('#00ff00');
    }
  );
});
