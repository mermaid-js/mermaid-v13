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
 * because the classic themes follow `flowchart.padding` (D152). A `flag` is `true` or `false`,
 * read literally at render time like geometry, so it has no CSS variable (D182). An `opacity` is
 * a number from 0 to 1, read with `Theme.number` like geometry, so it has no CSS variable either
 * (D221).
 */
export type ThemeVarKind =
  | 'color'
  | 'length'
  | 'font'
  | 'weight'
  | 'filter'
  | 'padding'
  | 'flag'
  | 'opacity';

/** What the theme reads at render time: a variable's alias and kind. */
export type ThemeVarEntry = Pick<ThemeVarDef, 'alias' | 'kind'>;

export interface ThemeVarDef {
  /** The short private alias written on the root, without the leading `--_`. */
  readonly alias: string;
  readonly kind: ThemeVarKind;
  /**
   * The diagram types (or `core`) that read it; empty for a v12 variable no ported diagram
   * reads yet. `tools/gen-config/src/theme-used-by.spec.ts` checks the diagram types against
   * their sources.
   */
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
  // ER crow's-foot ends: where the zero-or-more circle sits, out from the outline.
  'erZeroOrMoreCircleOffset',
] as const;

export type ArrowheadVariable = (typeof ARROWHEAD_VARIABLES)[number];

/**
 * Class relationship marker geometry (D152): v12 drew `look: neo` class markers from its
 * `*-margin` variants, so the redux themes carry those and the classic themes v12 classic's.
 * Read as numbers at render time. Only the quantities that differ are variables.
 */
export const CLASS_MARKER_VARIABLES = [
  'classMarkerStrokeWidth',
  'classFilledMarkerStrokeWidth',
  'extensionMarkerLength',
  'extensionMarkerGap',
  'compositionMarkerGap',
  'dependencyMarkerGap',
] as const;

export type ClassMarkerVariable = (typeof CLASS_MARKER_VARIABLES)[number];

/**
 * Name lists joined into one. Called `@__PURE__` with no spread, so a bundle drops a list that
 * nothing reads at run time (only types and tools read `TOKEN_VARIABLES`; core's size budget,
 * R-PERF-8). An array spread would keep it, as bundlers cannot prove it has no side effects.
 */
const joined = <L extends readonly (readonly string[])[]>(
  ...lists: L
): readonly L[number][number][] => lists.flat();

/** Shape tokens (R-THEME-11): sizes every diagram type reads instead of hard-coding them. */
export const TOKEN_VARIABLES = /* @__PURE__ */ joined(
  [
    'strokeWidth',
    'clusterStrokeWidth',
    'radius',
    'fontWeight',
    'spacing1',
    'spacing2',
    'spacing3',
  ] as const,
  ARROWHEAD_VARIABLES,
  CLASS_MARKER_VARIABLES,
  [
    // A class relationship's multiplicities (v12 `.edgeTerminals { font-size: 11px }`); the same
    // in every theme, a size key that keeps v12's default.
    'classTerminalFontSize',
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
    // Sequence geometry (v12 `look: neo` / classic, #194): the glyph band participants stand in
    // (0 draws the classic symbols), the gap at a message's end, the taller fragment label tab
    // and the room below the drawing.
    'actorGlyphBand',
    'messageEndGap',
    'labelBoxExtraHeight',
    'actorFooterPadding',
    // Pie text sizes, stroke widths and slice opacity (#325): the same in every v12 theme.
    'pieTitleTextSize',
    'pieSectionTextSize',
    'pieLegendTextSize',
    'pieStrokeWidth',
    'pieOuterStrokeWidth',
    'pieOpacity',
    // Timeline boxes (spec #291, D227): the top corner, the label offset (sections and periods)
    // and the extra offset of event labels, and whether boxes take the `cScale` palettes.
    'timelineRadius',
    'timelineLabelOffset',
    'timelineEventLabelShift',
    'timelineScaleColors',
    // The neo gradient (D182): outlines that `Theme.outline()` paints take the gradient.
    'useGradient',
  ] as const
);

export type TokenVariable = (typeof TOKEN_VARIABLES)[number];

