import type { DiagramThemeTable, ThemeRuleTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/** v12's `cScalePeer` slots, one per `cScale` slot. */
const PEER_SLOTS = 12;

/** `cScalePeer<i>` = `step(cScale<i>, 10%)` for every slot. */
const peers = (step: 'darkenHsl' | 'lightenHsl'): ThemeRuleTable =>
  Object.fromEntries(
    Array.from({ length: PEER_SLOTS }, (_, i) => [`cScalePeer${i}`, `${step}(cScale${i}, 10%)`])
  );

/** v12 `styles.ts`'s `titleFontSize` default, the same in every theme. */
const SIZES = { tokens: { treemapTitleFontSize: 14 } } as const;

/**
 * The treemap's theme table (`DiagramPlugin.theme`, D322, D331, D335, spec #428): the variables
 * of `vocabulary.ts` under the `treemap` section.
 *
 * - D406: `cScalePeer<i>` is khroma's `darken(cScale<i>, 10)` (`darkenHsl`) in light themes and
 *   `lighten(cScale<i>, 10)` under a dark theme or `darkMode`, keyed by the `dark` trait, as
 *   v12's base, neutral, dark and the redux and neo themes derived it. v12 default and forest
 *   (`darken(…, 25)`, two slots from other colours) take the same rule (D541): T5 lists them.
 * - D407: `treemapTitleColor` follows `titleColor`; `treemapTitleFontSize` is 14 px.
 *
 * It names no theme (D331), and reads only `cScale` slots and `titleColor`.
 */
export const theme: DiagramThemeTable = {
  section: 'treemap',
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: { ...peers('darkenHsl'), treemapTitleColor: 'titleColor' },
    dark: peers('lightenHsl'),
  },
  families: { classic: SIZES, redux: SIZES, neo: { fallback: 'redux' } },
};
