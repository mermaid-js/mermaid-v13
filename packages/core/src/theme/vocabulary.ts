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
export type ThemeVarKind = 'color' | 'length' | 'font' | 'weight' | 'filter' | 'padding';

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

/**
 * Arrowhead geometry (D152): sizes and gaps of the point, circle and cross arrowheads, read
 * as numbers at render time (`Theme.number`), so overriding their CSS variables has no effect.
 * Redux themes carry v12 `look: neo` values, classic themes v12 classic values.
 */
export const ARROWHEAD_VARIABLES = [
  'arrowheadGap',
  'arrowheadLength',
  'arrowheadWidth',
  'circleArrowheadSize',
  'circleArrowheadGap',
  'crossArrowheadSize',
  'crossArrowheadGap',
  'crossArrowheadStrokeWidth',
] as const;

export type ArrowheadVariable = (typeof ARROWHEAD_VARIABLES)[number];

/** Shape tokens (R-THEME-11): sizes every diagram type reads instead of hard-coding them. */
export const TOKEN_VARIABLES = [
  'strokeWidth',
  'clusterStrokeWidth',
  'radius',
  'fontWeight',
  'spacing1',
  'spacing2',
  'spacing3',
  ...ARROWHEAD_VARIABLES,
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
  // Shapes with their own v12 padding (#89), totals added to the label box.
  'subroutinePaddingX',
  'subroutinePaddingY',
  'cylinderPaddingX',
  'cylinderPaddingY',
  'leanPaddingX',
  'leanPaddingY',
  'oddPaddingX',
  'oddPaddingY',
  // Sequence participant boxes (v12 neo rx 6, classic 3).
  'actorRadius',
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
const ST = ['state'];
const S = ['sequence'];
const CS = ['core', 'sequence'];

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
  fontFamily: def('ff', 'font', [...CF, 'sequence']),
  fontSize: def('fs', 'length', [...CF, 'sequence']),
  // derived
  primaryBorderColor: def('pb', 'color', CF),
  secondaryBorderColor: def('sb', 'color', CF),
  tertiaryBorderColor: def('tb', 'color', CF),
  secondaryTextColor: def('st', 'color', CF),
  tertiaryTextColor: def('tt', 'color', CF),
  textColor: def('tx', 'color', [...CF, 'sequence']),
  mainBkg: def('mb', 'color', [...F, 'sequence']),
  nodeBorder: def('nb', 'color', [...F, 'sequence']),
  nodeTextColor: def('nt', 'color', F),
  clusterBkg: def('cb', 'color', F),
  clusterBorder: def('cs', 'color', F),
  titleColor: def('tc', 'color', F),
  edgeLabelBackground: def('el', 'color', F),
  arrowheadColor: def('ah', 'color', F),
  defaultLinkColor: def('dl', 'color', F),
  border1: def('b1', 'color', F),
  border2: def('b2', 'color', F),
  noteBkgColor: def('nk', 'color', CS),
  noteTextColor: def('nx', 'color', CS),
  noteBorderColor: def('no', 'color', CS),
  // sequence (v12 names, derived as v12 `theme-base.js` derives them)
  actorBkg: def('ab', 'color', S),
  actorBorder: def('ar', 'color', S),
  actorTextColor: def('at', 'color', S),
  actorLineColor: def('alc', 'color', S),
  signalColor: def('sc', 'color', S),
  signalTextColor: def('stc', 'color', S),
  labelBoxBkgColor: def('lbb', 'color', S),
  labelBoxBorderColor: def('lbr', 'color', S),
  labelTextColor: def('ltc', 'color', S),
  loopTextColor: def('lpt', 'color', S),
  activationBkgColor: def('acb', 'color', S),
  activationBorderColor: def('acr', 'color', S),
  sequenceNumberColor: def('snc', 'color', S),
  errorBkgColor: def('eb', 'color', C),
  errorTextColor: def('et', 'color', C),
  // composite states (#192, D120): the title strip and the alternate (nested) body.
  compositeTitleBackground: def('ctb', 'color', ST),
  altBackground: def('alb', 'color', ST),
  // tokens
  strokeWidth: def('sw', 'length', [...CF, 'sequence']),
  clusterStrokeWidth: def('cw', 'length', F),
  radius: def('r', 'length', CF),
  fontWeight: def('fw', 'weight', C),
  spacing1: def('g1', 'length', CF),
  spacing2: def('g2', 'length', CF),
  spacing3: def('g3', 'length', CF),
  // arrowhead geometry (numbers only)
  arrowheadGap: def('ag', 'length', F),
  arrowheadLength: def('al', 'length', F),
  arrowheadWidth: def('aw', 'length', F),
  circleArrowheadSize: def('ocs', 'length', F),
  circleArrowheadGap: def('ocg', 'length', F),
  crossArrowheadSize: def('xs', 'length', F),
  crossArrowheadGap: def('xg', 'length', F),
  crossArrowheadStrokeWidth: def('xw', 'length', F),
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
  subroutinePaddingX: def('srx', 'padding', F),
  subroutinePaddingY: def('sry', 'padding', F),
  cylinderPaddingX: def('cyx', 'padding', F),
  cylinderPaddingY: def('cyy', 'padding', F),
  leanPaddingX: def('lnx', 'padding', F),
  leanPaddingY: def('lny', 'padding', F),
  oddPaddingX: def('odx', 'padding', F),
  oddPaddingY: def('ody', 'padding', F),
  actorRadius: def('arx', 'length', S),
  // effects: a CSS `filter` (`none` or `drop-shadow(…)`, checked by `checkFilter`). A theme
  // that sets no value has no shadow.
  dropShadow: def('ds', 'filter', [...F, 'sequence']),
};
