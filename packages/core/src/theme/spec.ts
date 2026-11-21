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
  /**
   * The base variables: a value each, or for a colour a rule (`dsl.ts`) over the others, as
   * `base` derives `secondaryColor` from `primaryColor` (#797). The author's value still wins.
   */
  readonly base: Readonly<Record<BaseVariable, string>>;
  readonly tokens: Readonly<Record<TokenVariable, number | string | boolean>>;
  /** Literal values for derived variables, where v12 hard-codes them for this theme. */
  readonly values?: Readonly<Record<string, string>>;
  /** Rules that replace the shared ones for this theme. */
  readonly rules?: ThemeRuleTable;
  /**
   * Colour lists (D151, D152). A theme with a non-empty `borderColorArray` colours each
   * subgraph from it; an empty `bkgColorArray` means border-only colour. A palette the theme
   * leaves out is empty, except the series (`BASE_SERIES`) and the scale and git palettes
   * (`baseScalesFor`), which v12 theme-base derives from the base colours. An entry is a colour
   * or a rule (`dsl.ts`), and a rule may name a slot
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
  // Every edge label's fill is the background it sits on (D628).
  edgeLabelBackground: 'background',
  arrowheadColor: 'lineColor',
  defaultLinkColor: 'lineColor',
  border1: 'primaryBorderColor',
  border2: 'tertiaryBorderColor',
  noteBkgColor: '#fff5ad',
  noteTextColor: 'contrast(noteBkgColor, textColor, background)',
  noteBorderColor: 'mix(noteBkgColor, black, 30%)',
  errorBkgColor: '#552222',
  errorTextColor: 'contrast(background, #552222, #ffdddd)',

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
  // v12 theme-base's participant fill and border (sequence; usecase's role colour fallbacks).
  actorBkg: 'mainBkg',
  actorBorder: 'inline(softBorder)',
  // Shared inputs (D332), as v12 theme-base derives gitGraph's labels from them (D267): a badge
  // on v12's secondary colour, in its inverse unless the author sets `secondaryTextColor`, and a
  // callout on the primary colour, its text and border. The built-in themes write their own
  // badge and callout border (`gitLabelRules`).
  badgeBkg: BASE_SECONDARY,
  badgeTextColor: `ifSet(secondaryTextColor, invert(${BASE_SECONDARY}))`,
  calloutBkg: 'primaryColor',
  calloutTextColor: 'primaryTextColor',
  calloutBorder: 'primaryBorderColor',
  // Shared inputs (D332): a table's alternating row fills, exactly v12 theme-base's khroma
  // lighten (HSL lightness) of mainBkg (D117); the fill behind a label on a link where a diagram
  // draws it on a plain surface, the edge label fill unless a theme sets it; and the body of a
  // region nested in another of its kind, v12 theme-base's tertiaryColor.
  rowBkg: 'lightenHsl(mainBkg, 75%)',
  rowAltBkg: 'lightenHsl(mainBkg, 5%)',
  linkLabelBkg: 'edgeLabelBackground',
  nestedBkg: 'tertiaryColor',
  // Shared inputs (D656): the base colours as a diagram on its own canvas keeps them. A theme
  // whose v12 constructor value no override moves pins it in `values`.
  canvasBkg: 'background',
  canvasLineColor: 'lineColor',
  canvasTextColor: 'primaryTextColor',
  canvasItemBkg: 'primaryColor',
  canvasItemBkg3: 'tertiaryColor',
  canvasNodeBkg: 'mainBkg',
  bandBkg: 'tertiaryColor',
  guideLineColor: 'lineColor',
};

/** Shared derivation for dark themes. */
export const DARK_RULES: ThemeRuleTable = {
  ...LIGHT_RULES,
  primaryBorderColor: 'mix(primaryColor, white, 20%)',
  secondaryBorderColor: 'mix(secondaryColor, white, 20%)',
  tertiaryBorderColor: 'mix(tertiaryColor, white, 20%)',
  noteBkgColor: 'secondaryColor',
  noteBorderColor: 'mix(noteBkgColor, white, 30%)',
  errorBkgColor: '#a44141',
  errorTextColor: 'contrast(background, #dddddd, #552222)',
  // v12 theme-dark: khroma lighten(mainBkg, 5) and darken(mainBkg, 10), exactly (D117).
  rowBkg: 'lightenHsl(mainBkg, 5%)',
  rowAltBkg: 'darkenHsl(mainBkg, 10%)',
};
