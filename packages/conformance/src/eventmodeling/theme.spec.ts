/**
 * #611: the colours an event model draws with, against v12 12.2.0 in all eleven themes (D151:
 * v12 is the oracle) and base with `darkMode`, per D527 and D333(b).
 *
 * v12's paint of each of its 14 `em*` variables is what its renderer drew: the theme's resolved
 * `getThemeVariables()` value (only `default`, `dark`, `forest`, `neutral` and `base` set them,
 * `theme-*.js`), else the renderer's own fallback (`db.ts:290-326` for the kinds,
 * `renderer.ts:86,108-109,142` for the lanes, relations and heads; a relation's `visual.stroke` is
 * `#000`, `db.ts:623`). v13 reads event modeling's table (`theme/table.ts`) through core's
 * resolver. `emTextColor` is new in v13 (v12 left box and lane text to the page): it is checked
 * to be core's `textColor` instead.
 *
 * Colours compare per channel within 1.5 (v12 kept HSL fractions, v13 rounds to bytes). Every
 * value that differs is in `DIFFERENCES` with its decision, and the list has to match the
 * differences found exactly, so none is unlisted and none is stale:
 * - D527, the `dark` trait: `neo-dark`, `redux-dark` and `redux-dark-color` are dark themes that
 *   set no `em*`, so v12 drew them with the renderer's light fallbacks and `#000` relations; v13
 *   gives them `dark`'s values and `lineColor`.
 *
 * An author's flat `em*` variable is drawn as given in every theme, in both.
 */
import { createTheme, loadTheme, parseColor, THEME_NAMES } from '@mermaid-js/core/theme';
import type { Rgba, Theme, ThemeName } from '@mermaid-js/core/theme';
import { eventmodeling } from '@mermaid-js/diagram-eventmodeling';
import { describe, expect, it } from 'vitest';
import { v12Vars } from '../v12-theme.ts';

/** v12's renderer fallback for each variable, used where the theme sets none. */
const V12_FALLBACK: Readonly<Record<string, string>> = {
  emUiFill: 'white',
  emUiStroke: '#dbdada',
  emProcessorFill: '#edb3f6',
  emProcessorStroke: '#b88cbf',
  emReadModelFill: '#d3f1a2',
  emReadModelStroke: '#a3b732',
  emCommandFill: '#bcd6fe',
  emCommandStroke: '#679ac3',
  emEventFill: '#ffb778',
  emEventStroke: '#c19a0f',
  emSwimlaneBackgroundOdd: 'rgb(250,250,250)',
  emSwimlaneBackgroundStroke: 'rgb(240,240,240)',
  emRelationStroke: '#000',
  emArrowhead: '#000000',
};
const V12_NAMES = Object.keys(V12_FALLBACK);

/** A theme to compare: one of the eleven, or base with the author's `darkMode`. */
interface Case {
  readonly label: string;
  readonly theme: ThemeName;
  readonly vars?: Readonly<Record<string, unknown>>;
}
const CASES: readonly Case[] = [
  ...THEME_NAMES.map((theme) => ({ label: theme, theme })),
  { label: 'base+darkMode', theme: 'base', vars: { darkMode: true } },
];

/** What v12's renderer drew for `name`: the theme's value, else its fallback. */
function v12Paint(vars: Record<string, unknown>, name: string): Rgba | undefined {
  const v = vars[name];
  return parseColor(typeof v === 'string' && v !== '' ? v : V12_FALLBACK[name]!);
}

async function v13Theme(
  name: ThemeName,
  themeVariables?: Readonly<Record<string, unknown>>
): Promise<Theme> {
  return createTheme(await loadTheme(name), {
    diagram: eventmodeling.theme,
    cssVariables: false,
    ...(themeVariables ? { themeVariables } : {}),
  });
}