/**
 * Palettes (D151, D152, D258): lists of colours a theme carries as data. `themeVariables`
 * replaces a whole list (an array of colours, or a comma-separated string), and v12's numbered
 * names (`cScale0`–`cScale11`, `cScaleInv<n>`, `cScaleLabel<n>`) replace one entry of
 * `cScale`, `cScaleInv` or `cScaleLabel`. Palettes are read as literal colours, not CSS
 * variables.
 */
export const PALETTE_VARIABLES = [
  'borderColorArray',
  'bkgColorArray',
  'cScale',
  'cScaleInv',
  'cScaleLabel',
] as const;

/** The palettes with v12's numbered names, `<name>0`–`<name>11`. */
export const NUMBERED_PALETTES = ['cScale', 'cScaleInv', 'cScaleLabel'] as const;

export type PaletteVariable = (typeof PALETTE_VARIABLES)[number];

/** How many numbered names each of `NUMBERED_PALETTES` has (v12 `THEME_COLOR_LIMIT`, D258). */
export const PALETTE_LIMIT = 12;

// Pure, so a bundle that never reads `THEME_VARIABLES` drops it with its `usedBy` lists: the
// runtime reads the generated alias and kind table (`generated/variables.ts`) instead.
/* @__NO_SIDE_EFFECTS__ */
const def = (alias: string, kind: ThemeVarKind, usedBy: readonly string[]): ThemeVarDef => ({
  alias,
  kind,
  usedBy,
});

/** Who reads the base text variables (`fontFamily`, `fontSize`): a new type appends here. */
const TEXT_USERS = ['core', 'flowchart', 'sequence', 'class', 'state', 'er', 'journey', 'timeline'];

const JOURNEY = ['journey'];

/**
 * The pie slot colours `pie1`–`pie12`, aliases `pi1`–`pi12`, built in a loop: the vocabulary is
 * in core's size budget (R-PERF-8).
 */
const PIE_SLOTS: Readonly<Record<string, ThemeVarDef>> = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [`pie${i + 1}`, def(`pi${i + 1}`, 'color', ['pie'])])
);

/**
 * The core inventory. Order is the order of the generated table. Tools and specs read it (with
 * `usedBy`); the theme reads `THEME_VARIABLE_TABLE`, which `pnpm gen:theme` writes from it.
 */
