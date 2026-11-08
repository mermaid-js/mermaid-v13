/**
 * #338 (timeline T4a, D258): the `cScale`, `cScaleInv` and `cScaleLabel` palettes of every
 * built-in theme against v12 12.2.0's resolved `getThemeVariables()` (D151: v12 is the
 * oracle). The theme values match in every theme, and under base-colour, `darkMode` and
 * numbered overrides they follow v12's rule.
 */
import {
  THEME_NAMES,
  contrastRatio,
  createTheme,
  formatColor,
  loadTheme,
  parseColor,
  type ThemeName,
} from '@mermaid-js/core/theme';
import { DIAGRAM_TABLES } from './diagram-themes.ts';
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

const PALETTES = ['cScale', 'cScaleInv', 'cScaleLabel'] as const;
type Palettes = Record<(typeof PALETTES)[number], string[]>;

function hex(v: unknown): string {
  const rgba = typeof v === 'string' ? parseColor(v) : undefined;
  return rgba ? formatColor(rgba) : String(v);
}

function v12Palettes(theme: string, themeVariables: object = {}): Palettes {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize({ theme, themeVariables });
  const vars = v12.mermaidAPI.getConfig().themeVariables;
  v12.mermaidAPI.reset();
  const out = {} as Palettes;
  for (const p of PALETTES) out[p] = Array.from({ length: 12 }, (_, i) => hex(vars[`${p}${i}`]));
  return out;
}

async function v13Palettes(theme: ThemeName, themeVariables?: object): Promise<Palettes> {
  const t = createTheme(await loadTheme(theme), {
    cssVariables: false,
    themeVariables: themeVariables as Record<string, unknown>,
  });
  const out = {} as Palettes;
  for (const p of PALETTES) out[p] = t.palette(p).map(hex);
  return out;
}

/**
 * Under `darkMode` v12 also turns these themes' unset `primaryTextColor` to `#eee`, and the
 * labels follow it. v13's `darkMode` switches the derivation rules, not the base colours, so the
 * labels keep the theme's `labelTextColor` (GAPS.md "#338 T4a").
 */
const TEXT_UNDER_DARK_MODE: readonly ThemeName[] = ['base', 'neo', 'redux', 'redux-color'];

/**
 * D544: `redux-dark` draws a `cScaleLabel` slot black where v12's ink is below AA on the slot's
 * fill and black reads better (`contrast(cScale<n>, scaleLabelColor, #000000)`). Its fills are
 * v12's; in the theme values only slot 8 changes. `neo-dark` keeps v12's labels: its readers
 * draw them on `mainBkg`, not on the fill.
 */
const CONTRAST_LABELS: readonly ThemeName[] = ['redux-dark'];

/** What v13 draws where v12 drew `old`: v12's palettes, with D544's labels. */
function expected(theme: ThemeName, old: Palettes): Palettes {
  if (!CONTRAST_LABELS.includes(theme)) return old;
  const black = parseColor('#000000')!;
  const ink = (fill: string, label: string): string => {
    const [f, l] = [parseColor(fill), parseColor(label)];
    if (!f || !l) return label;
    const ratio = contrastRatio(l, f);
    return ratio >= 4.5 || ratio >= contrastRatio(black, f) ? label : '#000000';
  };
  return { ...old, cScaleLabel: old.cScaleLabel.map((l, i) => ink(old.cScale[i]!, l)) };
}