const near = (a: Rgba | undefined, b: Rgba | undefined): boolean =>
  a !== undefined && b !== undefined && [0, 1, 2].every((i) => Math.abs(a[i]! - b[i]!) <= 1.5);

/** The variables of one theme whose v13 paint is not v12's. */
async function differing(c: Case, extra?: Readonly<Record<string, unknown>>): Promise<string[]> {
  const given = c.vars || extra ? { ...c.vars, ...extra } : undefined;
  const vars = v12Vars(c.theme, given);
  const theme = await v13Theme(c.theme, given);
  return V12_NAMES.filter((n) => !near(theme.rgba(n), v12Paint(vars, n)));
}

const D527_DARK =
  'D527: a dark theme that sets no em*, which v12 drew with its light fallbacks and #000 relations; v13 takes v12 dark’s values and lineColor';
/** The dark themes v12 gave no `em*` variables. */
const DARK_UNSET = ['neo-dark', 'redux-dark', 'redux-dark-color'];

/** `theme/variable` → the decision that makes v13 draw it differently from v12. */
const DIFFERENCES: Readonly<Record<string, string>> = Object.fromEntries(
  DARK_UNSET.flatMap((t) => V12_NAMES.map((n) => [`${t}/${n}`, D527_DARK]))
);

describe('event modeling colours against v12 12.2.0 (#611, D527, D333)', () => {
  it('compares v12’s 14 variables, and the table has them plus emTextColor', () => {
    expect(V12_NAMES).toHaveLength(14);
    expect(Object.keys(eventmodeling.theme.vars).sort()).toEqual(
      [...V12_NAMES, 'emTextColor'].sort()
    );
    // Flat only: v12 read no nested section (D527).
    expect(eventmodeling.theme.section).toBeUndefined();
  });

  it('differs from v12 only where a decision says so, in all eleven themes and base+darkMode', async () => {
    const found: string[] = [];
    for (const c of CASES) for (const n of await differing(c)) found.push(`${c.label}/${n}`);
    expect(found.sort()).toEqual(Object.keys(DIFFERENCES).sort());
  });

  it.each(DARK_UNSET.map((n) => [n]))(
    '%s: v13 draws v12 dark’s values, so the listed difference is D527’s (not another)',
    async (name) => {
      const dark = v12Vars('dark');
      const theme = await v13Theme(name as ThemeName);
      // The kinds and lanes are `dark`'s exactly (the lanes as lighten(background) of each
      // theme's own background, which is dark's in neo-dark only, so lanes are left out here).
      const kinds = V12_NAMES.filter((n) => !/Swimlane|Relation|Arrowhead/.test(n));
      for (const n of kinds) expect(near(theme.rgba(n), v12Paint(dark, n)), n).toBe(true);
      for (const n of ['emRelationStroke', 'emArrowhead'])
        expect(theme.value(n)).toBe(theme.value('lineColor'));
    }
  );

  it.each(CASES.map((c) => [c.label, c]))(
    '%s: emTextColor, new in v13, is core’s textColor (D527)',
    async (_label, c) => {
      const theme = await v13Theme(c.theme, c.vars);
      expect(theme.value('emTextColor')).toBe(theme.value('textColor'));
    }
  );

  // v12 merges an author's `themeVariables` over the theme's: `this.em… || …` keeps an author's
  // value, and the renderer reads it before its fallback.
  const AUTHOR = Object.fromEntries(
    V12_NAMES.map((n, i) => [n, `#${(0x102030 + i * 0x010101).toString(16)}`])
  );

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: an author’s flat em* variables are drawn as given, as in v12',
    async (name) => {
      expect(await differing({ label: name, theme: name }, AUTHOR)).toEqual([]);
      const theme = await v13Theme(name, { ...AUTHOR, emTextColor: '#abcdef' });
      for (const [n, v] of Object.entries(AUTHOR)) expect(theme.value(n)).toBe(v);
      expect(theme.value('emTextColor')).toBe('#abcdef');
    }
  );
});
