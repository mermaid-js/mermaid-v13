/**
 * Venn's theme table (`DiagramPlugin.theme`, D331, D415; `v13/docs/agents/runs/414/CONTRACT.md`):
 * the slot colours `venn1`–`venn8` and the two text inks, keyed by theme family and the `dark`
 * trait, never by a theme name. v12's variables are flat, so there is no section (D335).
 *
 * - **every family** (the table's light rule): each slot is `primaryColor`, the flat colour v12
 *   drew every circle in where a theme defines no `venn*` (redux, redux-dark, neo, neo-dark); the
 *   title ink is `titleColor` and the set ink `textColor`, as in every v12 theme.
 * - **classic, light**: v12 `default`'s formula (`theme-default.js:286-296`) in every light
 *   classic theme. v12 `base` and `forest` darken `venn3` by 30 rather than 40, and `neutral`
 *   reads its `cScale` greys: no trait separates them from `default`, so they take its formula
 *   (D415, D541; listed in the venn theme oracle spec).
 * - **classic, dark**: v12 `dark`'s `lighten(cScale<i>, 30)` (`theme-dark.js:258-263`), as
 *   literals.
 *
 * A theme with a palette (a non-empty `borderColorArray`) colours its circles from it instead;
 * that is the renderer's (`render/paint.ts`), since a palette slot past the palette's end has no
 * colour a rule could fall back from.
 */
import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';
import { VENN_SLOTS } from '../layout/metrics.ts';
import { slotVar } from './slots.ts';

/** `f(i)` for each slot `i` (0–7), keyed by its variable `venn<i + 1>`. */
function perSlot(f: (i: number) => string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < VENN_SLOTS; i++) out[slotVar(i)] = f(i);
  return out;
}

/** v12 default's eight: `adjust(c, { h, l })`, a hue turn as a literal. */
const DEFAULT_SLOTS: readonly string[] = [
  'darkenHsl(primaryColor, 30%)',
  'darkenHsl(secondaryColor, 30%)',
  'darkenHsl(tertiaryColor, 40%)',
  'literal(darkenHsl(adjustHue(primaryColor, 60), 30%))',
  'literal(darkenHsl(adjustHue(primaryColor, -60), 30%))',
  'literal(darkenHsl(adjustHue(secondaryColor, 60), 30%))',
  'literal(darkenHsl(adjustHue(primaryColor, 120), 30%))',
  'literal(darkenHsl(adjustHue(secondaryColor, 120), 30%))',
];

/** The shared colours the light rule reads: v12's flat circle colour and the two text inks. */
const FLAT = { slot: 'primaryColor', title: 'titleColor', set: 'textColor' } as const;

export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      ...perSlot(() => FLAT.slot),
      vennTitleTextColor: FLAT.title,
      vennSetTextColor: FLAT.set,
    },
  },
  families: {
    classic: {
      rules: perSlot((i) => DEFAULT_SLOTS[i]!),
      dark: { rules: perSlot((i) => `literal(lightenHsl(cScale${i}, 30%))`) },
    },
  },
};