export const THEME_VARIABLES: Readonly<Record<string, ThemeVarDef>> = {
  // base
  primaryColor: def('p', 'color', ['core']),
  secondaryColor: def('s', 'color', ['core']),
  tertiaryColor: def('t', 'color', ['core']),
  background: def('bg', 'color', ['core']),
  primaryTextColor: def('pt', 'color', ['core']),
  lineColor: def('l', 'color', ['flowchart', 'class', 'state', 'er']),
  // Pie draws in the font family but sizes its text by its own variables.
  fontFamily: def('ff', 'font', [...TEXT_USERS, 'pie']),
  fontSize: def('fs', 'length', TEXT_USERS),
  // derived
  primaryBorderColor: def('pb', 'color', ['core']),
  secondaryBorderColor: def('sb', 'color', ['core']),
  tertiaryBorderColor: def('tb', 'color', ['core']),
  secondaryTextColor: def('st', 'color', ['core']),
  tertiaryTextColor: def('tt', 'color', ['core']),
  textColor: def('tx', 'color', [
    'core',
    'flowchart',
    'sequence',
    'state',
    'er',
    'journey',
    'timeline',
  ]),
  mainBkg: def('mb', 'color', ['flowchart', 'sequence', 'class', 'state', 'er', 'timeline']),
  nodeBorder: def('nb', 'color', ['flowchart', 'sequence', 'class', 'state', 'er', 'timeline']),
  nodeTextColor: def('nt', 'color', ['flowchart', 'state', 'er']),
  clusterBkg: def('cb', 'color', ['flowchart', 'class', 'er']),
  clusterBorder: def('cs', 'color', ['flowchart', 'class', 'er']),
  titleColor: def('tc', 'color', ['flowchart', 'class', 'state', 'er']),
  edgeLabelBackground: def('el', 'color', ['flowchart', 'state']),
  // v12 `classText`: every text of a class diagram but notes and namespace titles.
  classText: def('ct', 'color', ['class']),
  arrowheadColor: def('ah', 'color', ['flowchart', 'state']),
  defaultLinkColor: def('dl', 'color', []),
  border1: def('b1', 'color', []),
  border2: def('b2', 'color', []),
  noteBkgColor: def('nk', 'color', ['core', 'sequence', 'class', 'state']),
  noteTextColor: def('nx', 'color', ['core', 'sequence', 'class', 'state']),
  noteBorderColor: def('no', 'color', ['core', 'sequence', 'class', 'state']),
  // sequence (v12 names, derived as v12 `theme-base.js` derives them)
  actorBkg: def('ab', 'color', ['sequence']),
  actorBorder: def('ar', 'color', ['sequence']),
  actorTextColor: def('at', 'color', ['sequence']),
  actorLineColor: def('alc', 'color', ['sequence']),
  signalColor: def('sc', 'color', ['sequence']),
  signalTextColor: def('stc', 'color', ['sequence']),
  labelBoxBkgColor: def('lbb', 'color', ['sequence']),
  labelBoxBorderColor: def('lbr', 'color', ['sequence']),
  labelTextColor: def('ltc', 'color', ['sequence']),
  loopTextColor: def('lpt', 'color', ['sequence']),
  activationBkgColor: def('acb', 'color', ['sequence']),
  activationBorderColor: def('acr', 'color', ['sequence']),
  sequenceNumberColor: def('snc', 'color', ['sequence']),
  errorBkgColor: def('eb', 'color', ['core']),
  errorTextColor: def('et', 'color', ['core']),
  // composite states (#192, D120, D126): the body, the title strip and the alternate
  // (nested) body.
  compositeBackground: def('cbg', 'color', ['state']),
  compositeTitleBackground: def('ctb', 'color', ['state']),
  altBackground: def('alb', 'color', ['state']),
  // pie chart (#325, v12 names): the slot colours `pie1`–`pie12`, texts, strokes and the slice
  // opacity, derived as each v12 theme derives them.
  ...PIE_SLOTS,
  pieTitleTextSize: def('pts', 'length', ['pie']),
  pieTitleTextColor: def('ptc', 'color', ['pie']),
  pieSectionTextSize: def('pss', 'length', ['pie']),
  pieSectionTextColor: def('psc', 'color', ['pie']),
  pieLegendTextSize: def('pls', 'length', ['pie']),
  pieLegendTextColor: def('plc', 'color', ['pie']),
  pieStrokeColor: def('pkc', 'color', ['pie']),
  pieStrokeWidth: def('pkw', 'length', ['pie']),
  pieOuterStrokeColor: def('poc', 'color', ['pie']),
  pieOuterStrokeWidth: def('pow', 'length', ['pie']),
  pieOpacity: def('pop', 'opacity', ['pie']),
  // tokens
  strokeWidth: def('sw', 'length', [
    'core',
    'flowchart',
    'sequence',
    'class',
    'state',
    'er',
    'timeline',
  ]),
  clusterStrokeWidth: def('cw', 'length', ['flowchart', 'class', 'er']),
  radius: def('r', 'length', ['core', 'flowchart', 'state']),
  fontWeight: def('fw', 'weight', ['core', 'timeline']),
  spacing1: def('g1', 'length', ['core']),
  spacing2: def('g2', 'length', ['core']),
  spacing3: def('g3', 'length', ['core']),
  // arrowhead geometry (numbers only)
  arrowheadGap: def('ag', 'length', ['flowchart', 'state']),
  arrowheadLength: def('al', 'length', ['flowchart', 'state']),
  arrowheadWidth: def('aw', 'length', ['flowchart', 'state']),
  circleArrowheadSize: def('ocs', 'length', ['flowchart']),
  circleArrowheadGap: def('ocg', 'length', ['flowchart']),
  crossArrowheadSize: def('xs', 'length', ['flowchart']),
  crossArrowheadGap: def('xg', 'length', ['flowchart']),
  crossArrowheadStrokeWidth: def('xw', 'length', ['flowchart']),
  // class marker geometry (numbers only)
  classMarkerStrokeWidth: def('cmw', 'length', ['class']),
  classFilledMarkerStrokeWidth: def('cfw', 'length', ['class']),
  extensionMarkerLength: def('eml', 'length', ['class']),
  extensionMarkerGap: def('emg', 'length', ['class']),
  compositionMarkerGap: def('cmg', 'length', ['class']),
  dependencyMarkerGap: def('dmg', 'length', ['class']),
  classTerminalFontSize: def('ctf', 'length', ['class']),
  erZeroOrMoreCircleOffset: def('ezc', 'length', ['er']),
  // Node padding, read as numbers at render time (D152), so their aliases are never written.
  nodePaddingX: def('npx', 'padding', ['flowchart']),
  nodePaddingY: def('npy', 'padding', ['flowchart']),
  stadiumPaddingX: def('spx', 'padding', ['flowchart']),
  stadiumPaddingY: def('spy', 'padding', ['flowchart']),
  hexagonPaddingX: def('hpx', 'padding', ['flowchart']),
  hexagonPaddingY: def('hpy', 'padding', ['flowchart']),
  hexagonSlant: def('hs', 'length', ['flowchart']),
  doubleCircleGap: def('dcg', 'length', ['flowchart']),
  doubleCirclePadding: def('dcp', 'padding', ['flowchart']),
  circlePadding: def('cp', 'padding', ['flowchart']),
  circleMinDiameter: def('cmd', 'length', ['flowchart']),
  subroutinePaddingX: def('srx', 'padding', ['flowchart']),
  subroutinePaddingY: def('sry', 'padding', ['flowchart']),
  cylinderPaddingX: def('cyx', 'padding', ['flowchart']),
  cylinderPaddingY: def('cyy', 'padding', ['flowchart']),
  leanPaddingX: def('lnx', 'padding', ['flowchart']),
  leanPaddingY: def('lny', 'padding', ['flowchart']),
  oddPaddingX: def('odx', 'padding', ['flowchart']),
  oddPaddingY: def('ody', 'padding', ['flowchart']),
  actorRadius: def('arx', 'length', ['sequence']),
  actorGlyphBand: def('agb', 'length', ['sequence']),
  messageEndGap: def('meg', 'length', ['sequence']),
  labelBoxExtraHeight: def('lbx', 'length', ['sequence']),
  actorFooterPadding: def('afp', 'length', ['sequence']),
  timelineRadius: def('tlr', 'length', ['timeline']),
  timelineLabelOffset: def('tlo', 'padding', ['timeline']),
  timelineEventLabelShift: def('tle', 'length', ['timeline']),
  timelineScaleColors: def('tls', 'flag', ['timeline']),
  // ER tables and ends (#133): v12's row fills, its colour-theme edge label background and
  // the zero circle's fill (white in v12 classic, the node fill in v12 neo).
  rowOdd: def('ro', 'color', ['er']),
  rowEven: def('re', 'color', ['er']),
  erEdgeLabelBackground: def('eel', 'color', ['er']),
  erMarkerFill: def('emf', 'color', ['er']),
  // user journey (#290): section and task fills by slot (D241), the face, and the author's
  // actor dot colours, which no theme sets (D249: the renderer then uses `actorColours`).
  // Built in a loop: fifteen near-identical rows cost the always-loaded core bytes.
  ...Object.fromEntries(
    [...'01234567'].map((n) => [`fillType${n}`, def(`jf${n}`, 'color', JOURNEY)])
  ),
  faceColor: def('jfc', 'color', JOURNEY),
  ...Object.fromEntries([...'012345'].map((n) => [`actor${n}`, def(`ja${n}`, 'color', JOURNEY)])),
  // effects: a CSS `filter` (`none` or `drop-shadow(…)`, checked by `checkFilter`). A theme
  // that sets no value has no shadow.
  dropShadow: def('ds', 'filter', ['flowchart', 'sequence', 'class', 'state', 'er', 'timeline']),
  // The neo gradient (D182). `useGradient` is read literally, so its alias is never written;
  // the stops are written on the gradient as `var(--mermaid-<name>,<computed value>)`.
  useGradient: def('ug', 'flag', ['core']),
  gradientStart: def('gs', 'color', ['core']),
  gradientStop: def('ge', 'color', ['core']),
};
