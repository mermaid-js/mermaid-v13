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
export type {
  DiagramThemeEntries,
  DiagramThemeFamily,
  DiagramThemeTable,
  DiagramThemeVar,
  DiagramThemeVarDef,
  ThemeFamily,
} from './diagram.ts';
export {
  ARROWHEAD_VARIABLES,
  BASE_VARIABLES,
  GIT_PALETTE_LIMIT,
  NUMBERED_PALETTES,
  PALETTE_LIMIT,
  PALETTE_LIMITS,
  PALETTE_VARIABLES,
  THEME_VARIABLES,
  TOKEN_VARIABLES,
  type ArrowheadVariable,
  type BaseVariable,
  type NumberedPalette,
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
