import { describe, expect, it } from 'vitest';
import { createTheme, loadTheme, THEME_NAMES, type ThemeSpec } from '@mermaid-js/core/theme';
import { RAILROAD_COLOUR_KEYS } from '../config.ts';
import { railroad } from '../plugin.ts';
import { THEME_VARIABLES } from './vocabulary.ts';

/**
 * Railroad's theme table (spec #526 Q6, D516, D331, D335, D540) through `createTheme`: one
 * colour per drawn v12 style key, nested under `railroad` with v12's key names, each following
 * the shared variable v12's `buildThemeDefaults` read, in every theme; the terminal fill follows
 * `lighten(mainBkg, 16)` in the dark themes (v12's `secondBkg` there).
 */
const specs = Object.fromEntries(
  await Promise.all(THEME_NAMES.map(async (n) => [n, await loadTheme(n)] as const))
) as Record<(typeof THEME_NAMES)[number], ThemeSpec>;

const lit = (s: ThemeSpec, themeVariables?: Record<string, unknown>) =>
  createTheme(s, { cssVariables: false, diagram: railroad.theme, themeVariables });

/** v12's fallback for each key but the terminal fill (`styles.ts:125-187`). */
const SHARED = {
  railroadTerminalStroke: 'secondaryBorderColor',
  railroadTerminalTextColor: 'secondaryTextColor',
  railroadNonTerminalFill: 'mainBkg',
  railroadNonTerminalStroke: 'primaryBorderColor',
  railroadNonTerminalTextColor: 'primaryTextColor',
  railroadLineColor: 'lineColor',
  railroadMarkerFill: 'lineColor',
  railroadSpecialFill: 'tertiaryColor',
  railroadSpecialStroke: 'tertiaryBorderColor',
  railroadRuleNameColor: 'titleColor',
} as const;

describe('railroad theme table', () => {
  it('declares one colour per drawn v12 key, nested under railroad with v12’s name', () => {
    expect(railroad.theme.section).toBe('railroad');
    const nested: Record<string, string> = Object.fromEntries(
      Object.entries(railroad.theme.vars).map(([k, v]): [string, string] => [v.nested ?? '', k])
    );
    expect(nested).toEqual(RAILROAD_COLOUR_KEYS);
    for (const v of Object.values(THEME_VARIABLES)) {
      expect(v.kind).toBe('color');
      expect(v.usedBy).toEqual(['railroad']);
    }
  });

  it('follows v12’s shared fallbacks in every theme', () => {
    for (const n of THEME_NAMES) {
      const t = lit(specs[n]);
      for (const [own, shared] of Object.entries(SHARED))
        expect(t.value(own), `${n} ${own}`).toBe(t.value(shared));
    }
  });

  it('fills terminals as v12’s secondBkg: the classic light themes’ clusterBkg, else #ffffde', () => {
    // 12.2.0 (packages/conformance/src/railroad/theme.spec.ts): default #ffffde, forest
    // #cdffb2, neutral #fcfcfc; base, neo, redux and redux-color have no secondBkg and drew
    // theme-default's #ffffde; the dark themes lighten(mainBkg, 16).
    const fill = (n: (typeof THEME_NAMES)[number]) => lit(specs[n]).value('railroadTerminalFill');
    expect(['default', 'forest', 'neutral', 'base'].map((n) => fill(n as never))).toEqual([
      '#ffffde',
      '#cdffb2',
      '#fcfcfc',
      '#ffffde',
    ]);
    for (const n of ['neo', 'redux', 'redux-color'] as const) expect(fill(n), n).toBe('#ffffde');
    for (const n of THEME_NAMES.filter((t) => specs[t].dark)) {
      const t = lit(specs[n]);
      const want = lit(specs[n], { railroadTerminalFill: 'lightenHsl(mainBkg, 16%)' });
      expect(t.value('railroadTerminalFill'), n).toBe(want.value('railroadTerminalFill'));
    }
    expect(fill('dark')).toBe('#474949');
  });

  it('keeps the light terminal fill under an author’s darkMode on a light theme', () => {
    expect(lit(specs.default, { darkMode: true }).value('railroadTerminalFill')).toBe('#ffffde');
  });

  it('follows an author’s shared override, as v12’s derivation did', () => {
    const t = lit(specs.default, { lineColor: '#123456', secondaryColor: '#abcdef' });
    expect(t.value('railroadLineColor')).toBe('#123456');
    expect(t.value('railroadMarkerFill')).toBe('#123456');
    // v12 default's secondBkg is a literal: an author's secondaryColor does not reach it.
    expect(t.value('railroadTerminalFill')).toBe('#ffffde');
    const dark = lit(specs.dark, { mainBkg: '#000000' });
    expect(dark.value('railroadTerminalFill')).toBe('#292929');
  });

  it('maps themeVariables.railroad.* key by key, the flat name winning (D335, D540)', () => {
    const t = lit(specs.dark, {
      railroad: { terminalFill: '#111111', ruleNameColor: '#222222' },
      railroadRuleNameColor: '#333333',
    });
    expect(t.value('railroadTerminalFill')).toBe('#111111');
    expect(t.value('railroadRuleNameColor')).toBe('#333333');
    expect(t.value('railroadLineColor')).toBe(t.value('lineColor'));
  });
});
