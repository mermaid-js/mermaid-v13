/**
 * `ThemeSpec`: a theme as data (DESIGN §8.1 item 1). Base values, shape tokens, the few
 * derived values a v12 theme hard-codes, and rules that override the shared derivation
 * table. Built-in specs live in `specs/`, one lazily imported file each.
 */
import type { ThemeFamily } from './diagram.ts';
import { BASE_SECONDARY } from './specs/palettes.ts';
import type { BaseVariable, PaletteVariable, TokenVariable } from './vocabulary.ts';

/** Derivation rules by variable name, in the DSL of `dsl.ts`. */
export type ThemeRuleTable = Readonly<Record<string, string>>;

export interface ThemeSpec {
  readonly name: string;
  /** Derive with the dark rules (borders lighten instead of darken, and so on). A trait (D331). */
  readonly dark: boolean;
  /**
   * The theme's family (D331): which entries of a diagram's theme table apply
   * (`DiagramThemeTable.families`). A new theme declares one and every diagram is themed.
   */
  readonly family: ThemeFamily;
  readonly base: Readonly<Record<BaseVariable, string>>;
  readonly tokens: Readonly<Record<TokenVariable, number | string | boolean>>;
  /** Literal values for derived variables, where v12 hard-codes them for this theme. */
  readonly values?: Readonly<Record<string, string>>;
  /** Rules that replace the shared ones for this theme. */
  readonly rules?: ThemeRuleTable;
  /**
   * Colour lists (D151, D152). A theme with a non-empty `borderColorArray` colours each
   * subgraph from it; an empty `bkgColorArray` means border-only colour. A palette the theme
   * leaves out is empty. An entry is a colour or a rule (`dsl.ts`), and a rule may name a slot
   * of any palette (`invert(cScale3)`, `bkgColorArray2`), so it follows the author's overrides
   * (D258, D332).
   */
  readonly palettes?: Readonly<Partial<Record<PaletteVariable, readonly string[]>>>;
  /**
   * The palettes that replace `palettes` when the author sets `themeVariables.darkMode`, where
   * v12 derives its `cScale` with darker steps. A theme's own `dark` flag does not switch them.
   */
  readonly darkModePalettes?: Readonly<Partial<Record<PaletteVariable, readonly string[]>>>;
}

