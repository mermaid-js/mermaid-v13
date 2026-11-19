/**
 * Venn's theme table (`DiagramPlugin.theme`, D331, D415; `v13/docs/agents/runs/414/CONTRACT.md`):
 * the slot colours `venn1`–`venn8` and the two text inks, keyed by theme family and the `dark`
 * trait, never by a theme name. v12's variables are flat, so there is no section (D335).
 *
 * - **every family**: the title ink is v12's `titleColor || tertiaryTextColor`, with v12 base's
 *   `invert(tertiaryColor)` where the theme writes neither (`theme-base.js:50, :65`), and the set
 *   ink `textColor`, as in every v12 theme.
 * - **classic, light**: v12 `default`'s slot formula (`theme-default.js:286-296`) in every light
 *   classic theme. v12 `base` and `forest` darken `venn3` by 30 rather than 40, and `neutral`
 *   reads its `cScale` greys: no trait separates them from `default`, so they take its formula
 *   (D415, D541; listed in the venn theme oracle spec).
 * - **classic, dark**: v12 `dark`'s `lighten(cScale<i>, 30)` (`theme-dark.js:258-263`), as
 *   literals.
 * - **redux and neo**: no slot values, as v12 (its redux, redux-dark, neo and neo-dark define
 *   none), so a slot reads `currentColor` until an author writes it. The renderer takes the slots
 *   that are written, else the palette, else `primaryColor` (`render/paint.ts`).
 *
 * A palette (a non-empty `borderColorArray`: redux-color, redux-dark-color, or an author's) is
 * the renderer's too: a palette slot past the palette's end reads `currentColor`, and `inline()`
 * takes no palette slot, so no rule here can fall back from one.
 */
import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';
import { slotVar, VENN_SLOTS } from './slots.ts';

/** `f(i)` for each slot `i` (0–7), keyed by its variable `venn<i + 1>`. */
function perSlot(f: (i: number) => string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < VENN_SLOTS; i++) out[slotVar(i)] = f(i);
  return out;
}

/**
 * v12 default's eight: `adjust(c, { h, l })`, a hue turn as a literal. The primary slots read
 * `canvasItemBkg`, which `default` pins where v12 keeps its slots under a `primaryColor`
 * override, and which follows `primaryColor` elsewhere (D656).
 */
const DEFAULT_SLOTS: readonly string[] = [
  'darkenHsl(canvasItemBkg, 30%)',
  'darkenHsl(secondaryColor, 30%)',
  'darkenHsl(tertiaryColor, 40%)',
  'literal(darkenHsl(adjustHue(canvasItemBkg, 60), 30%))',
  'literal(darkenHsl(adjustHue(canvasItemBkg, -60), 30%))',
  'literal(darkenHsl(adjustHue(secondaryColor, 60), 30%))',
  'literal(darkenHsl(adjustHue(canvasItemBkg, 120), 30%))',
  'literal(darkenHsl(adjustHue(secondaryColor, 120), 30%))',
];

export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      vennTitleTextColor:
        'ifSet(titleColor, inline(titleColor, ifSet(tertiaryTextColor, inline(tertiaryTextColor, invert(tertiaryColor)))))',
      vennSetTextColor: 'textColor',
    },
  },
  families: {
    classic: {
      rules: perSlot((i) => DEFAULT_SLOTS[i]!),
      dark: { rules: perSlot((i) => `literal(lightenHsl(cScale${i}, 30%))`) },
    },
  },
};
