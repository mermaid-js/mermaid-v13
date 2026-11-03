/**
 * The theme variable inventory (DESIGN §8.3, O-1): every v12 theme variable that core and
 * the ported diagrams read, with its private alias, its kind and who reads it. Names are
 * v12's, so the public CSS variable is `--mermaid-<name>` (R-THEME-2). Diagram plugins add
 * their own variables through `ThemeRuleTable`s (DESIGN §12.1); a variable no ported
 * diagram reads is accepted and ignored (R-CONF-5).
 */

/**
 * How a variable's value is checked and written. A `padding` is a px length or a multiple of
 * the diagram's own `padding` config (`padding`, `2 * padding`), resolved at render time
 * because the classic themes follow `flowchart.padding` (D152).
 */
export type ThemeVarKind = 'color' | 'length' | 'font' | 'weight' | 'padding';

export interface ThemeVarDef {
  /** The short private alias written on the root, without the leading `--_`. */
  readonly alias: string;
  readonly kind: ThemeVarKind;
  /** The diagram types (or `core`) that read it. */
  readonly usedBy: readonly string[];
}

/**
 * The base variables (R-THEME-5): a theme that sets only these renders fully, because every
 * other colour is derived from them.
 */
export const BASE_VARIABLES = [
  'primaryColor',
  'secondaryColor',
  'tertiaryColor',
  'background',
  'primaryTextColor',
  'lineColor',
  'fontFamily',
  'fontSize',
] as const;

export type BaseVariable = (typeof BASE_VARIABLES)[number];

/** Shape tokens (R-THEME-11): sizes every diagram type reads instead of hard-coding them. */
export const TOKEN_VARIABLES = [
  'strokeWidth',
  'clusterStrokeWidth',
  'radius',
  'fontWeight',
  'spacing1',
  'spacing2',
  'spacing3',
  // Node padding (D151, D152): v12 neo values in the redux family, v12 classic in the others.
  'nodePaddingX',
  'nodePaddingY',
  'stadiumPaddingX',
  'stadiumPaddingY',
  'hexagonPaddingX',
  'hexagonPaddingY',
  'hexagonSlant',
  'doubleCircleGap',
  'doubleCirclePadding',
  'circlePadding',
  'circleMinDiameter',
] as const;

export type TokenVariable = (typeof TOKEN_VARIABLES)[number];

/**
 * Palettes (D151, D152): lists of colours a theme carries as data. `themeVariables` replaces
 * a whole list (an array of colours, or a comma-separated string), and v12's numbered names
 * `cScale0`–`cScale11` replace one entry of `cScale`. Palettes are read as literal colours,
 * not CSS variables.
 */
export const PALETTE_VARIABLES = ['borderColorArray', 'bkgColorArray', 'cScale'] as const;

export type PaletteVariable = (typeof PALETTE_VARIABLES)[number];

/** How many `cScaleN` names v12 has (`THEME_COLOR_LIMIT`). */
export const PALETTE_LIMIT = 12;

const F = ['flowchart'];
const C = ['core'];
const CF = ['core', 'flowchart'];

const def = (alias: string, kind: ThemeVarKind, usedBy: readonly string[]): ThemeVarDef => ({
  alias,
  kind,
  usedBy,
});

/** The core inventory. Order is the order of the generated table. */
export const THEME_VARIABLES: Readonly<Record<string, ThemeVarDef>> = {
  // base
  primaryColor: def('p', 'color', CF),
  secondaryColor: def('s', 'color', CF),
  tertiaryColor: def('t', 'color', CF),
  background: def('bg', 'color', CF),
  primaryTextColor: def('pt', 'color', CF),
  lineColor: def('l', 'color', F),
  fontFamily: def('ff', 'font', CF),
  fontSize: def('fs', 'length', CF),
  // derived
  primaryBorderColor: def('pb', 'color', CF),
  secondaryBorderColor: def('sb', 'color', CF),
  tertiaryBorderColor: def('tb', 'color', CF),
  secondaryTextColor: def('st', 'color', CF),
  tertiaryTextColor: def('tt', 'color', CF),
  textColor: def('tx', 'color', CF),
  mainBkg: def('mb', 'color', F),
  nodeBorder: def('nb', 'color', F),
  nodeTextColor: def('nt', 'color', F),
  clusterBkg: def('cb', 'color', F),
  clusterBorder: def('cs', 'color', F),
  titleColor: def('tc', 'color', F),
  edgeLabelBackground: def('el', 'color', F),
  arrowheadColor: def('ah', 'color', F),
  defaultLinkColor: def('dl', 'color', F),
  border1: def('b1', 'color', F),
  border2: def('b2', 'color', F),
  noteBkgColor: def('nk', 'color', C),
  noteTextColor: def('nx', 'color', C),
  noteBorderColor: def('no', 'color', C),
  errorBkgColor: def('eb', 'color', C),
  errorTextColor: def('et', 'color', C),
  // tokens
  strokeWidth: def('sw', 'length', CF),
  clusterStrokeWidth: def('cw', 'length', F),
  radius: def('r', 'length', CF),
  fontWeight: def('fw', 'weight', C),
  spacing1: def('g1', 'length', CF),
  spacing2: def('g2', 'length', CF),
  spacing3: def('g3', 'length', CF),
  // Node padding, read as numbers at render time (D152), so their aliases are never written.
  nodePaddingX: def('npx', 'padding', F),
  nodePaddingY: def('npy', 'padding', F),
  stadiumPaddingX: def('spx', 'padding', F),
  stadiumPaddingY: def('spy', 'padding', F),
  hexagonPaddingX: def('hpx', 'padding', F),
  hexagonPaddingY: def('hpy', 'padding', F),
  hexagonSlant: def('hs', 'length', F),
  doubleCircleGap: def('dcg', 'length', F),
  doubleCirclePadding: def('dcp', 'padding', F),
  circlePadding: def('cp', 'padding', F),
  circleMinDiameter: def('cmd', 'length', F),
};
