/**
 * `ThemeSpec`: a theme as data (DESIGN §8.1 item 1). Base values, shape tokens, the few
 * derived values a v12 theme hard-codes, and rules that override the shared derivation
 * table. Built-in specs live in `specs/`, one lazily imported file each.
 */
import type { BaseVariable, PaletteVariable, TokenVariable } from './vocabulary.ts';

/** Derivation rules by variable name, in the DSL of `dsl.ts`. */
export type ThemeRuleTable = Readonly<Record<string, string>>;

export interface ThemeSpec {
  readonly name: string;
  /** Derive with the dark rules (borders lighten instead of darken, and so on). */
  readonly dark: boolean;
  readonly base: Readonly<Record<BaseVariable, string>>;
  readonly tokens: Readonly<Record<TokenVariable, number | string | boolean>>;
  /** Literal values for derived variables, where v12 hard-codes them for this theme. */
  readonly values?: Readonly<Record<string, string>>;
  /** Rules that replace the shared ones for this theme. */
  readonly rules?: ThemeRuleTable;
  /**
   * Colour lists (D151, D152). A theme with a non-empty `borderColorArray` colours each
   * subgraph from it; an empty `bkgColorArray` means border-only colour. A palette the theme
   * leaves out is empty.
   */
  readonly palettes?: Readonly<Partial<Record<PaletteVariable, readonly string[]>>>;
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
  classText: 'primaryTextColor',
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
  // their hue turns by +64, -64 and 128 degrees. The DSL has no hue turn, so 2-7 are base's
  // resolved v12 values; every other theme pins all eight (specs/journey-fills.ts).
  fillType0: 'primaryColor',
  fillType1: 'secondaryColor',
  fillType2: '#e6ffdd',
  fillType3: '#ffdde6',
  fillType4: '#ffddea',
  fillType5: '#ddeaff',
  fillType6: '#ddfff9',
  fillType7: '#fff9dd',
  // v12 theme-base.js; the other classic themes pin altBackground (#192, D126).
  compositeBackground: 'background',
  compositeTitleBackground: 'mainBkg',
  altBackground: 'tertiaryColor',
  // sequence, as v12 `theme-base.js` derives them
  actorBkg: 'mainBkg',
  actorBorder: 'nodeBorder',
  actorTextColor: 'primaryTextColor',
  actorLineColor: 'actorBorder',
  signalColor: 'textColor',
  signalTextColor: 'textColor',
  labelBoxBkgColor: 'actorBkg',
  labelBoxBorderColor: 'actorBorder',
  labelTextColor: 'actorTextColor',
  loopTextColor: 'actorTextColor',
  activationBkgColor: 'secondaryColor',
  // khroma darken(secondaryColor, 10): ten points of lightness, about 12.5% black on a grey.
  activationBorderColor: 'mix(secondaryColor, black, 12.5%)',
  sequenceNumberColor: 'invert(lineColor)',
  // The neo gradient's stops, as v12 theme-base derives them (D182).
  gradientStart: 'primaryBorderColor',
  gradientStop: 'secondaryBorderColor',
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
