/**
 * Agentflow's own lengths (pitfall 13): the one table the layout reads, so no other file under
 * `layout/` writes a length. The builder's shared lengths (group padding, title room, edge label
 * wrap, spacing floors) come from the unit profile, the shapes' theme padding from the theme
 * (D152), node padding from `flowchart.padding` (D466), and the shapes' own sizes and ratios
 * from `@mermaid-js/shared/shapes/*`. The `agentflow` section's length defaults are the generated
 * `config-defaults.ts` (the plugin's `configDefaults`).
 *
 * The px values are v12's (`fa796a943`: `agentflowDb.getData`, `collapsedGroup.ts`).
 */
/** The `flowchart` length agentflow reads (D466), with v12's schema default. */
export const FLOWCHART_LENGTH_DEFAULTS: Readonly<Record<'padding', number>> = Object.freeze({
  padding: 15,
});

/** `flowchart.subGraphTitleMargin`'s sides (D466), with v12's schema default. */
export const TITLE_MARGIN_DEFAULTS: Readonly<Record<'top' | 'bottom', number>> = Object.freeze({
  top: 0,
  bottom: 0,
});

export interface AgentflowMetrics {
  /**
   * v12's flow corner radius (`clusters.js` `flowGroup`): the expanded frame's, and the
   * collapsed card's (its `flow` style).
   */
  readonly flowRadius: number;
  /**
   * v12's collapsed-flow card (`collapsedGroup.ts`) as the renderer trims it: its padding and
   * indicator row, how far in the separator starts, and the three dots' radius and spacing.
   */
  readonly card: {
    readonly pad: number;
    readonly row: number;
    readonly inset: number;
    readonly dot: number;
    readonly dotGap: number;
  };
  /** Points per curved stretch of an outline (a rounded corner, half a wave): a count. */
  readonly curveSteps: number;
  /** How far an edge end may sit off a box side and still count as on it. */
  readonly onSide: number;
}

/**
 * The px metrics, the only set: text output (D320, #551) draws every shape as a text-form box
 * sized from the cell profile (`prepare.ts`), so it reads none of these.
 */
export const AGENTFLOW_METRICS: AgentflowMetrics = Object.freeze({
  flowRadius: 10,
  card: Object.freeze({
    pad: 8,
    row: 20,
    inset: 8,
    dot: 2.5,
    dotGap: 10,
  }),
  curveSteps: 8,
  onSide: 0.5,
});