describe('cScale, cScaleInv and cScaleLabel against v12 12.2.0 (#338, D258)', () => {
  it.each(CONTRAST_LABELS)('%s: only the slot-8 label differs from v12 (D544)', async (theme) => {
    const [now, old] = [await v13Palettes(theme), v12Palettes(theme)];
    const differ = now.cScaleLabel.flatMap((l, i) => (l === old.cScaleLabel[i] ? [] : [i]));
    expect([differ, now.cScaleLabel[8], old.cScaleLabel[8]]).toEqual([[8], '#000000', '#e0dfdf']);
    expect([now.cScale, now.cScaleInv]).toEqual([old.cScale, old.cScaleInv]);
  });

  it.each(THEME_NAMES)('%s: the theme values', async (theme) => {
    expect(await v13Palettes(theme)).toEqual(expected(theme, v12Palettes(theme)));
  });

  it.each(THEME_NAMES)(
    '%s: under primaryColor, secondaryColor and tertiaryColor',
    async (theme) => {
      const vars = { primaryColor: '#3366cc', secondaryColor: '#cc6633', tertiaryColor: '#66cc33' };
      expect(await v13Palettes(theme, vars)).toEqual(expected(theme, v12Palettes(theme, vars)));
    }
  );

  it.each(THEME_NAMES)('%s: under primaryColor alone', async (theme) => {
    const vars = { primaryColor: '#3366cc' };
    expect(await v13Palettes(theme, vars)).toEqual(expected(theme, v12Palettes(theme, vars)));
  });

  it.each(THEME_NAMES)('%s: under darkMode', async (theme) => {
    const vars = { darkMode: true };
    const now = await v13Palettes(theme, vars);
    const old = expected(theme, v12Palettes(theme, vars));
    expect(now.cScale).toEqual(old.cScale);
    expect(now.cScaleInv).toEqual(old.cScaleInv);
    if (!TEXT_UNDER_DARK_MODE.includes(theme)) expect(now.cScaleLabel).toEqual(old.cScaleLabel);
    else
      expect(now.cScaleLabel).toEqual(
        Array(12).fill(
          hex(
            createTheme(await loadTheme(theme), {
              diagram: DIAGRAM_TABLES.sequence,
              cssVariables: false,
            }).value('labelTextColor')
          )
        )
      );
  });

  it('redux follows a mainBkg override, as v12 does', async () => {
    const vars = { mainBkg: '#3366cc' };
    expect(await v13Palettes('redux', vars)).toEqual(v12Palettes('redux', vars));
  });

  // D334: the labels read v12's shared `scaleLabelColor`, no longer sequence's `labelTextColor`.
  it('labels follow a scaleLabelColor override, as v12 does', async () => {
    const vars = { scaleLabelColor: '#3366cc' };
    for (const theme of THEME_NAMES)
      expect((await v13Palettes(theme, vars)).cScaleLabel, theme).toEqual(
        expected(theme, v12Palettes(theme, vars)).cScaleLabel
      );
  });

  // v12 derives sequence's actor text from labelTextColor, never from scaleLabelColor.
  it("a scaleLabelColor override leaves sequence's text as the theme draws it", async () => {
    const names = ['actorTextColor', 'labelTextColor', 'loopTextColor'];
    for (const theme of THEME_NAMES) {
      const at = async (themeVariables?: Record<string, unknown>) => {
        const t = createTheme(await loadTheme(theme), {
          diagram: DIAGRAM_TABLES.sequence,
          cssVariables: false,
          themeVariables,
        });
        return names.map((n) => t.value(n));
      };
      expect(await at({ scaleLabelColor: '#3366cc' }), theme).toEqual(await at());
    }
  });

  it.each(THEME_NAMES)('%s: a numbered override replaces its slot verbatim', async (theme) => {
    const vars = { cScale4: '#123456', cScaleInv5: '#654321', cScaleLabel6: '#abcdef' };
    const now = await v13Palettes(theme, vars);
    const old = v12Palettes(theme, vars);
    expect(now.cScale[4]).toBe('#123456');
    expect(now.cScaleInv[5]).toBe('#654321');
    expect(now.cScaleLabel[6]).toBe('#abcdef');
    expect([now.cScale[4], now.cScaleInv[5], now.cScaleLabel[6]]).toEqual([
      old.cScale[4],
      old.cScaleInv[5],
      old.cScaleLabel[6],
    ]);
  });

  it.each(THEME_NAMES)('%s: the other palettes follow a cScale override', async (theme) => {
    const vars = { cScale1: '#123456' };
    expect(await v13Palettes(theme, vars)).toEqual(expected(theme, v12Palettes(theme, vars)));
  });
});