/** Shared derivation for light themes, approximating v12's khroma rules (D71). */
export const LIGHT_RULES: ThemeRuleTable = {
  primaryBorderColor: 'mix(primaryColor, black, 15%)',
  secondaryBorderColor: 'mix(secondaryColor, black, 15%)',
  tertiaryBorderColor: 'mix(tertiaryColor, black, 15%)',
  secondaryTextColor: 'contrast(secondaryColor, primaryTextColor, background)',
  tertiaryTextColor: 'contrast(tertiaryColor, primaryTextColor, background)',
  textColor: 'primaryTextColor',
  mainBkg: 'primaryColor',
  nodeBorder: 'primaryBorderColor',
  nodeTextColor: 'contrast(mainBkg, textColor, background)',
  clusterBkg: 'tertiaryColor',
  clusterBorder: 'tertiaryBorderColor',
  titleColor: 'contrast(clusterBkg, textColor, background)',
  edgeLabelBackground: 'secondaryColor',
  arrowheadColor: 'lineColor',
  defaultLinkColor: 'lineColor',
  border1: 'primaryBorderColor',
  border2: 'tertiaryBorderColor',
  noteBkgColor: '#fff5ad',
  noteTextColor: 'contrast(noteBkgColor, textColor, background)',
  noteBorderColor: 'mix(noteBkgColor, black, 30%)',
  errorBkgColor: '#552222',
  errorTextColor: 'contrast(background, #552222, #ffdddd)',
  // ER rows, exactly v12 theme-base's khroma lighten (HSL lightness) of mainBkg (D117).
  rowOdd: 'lightenHsl(mainBkg, 75%)',
  rowEven: 'lightenHsl(mainBkg, 5%)',
  erEdgeLabelBackground: 'edgeLabelBackground',
  erMarkerFill: '#ffffff',
  // v12 theme-base.js; the other classic themes pin altBackground (#192, D126).
  compositeBackground: 'background',
  compositeTitleBackground: 'mainBkg',
  altBackground: 'tertiaryColor',
  // gitGraph labels, as v12 theme-base derives them (D267); the built-in themes set their own
  // commit label and border rules (`gitLabelRules`). An author's `tagBorder` fills
  // `tagLabelBorder` unless the author sets that too.
  commitLabelColor: `ifSet(secondaryTextColor, invert(${BASE_SECONDARY}))`,
  commitLabelBackground: BASE_SECONDARY,
  tagLabelColor: 'primaryTextColor',
  tagLabelBackground: 'primaryColor',
  tagLabelBorder: 'ifSet(tagBorder, primaryBorderColor)',
  // gantt (#381, #385): v12 theme-base's derivation, from shared variables and literals only
  // (D331); no theme spec names a gantt variable. `vertLineColor` is the redux family's
  // `primaryBorderColor` (v12 theme-base: navy). Values only a per-theme literal could give are
  // listed in the spec #293 notes (GAPS #385).
  sectionBkgColor: 'tertiaryColor',
  altSectionBkgColor: 'white',
  sectionBkgColor2: 'primaryColor',
  excludeBkgColor: '#eeeeee',
  taskBorderColor: 'primaryBorderColor',
  taskBkgColor: 'primaryColor',
  activeTaskBorderColor: 'primaryColor',
  activeTaskBkgColor: 'lightenHsl(primaryColor, 23%)',
  gridColor: 'lightgrey',
  doneTaskBkgColor: 'lightgrey',
  doneTaskBorderColor: 'grey',
  critBorderColor: '#ff8888',
  critBkgColor: 'red',
  todayLineColor: 'red',
  vertLineColor: 'primaryBorderColor',
  taskTextColor: 'textColor',
  taskTextOutsideColor: 'textColor',
  taskTextDarkColor: 'textColor',
  // The neo gradient's stops, as v12 theme-base derives them (D182).
  gradientStart: 'primaryBorderColor',
  gradientStop: 'secondaryBorderColor',
  // Shared inputs that name no diagram (D332): the ink of a diagram's own titles and legends,
  // and of labels on the series colours; the theme's text ink unless a theme pins them.
  headingTextColor: 'textColor',
  seriesTextColor: 'textColor',
  // A shared input that names no diagram (D334): v12's `scaleLabelColor`, the ink `cScaleLabel`
  // and any per-slot label take; the theme's text ink unless a theme pins it.
  scaleLabelColor: 'primaryTextColor',
  // Shared inputs (D332), as v12 theme-base derives the values they carry: a muted surface on
  // the secondary colour and its border (khroma darken(secondaryColor, 10): ten points of
  // lightness, about 12.5% black on a grey), links in the text ink, text on a line inverted.
  mutedBkg: 'secondaryColor',
  mutedBorder: 'mix(secondaryColor, black, 12.5%)',
  linkInkColor: 'textColor',
  lineTextColor: 'invert(lineColor)',
  // A soft border is the node border unless a theme softens it; a frame's tab takes it too. A
  // diagram that reads `frameBorder` with a fallback (`inline(frameBorder, b)`) gets b instead
  // where no theme wrote one: the rule below does not count as set.
  softBorder: 'nodeBorder',
  frameBorder: 'softBorder',
};

/** Shared derivation for dark themes. */
export const DARK_RULES: ThemeRuleTable = {
  ...LIGHT_RULES,
  primaryBorderColor: 'mix(primaryColor, white, 20%)',
  secondaryBorderColor: 'mix(secondaryColor, white, 20%)',
  tertiaryBorderColor: 'mix(tertiaryColor, white, 20%)',
  edgeLabelBackground: 'mix(secondaryColor, black, 30%)',
  noteBkgColor: 'secondaryColor',
  noteBorderColor: 'mix(noteBkgColor, white, 30%)',
  errorBkgColor: '#a44141',
  errorTextColor: 'contrast(background, #dddddd, #552222)',
  // v12 theme-dark: khroma lighten(mainBkg, 5) and darken(mainBkg, 10), exactly (D117).
  rowOdd: 'lightenHsl(mainBkg, 5%)',
  rowEven: 'darkenHsl(mainBkg, 10%)',
  // gantt: v12 theme-redux-dark and theme-neo-dark fill done tasks with `secondBkg`, khroma
  // lighten(mainBkg, 16) (#385).
  doneTaskBkgColor: 'lightenHsl(mainBkg, 16%)',
};
