/**
 * `ThemeSpec`: a theme as data (DESIGN §8.1 item 1). Base values, shape tokens, the few
 * derived values a v12 theme hard-codes, and rules that override the shared derivation
 * table. Built-in specs live in `specs/`, one lazily imported file each.
 */
import type { ThemeFamily } from './diagram.ts';
import { fillTypes } from './specs/palettes.ts';
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
  // v12 journey `.face { fill: faceColor or #FFF8DC }`; no v12 theme sets faceColor.
  faceColor: '#fff8dc',
  // Journey section fills (#327, D241): v12 theme-base takes primaryColor, secondaryColor and
  // their hue turns by +64, -64 and 128 degrees. 2-7 are base's resolved v12 values; every other
  // theme pins all eight (`fillTypes`, specs/palettes.ts). A rule can now write a hue turn as a
  // literal (`literal(adjustHue(primaryColor, 64))`, D332), which the T0 migration uses.
  ...fillTypes('primaryColor secondaryColor #e6ffdd #ffdde6 #ffddea #ddeaff #ddfff9 #fff9dd'),
  // Pie slots (#325), as v12 theme-base derives them: the base colours, then khroma `darken`
  // by 10. 7-12 are base's resolved v12 values (hue turns, which `literal()` can now derive,
  // D332); the other themes set their own (`pieSlots` in their specs).
  pie1: 'primaryColor',
  pie2: 'secondaryColor',
  pie3: 'tertiaryColor',
  pie4: 'darkenHsl(primaryColor, 10%)',
  pie5: 'darkenHsl(secondaryColor, 10%)',
  pie6: 'darkenHsl(tertiaryColor, 10%)',
  pie7: '#c5ffaa',
  pie8: '#ffaac5',
  pie9: '#ddfff4',
  pie10: '#a3ff77',
  pie11: '#ff77a3',
  pie12: '#aaffe3',
  // v12 titles and legends in `taskTextDarkColor`, sections in `textColor`, strokes black.
  pieTitleTextColor: 'textColor',
  pieSectionTextColor: 'textColor',
  pieLegendTextColor: 'textColor',
  pieStrokeColor: 'black',
  pieOuterStrokeColor: 'black',
  // v12 theme-base.js; the other classic themes pin altBackground (#192, D126).
  compositeBackground: 'background',
  compositeTitleBackground: 'mainBkg',
  altBackground: 'tertiaryColor',
  // sequence, as v12 `theme-base.js` derives them (its other colours are its table's)
  actorBorder: 'nodeBorder',
  labelBoxBorderColor: 'actorBorder',
  // quadrant chart, as v12's `/* quadrant-graph */` block in every theme file derives them.
  // Fills 2–4 follow `quadrant1Fill`, so a theme that pins it moves them too (D232); points
  // default to `textColor`, the colour v12 points showed (D231).
  quadrant1Fill: 'primaryColor',
  quadrant2Fill: 'adjust(quadrant1Fill, 5, 5, 5)',
  quadrant3Fill: 'adjust(quadrant1Fill, 10, 10, 10)',
  quadrant4Fill: 'adjust(quadrant1Fill, 15, 15, 15)',
  quadrant1TextFill: 'primaryTextColor',
  quadrant2TextFill: 'adjust(primaryTextColor, -5, -5, -5)',
  quadrant3TextFill: 'adjust(primaryTextColor, -10, -10, -10)',
  quadrant4TextFill: 'adjust(primaryTextColor, -15, -15, -15)',
  quadrantPointFill: 'textColor',
  quadrantPointTextFill: 'primaryTextColor',
  quadrantXAxisTextFill: 'primaryTextColor',
  quadrantYAxisTextFill: 'primaryTextColor',
  quadrantInternalBorderStrokeFill: 'primaryBorderColor',
  quadrantExternalBorderStrokeFill: 'primaryBorderColor',
  quadrantTitleFill: 'primaryTextColor',
  // The neo gradient's stops, as v12 theme-base derives them (D182).
  gradientStart: 'primaryBorderColor',
  gradientStop: 'secondaryBorderColor',
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
};
