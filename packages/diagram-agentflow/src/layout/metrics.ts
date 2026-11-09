/**
 * Agentflow's own lengths and shape ratios (pitfall 13): the one table the layout reads, so no
 * other file under `layout/` writes a length. The builder's shared lengths (group padding, title
 * room, edge label wrap, spacing floors) come from the unit profile, the shapes' theme padding
 * from the theme (D152), and node padding from `flowchart.padding` (D466).
 *
 * The px values are v12's (`fa796a943`: `agentflowDb.getData`, `collapsedGroup.ts`, the
 * flowchart shapes agentflow draws) as v13 flowchart's builder took them (D446: a local copy,
 * never an import).
 */
import type { UnitProfile } from '@mermaid-js/core/layout';

/**
 * Config length defaults, as the schema writes them (`AgentflowDiagramConfig`). The resolved
 * config carries no `agentflow` defaults until the section joins `SECTION_OWNERS` with the
 * plugin (#550); then the generated `config-defaults.ts` takes over from this table.
 */
export const AGENTFLOW_LENGTH_DEFAULTS: Readonly<Record<string, number>> = Object.freeze({
  nodeSpacing: 50,
  rankSpacing: 50,
  wrappingWidth: 120,
  minNodeWidth: 120,
  diagramPadding: 8,
});

/** The `flowchart` length agentflow reads (D466), with v12's schema default. */
export const FLOWCHART_LENGTH_DEFAULTS: Readonly<Record<string, number>> = Object.freeze({
  padding: 15,
});

/** `flowchart.subGraphTitleMargin`'s sides (D466), with v12's schema default. */
export const TITLE_MARGIN_DEFAULTS: Readonly<Record<string, number>> = Object.freeze({
  top: 0,
  bottom: 0,
});

/** Config lengths at or above this are not taken (the cap flowchart's builder has). */
export const MAX_CONFIG_LENGTH = 1e4;

export interface AgentflowMetrics {
  /** The least label width a rounded box is sized for (v12 `Math.max(w, 12)`). */
  readonly minLabel: number;
  /** A tool's side frames, each this far in (v12 subroutine). */
  readonly frame: number;
  /** A refdoc's rule, this far in from its left side (v12 lined document). */
  readonly docRule: number;
  /** How far a refdoc's wave line sits above its box bottom, and its control points' offset. */
  readonly wave: { readonly depth: number; readonly control: number };
  /** An input's slanted corners: each cut in by this share of its height. */
  readonly leanCut: number;
  /** An input grows this share of its height in width for its slants. */
  readonly leanGrow: number;
  /** The share of a decision's side edges may spread along. */
  readonly roundSpan: number;
  /** The share of an action's height its left and right sides let edges spread along. */
  readonly hexSpan: number;
  /** Kept clear at each end of a flat side when edges spread along it. */
  readonly corner: number;
  /** v12's collapsed-flow card: fixed padding, label-to-row gap, indicator row, least width. */
  readonly card: {
    readonly pad: number;
    readonly gap: number;
    readonly row: number;
    readonly minWidth: number;
  };
  /** Points per curved stretch of an outline (a rounded corner, half a wave): a count. */
  readonly curveSteps: number;
  /** How far an edge end may sit off a box side and still count as on it. */
  readonly onSide: number;
}

const PX: AgentflowMetrics = Object.freeze({
  minLabel: 12,
  frame: 8,
  docRule: 8,
  wave: Object.freeze({ depth: 10, control: 12 }),
  leanCut: 0.25,
  leanGrow: 0.5,
  roundSpan: 0.6,
  hexSpan: 0.5,
  corner: 12,
  card: Object.freeze({ pad: 8, gap: 8, row: 20, minWidth: 80 }),
  curveSteps: 8,
  onSide: 0.5,
});

/**
 * The metrics for a unit profile. Only px is drawn today; text output (D320, #551) adds its
 * cell set here.
 */
export function agentflowMetrics(_units: UnitProfile): AgentflowMetrics {
  return PX;
}
