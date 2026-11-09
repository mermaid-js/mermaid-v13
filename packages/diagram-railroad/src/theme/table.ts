import type { DiagramThemeEntries, DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * v12's theme defaults (`styles.ts:125-187`, `buildThemeDefaults`): each railroad colour from a
 * shared variable, `a ?? b` read as `a` wherever every v12 theme writes `a`. v13 core has no
 * `secondBkg` (v12's terminal fill, `secondBkg ?? secondaryColor`), so the light rule reads the
 * fallback, `secondaryColor`, which v12's default, forest and neutral write equal to their
 * `secondBkg`; the dark themes' rule is below. `titleColor ?? textColor` is `titleColor`, which
 * every theme writes. A special's text is drawn in the nonterminal text colour, as v12's CSS did.
 */
const LIGHT = {
  railroadTerminalFill: 'secondaryColor',
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
 * A family's dark themes: v12's dark, neo-dark, redux-dark and redux-dark-color all compute
 * `secondBkg` as `lighten(mainBkg, 16)`, so the terminal fill follows `mainBkg` there (a
 * family-rule approximation of a variable core does not have, D541; T5 tabulates 12.2.0's
 * resolved values). Keyed by the `dark` trait, not the author's `darkMode`, as v12 keyed it by
 * theme.
 */
const DARK: DiagramThemeEntries = {
  rules: { railroadTerminalFill: 'lightenHsl(mainBkg, 16%)' },
};

/**
 * Railroad's theme table (`DiagramPlugin.theme`, D331, D335, D516, D540): the variables of
 * `vocabulary.ts` in section `railroad`. It names no theme (D331), and draws alike in every
 * family (D227): v12 had no theme-name or `look` branch, so the families differ through the
 * shared variables the rules read. The `railroad` config's colour keys beat these variables
 * (D515, D516): the renderer reads a variable only where the config sets no usable colour.
 */
export const theme: DiagramThemeTable = {
  section: 'railroad',
  vars: THEME_VARIABLE_TABLE,
  rules: { light: LIGHT },
  families: {
    classic: { dark: DARK },
    redux: { dark: DARK },
    neo: { fallback: 'redux' },
  },
};
