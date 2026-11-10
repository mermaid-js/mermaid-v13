import type { DiagramThemeEntries, DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * v12's theme defaults (`styles.ts:125-187`, `buildThemeDefaults`): each railroad colour from a
 * shared variable, `a ?? b` read as `a` wherever every v12 theme writes `a` (`titleColor`,
 * `secondaryBorderColor`, …). A special's text is drawn in the nonterminal text colour, as v12's
 * CSS did.
 *
 * The terminal fill is v12's `secondBkg ?? secondaryColor` over theme-default's variables,
 * which v12 spread first, so a theme without `secondBkg` drew default's `#ffffde` (12.2.0: base,
 * neo, redux, redux-color). Core has no `secondBkg`; v12's classic themes all set `clusterBkg`
 * to their `secondBkg` (`theme-default.js:196` and the others), so the light rule reads
 * `clusterBkg` as the theme wrote it, else `#ffffde` (base). The family entries below give the
 * redux family default's literal and every family's dark themes `lighten(mainBkg, 16)`.
 */
const LIGHT = {
  railroadTerminalFill: 'inline(clusterBkg, #ffffde)',
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

/**
 * A family's dark themes: v12's dark, neo-dark, redux-dark and redux-dark-color compute
 * `secondBkg` as `lighten(mainBkg, 16)`, so the terminal fill follows `mainBkg` there. Keyed by
 * the `dark` trait, not the author's `darkMode`, as v12 keyed it by theme.
 */
const DARK: DiagramThemeEntries = {
  rules: { railroadTerminalFill: 'lightenHsl(mainBkg, 16%)' },
};

/**
 * Railroad's theme table (`DiagramPlugin.theme`, D331, D335, D516, D540): the variables of
 * `vocabulary.ts` in section `railroad`. It names no theme (D331), and draws alike in every
 * family (D227): v12 had no theme-name or `look` branch, so the families differ through the
 * shared variables the rules read and v12's `secondBkg` (above). The `railroad` config's colour
 * keys beat these variables (D515, D516): the renderer reads a variable only where the config
 * sets no usable colour. `packages/conformance/src/railroad/theme.spec.ts` compares every value
 * with 12.2.0's in the eleven themes.
 */
export const theme: DiagramThemeTable = {
  section: 'railroad',
  vars: THEME_VARIABLE_TABLE,
  rules: { light: LIGHT },
  families: {
    classic: { dark: DARK },
    // v12's redux and neo light themes have no `secondBkg`: default's literal.
    redux: { rules: { railroadTerminalFill: '#ffffde' }, dark: DARK },
    neo: { fallback: 'redux' },
  },
};
