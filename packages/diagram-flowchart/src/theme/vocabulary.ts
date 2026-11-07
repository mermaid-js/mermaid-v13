import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/**
 * Flowchart's own theme variables (spec #414 T4, D331): v12-style names, so `themeVariables`
 * works as before. All are geometry read as numbers at render time (D152), so they have no CSS
 * variable. `pnpm gen:theme` writes the runtime half to `generated/variables.ts`. The point
 * arrowhead and the rectangle, hexagon and circle padding stay in core: state and mindmap read
 * them too.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  // Circle and cross arrowheads: size, gap to the node outline, the cross's stroke.
  circleArrowheadSize: { alias: 'ocs', kind: 'length', usedBy: ['flowchart'] },
  circleArrowheadGap: { alias: 'ocg', kind: 'length', usedBy: ['flowchart'] },
  crossArrowheadSize: { alias: 'xs', kind: 'length', usedBy: ['flowchart'] },
  crossArrowheadGap: { alias: 'xg', kind: 'length', usedBy: ['flowchart'] },
  crossArrowheadStrokeWidth: { alias: 'xw', kind: 'length', usedBy: ['flowchart'] },
  // Node padding (D151, D152): px, or a multiple of `flowchart.padding`.
  stadiumPaddingX: { alias: 'spx', kind: 'padding', usedBy: ['flowchart'] },
  stadiumPaddingY: { alias: 'spy', kind: 'padding', usedBy: ['flowchart'] },
  doubleCircleGap: { alias: 'dcg', kind: 'length', usedBy: ['flowchart'] },
  doubleCirclePadding: { alias: 'dcp', kind: 'padding', usedBy: ['flowchart'] },
  circleMinDiameter: { alias: 'cmd', kind: 'length', usedBy: ['flowchart'] },
  // Shapes with their own v12 padding (#89), totals added to the label box.
  subroutinePaddingX: { alias: 'srx', kind: 'padding', usedBy: ['flowchart'] },
  subroutinePaddingY: { alias: 'sry', kind: 'padding', usedBy: ['flowchart'] },
  cylinderPaddingX: { alias: 'cyx', kind: 'padding', usedBy: ['flowchart'] },
  cylinderPaddingY: { alias: 'cyy', kind: 'padding', usedBy: ['flowchart'] },
  leanPaddingX: { alias: 'lnx', kind: 'padding', usedBy: ['flowchart'] },
  leanPaddingY: { alias: 'lny', kind: 'padding', usedBy: ['flowchart'] },
  oddPaddingX: { alias: 'odx', kind: 'padding', usedBy: ['flowchart'] },
  oddPaddingY: { alias: 'ody', kind: 'padding', usedBy: ['flowchart'] },
};
