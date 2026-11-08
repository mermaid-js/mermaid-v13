import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of every row: wardley reads them all. */
const WARDLEY: readonly string[] = ['wardley'];

/**
 * The Wardley map's theme variables (D322, D331, spec #430): v12's twelve `wardley.*` keys as
 * flat `wardley*` variables, each with its key under the `wardley` section (D335, D540:
 * `themeVariables.wardley.axisColor` sets `wardleyAxisColor`, the flat name winning), and v12's
 * own flat `wardleyEvolutionColor`, which `wardleyEvolutionStroke` reads. They are not core's
 * (R-PERF-8). `pnpm gen:theme` writes `generated/variables.ts` from them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  wardleyBackgroundColor: {
    alias: 'wbg',
    kind: 'color',
    usedBy: WARDLEY,
    nested: 'backgroundColor',
  },
  wardleyAxisColor: { alias: 'wax', kind: 'color', usedBy: WARDLEY, nested: 'axisColor' },
  wardleyAxisTextColor: {
    alias: 'wat',
    kind: 'color',
    usedBy: WARDLEY,
    nested: 'axisTextColor',
  },
  wardleyGridColor: { alias: 'wgr', kind: 'color', usedBy: WARDLEY, nested: 'gridColor' },
  wardleyComponentFill: {
    alias: 'wcf',
    kind: 'color',
    usedBy: WARDLEY,
    nested: 'componentFill',
  },
  wardleyComponentStroke: {
    alias: 'wcs',
    kind: 'color',
    usedBy: WARDLEY,
    nested: 'componentStroke',
  },
  wardleyComponentLabelColor: {
    alias: 'wcl',
    kind: 'color',
    usedBy: WARDLEY,
    nested: 'componentLabelColor',
  },
  wardleyLinkStroke: { alias: 'wls', kind: 'color', usedBy: WARDLEY, nested: 'linkStroke' },
  wardleyEvolutionStroke: {
    alias: 'wes',
    kind: 'color',
    usedBy: WARDLEY,
    nested: 'evolutionStroke',
  },
  wardleyAnnotationStroke: {
    alias: 'was',
    kind: 'color',
    usedBy: WARDLEY,
    nested: 'annotationStroke',
  },
  wardleyAnnotationTextColor: {
    alias: 'wtc',
    kind: 'color',
    usedBy: WARDLEY,
    nested: 'annotationTextColor',
  },
  wardleyAnnotationFill: {
    alias: 'waf',
    kind: 'color',
    usedBy: WARDLEY,
    nested: 'annotationFill',
  },
  // v12's flat variable (`theme-default.js:357`), not under the section.
  wardleyEvolutionColor: { alias: 'wec', kind: 'color', usedBy: WARDLEY },
};
