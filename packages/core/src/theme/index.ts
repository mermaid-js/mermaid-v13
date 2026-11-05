/**
 * Theme specs, the derivation DSL and CSS variables (DESIGN §8, ADR-4).
 */
export {
  composite,
  contrastRatio,
  formatColor,
  invertColor,
  luminance,
  mixColors,
  parseColor,
  type Rgba,
} from './color.ts';
export { DARK_RULES, LIGHT_RULES, type ThemeRuleTable, type ThemeSpec } from './spec.ts';
export {
  ARROWHEAD_VARIABLES,
  BASE_VARIABLES,
  NUMBERED_PALETTES,
  PALETTE_LIMIT,
  PALETTE_VARIABLES,
  THEME_VARIABLES,
  TOKEN_VARIABLES,
  type ArrowheadVariable,
  type BaseVariable,
  type PaletteVariable,
  type ThemeVarDef,
  type ThemeVarEntry,
  type ThemeVarKind,
  type TokenVariable,
} from './vocabulary.ts';
export { THEME_VARIABLE_TABLE } from './generated/variables.ts';
export {
  createTheme,
  type AliasName,
  type AutoDeclarations,
  type Theme,
  type ThemeGradient,
  type ThemeOptions,
  type ThemeWarning,
} from './theme.ts';
export {
  DEFAULT_THEME,
  THEME_NAMES,
  isThemeName,
  loadTheme,
  loadedTheme,
  resolveThemeName,
  type ThemeChoice,
  type ThemeName,
} from './registry.ts';
